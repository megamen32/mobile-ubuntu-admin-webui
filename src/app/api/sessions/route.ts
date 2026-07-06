import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getRequestInfo } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sessions
 *   Returns all known device sessions for the current user.
 *
 * POST /api/sessions
 *   { deviceId, label? }
 *   Creates or updates a device session (called on first API call from a new device).
 */

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  try {
    const sessions = await db.deviceSession.findMany({
      where: { username: auth.username },
      orderBy: { lastSeen: "desc" },
    });

    return NextResponse.json({
      sessions: sessions.map(s => ({
        ...s,
        // Compute session age in human-readable form
        ageDays: Math.floor((Date.now() - s.firstSeen.getTime()) / (24 * 60 * 60 * 1000)),
        lastSeenAgo: Math.floor((Date.now() - s.lastSeen.getTime()) / 1000),
      })),
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const deviceId = body.deviceId || "default";
  const label = body.label;
  const { ip, userAgent } = getRequestInfo(req);

  try {
    const session = await db.deviceSession.upsert({
      where: {
        username_deviceId: {
          username: auth.username,
          deviceId,
        },
      },
      update: {
        lastSeen: new Date(),
        ip,
        userAgent,
        ...(label ? { label } : {}),
      },
      create: {
        username: auth.username,
        deviceId,
        label,
        userAgent,
        ip,
      },
    });
    return NextResponse.json({ ok: true, session });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
