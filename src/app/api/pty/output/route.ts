import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { pollOutput, getSession } from "@/lib/pty-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/pty/output?sessionId=...
 *
 * Long-polls for new PTY output. Returns when:
 *  - new data arrives → { data, exit: false }
 *  - session exits    → { data: "", exit: true, exitCode }
 *  - 25s timeout      → { data: "", exit: false } (client polls again)
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found", exit: true, exitCode: -1 }, { status: 404 });
  }

  const result = await pollOutput(sessionId);

  return NextResponse.json({
    data: result.data,
    exit: result.exit,
    exitCode: session.exitCode,
    sessionId,
  });
}
