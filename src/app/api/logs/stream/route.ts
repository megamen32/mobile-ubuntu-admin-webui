import { NextRequest } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { spawn, ChildProcess } from "child_process";
import { hasJournalctl, hasSystemd } from "@/lib/server-exec";
import { generateMockLogs } from "@/lib/mock-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long-lived SSE connection — no maxDuration cap (Next.js will keep it open)
export const maxDuration = 60 * 60; // 1 hour, will auto-reconnect via SSE

/**
 * GET /api/logs/stream?since=1h&priority=err&unit=nginx&lines=50
 *
 * Server-Sent Events stream of journalctl -f output.
 *
 * Wire format:
 *   event: log
 *   data: {"line": "...", "ts": 1234567890}
 *
 *   event: status
 *   data: {"status": "following", "since": "1h"}
 *
 *   event: error
 *   data: {"error": "journalctl failed: ..."}
 *
 * On client disconnect, the journalctl process is killed.
 * Browser auto-reconnects via native EventSource behavior.
 *
 * In sandbox (no journald), generates mock log lines on interval.
 */

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const sp = req.nextUrl.searchParams;
  const since = sp.get("since") || "1h";
  const priority = sp.get("priority");
  const unit = sp.get("unit");
  const initialLines = Math.min(500, Math.max(0, Number(sp.get("lines") || 50)));

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let child: ChildProcess | null = null;
      let mockTimer: NodeJS.Timeout | null = null;
      let mockIdx = 0;

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

      // Send initial status
      send("status", { status: "starting", since, priority, unit, lines: initialLines });

      (async () => {
        const onJournal = await hasJournalctl();
        const onSystemd = await hasSystemd();

        if (!onJournal || !onSystemd) {
          // Mock mode — generate fake log lines
          send("status", { status: "mock", message: "journald not running, generating mock data" });

          // Send initial backlog
          const backlog = generateMockLogs(initialLines, unit || undefined);
          for (const line of backlog.reverse()) {
            send("log", { line, ts: Date.now(), mock: true });
          }

          send("status", { status: "following", mock: true });

          // Generate new lines on interval
          const tick = () => {
            if (closed) return;
            const newLogs = generateMockLogs(1, unit || undefined);
            for (const line of newLogs) {
              send("log", { line, ts: Date.now(), mock: true });
            }
            // Random interval 1-4s
            mockTimer = setTimeout(tick, 1000 + Math.random() * 3000);
          };
          mockTimer = setTimeout(tick, 1500);
          return;
        }

        // Real journalctl -f
        const args: string[] = ["journalctl", "-f", "--no-pager", "-o", "short-iso", "-n", String(initialLines)];
        if (since) args.push("--since=" + since);
        if (priority) args.push("-p", priority);
        if (unit) args.push("-u", unit.replace(/[^a-zA-Z0-9_.@-]/g, ""));

        try {
          child = spawn(args[0], args.slice(1), {
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (e: any) {
          send("error", { error: `Failed to spawn journalctl: ${e?.message}` });
          close();
          return;
        }

        send("status", { status: "following", mock: false, command: args.join(" ") });

        let buffer = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          if (closed) return;
          buffer += chunk.toString("utf8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // keep partial line
          for (const line of lines) {
            if (line.trim()) {
              send("log", { line, ts: Date.now() });
            }
          }
        });

        child.stderr?.on("data", (chunk: Buffer) => {
          console.warn("[sse logs] journalctl stderr:", chunk.toString("utf8"));
        });

        child.on("exit", (code, signal) => {
          if (!closed) {
            send("status", { status: "exited", code, signal });
            // Don't close — let browser reconnect via EventSource
            close();
          }
        });

        child.on("error", (err) => {
          send("error", { error: `journalctl error: ${err.message}` });
          close();
        });
      })();

      // Client disconnect
      req.signal.addEventListener("abort", () => {
        close();
      });
    },

    cancel() {
      // Stream cancelled by Next.js
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
      "X-Content-Type-Options": "nosniff",
    },
  });
}
