import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { resizeSession, getSession } from "@/lib/pty-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pty/resize
 *   { sessionId, cols, rows }
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { sessionId, cols, rows } = body;
  if (!sessionId || !cols || !rows) {
    return NextResponse.json({ error: "sessionId, cols, rows required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  resizeSession(sessionId, Number(cols), Number(rows));
  return NextResponse.json({ ok: true });
}
