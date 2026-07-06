import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Lightweight liveness probe — no auth, no DB calls.
 * Used by Docker healthcheck and load balancers.
 *
 * For deeper checks (DB reachable, systemd reachable), add /api/health/ready.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    ts: Date.now(),
    pid: process.pid,
  });
}
