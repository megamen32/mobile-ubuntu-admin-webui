"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  TerminalSquare,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  X,
  Power,
  RefreshCw,
  Type,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onSwitchToSimple: () => void;
}

/**
 * PTY terminal backed by HTTP long-polling (not WebSocket).
 *
 * Why: Next.js rewrites can't reliably proxy WebSockets to a different port in
 * the preview sandbox. HTTP long-polling on port 3000 works universally.
 *
 * Flow:
 *  1. POST /api/pty/connect  → sessionId
 *  2. GET  /api/pty/output?sessionId=...  → long-poll for output (25s timeout)
 *     → on data, write to xterm.js and immediately re-poll
 *     → on exit, stop polling
 *  3. POST /api/pty/input    → send keystrokes (xterm.onData)
 *  4. POST /api/pty/resize   → on container resize
 *  5. POST /api/pty/kill     → kill session
 */

export function PtyTerminal({ onSwitchToSimple }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitRef = useRef<any>(null);
  const sessionIdRef = useRef<string>("");
  const pollAbortRef = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"loading" | "connecting" | "ready" | "error" | "exited">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [cols, setCols] = useState(80);
  const [rows, setRows] = useState(24);

  // Auth header
  const getAuthHeader = useCallback(() => {
    try {
      const raw = localStorage.getItem("ub-admin:auth");
      if (raw) {
        const a = JSON.parse(raw);
        return "Basic " + btoa(`${a.username}:${a.password}`);
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  // Combined: load xterm + connect to PTY in one effect to avoid StrictMode
  // double-mount race conditions.
  useEffect(() => {
    let cancelled = false;
    let pollAbort: AbortController | null = null;

    (async () => {
      try {
        const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
          import("@xterm/addon-web-links"),
        ]);
        if (cancelled || !containerRef.current) return;

        // Load CSS (idempotent)
        if (!document.querySelector(`link[data-xterm-css]`)) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = "https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css";
          link.setAttribute("data-xterm-css", "true");
          document.head.appendChild(link);
        }

        const term = new Terminal({
          cursorBlink: true,
          fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Source Code Pro', Menlo, monospace",
          fontSize: 13,
          theme: {
            background: "#1a0e1a",
            foreground: "#f0e8e8",
            cursor: "#e95420",
            cursorAccent: "#1a0e1a",
            selectionBackground: "#e9542055",
            black: "#2c001e",
            red: "#e95420",
            green: "#0e8c2e",
            yellow: "#f99b11",
            blue: "#3b73d4",
            magenta: "#a555b9",
            cyan: "#18b1c7",
            white: "#e0d8d8",
            brightBlack: "#5c525c",
            brightRed: "#ff6b3b",
            brightGreen: "#3ca55c",
            brightYellow: "#ffb86c",
            brightBlue: "#5e8fe8",
            brightMagenta: "#c87dd6",
            brightCyan: "#4dd0e1",
            brightWhite: "#ffffff",
          },
          allowProposedApi: true,
          scrollback: 5000,
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        try { fit.fit(); } catch { /* ignore */ }

        termRef.current = term;
        fitRef.current = fit;
        setCols(term.cols);
        setRows(term.rows);

        if (cancelled) return;
        setStatus("connecting");

        // Connect to PTY
        const auth = getAuthHeader();
        if (!auth) {
          setErrorMsg("Not authenticated");
          setStatus("error");
          return;
        }

        const storedSessionId = typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem("ub-admin:pty-session") || ""
          : "";

        const res = await fetch("/api/pty/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": auth,
          },
          body: JSON.stringify({
            cols: term.cols || 80,
            rows: term.rows || 24,
            sessionId: storedSessionId || undefined,
          }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;

        sessionIdRef.current = data.sessionId;
        sessionStorage.setItem("ub-admin:pty-session", data.sessionId);
        setStatus("ready");
        toast.success(`PTY ready · ${data.shell}`);

        // Hook up xterm input → POST /api/pty/input
        term.onData((input: string) => {
          const a = getAuthHeader();
          if (!a) return;
          fetch("/api/pty/input", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": a,
            },
            body: JSON.stringify({
              sessionId: sessionIdRef.current,
              data: input,
            }),
          }).catch(() => { /* ignore */ });
        });

        // Start long-poll loop for output
        pollAbort = new AbortController();
        while (!cancelled && sessionIdRef.current) {
          const a = getAuthHeader();
          if (!a) break;

          try {
            const r = await fetch(
              `/api/pty/output?sessionId=${encodeURIComponent(sessionIdRef.current)}`,
              {
                headers: { "Authorization": a },
                signal: pollAbort.signal,
              }
            );
            if (cancelled) return;
            if (r.status === 404) {
              term.write("\r\n\x1b[31m[session ended]\x1b[0m\r\n");
              setStatus("exited");
              sessionStorage.removeItem("ub-admin:pty-session");
              return;
            }
            if (!r.ok) {
              await new Promise(r => setTimeout(r, 1000));
              continue;
            }
            const out = await r.json();
            if (cancelled) return;

            if (out.data && termRef.current) {
              termRef.current.write(out.data);
            }
            if (out.exit) {
              if (termRef.current) {
                termRef.current.write(`\r\n\x1b[31m[process exited code=${out.exitCode}]\x1b[0m\r\n`);
              }
              setStatus("exited");
              sessionStorage.removeItem("ub-admin:pty-session");
              return;
            }
            // Loop immediately — server holds connection until data or 25s timeout
          } catch (e: any) {
            if (cancelled) return;
            if (e?.name === "AbortError") return;
            console.warn("poll error", e);
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error("Failed to load xterm", e);
        setErrorMsg(e?.message ?? "Failed to load terminal");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (pollAbort) pollAbort.abort();
      if (termRef.current) {
        try { termRef.current.dispose(); } catch { /* ignore */ }
        termRef.current = null;
      }
    };
  }, [getAuthHeader]);

  // Resize handling
  useEffect(() => {
    if (!termRef.current || !fitRef.current) return;
    const handleResize = () => {
      try {
        fitRef.current.fit();
        const c = termRef.current.cols;
        const r = termRef.current.rows;
        setCols(c);
        setRows(r);
        // Send resize to server
        const auth = getAuthHeader();
        if (auth && sessionIdRef.current) {
          fetch("/api/pty/resize", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": auth,
            },
            body: JSON.stringify({
              sessionId: sessionIdRef.current,
              cols: c,
              rows: r,
            }),
          }).catch(() => { /* ignore */ });
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("resize", handleResize);
    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    setTimeout(handleResize, 50);
    return () => {
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
    };
  }, [status, getAuthHeader]);

  // Special keys — write escape sequences to PTY
  const sendRaw = useCallback((data: string) => {
    const auth = getAuthHeader();
    if (!auth || !sessionIdRef.current) return;
    fetch("/api/pty/input", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": auth,
      },
      body: JSON.stringify({ sessionId: sessionIdRef.current, data }),
    }).catch(() => { /* ignore */ });
    termRef.current?.focus();
  }, [getAuthHeader]);

  const sendSpecial = useCallback((key: string) => {
    const seqs: Record<string, string> = {
      Tab: "\t",
      ArrowUp: "\x1b[A",
      ArrowDown: "\x1b[B",
      ArrowRight: "\x1b[C",
      ArrowLeft: "\x1b[D",
      Home: "\x1b[H",
      End: "\x1b[F",
      PageUp: "\x1b[5~",
      PageDown: "\x1b[6~",
      Insert: "\x1b[2~",
      Delete: "\x1b[3~",
      Escape: "\x1b",
      Enter: "\r",
      Backspace: "\x7f",
    };
    sendRaw(seqs[key] || "");
  }, [sendRaw]);

  const sendCtrl = useCallback((letter: string) => {
    const code = letter.toLowerCase().charCodeAt(0) - 96;
    if (code >= 0 && code <= 31) sendRaw(String.fromCharCode(code));
  }, [sendRaw]);

  const clearScreen = useCallback(() => sendCtrl("l"), [sendCtrl]);
  const interrupt = useCallback(() => sendCtrl("c"), [sendCtrl]);

  const killSession = useCallback(() => {
    if (!confirm("Kill terminal session?")) return;
    const auth = getAuthHeader();
    if (!auth || !sessionIdRef.current) return;
    fetch("/api/pty/kill", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": auth,
      },
      body: JSON.stringify({ sessionId: sessionIdRef.current }),
    }).then(() => {
      sessionStorage.removeItem("ub-admin:pty-session");
      if (termRef.current) termRef.current.clear();
      toast.success("Session killed");
      setStatus("exited");
    }).catch(() => { /* ignore */ });
  }, [getAuthHeader]);

  const reconnect = useCallback(() => {
    sessionStorage.removeItem("ub-admin:pty-session");
    sessionIdRef.current = "";
    if (termRef.current) termRef.current.clear();
    setStatus("connecting");
    setErrorMsg("");
    // Force a reload to restart the effect cleanly — simpler than tracking a counter
    setTimeout(() => {
      window.location.reload();
    }, 100);
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <TerminalSquare className="w-4 h-4 text-primary shrink-0" />
          <h1 className="text-sm font-semibold">Terminal · PTY</h1>
          <span className={cn(
            "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded",
            status === "ready" && "bg-emerald-500/15 text-emerald-400",
            status === "connecting" && "bg-yellow-500/15 text-yellow-400",
            status === "loading" && "bg-secondary text-muted-foreground",
            status === "error" && "bg-destructive/15 text-destructive",
            status === "exited" && "bg-destructive/15 text-destructive",
          )}>
            {status === "connecting" && <Loader2 className="w-3 h-3 mr-0.5 inline animate-spin" />}
            {status}
          </span>
          {status === "ready" && (
            <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">
              {cols}×{rows}
            </span>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={onSwitchToSimple}
            title="Switch to simple text-mode terminal"
          >
            <Type className="w-3.5 h-3.5" />
            <span className="hidden sm:inline ml-1">Simple</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={clearScreen} title="Clear (Ctrl+L)">
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={interrupt} title="Interrupt (Ctrl+C)">
            <X className="w-4 h-4" />
          </Button>
          {(status === "error" || status === "exited") && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={reconnect} title="Reconnect">
              <RefreshCw className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={killSession} title="Kill session">
            <Power className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* xterm.js container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-black/40 p-1"
        onClick={() => termRef.current?.focus()}
      />

      {/* Special keys bar — mobile-friendly */}
      <div className="border-t border-border bg-background p-2 safe-bottom">
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          <SpecialKey label="Tab" onClick={() => sendSpecial("Tab")} />
          <SpecialKey icon={<ChevronUp className="w-3.5 h-3.5" />} onClick={() => sendSpecial("ArrowUp")} />
          <SpecialKey icon={<ChevronDown className="w-3.5 h-3.5" />} onClick={() => sendSpecial("ArrowDown")} />
          <SpecialKey icon={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => sendSpecial("ArrowLeft")} />
          <SpecialKey icon={<ArrowRight className="w-3.5 h-3.5" />} onClick={() => sendSpecial("ArrowRight")} />
          <SpecialKey label="Home" onClick={() => sendSpecial("Home")} />
          <SpecialKey label="End" onClick={() => sendSpecial("End")} />
          <SpecialKey label="PgUp" onClick={() => sendSpecial("PageUp")} />
          <SpecialKey label="PgDn" onClick={() => sendSpecial("PageDown")} />
          <SpecialKey label="Ins" onClick={() => sendSpecial("Insert")} />
          <SpecialKey label="Del" onClick={() => sendSpecial("Delete")} />
          <SpecialKey label="Esc" onClick={() => sendSpecial("Escape")} />
          <SpecialKey label="^C" onClick={() => sendCtrl("c")} />
          <SpecialKey label="^D" onClick={() => sendCtrl("d")} />
          <SpecialKey label="^L" onClick={() => sendCtrl("l")} />
          <SpecialKey label="^Z" onClick={() => sendCtrl("z")} />
          <SpecialKey label="^R" onClick={() => sendCtrl("r")} />
          <SpecialKey label="^A" onClick={() => sendCtrl("a")} />
          <SpecialKey label="^E" onClick={() => sendCtrl("e")} />
          <SpecialKey label="^W" onClick={() => sendCtrl("w")} />
          <SpecialKey label="^U" onClick={() => sendCtrl("u")} />
          <SpecialKey label="^K" onClick={() => sendCtrl("k")} />
        </div>
      </div>

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/95 z-50 p-6">
          <div className="text-center space-y-4 max-w-sm">
            <div className="text-destructive text-4xl">⚠</div>
            <div>
              <div className="font-semibold mb-1">PTY connection failed</div>
              <div className="text-sm text-muted-foreground">{errorMsg}</div>
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="default" onClick={reconnect} size="sm">
                <RefreshCw className="w-4 h-4 mr-1.5" />
                Retry
              </Button>
              <Button variant="secondary" onClick={onSwitchToSimple} size="sm">
                <Type className="w-4 h-4 mr-1.5" />
                Simple mode
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecialKey({
  icon, label, onClick,
}: {
  icon?: React.ReactNode;
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 h-8 min-w-8 px-2 flex items-center gap-1 rounded bg-secondary hover:bg-accent text-xs font-mono uppercase text-secondary-foreground active:scale-95 transition-transform"
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}
