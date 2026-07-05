import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell } from "@/lib/server-exec";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/terminal/exec
 *   { cmd: string, cwd: string, sessionId: string }
 * Returns { stdout, stderr, exitCode, cwd }
 *
 * Each request spawns a fresh `bash -c "<cmd>"` with cwd set per session.
 * Stateless per-command execution — well-suited to mobile (no full PTY).
 * cwd is passed by the client and persisted in localStorage for continuity.
 */

const MAX_CMD_MS = 30_000;
const MAX_OUTPUT = 256 * 1024;

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  try {
    const body = await req.json();
    const cmd = String(body.cmd ?? "");
    const cwd = String(body.cwd || "/root");

    // Always handle cd specially — never shell out for it
    const trimmed = cmd.trim();
    if (trimmed.startsWith("cd ") || trimmed === "cd") {
      const target = trimmed.slice(3).trim();
      let newCwd = cwd;
      if (target === "" || target === "~") {
        newCwd = process.env.HOME || "/root";
      } else if (target.startsWith("/")) {
        newCwd = target;
      } else {
        newCwd = cwd === "/" ? "/" + target : cwd + "/" + target;
      }
      const fs = await import("fs/promises");
      try {
        const stat = await fs.stat(newCwd);
        if (!stat.isDirectory()) {
          return NextResponse.json({
            stdout: "",
            stderr: `bash: cd: ${target}: Not a directory\n`,
            exitCode: 1,
            cwd,
          });
        }
        return NextResponse.json({ stdout: "", stderr: "", exitCode: 0, cwd: newCwd });
      } catch {
        return NextResponse.json({
          stdout: "",
          stderr: `bash: cd: ${target}: No such file or directory\n`,
          exitCode: 1,
          cwd,
        });
      }
    }

    // Exit/logout
    if (trimmed === "exit" || trimmed === "logout") {
      return NextResponse.json({
        stdout: "logout\n",
        stderr: "",
        exitCode: 0,
        cwd,
        exit: true,
      });
    }

    // Clear screen sentinel
    if (trimmed === "clear") {
      return NextResponse.json({ stdout: "", stderr: "", exitCode: 0, cwd, clear: true });
    }

    const r = await runShell(`bash -c ${JSON.stringify(cmd)}`, { timeout: MAX_CMD_MS, cwd });

    let stdout = r.stdout;
    let stderr = r.stderr;
    if (stdout.length > MAX_OUTPUT) stdout = stdout.slice(0, MAX_OUTPUT) + "\n... [truncated]";
    if (stderr.length > MAX_OUTPUT) stderr = stderr.slice(0, MAX_OUTPUT) + "\n... [truncated]";

    return NextResponse.json({
      stdout,
      stderr,
      exitCode: r.exitCode,
      cwd,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "exec failed", stdout: "", stderr: "", exitCode: 1, cwd: "/" },
      { status: 500 }
    );
  }
}
