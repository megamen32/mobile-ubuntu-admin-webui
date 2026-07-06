import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runShell } from "@/lib/server-exec";
import { getConnection, execCommand, type SshServerConfig } from "@/lib/ssh-pool";

/**
 * Server context — determines which server a request targets.
 *
 * Two modes:
 *  1. "local" (default) — run commands on the host running this app
 *  2. "remote" — connect via SSH to a registered server
 *
 * The mode is determined by the `X-Server-Id` header (or ?server= query).
 * If absent or "local", we run locally. Otherwise we look up the server
 * config in the DB and SSH to it.
 *
 * This abstraction lets all existing API routes work unchanged — they just
 * call `ctx.exec(cmd)` instead of `runShell(cmd)`.
 */

export interface ServerContext {
  mode: "local" | "remote";
  serverId?: string;
  serverName?: string;
  /** Execute a shell command */
  exec: (cmd: string, opts?: { timeout?: number; cwd?: string }) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
  /** Get connection (for PTY/SFTP operations that need raw SSH access) */
  getConnection?: () => Promise<any>;
}

/** Local server — special ID for the host running this app */
export const LOCAL_SERVER_ID = "local";

export async function getServerContext(req: NextRequest): Promise<ServerContext> {
  const serverId = req.headers.get("x-server-id") || req.nextUrl.searchParams.get("server") || LOCAL_SERVER_ID;

  if (serverId === LOCAL_SERVER_ID) {
    return {
      mode: "local",
      serverId: LOCAL_SERVER_ID,
      serverName: "local",
      exec: runShell,
    };
  }

  // Look up server config
  let server: SshServerConfig | null = null;
  try {
    const s = await db.server.findUnique({ where: { id: serverId } });
    if (s) {
      server = {
        id: s.id,
        name: s.name,
        host: s.host,
        port: s.port,
        username: s.username,
        authMethod: s.authMethod as "password" | "key",
        password: s.password || undefined,
        keyName: s.keyName || undefined,
        passphrase: s.passphrase || undefined,
      };
    }
  } catch (e: any) {
    // DB may not have servers table yet — fall back to local
    console.warn("[server-context] DB error:", e?.message);
  }

  if (!server) {
    // Server not found — fall back to local with warning
    return {
      mode: "local",
      serverId: LOCAL_SERVER_ID,
      serverName: "local (fallback)",
      exec: runShell,
    };
  }

  return {
    mode: "remote",
    serverId: server.id,
    serverName: server.name,
    exec: async (cmd, opts) => {
      const conn = await getConnection(server!);
      return execCommand(conn, cmd, opts);
    },
    getConnection: async () => {
      return getConnection(server!);
    },
  };
}

/** Helper for routes that need raw SSH connection (PTY, SFTP) */
export async function getSshConnection(req: NextRequest): Promise<{ conn: any; server: SshServerConfig } | null> {
  const serverId = req.headers.get("x-server-id") || req.nextUrl.searchParams.get("server") || LOCAL_SERVER_ID;
  if (serverId === LOCAL_SERVER_ID) return null;

  try {
    const s = await db.server.findUnique({ where: { id: serverId } });
    if (!s) return null;

    const server: SshServerConfig = {
      id: s.id,
      name: s.name,
      host: s.host,
      port: s.port,
      username: s.username,
      authMethod: s.authMethod as "password" | "key",
      password: s.password || undefined,
      keyName: s.keyName || undefined,
      passphrase: s.passphrase || undefined,
    };

    const conn = await getConnection(server);
    return { conn, server };
  } catch {
    return null;
  }
}
