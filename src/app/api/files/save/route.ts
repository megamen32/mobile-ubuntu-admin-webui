import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import fs from "fs/promises";
import path from "path";
import { MOCK_FILE_CONTENTS } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/files/save
 *   { path: string, content: string }
 * Returns { ok: true, size }
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  try {
    const body = await req.json();
    const target = path.normalize(String(body.path || ""));
    const content = String(body.content ?? "");
    if (!target) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    try {
      // Real write
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, content, "utf8");
      // Also update mock store for demo persistence
      MOCK_FILE_CONTENTS[target] = content;
      return NextResponse.json({ ok: true, size: content.length, ts: Date.now() });
    } catch {
      // Mock fallback (preview-only)
      MOCK_FILE_CONTENTS[target] = content;
      return NextResponse.json({ ok: true, size: content.length, mock: true, ts: Date.now() });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 });
  }
}
