import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import webpush from "web-push";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * VAPID keys are generated on first request if not in env. In production,
 * set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars to keep keys stable
 * across restarts (otherwise subscribers will need to re-subscribe).
 */

let vapidKeys: { publicKey: string; privateKey: string } | null = null;

function getVapidKeys() {
  if (vapidKeys) return vapidKeys;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    vapidKeys = { publicKey: pub, privateKey: priv };
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    console.log("[notifications] Generated VAPID keys. For production stability, set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars:");
    console.log(`[notifications]   VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
    console.log(`[notifications]   VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  return vapidKeys;
}

/**
 * GET /api/notifications/vapid
 *   Returns the public VAPID key for the browser to use for push subscription.
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const keys = getVapidKeys();
  return NextResponse.json({
    publicKey: keys.publicKey,
    ts: Date.now(),
  });
}

export { getVapidKeys };
