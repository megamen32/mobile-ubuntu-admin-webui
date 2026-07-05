import { createServer } from "http";
import { Server, Socket } from "socket.io";
import * as pty from "node-pty";
import { spawn as spawnCb } from "child_process";

const PORT = 3003;
const SHELL = process.env.SHELL || "/bin/bash";

/**
 * PTY mini-service — bidirectional WebSocket terminal backed by node-pty.
 *
 * Wire protocol (Socket.IO, path "/" — required by Caddy gateway):
 *  - Client emits "auth"   { username, password, sessionId }   — auth & create session
 *  - Client emits "input"  { data, sessionId }                  — keystrokes to PTY
 *  - Client emits "resize" { cols, rows, sessionId }            — terminal resize
 *  - Client emits "kill"   { sessionId }                        — kill PTY process
 *  - Server emits "auth:ok"   { sessionId }
 *  - Server emits "auth:fail"
 *  - Server emits "output" { data, sessionId }                  — PTY stdout/stderr
 *  - Server emits "exit"   { code, sessionId }                  — PTY process exited
 *  - Server emits "error"  { message, sessionId }
 *
 * Auth is performed by spawning `su -c true <user>` with password piped to stdin.
 * In preview sandbox where `su` doesn't accept passwords via stdin, we accept any
 * non-empty pair so the UI is demoable. On real Ubuntu this needs to be replaced
 * with PAM validation (or the proxy should validate auth before forwarding).
 */

interface SessionState {
  pty: pty.IPty;
  username: string;
  cwd: string;
  lastActivity: number;
}

const sessions = new Map<string, SessionState>();
const authedSockets = new WeakSet<Socket>();

const httpServer = createServer();

const io = new Server(httpServer, {
  // Use default path /socket.io/ so Caddy gateway forwards correctly.
  // The path "/" was wrong — Socket.IO expects /socket.io/ by default.
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
  maxHttpBufferSize: 5 * 1024 * 1024, // 5MB for big paste
});

/** Auth via `su -c true <user>` with password on stdin. */
async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawnCb(
        "su",
        ["-c", "exit 0", username],
        { stdio: ["pipe", "ignore", "ignore"] }
      );
      let settled = false;
      const done = (ok: boolean) => {
        if (!settled) {
          settled = true;
          resolve(ok);
        }
      };
      child.on("exit", (code: number | null) => done(code === 0));
      child.on("error", () => done(false));
      try {
        child.stdin.write(password + "\n");
        child.stdin.end();
      } catch {
        done(false);
      }
      // Timeout — sandbox `su` may not respond
      setTimeout(() => done(false), 4000);
    } catch {
      resolve(false);
    }
  });
}

/** Generate a session ID. */
function makeSessionId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

/** Spawn or reuse a PTY for the given session. */
function spawnPty(
  sessionId: string,
  username: string,
  cols: number,
  rows: number
): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  const env = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    LANG: "en_US.UTF-8",
    USER: username,
    LOGNAME: username,
    HOME: `/home/${username}`,
  };

  const ptyProc = pty.spawn(SHELL, ["--login"], {
    name: "xterm-256color",
    cols: cols || 80,
    rows: rows || 24,
    cwd: env.HOME,
    env,
  });

  const state: SessionState = {
    pty: ptyProc,
    username,
    cwd: env.HOME || "/",
    lastActivity: Date.now(),
  };
  sessions.set(sessionId, state);

  ptyProc.onData((data) => {
    // Track cwd by sniffing prompt? Hard to do reliably. We rely on client-side
    // tracking instead (terminalView parses prompt) — keep it simple here.
    state.lastActivity = Date.now();
    io.to(sessionId).emit("output", { data, sessionId });
  });

  ptyProc.onExit(({ exitCode, signal }) => {
    io.to(sessionId).emit("exit", {
      code: exitCode,
      signal,
      sessionId,
    });
    sessions.delete(sessionId);
  });

  return state;
}

/** Track cwd from PTY output by emitting OSC 7 / heuristic prompt parsing. */
function trackCwd(socket: Socket, sessionId: string, data: string) {
  // OSC 7: \x1b]7;file:///path\x07  — emitted by some shells
  const osc7 = data.match(/\x1b\]7;file:\/\/[^/]+(\/[^\x07\x1b]*)/);
  if (osc7 && osc7[1]) {
    socket.emit("cwd", { sessionId, cwd: osc7[1] });
    return;
  }
}

io.on("connection", (socket: Socket) => {
  console.log(`[pty] socket connected: ${socket.id}`);

  socket.on("auth", async (payload: { username: string; password: string; sessionId?: string; cols?: number; rows?: number }) => {
    const { username, password, sessionId: requestedId, cols, rows } = payload || {};
    if (!username || !password) {
      socket.emit("auth:fail", { message: "missing credentials" });
      return;
    }

    // Try real auth
    let ok = false;
    try {
      ok = await verifyCredentials(username, password);
    } catch { /* ignore */ }

    // Sandbox fallback: accept any non-empty pair so UI is demoable.
    // In production: replace with PAM/sudo-based auth and remove this fallback.
    if (!ok) {
      ok = String(username).length > 0 && String(password).length > 0;
    }

    if (!ok) {
      socket.emit("auth:fail", { message: "invalid credentials" });
      return;
    }

    authedSockets.add(socket);

    const sessionId = requestedId || makeSessionId();
    socket.join(sessionId);

    try {
      spawnPty(sessionId, username, cols || 80, rows || 24);
    } catch (e: any) {
      socket.emit("error", { message: e?.message ?? "spawn failed", sessionId });
      return;
    }

    socket.emit("auth:ok", { sessionId, shell: SHELL });
    console.log(`[pty] session ${sessionId} authed as ${username}`);
  });

  socket.on("input", (payload: { data: string; sessionId: string }) => {
    if (!authedSockets.has(socket)) return;
    const { data, sessionId } = payload || {};
    if (!data || !sessionId) return;
    const state = sessions.get(sessionId);
    if (!state) {
      socket.emit("error", { message: "no session", sessionId });
      return;
    }
    state.lastActivity = Date.now();
    try {
      state.pty.write(data);
    } catch (e: any) {
      socket.emit("error", { message: e?.message ?? "write failed", sessionId });
    }
  });

  socket.on("resize", (payload: { cols: number; rows: number; sessionId: string }) => {
    if (!authedSockets.has(socket)) return;
    const { cols, rows, sessionId } = payload || {};
    if (!cols || !rows || !sessionId) return;
    const state = sessions.get(sessionId);
    if (!state) return;
    try {
      state.pty.resize(Math.max(1, Math.min(400, cols)), Math.max(1, Math.min(200, rows)));
    } catch { /* ignore */ }
  });

  socket.on("kill", (payload: { sessionId: string }) => {
    if (!authedSockets.has(socket)) return;
    const { sessionId } = payload || {};
    if (!sessionId) return;
    const state = sessions.get(sessionId);
    if (!state) return;
    try {
      state.pty.kill();
    } catch { /* ignore */ }
    sessions.delete(sessionId);
    console.log(`[pty] session ${sessionId} killed by client`);
  });

  // Track cwd from PTY output (forward to all sockets in room)
  socket.onAny((eventName: string, ...args: any[]) => {
    if (eventName === "output-relay") {
      // unused — server-side forwarder pattern, kept for future
    }
  });

  socket.on("disconnect", () => {
    console.log(`[pty] socket disconnected: ${socket.id}`);
    // Sessions persist — multiple sockets can share a session (e.g. multiple tabs)
    // Sessions are killed via explicit "kill" event or timeout.
  });

  socket.on("error", (err: Error) => {
    console.error(`[pty] socket error:`, err);
  });
});

// Idle session reaper — kill sessions idle for > 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, state] of sessions) {
    if (now - state.lastActivity > 30 * 60 * 1000) {
      console.log(`[pty] reaping idle session ${id}`);
      try { state.pty.kill(); } catch { /* ignore */ }
      sessions.delete(id);
    }
  }
}, 60_000).unref();

httpServer.listen(PORT, () => {
  console.log(`[pty-service] listening on port ${PORT}, shell=${SHELL}`);
});

// Graceful shutdown
const shutdown = (sig: string) => {
  console.log(`[pty-service] ${sig} received, killing ${sessions.size} sessions`);
  for (const [, state] of sessions) {
    try { state.pty.kill(); } catch { /* ignore */ }
  }
  io.close();
  httpServer.close(() => process.exit(0));
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
