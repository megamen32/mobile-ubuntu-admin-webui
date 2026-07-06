import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { getFsProvider } from "@/lib/fs-provider";
import { MOCK_FILE_TREE, MOCK_FILE_CONTENTS } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/files?path=/etc/nginx
 *   Returns directory listing or file content.
 *   Supports multi-server via X-Server-Id (SFTP for remote).
 *
 * POST /api/files
 *   { action: "mkdir"|"delete"|"rename", path, newPath? }
 */

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  let target = sp.get("path") || "/";
  if (!target.startsWith("/")) target = "/" + target;
  // Normalize — simple version that works for both local and SFTP paths
  target = target.replace(/\/+/g, "/").replace(/\/$/, "") || "/";

  try {
    const provider = await getFsProvider(req);

    // Try real first (works for both local and SFTP)
    try {
      // For local: check if it's a file or dir by trying listDir first
      // For SFTP: same approach
      const entries = await provider.listDir(target);
      return NextResponse.json({ path: target, entries, mock: false, ts: Date.now() });
    } catch (listErr: any) {
      // If listDir failed, maybe it's a file
      try {
        const { content, size, mtime } = await provider.readFile(target);
        return NextResponse.json({
          path: target,
          content,
          size,
          mtime,
          isFile: true,
          mock: false,
          ts: Date.now(),
        });
      } catch {
        // Not a file either — rethrow for mock fallback (local only)
        if (!provider.isLocal) throw listErr;
        throw listErr;
      }
    }
  } catch {
    // Mock fallback (local mode only — when path doesn't exist)
    if (MOCK_FILE_TREE[target]) {
      const entries = MOCK_FILE_TREE[target].map(name => {
        const childPath = target === "/" ? "/" + name : target + "/" + name;
        const isDir = !name.includes(".") || !!MOCK_FILE_TREE[childPath];
        return {
          name,
          isDir,
          size: isDir ? 0 : (MOCK_FILE_CONTENTS[childPath]?.length ?? 1024),
          mtime: Date.now() - Math.random() * 86_400_000 * 30,
          mode: isDir ? "0755" : "0644",
        };
      });
      entries.sort((a: any, b: any) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
      return NextResponse.json({ path: target, entries, mock: true, ts: Date.now() });
    }
    if (MOCK_FILE_CONTENTS[target]) {
      return NextResponse.json({
        path: target,
        content: MOCK_FILE_CONTENTS[target],
        size: MOCK_FILE_CONTENTS[target].length,
        mtime: Date.now() - 86_400_000,
        isFile: true,
        mock: true,
        ts: Date.now(),
      });
    }
    return NextResponse.json({ error: `Path not found: ${target}` }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const target = String(body.path || "/");
    const newPath = body.newPath ? String(body.newPath) : undefined;

    const provider = await getFsProvider(req);

    if (action === "mkdir") {
      await provider.mkdir(target);
      return NextResponse.json({ ok: true, ts: Date.now() });
    }
    if (action === "delete") {
      await provider.unlink(target);
      return NextResponse.json({ ok: true, ts: Date.now() });
    }
    if (action === "rename" && newPath) {
      await provider.rename(target, newPath);
      return NextResponse.json({ ok: true, ts: Date.now() });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "File operation failed" }, { status: 500 });
  }
}
