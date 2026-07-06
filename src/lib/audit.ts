import { db } from "@/lib/db";

/**
 * App-level audit log.
 *
 * Records UI actions performed through the admin panel:
 *  - service.start / service.stop / service.restart / service.enable / service.disable
 *  - file.save / file.delete / file.upload / file.mkdir
 *  - terminal.exec (with command line)
 *  - pty.connect / pty.kill
 *  - login.success / login.failed / logout
 *
 * Set AUDIT_LOG_ENABLED=false to disable.
 *
 * Failures are silent — audit logging never blocks the main action.
 */

const ENABLED = process.env.AUDIT_LOG_ENABLED !== "false";

export interface AuditEntry {
  username: string;
  action: string;
  target?: string;
  ip?: string;
  deviceId?: string;
  result?: "ok" | "error" | "denied";
  error?: string;
  meta?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  if (!ENABLED) return;
  try {
    await db.auditLog.create({
      data: {
        ts: Date.now(),
        username: entry.username,
        action: entry.action,
        target: entry.target || null,
        ip: entry.ip || null,
        deviceId: entry.deviceId || null,
        result: entry.result || "ok",
        error: entry.error || null,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
      },
    });
  } catch (e: any) {
    // Silent failure — audit logging must not block the action
    console.warn("[audit] failed to record:", e?.message);
  }
}

/** Extract client info from request — handles Caddy/Nginx proxies. */
export function getRequestInfo(req: Request): { ip?: string; userAgent?: string } {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : (req.headers.get("x-real-ip") || undefined);
  const userAgent = req.headers.get("user-agent") || undefined;
  return { ip, userAgent };
}

/** Purge audit entries older than `daysOld` days. Call from a cron job. */
export async function purgeOldAuditEntries(daysOld: number = 90): Promise<number> {
  try {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    const result = await db.auditLog.deleteMany({
      where: { ts: { lt: cutoff } },
    });
    return result.count;
  } catch {
    return 0;
  }
}
