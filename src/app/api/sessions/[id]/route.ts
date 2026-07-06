import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/sessions/[id]
 *   Revokes (deletes) a device session. The revoked device's credentials will
 *   still work — we just mark the session as "known to be untrusted". For real
 *   revocation, the user should change their password.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  const { id } = await params;

  try {
    const session = await db.deviceSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.username !== auth.username) {
      // Can't revoke other users' sessions
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await db.deviceSession.delete({ where: { id } });

    await recordAudit({
      username: auth.username,
      action: "session.revoke",
      target: session.deviceId,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim(),
      meta: { label: session.label, lastSeen: session.lastSeen },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
