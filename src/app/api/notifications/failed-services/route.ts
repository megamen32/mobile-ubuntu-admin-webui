import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell, hasSystemd } from "@/lib/server-exec";
import { MOCK_UNITS } from "@/lib/mock-data";
import { db } from "@/lib/db";
import { getVapidKeys } from "../vapid/route";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/notifications/failed-services
 *
 * Returns list of currently-failed systemd services.
 *
 * Also, the client polls this every 60s. When a NEW failed service appears
 * (compared to last poll), we trigger a Web Push to all subscribed devices
 * for the current user.
 *
 * State is kept per-user in-memory: Map<username, Set<failedUnitName>>.
 */

const lastFailed = new Map<string, Set<string>>();

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  // Get current failed units
  let failed: string[] = [];

  const onSystemd = await hasSystemd();
  if (!onSystemd) {
    failed = MOCK_UNITS.filter(u => u.activeState === "failed").map(u => u.name);
  } else {
    const r = await runShell(
      `systemctl list-units --state=failed --no-legend --plain 2>/dev/null`,
      { timeout: 10_000 }
    );
    if (r.exitCode === 0) {
      for (const line of r.stdout.split("\n")) {
        if (!line.trim()) continue;
        const m = line.match(/^(\S+)/);
        if (m) failed.push(m[1]);
      }
    }
  }

  // Diff against last poll — find newly-failed
  const prev = lastFailed.get(auth.username) || new Set<string>();
  const newlyFailed = failed.filter(name => !prev.has(name));
  const recovered = Array.from(prev).filter(name => !failed.includes(name));

  // Update state
  lastFailed.set(auth.username, new Set(failed));

  // Send push notifications for newly-failed services
  if (newlyFailed.length > 0) {
    try {
      const keys = getVapidKeys();
      const subs = await db.pushSubscription.findMany({
        where: { username: auth.username },
      });

      const payload = JSON.stringify({
        title: `🔴 ${newlyFailed.length} service(s) failed`,
        body: newlyFailed.slice(0, 3).join(", ") + (newlyFailed.length > 3 ? ` (+${newlyFailed.length - 3} more)` : ""),
        tag: "failed-services",
        renotify: true,
        requireInteraction: true,
        data: {
          url: "/#/services?status=failed",
          failedServices: newlyFailed,
        },
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
        } catch (e: any) {
          // 410 = subscription expired, delete it
          if (e?.statusCode === 410 || e?.statusCode === 404) {
            try {
              await db.pushSubscription.delete({ where: { endpoint: sub.endpoint } });
            } catch { /* ignore */ }
          }
        }
      }
    } catch (e: any) {
      console.warn("[notifications] push failed:", e?.message);
    }
  }

  return NextResponse.json({
    failed,
    newlyFailed,
    recovered,
    totalFailed: failed.length,
    ts: Date.now(),
  });
}
