import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auth check — supports two methods:
 *
 * 1. Standard: `Authorization: Basic <base64(user:pass)>` header
 * 2. Query string: `?u=<user>&p=<pass>` — used by EventSource (SSE) which
 *    can't send custom headers.
 *
 * The query-string variant is required because EventSource API doesn't allow
 * setting headers. The URL is HTTPS-only in production, so credentials are
 * encrypted in transit.
 */
export function checkAuth(req: NextRequest): { ok: boolean; username?: string } {
  // Method 1: Authorization header
  const hdr = req.headers.get("authorization") || "";
  if (hdr.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(hdr.slice(6), "base64").toString("utf8");
      const [username, password] = decoded.split(":");
      if (!username || !password) return { ok: false };
      return { ok: true, username };
    } catch {
      return { ok: false };
    }
  }

  // Method 2: Query string (for SSE / EventSource)
  const url = req.nextUrl;
  const qUser = url.searchParams.get("u");
  const qPass = url.searchParams.get("p");
  if (qUser && qPass) {
    return { ok: true, username: qUser };
  }

  return { ok: false };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
