import { NextRequest } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { spawn, ChildProcess } from "child_process";
import { hasJournalctl, hasSystemd } from "@/lib/server-exec";
import { getServerContext, getSshConnection } from "@/lib/server-context";
import { generateMockLogs } from "@/lib/mock-data";
import { Client } from "ssh2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60 * 60;

/**
 * GET /api/logs/stream?since=1h&priority=err&unit=nginx&lines=50
 *
 * SSE stream of journalctl -f output. Supports multi-server via X-Server-Id.
 *
 * For local: spawns `journalctl -f` process, pipes stdout as SSE events.
 * For remote: opens SSH shell running `journalctl -f`, pipes output.
 *
 * On client disconnect, the process/SSH channel is killed.
 */
export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  const ctx = await getServerContext(req);
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
      let sshStream: any = null;
      let sshConn: Client | null = null;
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
        if (sshStream) {
          try { sshStream.close(); } catch { /* ignore */ }
          sshStream = null;
        }
        // Note: don't close sshConn — it's pooled
        if (mockTimer) {
          clearTimeout(mockTimer);
          mockTimer = null;
        }
        try { controller.close(); } catch { /* already closed */ }
      };

      send("status", { status: "starting", since, priority, unit, lines: initialLines, server: ctx.serverName });

      (async () => {
        // Check if we should use mock mode (only for local without journald)
        let useMock = false;
        if (ctx.mode === "local") {
          const onJournal = await hasJournalctl();
          const onSystemd = await hasSystemd();
          useMock = !onJournal || !onSystemd;
        }

        if (useMock) {
          send("status", { status: "mock", message: "journald not running, generating mock data" });
          const backlog = generateMockLogs(initialLines, unit || undefined);
          for (const line of backlog.reverse()) {
            send("log", { line, ts: Date.now(), mock: true });
          }
          send("status", { status: "following", mock: true });
          const tick = () => {
            if (closed) return;
            const newLogs = generateMockLogs(1, unit || undefined);
            for (const line of newLogs) {
              send("log", { line, ts: Date.now(), mock: true });
            }
            mockTimer = setTimeout(tick, 1000 + Math.random() * 3000);
          };
          mockTimer = setTimeout(tick, 1500);
          return;
        }

        // Build journalctl command
        const args: string[] = ["journalctl", "-f", "--no-pager", "-o", "short-iso", "-n", String(initialLines)];
        if (since) args.push("--since=" + since);
        if (priority) args.push("-p", priority);
        if (unit) args.push("-u", unit.replace(/[^a-zA-Z0-9_.@-]/g, ""));
        const cmd = args.join(" ");

        if (ctx.mode === "local") {
          // Local: spawn journalctl directly
          try {
            child = spawn(args[0], args.slice(1), { stdio: ["ignore", "pipe", "pipe"] });
          } catch (e: any) {
            send("error", { error: `Failed to spawn journalctl: ${e?.message}` });
            close();
            return;
          }

          send("status", { status: "following", mock: false, command: cmd });

          let buffer = "";
          child.stdout?.on("data", (chunk: Buffer) => {
            if (closed) return;
            buffer += chunk.toString("utf8");
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.trim()) send("log", { line, ts: Date.now() });
            }
          });

          child.stderr?.on("data", (chunk: Buffer) => {
            console.warn("[sse logs] journalctl stderr:", chunk.toString("utf8"));
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
        } else {
          // Remote: SSH exec journalctl
          const sshResult = await getSshConnection(req);
          if (!sshResult) {
            send("error", { error: "Failed to get SSH connection" });
            close();
            return;
          }
          sshConn = sshResult.conn;

          try {
            sshStream = await new Promise<any>((resolve, reject) => {
              sshConn.exec(cmd, { pty: false }, (err: any, stream: any) => {
                if (err) reject(err);
                else resolve(stream);
              });
            });
          } catch (e: any) {
            send("error", { error: `SSH exec failed: ${e?.message}` });
            close();
            return;
          }

          send("status", { status: "following", mock: false, server: ctx.serverName });

          let buffer = "";
          sshStream.on("data", (chunk: Buffer) => {
            if (closed) return;
            buffer += chunk.toString("utf8");
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (line.trim()) send("log", { line, ts: Date.now() });
            }
          });

          sshStream.stderr.on("data", (chunk: Buffer) => {
            console.warn(`[sse logs ${ctx.serverName}] journalctl stderr:`, chunk.toString("utf8"));
          });

          sshStream.on("close", (code: number, signal: any) => {
            if (!closed) {
              send("status", { status: "exited", code, signal });
              close();
            }
          });

          sshStream.on("error", (err: Error) => {
            send("error", { error: `SSH stream error: ${err.message}` });
            close();
          });
        }
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
      "X-Content-Type-Options": "nosniff",
    },
  });
}
