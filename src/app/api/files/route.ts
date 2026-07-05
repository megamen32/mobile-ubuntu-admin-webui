import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import fs from "fs/promises";
import path from "path";
import { MOCK_FILE_TREE, MOCK_FILE_CONTENTS } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/files?path=/etc/nginx
 *   Returns directory listing with stat info.
 * POST /api/files
 *   { action: "mkdir"|"delete"|"rename", path, newPath? }
 */

interface DirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number;
  mode: string;
}

const REAL_ROOT = "/"; // allow browsing whole fs (admin tool)

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  let target = sp.get("path") || "/";
  if (!target.startsWith("/")) target = "/" + target;
  // Normalise
  target = path.normalize(target);

  // Mock mode: if real fs lacks the path, return mock data
  try {
    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(target, { withFileTypes: true });
      const out: DirEntry[] = [];
      for (const e of entries) {
        try {
          const es = await fs.stat(path.join(target, e.name));
          out.push({
            name: e.name,
            isDir: e.isDirectory(),
            size: es.size,
            mtime: es.mtimeMs,
            mode: "0" + (es.mode & 0o777).toString(8),
          });
        } catch { /* skip */ }
      }
      // Folders first, then alphabetical
      out.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
      return NextResponse.json({ path: target, entries: out, mock: false, ts: Date.now() });
    } else {
      // It's a file — return its content
      const content = await fs.readFile(target, "utf8");
      return NextResponse.json({
        path: target,
        content,
        size: stat.size,
        mtime: stat.mtimeMs,
        isFile: true,
        mock: false,
        ts: Date.now(),
      });
    }
  } catch {
    // Mock fallback
    if (MOCK_FILE_TREE[target]) {
      const entries: DirEntry[] = MOCK_FILE_TREE[target].map(name => {
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
      entries.sort((a, b) => (b.isDir ? 1 : 0) - (a.isDir ? 1 : 0) || a.name.localeCompare(b.name));
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
    const target = path.normalize(String(body.path || "/"));
    const newPath = body.newPath ? path.normalize(String(body.newPath)) : undefined;

    if (action === "mkdir") {
      await fs.mkdir(target, { recursive: true });
      return NextResponse.json({ ok: true, ts: Date.now() });
    }
    if (action === "delete") {
      const stat = await fs.stat(target);
      if (stat.isDirectory()) await fs.rm(target, { recursive: true });
      else await fs.unlink(target);
      return NextResponse.json({ ok: true, ts: Date.now() });
    }
    if (action === "rename" && newPath) {
      await fs.rename(target, newPath);
      return NextResponse.json({ ok: true, ts: Date.now() });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "File operation failed" }, { status: 500 });
  }
}
