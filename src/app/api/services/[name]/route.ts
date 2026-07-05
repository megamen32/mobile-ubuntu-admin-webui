import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell, hasSystemd } from "@/lib/server-exec";
import { MOCK_UNITS } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET    /api/services/[name]      — get status
 * POST   /api/services/[name]      — control: { action: "start"|"stop"|"restart"|"reload"|"enable"|"disable" }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const { name } = await params;
  const safeName = name.replace(/[^a-zA-Z0-9_.@-]/g, "");
  if (!safeName) {
    return NextResponse.json({ error: "Invalid unit name" }, { status: 400 });
  }

  const onSystemd = await hasSystemd();
  if (!onSystemd) {
    const u = MOCK_UNITS.find(x => x.name === safeName);
    if (!u) {
      return NextResponse.json({ error: "Unit not found (mock)" }, { status: 404 });
    }
    return NextResponse.json({ unit: u, mock: true, ts: Date.now() });
  }

  const r = await runShell(`systemctl status ${safeName} --no-pager --full 2>&1`, { timeout: 10_000 });
  const enR = await runShell(`systemctl is-enabled ${safeName} 2>/dev/null`, { timeout: 3000 });
  const loadR = await runShell(`systemctl show ${safeName} --property=LoadState,ActiveState,SubState,Description,MainPID,MemoryCurrent,CPUUsageNSec,FragmentPath --no-pager 2>/dev/null`, { timeout: 5000 });

  // Parse systemctl show output
  const props: Record<string, string> = {};
  for (const line of loadR.stdout.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1);
  }

  return NextResponse.json({
    unit: {
      name: safeName,
      description: props.Description || "",
      loadState: props.LoadState || "",
      activeState: props.ActiveState || "",
      subState: props.SubState || "",
      enabled: enR.stdout.trim() || "unknown",
      mainPID: props.MainPID,
      memoryBytes: props.MemoryCurrent ? Number(props.MemoryCurrent) : undefined,
      cpuNs: props.CPUUsageNSec ? Number(props.CPUUsageNSec) : undefined,
      fragmentPath: props.FragmentPath,
    },
    statusText: r.stdout,
    mock: false,
    ts: Date.now(),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const { name } = await params;
  const safeName = name.replace(/[^a-zA-Z0-9_.@-]/g, "");
  if (!safeName) {
    return NextResponse.json({ error: "Invalid unit name" }, { status: 400 });
  }

  const body = await req.json();
  const action = String(body.action || "");
  const allowed = ["start", "stop", "restart", "reload", "enable", "disable", "mask", "unmask"];
  if (!allowed.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const onSystemd = await hasSystemd();
  if (!onSystemd) {
    return NextResponse.json({
      ok: true,
      mock: true,
      message: `Mock: ${action} ${safeName}`,
      ts: Date.now(),
    });
  }

  const r = await runShell(`sudo systemctl ${action} ${safeName} 2>&1`, { timeout: 30_000 });
  if (r.exitCode !== 0) {
    return NextResponse.json(
      { error: r.stderr || r.stdout || `Failed to ${action} ${safeName}`, exitCode: r.exitCode },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, mock: false, output: r.stdout, ts: Date.now() });
}
