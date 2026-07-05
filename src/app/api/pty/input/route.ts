import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { writeInput, getSession } from "@/lib/pty-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pty/input
 *   { sessionId, data }
 * Returns { ok }
 *
 * Writes keystrokes to the PTY.
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

  const { sessionId, data } = body;
  if (!sessionId || typeof data !== "string") {
    return NextResponse.json({ error: "sessionId and data required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const ok = writeInput(sessionId, data);
  if (!ok) {
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
