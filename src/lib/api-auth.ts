import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Basic auth middleware helper — checks Authorization header. */
export function checkAuth(req: NextRequest): { ok: boolean; username?: string } {
  const hdr = req.headers.get("authorization") || "";
  if (!hdr.startsWith("Basic ")) return { ok: false };
  try {
    const decoded = Buffer.from(hdr.slice(6), "base64").toString("utf8");
    const [username, password] = decoded.split(":");
    if (!username || !password) return { ok: false };
    return { ok: true, username };
  } catch {
    return { ok: false };
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
