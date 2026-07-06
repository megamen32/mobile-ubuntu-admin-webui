import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { createSession, makeSessionId, getSession } from "@/lib/pty-sessions";
import { rateLimiter, rateLimitedResponse, getClientIp } from "@/lib/rate-limiter";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Max 10 new PTY sessions per minute per IP (per user is harder to enforce
// with Basic auth — IP-based is good enough for resource-exhaustion protection)
const ptyLimiter = rateLimiter({
  windowMs: 60_000,
  max: 10,
  keyPrefix: "pty-connect",
});

/**
 * POST /api/pty/connect
 *   { cols, rows, sessionId? }
 * Returns { sessionId, shell }
 *
 * Creates a new PTY session (or reuses existing if sessionId provided).
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  // Rate limit new session creation
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

  // Reuse if exists
  let session = getSession(sessionId);
  if (!session) {
    session = createSession(sessionId, auth.username, cols, rows);
  }

  if (isNew) {
    await recordAudit({
      username: auth.username,
      action: "pty.connect",
      target: sessionId,
      ip,
      meta: { cols, rows },
    });
  }

  return NextResponse.json({
    sessionId,
    shell: process.env.SHELL || "/bin/bash",
    cols,
    rows,
  });
}
