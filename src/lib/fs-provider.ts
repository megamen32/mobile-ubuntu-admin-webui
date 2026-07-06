import { Client } from "ssh2";
import { getConnection, type SshServerConfig } from "@/lib/ssh-pool";
import { getSshConnection } from "@/lib/server-context";
import { NextRequest } from "next/server";
import { stat, readdir, readFile, writeFile, mkdir, unlink, rename } from "fs/promises";
import { join } from "path";

/**
 * File system abstraction — works for both local fs and remote SFTP.
 *
 * Used by /api/files/* routes. When X-Server-Id header is set, all operations
 * go through SFTP via the SSH connection pool. Otherwise, local fs.
 */

export interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
  mode: string;
}

export interface FsProvider {
  isLocal: boolean;
  /** List directory contents */
  listDir(path: string): Promise<DirEntry[]>;
  /** Read file content as string */
  readFile(path: string): Promise<{ content: string; size: number; mtime: number }>;
  /** Write file content */
  writeFile(path: string, content: string): Promise<void>;
  /** Create directory */
  mkdir(path: string): Promise<void>;
  /** Delete file or directory */
  unlink(path: string): Promise<void>;
  /** Rename/move */
  rename(oldPath: string, newPath: string): Promise<void>;
}

/** Get the appropriate FS provider based on request (local or SFTP) */
export async function getFsProvider(req: NextRequest): Promise<FsProvider> {
  const sshResult = await getSshConnection(req);
  if (!sshResult) {
    return new LocalFsProvider();
  }
  return new SftpProvider(sshResult.conn);
}

/** Local filesystem provider */
class LocalFsProvider implements FsProvider {
  isLocal = true;

  async listDir(dirPath: string): Promise<DirEntry[]> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const out: DirEntry[] = [];
    for (const e of entries) {
      try {
        const es = await stat(join(dirPath, e.name));
        out.push({
          name: e.name,
          isDir: e.isDirectory(),
          size: es.size,
          mtime: es.mtimeMs,
          mode: "0" + (es.mode & 0o777).toString(8),
        });
      } catch { /* skip unreadable */ }
    }
    out.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
    return out;
  }

  async readFile(filePath: string): Promise<{ content: string; size: number; mtime: number }> {
    const s = await stat(filePath);
    const content = await readFile(filePath, "utf8");
    return { content, size: s.size, mtime: s.mtimeMs };
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await writeFile(filePath, content, "utf8");
  }

  async mkdir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
  }

  async unlink(path: string): Promise<void> {
    const s = await stat(path);
    if (s.isDirectory()) {
      await import("fs/promises").then(fs => fs.rm(path, { recursive: true }));
    } else {
      await unlink(path);
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await rename(oldPath, newPath);
  }
}

/** SFTP provider — uses ssh2 sftp() channel */
class SftpProvider implements FsProvider {
  isLocal = false;
  private sftp: any;
  private conn: Client;

  constructor(conn: Client) {
    this.conn = conn;
  }

  private async getSftp(): Promise<any> {
    if (this.sftp) return this.sftp;
    return new Promise((resolve, reject) => {
      this.conn.sftp((err, sftp) => {
        if (err) reject(err);
        else { this.sftp = sftp; resolve(sftp); }
      });
    });
  }

  async listDir(dirPath: string): Promise<DirEntry[]> {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      sftp.readdir(dirPath, (err: any, list: any[]) => {
        if (err) { reject(err); return; }
        const out: DirEntry[] = (list || []).map(entry => ({
          name: entry.filename,
          isDir: (entry.attrs.mode & 0o170000) === 0o040000, // S_IFDIR
          size: entry.attrs.size || 0,
          mtime: (entry.attrs.mtime || 0) * 1000,
          mode: "0" + ((entry.attrs.mode & 0o777) || 0o644).toString(8),
        }));
        out.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
        resolve(out);
      });
    });
  }

  async readFile(filePath: string): Promise<{ content: string; size: number; mtime: number }> {
    const sftp = await this.getSftp();
    // stat first
    const statResult = await new Promise<any>((resolve, reject) => {
      sftp.stat(filePath, (err: any, stats: any) => {
        if (err) reject(err);
        else resolve(stats);
      });
    });

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(filePath);
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        const content = Buffer.concat(chunks).toString("utf8");
        resolve({
          content,
          size: statResult.size || content.length,
          mtime: (statResult.mtime || 0) * 1000,
        });
      });
      stream.on("error", reject);
    });
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      const stream = sftp.createWriteStream(filePath);
      stream.on("finish", () => resolve());
      stream.on("error", reject);
      stream.end(content, "utf8");
    });
  }

  async mkdir(dirPath: string): Promise<void> {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      // mkdir with recursive not supported in ssh2 — create one level at a time
      sftp.mkdir(dirPath, (err: any) => {
        if (err) {
          // Try recursive by splitting
          const parts = dirPath.split("/").filter(Boolean);
          let current = dirPath.startsWith("/") ? "/" : "";
          let i = 0;
          const tryNext = () => {
            if (i >= parts.length) { resolve(); return; }
            current = current === "/" ? "/" + parts[i] : current + "/" + parts[i];
            sftp.mkdir(current, (e: any) => {
              // ignore "already exists" errors
              i++;
              tryNext();
            });
          };
          tryNext();
        } else {
          resolve();
        }
      });
    });
  }

  async unlink(path: string): Promise<void> {
    const sftp = await this.getSftp();
    // Try rmdir first (for directories), fall back to unlink
    return new Promise((resolve, reject) => {
      sftp.stat(path, (statErr: any, stats: any) => {
        if (statErr) { reject(statErr); return; }
        const isDir = (stats.mode & 0o170000) === 0o040000;
        if (isDir) {
          // For directories, we need recursive delete — use exec rm -rf
          this.conn.exec(`rm -rf ${JSON.stringify(path)}`, (execErr: any) => {
            if (execErr) reject(execErr);
            else resolve();
          });
        } else {
          sftp.unlink(path, (err: any) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      sftp.rename(oldPath, newPath, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
