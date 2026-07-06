import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { getFsProvider } from "@/lib/fs-provider";
import { MOCK_FILE_CONTENTS } from "@/lib/mock-data";
import { getSshConnection } from "@/lib/server-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/files/download?path=/etc/nginx/nginx.conf
 *   Returns file content as downloadable blob.
 *   Supports multi-server via SFTP.
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const target = sp.get("path") || "/";
  const basename = target.split("/").pop() || "file.txt";

  try {
    const provider = await getFsProvider(req);

    // For SFTP, we need to stream binary data; for local, we can stream directly
    if (provider.isLocal) {
      // Local: use streaming Response for efficiency
      const sshResult = await getSshConnection(req);
      if (!sshResult) {
        // truly local
        const { readFile } = await import("fs/promises");
        const { stat } = await import("fs/promises");
        try {
          const s = await stat(target);
          if (!s.isFile()) {
            return NextResponse.json({ error: "Not a file" }, { status: 400 });
          }
          const content = await readFile(target);
          return new NextResponse(content as any, {
            status: 200,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": `attachment; filename="${basename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
              "Content-Length": String(s.size),
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
    }

    // SFTP mode
    const { content, size } = await provider.readFile(target);
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${basename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
        "Content-Length": String(size),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Download failed" }, { status: 500 });
  }
}
