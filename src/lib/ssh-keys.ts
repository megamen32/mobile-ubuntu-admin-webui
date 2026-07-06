import { readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

/**
 * List available SSH keys in ~/.ssh/ — used by the manage servers UI to
 * populate the key dropdown when adding a server.
 *
 * Returns filenames (not full paths). Files starting with "." are skipped.
 * Common public key extensions (.pub) are filtered out — we want private keys.
 */
export async function listSshKeys(): Promise<string[]> {
  const sshDir = join(homedir(), ".ssh");
  try {
    const entries = await readdir(sshDir);
    const keys: string[] = [];
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      if (name.endsWith(".pub")) continue; // public key — skip
      if (name === "known_hosts" || name === "authorized_keys" || name === "config") continue;
      try {
        const filePath = join(sshDir, name);
        const s = await stat(filePath);
        if (!s.isFile()) continue;
        // Heuristic: skip files > 100KB (unlikely to be keys)
        if (s.size > 100 * 1024) continue;
        keys.push(name);
      } catch { /* skip unreadable */ }
    }
    return keys.sort();
  } catch {
    return [];
  }
}
