import { NextRequest } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { spawn, ChildProcess } from "child_process";
import { hasJournalctl, hasSystemd } from "@/lib/server-exec";
import { generateMockLogs } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60 * 60;

/**
 * GET /api/services/[name]/logs/stream?lines=50
 *
 * SSE stream of journalctl -u <name> -f output.
 * Same wire format as /api/logs/stream.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const { name } = await params;
  const safeName = name.replace(/[^a-zA-Z0-9_.@-]/g, "");
  if (!safeName) {
    return new Response(JSON.stringify({ error: "Invalid unit name" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const sp = req.nextUrl.searchParams;
  const initialLines = Math.min(500, Math.max(0, Number(sp.get("lines") || 50)));

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let child: ChildProcess | null = null;
      let mockTimer: NodeJS.Timeout | null = null;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch { /* client gone */ }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        if (child) {
          try { child.kill("SIGTERM"); } catch { /* ignore */ }
          child = null;
        }
        if (mockTimer) {
          clearTimeout(mockTimer);
          mockTimer = null;
        }
        try { controller.close(); } catch { /* already closed */ }
      };

      send("status", { status: "starting", unit: safeName, lines: initialLines });

      (async () => {
        const onJournal = await hasJournalctl();
        const onSystemd = await hasSystemd();

        if (!onJournal || !onSystemd) {
          send("status", { status: "mock", message: "journald not running, generating mock data" });

          const backlog = generateMockLogs(initialLines, safeName);
          for (const line of backlog.reverse()) {
            send("log", { line, ts: Date.now(), mock: true });
          }
          send("status", { status: "following", mock: true });

          const tick = () => {
            if (closed) return;
            const newLogs = generateMockLogs(1, safeName);
            for (const line of newLogs) {
              send("log", { line, ts: Date.now(), mock: true });
            }
            mockTimer = setTimeout(tick, 1000 + Math.random() * 3000);
          };
          mockTimer = setTimeout(tick, 1500);
          return;
        }

        const args = ["journalctl", "-f", "-u", safeName, "--no-pager", "-o", "cat", "-n", String(initialLines)];

        try {
          child = spawn(args[0], args.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
        } catch (e: any) {
          send("error", { error: `Failed to spawn journalctl: ${e?.message}` });
          close();
          return;
        }

        send("status", { status: "following", mock: false });

        let buffer = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          if (closed) return;
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.trim()) {
              send("log", { line, ts: Date.now() });
            }
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          console.warn(`[sse service-logs ${safeName}] journalctl stderr:`, chunk.toString("utf8"));
        });

        child.on("exit", (code, signal) => {
          if (!closed) {
            send("status", { status: "exited", code, signal });
            close();
          }
        });

        child.on("error", (err) => {
          send("error", { error: `journalctl error: ${err.message}` });
          close();
        });
      })();

      req.signal.addEventListener("abort", () => close());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
