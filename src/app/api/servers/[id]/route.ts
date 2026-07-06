import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { closeConnection } from "@/lib/ssh-pool";
import { getClientIp } from "@/lib/rate-limiter";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT  /api/servers/[id] — update server config
 * DELETE /api/servers/[id] — delete server
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { name, host, port, username, authMethod, password, keyName, passphrase, label } = body;

  try {
    const existing = await db.server.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    const data: any = {};
    if (name !== undefined) data.name = String(name);
    if (host !== undefined) data.host = String(host);
    if (port !== undefined) data.port = Number(port);
    if (username !== undefined) data.username = String(username);
    if (authMethod !== undefined) data.authMethod = String(authMethod);
    // Only update credentials if explicitly provided (don't null them out on every edit)
    if (password !== undefined) data.password = password ? String(password) : null;
    if (keyName !== undefined) data.keyName = keyName ? String(keyName) : null;
    if (passphrase !== undefined) data.passphrase = passphrase ? String(passphrase) : null;
    if (label !== undefined) data.label = label ? String(label) : null;

    const updated = await db.server.update({ where: { id }, data });

    // Close existing SSH connection — will reconnect with new config on next use
    closeConnection(id);

    await recordAudit({
      username: auth.username,
      action: "server.update",
      target: updated.name,
      ip: getClientIp(req),
    });

    return NextResponse.json({
      ok: true,
      server: { ...updated, password: undefined, passphrase: undefined },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  const { id } = await params;

  try {
    const server = await db.server.findUnique({ where: { id } });
    if (!server) {
      return NextResponse.json({ error: "Server not found" }, { status: 404 });
    }

    // Close any active SSH connection
    closeConnection(id);

    await db.server.delete({ where: { id } });

    await recordAudit({
      username: auth.username,
      action: "server.delete",
      target: server.name,
      ip: getClientIp(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
