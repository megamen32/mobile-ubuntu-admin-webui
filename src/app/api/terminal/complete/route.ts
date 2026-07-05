import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell } from "@/lib/server-exec";
import { mockBashComplete } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/terminal/complete
 *   { line: string, cwd: string }
 * Returns { completions: string[] }
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  let line = "";
  let cwd = "/root";
  try {
    const body = await req.json();
    line = String(body.line ?? "");
    cwd = String(body.cwd || "/root");
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const parts = line.split(" ");
    const last = parts[parts.length - 1] || "";
    let completions: string[] = [];

    if (parts.length === 1) {
      // command completion
      const r = await runShell(
        `bash -c 'compgen -A command -- ${JSON.stringify(line)}' 2>/dev/null`,
        { timeout: 3000 }
      );
      completions = r.stdout.split("\n").filter(Boolean);
    } else {
      // file completion
      const r = await runShell(
        `bash -c 'compgen -A file -- ${JSON.stringify(last)}' 2>/dev/null`,
        { timeout: 3000, cwd }
      );
      completions = r.stdout.split("\n").filter(Boolean);

      // systemctl/journalctl subcommands
      if (parts[0] === "systemctl" || parts[0] === "journalctl") {
        const subs = ["start", "stop", "restart", "reload", "status", "enable", "disable",
          "mask", "unmask", "list-units", "list-unit-files", "show", "cat", "edit",
          "-u", "--user", "--no-pager", "-n", "--since", "--until", "-f"];
        completions = [...completions, ...subs.filter(s => s.startsWith(last))];
      }
    }

    if (completions.length === 0) {
      // Mock fallback so completion feels responsive in preview
      completions = mockBashComplete(line, cwd);
    }

    return NextResponse.json({ completions: completions.slice(0, 50), ts: Date.now() });
  } catch {
    return NextResponse.json({ completions: mockBashComplete(line, cwd), ts: Date.now() });
  }
}
