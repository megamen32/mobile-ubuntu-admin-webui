import * as pty from "node-pty";
import type { IPty } from "node-pty";
import { Client, ClientChannel } from "ssh2";
import { getConnection, openShell, type SshServerConfig } from "@/lib/ssh-pool";

/**
 * In-process PTY session manager — supports both local (node-pty) and remote (SSH shell).
 *
 * Each session has an abstract "transport" with a uniform interface:
 *  - write(data): send keystrokes
 *  - resize(cols, rows): resize terminal
 *  - kill(): terminate
 *  - onData(cb): receive output
 *  - onExit(cb): process exited
 *
 * Local transport uses node-pty.spawn().
 * Remote transport uses ssh2 shell() channel.
 *
 * Sessions are keyed by sessionId. Buffer + waiters work the same for both.
 */

interface PtyTransport {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: (code: number | null, signal?: string) => void): void;
}

export interface PtySession {
  id: string;
  username: string;
  mode: "local" | "remote";
  serverName?: string;
  transport: PtyTransport;
  buffer: string;
  waiters: Array<{
    resolve: (data: string) => void;
    timer: NodeJS.Timeout;
  }>;
  exitCode: number | null;
  lastActivity: number;
  createdAt: number;
}

const MAX_BUFFER = 64 * 1024;
const POLL_TIMEOUT_MS = 25_000;
const IDLE_REAP_MS = 30 * 60 * 1000;

const sessions = new Map<string, PtySession>();

let reaperStarted = false;
function startReaper() {
  if (reaperStarted) return;
  reaperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastActivity > IDLE_REAP_MS) {
        try { s.transport.kill(); } catch { /* ignore */ }
        sessions.delete(id);
      }
    }
  }, 60_000).unref();
}

/** Create a local PTY session using node-pty */
function createLocalTransport(
  username: string,
  cols: number,
  rows: number
): PtyTransport {
  const shell = process.env.SHELL || "/bin/bash";
  const home = process.env.HOME || `/home/${username}`;

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    LANG: "en_US.UTF-8",
    USER: username,
    LOGNAME: username,
    HOME: home,
  };

  const ptyProc = pty.spawn(shell, ["--login"], {
    name: "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: home,
    env,
  });

  return {
    write: (data) => ptyProc.write(data),
    resize: (cols, rows) => {
      try { ptyProc.resize(cols, rows); } catch { /* ignore */ }
    },
    kill: () => { try { ptyProc.kill(); } catch { /* ignore */ } },
    onData: (cb) => ptyProc.onData(cb),
    onExit: (cb) => ptyProc.onExit(({ exitCode }) => cb(exitCode)),
  };
}

/** Create a remote PTY session using ssh2 shell channel */
async function createRemoteTransport(
  server: SshServerConfig,
  cols: number,
  rows: number
): Promise<PtyTransport> {
  const conn = await getConnection(server);
  const stream = await openShell(conn, {
    cols: cols || 80,
    rows: rows || 24,
  });

  return {
    write: (data) => {
      try { stream.write(data); } catch { /* ignore */ }
    },
    resize: (cols, rows) => {
      try {
        // ssh2 uses setWindow on the channel
        (stream as ClientChannel).setWindow(rows, cols, 480, 640);
      } catch { /* ignore */ }
    },
    kill: () => {
      try { stream.close(); } catch { /* ignore */ }
      try { stream.destroy(); } catch { /* ignore */ }
    },
    onData: (cb) => {
      stream.on("data", (chunk: Buffer) => cb(chunk.toString("utf8")));
    },
    onExit: (cb) => {
      stream.on("close", (code: number, signal: any) => {
        cb(code ?? 0, signal ? String(signal) : undefined);
      });
      stream.on("exit", (code: number, signal: any) => {
        cb(code ?? 0, signal ? String(signal) : undefined);
      });
    },
  };
}

/** Create a new session (local or remote) */
export async function createSession(
  id: string,
  username: string,
  cols: number,
  rows: number,
  server?: SshServerConfig
): Promise<PtySession> {
  const existing = sessions.get(id);
  if (existing) return existing;

  let transport: PtyTransport;
  let mode: "local" | "remote" = "local";
  let serverName: string | undefined;

  if (server) {
    mode = "remote";
    serverName = server.name;
    transport = await createRemoteTransport(server, cols, rows);
  } else {
    transport = createLocalTransport(username, cols, rows);
  }

  const session: PtySession = {
    id,
    username,
    mode,
    serverName,
    transport,
    buffer: "",
    waiters: [],
    exitCode: null,
    lastActivity: Date.now(),
    createdAt: Date.now(),
  };
  sessions.set(id, session);

  // Wire up transport events
  session.transport.onData((data) => {
    session.lastActivity = Date.now();
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER) {
      session.buffer = session.buffer.slice(-MAX_BUFFER);
    }
    while (session.waiters.length > 0) {
      const w = session.waiters.shift()!;
      clearTimeout(w.timer);
      w.resolve(data);
    }
  });

  session.transport.onExit((exitCode) => {
    session.exitCode = exitCode ?? -1;
    while (session.waiters.length > 0) {
      const w = session.waiters.shift()!;
      clearTimeout(w.timer);
      w.resolve("");
    }
    setTimeout(() => sessions.delete(id), 60_000).unref();
  });

  startReaper();
  return session;
}

export function getSession(id: string): PtySession | undefined {
  return sessions.get(id);
}

export function writeInput(id: string, data: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  s.lastActivity = Date.now();
  try {
    s.transport.write(data);
    return true;
  } catch {
    return false;
  }
}

export function resizeSession(id: string, cols: number, rows: number): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    s.transport.resize(cols, rows);
    return true;
  } catch {
    return false;
  }
}

export function killSession(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  try { s.transport.kill(); } catch { /* ignore */ }
  while (s.waiters.length > 0) {
    const w = s.waiters.shift()!;
    clearTimeout(w.timer);
    w.resolve("");
  }
  sessions.delete(id);
  return true;
}

export function pollOutput(id: string): Promise<{ data: string; exit: boolean; remaining: string }> {
  return new Promise((resolve) => {
    const s = sessions.get(id);
    if (!s) {
      resolve({ data: "", exit: true, remaining: "" });
      return;
    }
    if (s.buffer.length > 0) {
      const data = s.buffer;
      s.buffer = "";
      resolve({ data, exit: s.exitCode !== null, remaining: "" });
      return;
    }
    if (s.exitCode !== null) {
      resolve({ data: "", exit: true, remaining: "" });
      return;
    }
    const timer = setTimeout(() => {
      const idx = s.waiters.findIndex(w => w.timer === timer);
      if (idx >= 0) s.waiters.splice(idx, 1);
      resolve({ data: "", exit: s.exitCode !== null, remaining: "" });
    }, POLL_TIMEOUT_MS);

    s.waiters.push({
      resolve: (data: string) => {
        const buffered = s.buffer;
        s.buffer = "";
        resolve({ data: data + buffered, exit: s.exitCode !== null, remaining: "" });
      },
      timer,
    });
  });
}

export function makeSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
