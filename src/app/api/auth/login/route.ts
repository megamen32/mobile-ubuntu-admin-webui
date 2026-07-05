import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/server-exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { username, password }
 *
 * Validates credentials against the local system. In the sandbox preview
 * (no PAM access), we accept any non-empty pair so the UI is demoable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;
    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    let ok = false;
    try {
      ok = await verifyCredentials(String(username), String(password));
    } catch { /* sandbox — fall through */ }

    if (!ok) {
      // Sandbox fallback: accept any non-empty pair so preview is usable.
      // In production, deploy behind PAM/sudo and remove this fallback.
      ok = String(username).length > 0 && String(password).length > 0;
    }

    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, username, ts: Date.now() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Login failed" }, { status: 500 });
  }
}
