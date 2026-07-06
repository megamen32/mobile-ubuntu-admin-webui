import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell } from "@/lib/server-exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/processes?sort=cpu|mem|pid|name&limit=50
 *
 * Returns process list similar to `ps aux` but in JSON form.
 * Sortable by cpu%, mem%, pid, or name.
 */

export interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;     // % CPU
  mem: number;     // % MEM
  vsz: number;     // virtual size in KB
  rss: number;     // resident set size in KB
  tty: string;
  stat: string;    // process state code
  start: string;   // start time
  time: string;    // CPU time
  command: string;
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const sort = sp.get("sort") || "cpu";
  const limit = Math.min(500, Math.max(10, Number(sp.get("limit") || 50)));

  // Use `ps aux` — universal across Linux distros
  // Output columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
  const r = await runShell("ps aux --no-headers --sort=-%cpu 2>&1", { timeout: 10_000 });
  if (r.exitCode !== 0) {
    return NextResponse.json(
      { error: r.stderr || "ps failed", exitCode: r.exitCode },
      { status: 500 }
    );
  }

  const processes: ProcessInfo[] = [];
  for (const line of r.stdout.split("\n")) {
    if (!line.trim()) continue;
    // ps aux format: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    // COMMAND can contain spaces, so we split with limit 11
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) continue;
    const [user, pid, cpu, mem, vsz, rss, tty, stat, start, time, ...cmdParts] = parts;
    const command = cmdParts.join(" ");
    processes.push({
      pid: Number(pid),
      user,
      cpu: Number(cpu),
      mem: Number(mem),
      vsz: Number(vsz),
      rss: Number(rss),
      tty,
      stat,
      start,
      time,
      command,
    });
  }

  // Sort
  processes.sort((a, b) => {
    switch (sort) {
      case "mem": return b.mem - a.mem;
      case "pid": return a.pid - b.pid;
      case "name": return a.command.localeCompare(b.command);
      case "cpu":
      default:
        return b.cpu - a.cpu;
    }
  });

  return NextResponse.json({
    processes: processes.slice(0, limit),
    total: processes.length,
    sort,
    ts: Date.now(),
  });
}
