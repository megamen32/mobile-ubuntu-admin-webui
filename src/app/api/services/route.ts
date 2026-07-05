import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell, hasSystemd } from "@/lib/server-exec";
import { MOCK_UNITS } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface UnitInfo {
  name: string;
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
  enabled: "enabled" | "disabled" | "static" | "masked" | string;
  type: string;
}

/**
 * GET /api/services
 *   ?type=service|socket|timer|target|mount  (default: all)
 *
 * Returns list of systemd units. Cached client-side via SWR.
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const type = req.nextUrl.searchParams.get("type") || "all";

  const onSystemd = await hasSystemd();
  if (!onSystemd) {
    // mock mode
    const filtered = type === "all" ? MOCK_UNITS : MOCK_UNITS.filter(u => u.type === type);
    return NextResponse.json({
      units: filtered,
      mock: true,
      ts: Date.now(),
    });
  }

  // Real: systemctl list-units --all --no-legend --plain
  const r = await runShell(
    `systemctl list-units --all --no-legend --plain 2>/dev/null`,
    { timeout: 15_000 }
  );
  if (r.exitCode !== 0) {
    return NextResponse.json(
      { error: r.stderr || "Failed to list units", exitCode: r.exitCode },
      { status: 500 }
    );
  }

  const units: UnitInfo[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    // Format: UNIT LOAD ACTIVE SUB DESCRIPTION
    const m = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!m) continue;
    const [, name, loadState, activeState, subState, description] = m;
    const dotIdx = name.lastIndexOf(".");
    const unitType = dotIdx > 0 ? name.slice(dotIdx + 1) : "unknown";
    if (type !== "all" && unitType !== type) continue;
    // get enabled state
    units.push({
      name,
      description: description || "",
      loadState,
      activeState,
      subState,
      enabled: "static", // will be enriched below
      type: unitType,
    });
  }

  // Enrich enabled state in one shot (much faster than per-unit calls)
  if (units.length > 0 && units.length < 500) {
    const names = units.map(u => u.name).join(" ");
    const enR = await runShell(
      `systemctl is-enabled ${names} 2>/dev/null || true`,
      { timeout: 15_000 }
    );
    const enabledLines = enR.stdout.split("\n").map(s => s.trim());
    units.forEach((u, i) => {
      u.enabled = enabledLines[i] || "unknown";
    });
  }

  return NextResponse.json({ units, mock: false, ts: Date.now() });
}
