import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { createSession, makeSessionId, getSession } from "@/lib/pty-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const cols = Number(body.cols) || 80;
  const rows = Number(body.rows) || 24;
  const sessionId = body.sessionId || makeSessionId();

  // Reuse if exists
  let session = getSession(sessionId);
  if (!session) {
    session = createSession(sessionId, auth.username, cols, rows);
  }

  return NextResponse.json({
    sessionId,
    shell: process.env.SHELL || "/bin/bash",
    cols,
    rows,
  });
}
