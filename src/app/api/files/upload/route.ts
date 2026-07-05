import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/files/upload
 *   multipart form: { dest: string, file: File }
 * Returns { ok: true, savedPath, size }
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  try {
    const form = await req.formData();
    const dest = String(form.get("dest") || "/");
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file in form" }, { status: 400 });
    }
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const target = path.join(path.normalize(dest), safeName);
    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(target, buf);
    return NextResponse.json({
      ok: true,
      savedPath: target,
      size: buf.length,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Upload failed" }, { status: 500 });
  }
}
