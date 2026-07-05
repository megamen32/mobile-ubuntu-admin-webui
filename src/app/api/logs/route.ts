import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell, hasJournalctl } from "@/lib/server-exec";
import { generateMockLogs } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/logs?lines=500&since=1h&priority=0..7&unit=nginx
 *
 * General journalctl viewer. Returns lines (no leading unit prefix for compactness).
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const lines = Math.min(5000, Math.max(50, Number(sp.get("lines") || 500)));
  const since = sp.get("since");
  const priority = sp.get("priority");
  const unit = sp.get("unit");

  const onJournal = await hasJournalctl();
  if (!onJournal) {
    return NextResponse.json({
      logs: generateMockLogs(lines, unit || undefined),
      mock: true,
      ts: Date.now(),
    });
  }

  const args: string[] = ["journalctl", "--no-pager", "-o", "short-iso", "-n", String(lines)];
  if (since) args.push("--since=" + JSON.stringify(since));
  if (priority) args.push("-p", JSON.stringify(priority));
  if (unit) args.push("-u", unit.replace(/[^a-zA-Z0-9_.@-]/g, ""));

  const r = await runShell(args.join(" ") + " 2>&1", { timeout: 20_000 });
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
