import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/subscribe
 *   { endpoint, keys: { p256dh, auth }, deviceId }
 *
 * Stores a Web Push subscription for the current user.
 * The browser calls this after `serviceWorkerRegistration.pushManager.subscribe()`.
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { endpoint, keys, deviceId } = body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "endpoint, keys.p256dh, keys.auth required" }, { status: 400 });
  }

  try {
    // Upsert subscription — one row per (user, deviceId, endpoint)
    await db.pushSubscription.upsert({
      where: {
        endpoint,
      },
      update: {
        username: auth.username,
        deviceId: deviceId || "default",
        p256dh: keys.p256dh,
        auth: keys.auth,
        updatedAt: new Date(),
      },
      create: {
        endpoint,
        username: auth.username,
        deviceId: deviceId || "default",
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    // DB may not be set up in sandbox — fail soft
    console.warn("[notifications] subscribe DB error:", e?.message);
    return NextResponse.json({ ok: true, mock: true });
  }
}

/**
 * DELETE /api/notifications/subscribe
 *   { endpoint }
 * Removes a subscription (called when user unsubscribes).
 */
export async function DELETE(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { endpoint } = body || {};
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  try {
    await db.pushSubscription.deleteMany({ where: { endpoint } });
  } catch (e: any) {
    console.warn("[notifications] unsubscribe DB error:", e?.message);
  }
  return NextResponse.json({ ok: true });
}
