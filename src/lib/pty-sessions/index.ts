import * as pty from "node-pty";
import type { IPty } from "node-pty";

/**
 * In-process PTY session manager for Next.js API routes.
 *
 * Why: Next.js rewrites can't reliably proxy WebSockets to a different port in
 * the preview sandbox (ECONNRESET / socket hang up). Instead we host the PTY
 * pool inside the Next.js process itself and expose it via HTTP routes that
 * the frontend polls. This keeps everything on port 3000 (the only externally
 * visible port) and avoids the proxy problem entirely.
 *
 * Sessions are keyed by sessionId. Each session has:
 *  - pty: the node-pty process
 *  - buffer: rolling output buffer (last 64KB) — consumed via long-polling
 *  - waiters: queue of long-poll HTTP responses waiting for new output
 *  - createdAt, lastActivity: for idle reaping
 *
 * Lifecycle:
 *  - POST /api/pty/connect  → create session, return sessionId
 *  - POST /api/pty/input    → write keystrokes
 *  - GET  /api/pty/output   → long-poll for output (up to 25s)
 *  - POST /api/pty/resize   → resize terminal
 *  - POST /api/pty/kill     → kill session
 */

export interface PtySession {
  id: string;
  pty: IPty;
  username: string;
  buffer: string;          // rolling output buffer
  waiters: Array<{         // long-poll waiters
    resolve: (data: string) => void;
    timer: NodeJS.Timeout;
  }>;
  exitCode: number | null;
  lastActivity: number;
  createdAt: number;
}

const MAX_BUFFER = 64 * 1024; // 64KB rolling buffer
const POLL_TIMEOUT_MS = 25_000;
const IDLE_REAP_MS = 30 * 60 * 1000; // 30 min

const sessions = new Map<string, PtySession>();

// Idle reaper — kill sessions idle for > 30 min
let reaperStarted = false;
function startReaper() {
  if (reaperStarted) return;
  reaperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastActivity > IDLE_REAP_MS) {
        try { s.pty.kill(); } catch { /* ignore */ }
        sessions.delete(id);
      }
    }
  }, 60_000).unref();
}

export function createSession(
  id: string,
  username: string,
  cols: number,
  rows: number
): PtySession {
  // Reuse existing if same id
  const existing = sessions.get(id);
  if (existing) return existing;

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

  const session: PtySession = {
    id,
    pty: ptyProc,
    username,
    buffer: "",
    waiters: [],
    exitCode: null,
    lastActivity: Date.now(),
    createdAt: Date.now(),
  };
  sessions.set(id, session);

  ptyProc.onData((data) => {
    session.lastActivity = Date.now();
    // Append to rolling buffer
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER) {
      session.buffer = session.buffer.slice(-MAX_BUFFER);
    }
    // Wake up all waiters
    while (session.waiters.length > 0) {
      const w = session.waiters.shift()!;
      clearTimeout(w.timer);
      w.resolve(data);
    }
  });

  ptyProc.onExit(({ exitCode, signal }) => {
    session.exitCode = exitCode ?? -1;
    // Wake up all waiters with exit sentinel
    while (session.waiters.length > 0) {
      const w = session.waiters.shift()!;
      clearTimeout(w.timer);
      w.resolve(""); // empty payload — exit code is checked separately
    }
    // Auto-cleanup after 60s
    setTimeout(() => {
      sessions.delete(id);
    }, 60_000).unref();
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
    s.pty.write(data);
    return true;
  } catch {
    return false;
  }
}

export function resizeSession(id: string, cols: number, rows: number): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    s.pty.resize(
      Math.max(1, Math.min(400, cols)),
      Math.max(1, Math.min(200, rows))
    );
    return true;
  } catch {
    return false;
  }
}

export function killSession(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  try { s.pty.kill(); } catch { /* ignore */ }
  // Wake up waiters
  while (s.waiters.length > 0) {
    const w = s.waiters.shift()!;
    clearTimeout(w.timer);
    w.resolve("");
  }
  sessions.delete(id);
  return true;
}

/**
 * Long-poll for output. Returns a promise that resolves when:
 *  - new data arrives, OR
 *  - the session exits, OR
 *  - POLL_TIMEOUT_MS elapses (returns whatever is in the buffer)
 */
export function pollOutput(id: string): Promise<{ data: string; exit: boolean; remaining: string }> {
  return new Promise((resolve) => {
    const s = sessions.get(id);
    if (!s) {
      resolve({ data: "", exit: true, remaining: "" });
      return;
    }
    // If buffer has content, return it immediately
    if (s.buffer.length > 0) {
      const data = s.buffer;
      s.buffer = "";
      resolve({ data, exit: s.exitCode !== null, remaining: "" });
      return;
    }
    // If session exited, signal exit
    if (s.exitCode !== null) {
      resolve({ data: "", exit: true, remaining: "" });
      return;
    }
    // Otherwise wait for new data
    const timer = setTimeout(() => {
      // Timeout — pop ourselves from waiters
      const idx = s.waiters.findIndex(w => w.timer === timer);
      if (idx >= 0) s.waiters.splice(idx, 1);
      resolve({ data: "", exit: s.exitCode !== null, remaining: "" });
    }, POLL_TIMEOUT_MS);

    s.waiters.push({
      resolve: (data: string) => {
        // Also drain any buffered data accumulated between waiter registration and now
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
