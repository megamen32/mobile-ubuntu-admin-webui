import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { getFsProvider } from "@/lib/fs-provider";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/files/upload
 *   multipart form: { dest: string, file: File }
 *   Saves uploaded file to dest directory.
 *   Supports multi-server via SFTP.
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  try {
    const form = await req.formData();
    const dest = String(form.get("dest") || "/");
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file in form" }, { status: 400 });
    }

    const safeName = (file.name || "upload").replace(/[^a-zA-Z0-9._-]/g, "_");
    const target = (dest.endsWith("/") ? dest : dest + "/") + safeName;

    const content = Buffer.from(await file.arrayBuffer());
    const provider = await getFsProvider(req);
    const ip = getClientIp(req);

    await provider.writeFile(target, content.toString("utf8"));

    await recordAudit({
      username: auth.username,
      action: "file.upload",
      target,
      ip,
      meta: {
        size: content.length,
        remote: !provider.isLocal,
      },
    });

    return NextResponse.json({
      ok: true,
      savedPath: target,
      size: content.length,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 500 });
  }
}
