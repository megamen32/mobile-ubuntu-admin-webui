import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bookmarks API.
 *
 * Bookmarks are stored client-side in localStorage — they're per-device
 * preferences, not server data. This route exists only to make the API
 * consistent with the rest of the app and to enable future server-side
 * sync if needed.
 *
 * For now, the client uses localStorage directly via src/lib/bookmarks.ts.
 * This route is a no-op stub.
 */

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();
  return NextResponse.json({
    message: "Bookmarks are stored client-side. See src/lib/bookmarks.ts.",
    ts: Date.now(),
  });
}
