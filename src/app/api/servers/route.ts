import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limiter";
import { recordAudit } from "@/lib/audit";
import { listSshKeys } from "@/lib/ssh-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/servers
 *   Returns all registered servers + the implicit "local" server.
 *
 * POST /api/servers
 *   { name, host, port?, username, authMethod, password?, keyName?, passphrase?, label? }
 *   Creates a new server entry.
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  try {
    const servers = await db.server.findMany({
      orderBy: [{ label: "asc" }, { name: "asc" }],
    });

    // Available SSH keys in ~/.ssh/ (for the manage UI dropdown)
    const availableKeys = await listSshKeys();

    return NextResponse.json({
      // "local" is always present — the host running this app
      local: {
        id: "local",
        name: "local",
        host: "localhost",
        label: "this server",
        isLocal: true,
      },
      servers: servers.map(s => ({
        ...s,
        isLocal: false,
        // Never return password/passphrase to client
        password: undefined,
        passphrase: undefined,
      })),
      availableKeys,
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
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { name, host, port, username, authMethod, password, keyName, passphrase, label } = body;
  if (!name || !host || !username) {
    return NextResponse.json({ error: "name, host, username required" }, { status: 400 });
  }

  if (authMethod === "key" && !keyName) {
    return NextResponse.json({ error: "keyName required for key auth" }, { status: 400 });
  }
  if (authMethod === "password" && !password) {
    return NextResponse.json({ error: "password required for password auth" }, { status: 400 });
  }

  try {
    const server = await db.server.create({
      data: {
        name: String(name),
        host: String(host),
        port: Number(port) || 22,
        username: String(username),
        authMethod: String(authMethod),
        password: password ? String(password) : null,
        keyName: keyName ? String(keyName) : null,
        passphrase: passphrase ? String(passphrase) : null,
        label: label ? String(label) : null,
      },
    });

    await recordAudit({
      username: auth.username,
      action: "server.add",
      target: server.name,
      ip: getClientIp(req),
      meta: { host: server.host, authMethod: server.authMethod },
    });

    return NextResponse.json({
      ok: true,
      server: { ...server, password: undefined, passphrase: undefined },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
