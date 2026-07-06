import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { createSession, makeSessionId, getSession } from "@/lib/pty-sessions";
import { getSshConnection } from "@/lib/server-context";
import { rateLimiter, rateLimitedResponse, getClientIp } from "@/lib/rate-limiter";
import { recordAudit } from "@/lib/audit";
import type { SshServerConfig } from "@/lib/ssh-pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ptyLimiter = rateLimiter({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "pty-connect",
});

/**
 * POST /api/pty/connect
 *   { cols, rows, sessionId? }
 * Returns { sessionId, shell, mode, serverName }
 *
 * Creates a new PTY session (or reuses existing if sessionId provided).
 * Supports multi-server: if X-Server-Id header is set, opens SSH shell.
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  const ip = getClientIp(req);
  const rl = ptyLimiter.check(ip);
  if (!rl.ok) {
    return rateLimitedResponse(rl.retryAfterMs, "Too many PTY sessions created. Try again later.");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const cols = Number(body.cols) || 80;
  const rows = Number(body.rows) || 24;
  const sessionId = body.sessionId || makeSessionId();
  const isNew = !getSession(sessionId);

  // Check if remote server is selected
  const sshResult = await getSshConnection(req);
  let server: SshServerConfig | undefined;
  if (sshResult) {
    server = sshResult.server;
  }

  // Create or reuse session
  let session = getSession(sessionId);
  if (!session) {
    try {
      session = await createSession(sessionId, auth.username, cols, rows, server);
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "Failed to create PTY session" },
        { status: 500 }
      );
    }
  }

  if (isNew) {
    await recordAudit({
      username: auth.username,
      action: "pty.connect",
      target: sessionId,
      ip,
      meta: {
        cols, rows,
        mode: session.mode,
        server: session.serverName,
      },
    });
  }

  return NextResponse.json({
    sessionId,
    shell: process.env.SHELL || "/bin/bash",
    cols,
    rows,
    mode: session.mode,
    serverName: session.serverName,
  });
}
