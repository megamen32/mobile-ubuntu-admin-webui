import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell } from "@/lib/server-exec";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/system
 *   Returns basic system info (hostname, uptime, load, memory, disk).
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const info = {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    uptime: os.uptime(),
    loadavg: os.loadavg(),
    cpus: os.cpus().length,
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    ts: Date.now(),
  };

  // Try to enrich with disk usage and distro info
  try {
    const df = await runShell("df -h / --output=size,used,avail,pcent 2>/dev/null | tail -1", { timeout: 3000 });
    if (df.exitCode === 0) {
      const parts = df.stdout.trim().split(/\s+/);
      (info as any).disk = {
        size: parts[0],
        used: parts[1],
        avail: parts[2],
        percent: parts[3],
      };
    }
  } catch { /* ignore */ }

  try {
    const distro = await runShell(". /etc/os-release 2>/dev/null && echo $PRETTY_NAME", { timeout: 2000 });
    if (distro.exitCode === 0 && distro.stdout.trim()) {
      (info as any).distro = distro.stdout.trim();
    }
  } catch { /* ignore */ }

  return NextResponse.json(info);
}
