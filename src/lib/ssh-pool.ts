import { Client, ClientChannel, ConnectConfig } from "ssh2";
import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * SSH connection pool — maintains persistent SSH connections to remote servers.
 *
 * Why persistent: SSH handshake is expensive (~500ms-2s). For interactive use
 * (journalctl -f, terminal PTY, repeated systemctl calls) we keep connections
 * open and reuse them.
 *
 * Connections are keyed by serverId. Idle connections auto-close after 5 min.
 *
 * Auth methods (both supported, per server config):
 *  1. Password auth
 *  2. Public key auth — key file read from ~/.ssh/<keyName>
 *     (server registry stores only the key filename, not the key content)
 */

export interface SshServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  password?: string;        // for password auth (encrypted at rest in DB)
  keyName?: string;         // for key auth — filename in ~/.ssh/
  passphrase?: string;      // optional passphrase for encrypted keys
}

interface PooledConnection {
  conn: Client;
  lastActivity: number;
  connecting: Promise<Client> | null;
}

const pool = new Map<string, PooledConnection>();
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

// Idle reaper
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pool) {
    if (now - entry.lastActivity > IDLE_TIMEOUT_MS && !entry.connecting) {
      try { entry.conn.end(); } catch { /* ignore */ }
      pool.delete(id);
      console.log(`[ssh-pool] reaped idle connection: ${id}`);
    }
  }
}, 60_000).unref();

/** Resolve key path: keyName can be absolute or relative to ~/.ssh/ */
function resolveKeyPath(keyName: string): string {
  if (keyName.startsWith("/")) return keyName;
  if (keyName.startsWith("~")) return keyName.replace(/^~/, homedir());
  return join(homedir(), ".ssh", keyName);
}

/** Build ssh2 ConnectConfig from server config */
function buildConnectConfig(server: SshServerConfig): ConnectConfig {
  const cfg: ConnectConfig = {
    host: server.host,
    port: server.port || 22,
    username: server.username,
    readyTimeout: 10_000,
    keepaliveInterval: 30_000,
  };

  if (server.authMethod === "key" && server.keyName) {
    const keyPath = resolveKeyPath(server.keyName);
    if (!existsSync(keyPath)) {
      throw new Error(`SSH key not found: ${keyPath}`);
    }
    try {
      cfg.privateKey = readFileSync(keyPath);
      if (server.passphrase) {
        cfg.passphrase = server.passphrase;
      }
    } catch (e: any) {
      throw new Error(`Failed to read SSH key ${keyPath}: ${e?.message}`);
    }
  } else if (server.authMethod === "password" && server.password) {
    cfg.password = server.password;
  } else {
    throw new Error(`Invalid auth config for server ${server.name}`);
  }

  return cfg;
}

/** Get or create a persistent SSH connection */
export async function getConnection(server: SshServerConfig): Promise<Client> {
  const existing = pool.get(server.id);
  if (existing) {
    if (existing.connecting) return existing.connecting;
    if (existing.conn) {
      existing.lastActivity = Date.now();
      return existing.conn;
    }
  }

  // Start new connection
  const connecting = new Promise<Client>((resolve, reject) => {
    const conn = new Client();
    const cfg = buildConnectConfig(server);

    conn.on("ready", () => {
      const entry = pool.get(server.id);
      if (entry) {
        entry.conn = conn;
        entry.connecting = null;
        entry.lastActivity = Date.now();
      } else {
        pool.set(server.id, { conn, lastActivity: Date.now(), connecting: null });
      }
      console.log(`[ssh-pool] connected to ${server.name} (${server.host})`);
      resolve(conn);
    });

    conn.on("error", (err) => {
      console.error(`[ssh-pool] error on ${server.name}:`, err.message);
      pool.delete(server.id);
      reject(err);
    });

    conn.on("close", () => {
      console.log(`[ssh-pool] connection closed: ${server.name}`);
      pool.delete(server.id);
    });

    conn.on("end", () => {
      pool.delete(server.id);
    });

    try {
      conn.connect(cfg);
    } catch (e: any) {
      pool.delete(server.id);
      reject(e);
    }
  });

  // Store connecting promise
  pool.set(server.id, { conn: null as any, lastActivity: Date.now(), connecting });

  return connecting;
}

/** Test connection — returns quickly with ok/error */
export async function testConnection(server: SshServerConfig): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
  const start = Date.now();
  try {
    const conn = await getConnection(server);
    // Run a simple command to verify
    await execCommand(conn, "echo ok");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Connection failed" };
  }
}

/** Execute a command and return stdout/stderr/exitCode */
export async function execCommand(conn: Client, cmd: string, options: { timeout?: number; cwd?: string } = {}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const fullCmd = options.cwd ? `cd ${JSON.stringify(options.cwd)} && ${cmd}` : cmd;
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { stream.close(); } catch { /* ignore */ }
        resolve({ stdout, stderr: stderr + "\n[timeout]", exitCode: 124 });
      }
    }, options.timeout || 30_000);

    const stream = conn.exec(fullCmd, (err, channel) => {
      if (err) {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve({ stdout: "", stderr: err.message, exitCode: 1 });
        }
        return;
      }

      channel.on("data", (data: Buffer) => { stdout += data.toString("utf8"); });
      channel.stderr.on("data", (data: Buffer) => { stderr += data.toString("utf8"); });
      channel.on("close", (code: number) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          exitCode = code ?? 0;
          resolve({ stdout, stderr, exitCode });
        }
      });
      channel.on("error", (err: Error) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve({ stdout, stderr: stderr + err.message, exitCode: 1 });
        }
      });
    });
  });
}

/** Open an interactive shell with PTY — returns a duplex stream */
export async function openShell(conn: Client, options: { cols: number; rows: number; cwd?: string; env?: Record<string, string> }): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    const env = options.env || {};
    conn.shell(
      {
        cols: options.cols || 80,
        rows: options.rows || 24,
        term: "xterm-256color",
      },
      // env support via setEnv requires server cooperation; we set TERM via pty
      (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        // If cwd specified, send a cd command
        if (options.cwd) {
          stream.write(`cd ${JSON.stringify(options.cwd)}\n`);
        }
        resolve(stream);
      }
    );
  });
}

/** Close all connections for a specific server (e.g. after config change) */
export function closeConnection(serverId: string) {
  const entry = pool.get(serverId);
  if (entry?.conn) {
    try { entry.conn.end(); } catch { /* ignore */ }
  }
  pool.delete(serverId);
}

/** Close all connections (graceful shutdown) */
export function closeAllConnections() {
  for (const [, entry] of pool) {
    if (entry.conn) {
      try { entry.conn.end(); } catch { /* ignore */ }
    }
  }
  pool.clear();
}

process.on("SIGTERM", () => closeAllConnections());
process.on("SIGINT", () => closeAllConnections());
