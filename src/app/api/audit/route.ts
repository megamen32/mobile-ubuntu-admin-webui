import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit?limit=100&offset=0&action=service.&username=root
 *   Returns audit log entries (newest first).
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(500, Math.max(10, Number(sp.get("limit") || 100)));
  const offset = Math.max(0, Number(sp.get("offset") || 0));
  const actionFilter = sp.get("action"); // prefix match, e.g. "service." matches service.start
  const usernameFilter = sp.get("username");

  try {
    const where: any = {};
    if (actionFilter) where.action = { startsWith: actionFilter };
    if (usernameFilter) where.username = usernameFilter;

    const [entries, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { ts: "desc" },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ]);

    // BigInt (ts) is not JSON-serializable by default — convert to string
    const serialized = entries.map(e => ({
      ...e,
      ts: e.ts.toString(),
    }));

    return NextResponse.json({
      entries: serialized,
      total,
      limit,
      offset,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
