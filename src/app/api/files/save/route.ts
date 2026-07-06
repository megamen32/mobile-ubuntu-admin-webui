import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { getFsProvider } from "@/lib/fs-provider";
import { MOCK_FILE_CONTENTS } from "@/lib/mock-data";
import { recordAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/rate-limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/files/save
 *   { path: string, content: string }
 * Saves file content — works for both local fs and remote SFTP.
 */
export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok || !auth.username) return unauthorized();

  try {
    const body = await req.json();
    const target = String(body.path || "");
    const content = String(body.content ?? "");
    if (!target) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    const provider = await getFsProvider(req);
    const ip = getClientIp(req);

    try {
      await provider.writeFile(target, content);

      await recordAudit({
        username: auth.username,
        action: "file.save",
        target,
        ip,
        meta: provider.isLocal ? undefined : { remote: true },
      });

      return NextResponse.json({ ok: true, size: content.length, ts: Date.now() });
    } catch (e: any) {
      // Mock fallback (local preview only)
      if (provider.isLocal) {
        MOCK_FILE_CONTENTS[target] = content;
        return NextResponse.json({ ok: true, size: content.length, mock: true, ts: Date.now() });
      }
      throw e;
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 });
  }
}
