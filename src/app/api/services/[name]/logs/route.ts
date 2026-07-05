import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell, hasSystemd } from "@/lib/server-exec";
import { generateMockLogs } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/services/[name]/logs?lines=200&since=1h
 *
 * Returns journalctl -u <name> output. Uses SSE-friendly chunked text.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const { name } = await params;
  const safeName = name.replace(/[^a-zA-Z0-9_.@-]/g, "");
  if (!safeName) return NextResponse.json({ error: "Invalid unit name" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const lines = Math.min(2000, Math.max(50, Number(sp.get("lines") || 200)));
  const since = sp.get("since"); // e.g. "1h", "2d", "2025-01-01"

  const onSystemd = await hasSystemd();
  if (!onSystemd) {
    return NextResponse.json({
      logs: generateMockLogs(lines, safeName),
      mock: true,
      ts: Date.now(),
    });
  }

  const sinceArg = since ? ` --since=${JSON.stringify(since)}` : "";
  const r = await runShell(
    `journalctl -u ${safeName}${sinceArg} -n ${lines} --no-pager -o cat 2>&1`,
    { timeout: 15_000 }
  );
  if (r.exitCode !== 0) {
    return NextResponse.json(
      { error: r.stderr || "journalctl failed", exitCode: r.exitCode },
      { status: 500 }
    );
  }
  return NextResponse.json({
    logs: r.stdout.split("\n").filter(Boolean),
    mock: false,
    ts: Date.now(),
  });
}
