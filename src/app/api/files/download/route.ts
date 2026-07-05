import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import fs from "fs/promises";
import path from "path";
import { MOCK_FILE_CONTENTS } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/files/download?path=/etc/nginx/nginx.conf
 *   Returns file content as text/plain with Content-Disposition attachment.
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const target = path.normalize(sp.get("path") || "/");
  const basename = path.basename(target) || "file.txt";

  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }
    const content = await fs.readFile(target);
    return new NextResponse(content as any, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${basename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch {
    // Mock fallback
    if (MOCK_FILE_CONTENTS[target]) {
      const content = MOCK_FILE_CONTENTS[target];
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${basename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          "Content-Length": String(content.length),
        },
      });
    }
    return NextResponse.json({ error: `File not found: ${target}` }, { status: 404 });
  }
}
