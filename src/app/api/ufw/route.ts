import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell, hasBin } from "@/lib/server-exec";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ufw
 *   Returns UFW status + rules.
 *
 * POST /api/ufw
 *   { action: "enable" | "disable" | "reload" | "reset" | "allow" | "deny" | "delete" | "limit", rule?, direction? }
 *   - rule: "80/tcp", "443", "22", "from 10.0.0.0/8 to any port 22"
 *   - direction: "in" | "out" | "both" (default: in)
 *
 * All actions require root (Next.js process must run as root or with sudo).
 */

interface UfwRule {
  action: string;       // allow / deny / limit / reject
  direction: string;    // IN / OUT / FORWARD
  from: string;         // anywhere / 10.0.0.0/8
  to: string;           // anywhere / 22/tcp
  port?: string;
  proto?: string;
  raw: string;          // full raw line
}

function parseUfwRules(stdout: string): UfwRule[] {
  const rules: UfwRule[] = [];
  const lines = stdout.split("\n");
  let started = false;
  for (const line of lines) {
    if (line.startsWith("-----")) { started = true; continue; }
    if (!started) continue;
    if (!line.trim() || line.startsWith("[") && line.endsWith("]")) continue;
    // Format: " 80/tcp                    ALLOW IN    Anywhere"
    // or:     " 22/tcp                    ALLOW IN    10.0.0.0/8"
    // or:     " Anywhere                  DENY IN     192.168.1.5"
    const m = line.match(/^\s*(\S+(?:\/\w+)?)\s+(ALLOW|DENY|LIMIT|REJECT)\s+(IN|OUT|FORWARD)\s+(.+)$/);
    if (m) {
      const [, to, action, direction, from] = m;
      let port: string | undefined;
      let proto: string | undefined;
      if (to.includes("/")) {
        const [p, pr] = to.split("/");
        port = p;
        proto = pr;
      } else if (to !== "Anywhere") {
        port = to;
      }
      rules.push({
        action: action.toLowerCase(),
        direction,
        from,
        to,
        port,
        proto,
        raw: line.trim(),
      });
    }
  }
  return rules;
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const hasUfw = await hasBin("ufw");
  if (!hasUfw) {
    return NextResponse.json({
      error: "ufw not installed. Install with: sudo apt install ufw",
      installed: false,
    }, { status: 503 });
  }

  // Get status verbose
  const statusR = await runShell("ufw status verbose 2>&1", { timeout: 5_000 });
  if (statusR.exitCode !== 0) {
    return NextResponse.json(
      { error: statusR.stderr || "ufw status failed", exitCode: statusR.exitCode },
      { status: 500 }
    );
  }

  // Parse status
  const lines = statusR.stdout.split("\n");
  let enabled = false;
  let defaultIncoming = "deny";
  let defaultOutgoing = "allow";
  let defaultForward = "deny";
  let ipv6 = true;
  let logging = "off";

  for (const line of lines) {
    if (line.startsWith("Status:")) {
      enabled = line.includes("active");
    } else if (line.startsWith("Default:")) {
      const m = line.match(/Default:\s*(\S+)\s+\(incoming\),\s*(\S+)\s+\(outgoing\),\s*(\S+)\s+\(forward/);
      if (m) {
        defaultIncoming = m[1];
        defaultOutgoing = m[2];
        defaultForward = m[3];
      }
    } else if (line.startsWith("Logging:")) {
      logging = line.replace("Logging:", "").trim();
    } else if (line.includes("IPV6=")) {
      ipv6 = line.includes("yes");
    }
  }

  const rules = parseUfwRules(statusR.stdout);

  return NextResponse.json({
    installed: true,
    enabled,
    defaultIncoming,
    defaultOutgoing,
    defaultForward,
    ipv6,
    logging,
    rules,
    raw: statusR.stdout,
    ts: Date.now(),
  });
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const action = String(body.action || "");
  const allowed = ["enable", "disable", "reload", "reset", "allow", "deny", "delete", "limit", "reject", "default"];
  if (!allowed.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  // Validate rule for actions that need it
  const ruleActions = ["allow", "deny", "delete", "limit", "reject"];
  if (ruleActions.includes(action) && !body.rule) {
    return NextResponse.json({ error: "rule required for this action" }, { status: 400 });
  }

  // Sanitize rule — allow only safe chars
  const rule = body.rule ? String(body.rule).replace(/[;&|`$(){}!#<>]/g, "") : "";
  const direction = body.direction === "out" ? "out" : body.direction === "both" ? "" : "in";
  const ip = getClientIp(req);

  // Build the command — always use sudo (ufw needs root)
  let cmd: string;
  if (action === "enable") {
    cmd = "echo y | sudo ufw enable 2>&1";
  } else if (action === "disable") {
    cmd = "sudo ufw disable 2>&1";
  } else if (action === "reload") {
    cmd = "sudo ufw reload 2>&1";
  } else if (action === "reset") {
    cmd = "echo y | sudo ufw reset 2>&1";
  } else if (action === "default") {
    const policy = String(body.policy || "").replace(/[^a-z]/g, "");
    const direction = String(body.direction || "incoming").replace(/[^a-z]/g, "");
    if (!["deny", "allow", "reject"].includes(policy) || !["incoming", "outgoing", "forward", "routed"].includes(direction)) {
      return NextResponse.json({ error: "Invalid policy or direction" }, { status: 400 });
    }
    cmd = `sudo ufw default ${policy} ${direction} 2>&1`;
  } else {
    // allow / deny / delete / limit / reject
    const actionArg = action === "delete" ? `delete ${action === "delete" ? "" : ""}` : action;
    const dirArg = direction ? `${direction} ` : "";
    cmd = `sudo ufw ${action === "delete" ? "delete" : action} ${dirArg}${rule} 2>&1`;
  }

  const r = await runShell(cmd, { timeout: 15_000 });

  await recordAudit({
    username: auth.username,
    action: `ufw.${action}`,
    target: rule || action,
    ip,
    result: r.exitCode === 0 ? "ok" : "error",
    error: r.exitCode !== 0 ? r.stderr || r.stdout : undefined,
    meta: { command: cmd.replace(/^sudo /, "") },
  });

  if (r.exitCode !== 0) {
    return NextResponse.json(
      { error: r.stderr || r.stdout || `Failed to ${action}`, exitCode: r.exitCode },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    action,
    rule: rule || undefined,
    direction: direction || undefined,
    output: r.stdout,
    ts: Date.now(),
  });
}
