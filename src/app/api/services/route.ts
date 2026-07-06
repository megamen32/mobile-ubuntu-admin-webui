import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { hasSystemd } from "@/lib/server-exec";
import { getServerContext } from "@/lib/server-context";
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
 * Supports multi-server via X-Server-Id header.
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const ctx = await getServerContext(req);
  const type = req.nextUrl.searchParams.get("type") || "all";

  // For local mode, check systemd availability. For remote, always try real.
  if (ctx.mode === "local") {
    const onSystemd = await hasSystemd();
    if (!onSystemd) {
      const filtered = type === "all" ? MOCK_UNITS : MOCK_UNITS.filter(u => u.type === type);
      return NextResponse.json({
        units: filtered,
        mock: true,
        ts: Date.now(),
      });
    }
  }

  // Real: systemctl list-units --all --no-legend --plain
  const r = await ctx.exec(`systemctl list-units --all --no-legend --plain 2>/dev/null`, { timeout: 15_000 });
  if (r.exitCode !== 0) {
    return NextResponse.json(
      { error: r.stderr || "Failed to list units", exitCode: r.exitCode },
      { status: 500 }
    );
  }

  const units: UnitInfo[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!m) continue;
    const [, name, loadState, activeState, subState, description] = m;
    const dotIdx = name.lastIndexOf(".");
    const unitType = dotIdx > 0 ? name.slice(dotIdx + 1) : "unknown";
    if (type !== "all" && unitType !== type) continue;
    units.push({
      name,
      description: description || "",
      loadState,
      activeState,
      subState,
      enabled: "static",
      type: unitType,
    });
  }

  // Enrich enabled state in one shot
  if (units.length > 0 && units.length < 500) {
    const names = units.map(u => u.name).join(" ");
    const enR = await ctx.exec(`systemctl is-enabled ${names} 2>/dev/null || true`, { timeout: 15_000 });
    const enabledLines = enR.stdout.split("\n").map(s => s.trim());
    units.forEach((u, i) => {
      u.enabled = enabledLines[i] || "unknown";
    });
  }

  return NextResponse.json({ units, mock: false, ts: Date.now() });
}
