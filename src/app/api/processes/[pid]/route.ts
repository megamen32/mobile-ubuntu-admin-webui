import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell } from "@/lib/server-exec";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/processes/[pid]?signal=term|kill|hup
 *   Kills the process with the given PID.
 *
 * Default signal: SIGTERM (graceful). Use ?signal=kill for SIGKILL (force).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ pid: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  const { pid: pidStr } = await params;
  const pid = Number(pidStr);
  if (!Number.isInteger(pid) || pid <= 0 || pid > 4194304) {
    return NextResponse.json({ error: "Invalid PID" }, { status: 400 });
  }

  // Don't allow killing PID 1 (init) or our own process
  if (pid === 1) {
    return NextResponse.json({ error: "Refusing to kill PID 1" }, { status: 400 });
  }
  if (pid === process.pid) {
    return NextResponse.json({ error: "Refusing to kill self" }, { status: 400 });
  }

  const sp = req.nextUrl.searchParams;
  const signal = sp.get("signal") || "term";
  const signalMap: Record<string, string> = {
    term: "SIGTERM",
    kill: "SIGKILL",
    hup: "SIGHUP",
    int: "SIGINT",
    usr1: "SIGUSR1",
    usr2: "SIGUSR2",
  };
  const sigName = signalMap[signal.toLowerCase()];
  if (!sigName) {
    return NextResponse.json({ error: "Invalid signal" }, { status: 400 });
  }

  const ip = getClientIp(req);
  const r = await runShell(`kill -${sigName} ${pid} 2>&1`, { timeout: 5000 });

  if (r.exitCode !== 0) {
    await recordAudit({
      username: auth.username,
      action: "process.kill",
      target: `pid=${pid} signal=${sigName}`,
      ip,
      result: "error",
      error: r.stderr || r.stdout,
    });
    return NextResponse.json(
      { error: r.stderr || r.stdout || `Failed to kill PID ${pid}`, exitCode: r.exitCode },
      { status: 500 }
    );
  }

  await recordAudit({
    username: auth.username,
    action: "process.kill",
    target: `pid=${pid} signal=${sigName}`,
    ip,
  });

  return NextResponse.json({ ok: true, pid, signal: sigName });
}
