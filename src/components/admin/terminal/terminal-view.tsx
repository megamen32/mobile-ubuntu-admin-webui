"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { apiPost, apiFetch } from "@/lib/api-client";
import { useHashRoute } from "@/lib/use-hash-route";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  TerminalSquare,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  CornerDownLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalLine {
  id: string;
  type: "input" | "output" | "stderr" | "system";
  text: string;
  cwd?: string;
}

interface CompletionState {
  open: boolean;
  items: string[];
  index: number;
  prefix: string;
}

const STORAGE_HIST = "ub-admin:terminal-history";
const STORAGE_CWD = "ub-admin:terminal-cwd";
const MAX_HISTORY = 500;

export function TerminalView() {
  const [, navigate] = useHashRoute();
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState<string>("/root");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number>(-1);
  const [running, setRunning] = useState(false);
  const [completions, setCompletions] = useState<CompletionState>({
    open: false, items: [], index: 0, prefix: "",
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const completionReqId = useRef(0);

  // Init from localStorage
  useEffect(() => {
    try {
      const h = JSON.parse(localStorage.getItem(STORAGE_HIST) || "[]");
      if (Array.isArray(h)) setHistory(h.slice(-MAX_HISTORY));
      const c = localStorage.getItem(STORAGE_CWD);
      if (c) setCwd(c);
    } catch { /* ignore */ }
    // Welcome banner
    setLines([
      { id: "sys1", type: "system", text: "Ubuntu Admin Terminal — bash session" },
      { id: "sys2", type: "system", text: "Type commands and press Enter. Use Tab for completion, ↑/↓ for history." },
    ]);
  }, []);

  // Persist history
  useEffect(() => {
    if (history.length > 0) {
      localStorage.setItem(STORAGE_HIST, JSON.stringify(history.slice(-MAX_HISTORY)));
    }
  }, [history]);

  // Persist cwd
  useEffect(() => {
    localStorage.setItem(STORAGE_CWD, cwd);
  }, [cwd]);

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // Refocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const appendLine = useCallback((line: Omit<TerminalLine, "id">) => {
    setLines(prev => [...prev, { ...line, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]);
  }, []);

  const runCommand = useCallback(async (cmd: string) => {
    setRunning(true);
    // Echo the input
    appendLine({ type: "input", text: cmd, cwd });

    try {
      const r = await apiPost<{ stdout: string; stderr: string; exitCode: number; cwd: string; clear?: boolean; exit?: boolean }>(
        "/api/terminal/exec",
        { cmd, cwd, sessionId: "default" }
      );
      if (r.clear) {
        setLines([]);
      } else {
        if (r.stdout) appendLine({ type: "output", text: r.stdout.replace(/\n$/, "") });
        if (r.stderr) appendLine({ type: "stderr", text: r.stderr.replace(/\n$/, "") });
        if (!r.stdout && !r.stderr && r.exitCode === 0) {
          // no output — common for `cd`, `mkdir`, etc.
        }
      }
      if (r.cwd && r.cwd !== cwd) setCwd(r.cwd);
    } catch (e: any) {
      appendLine({ type: "stderr", text: `error: ${e?.message || "exec failed"}` });
    } finally {
      setRunning(false);
      // Add to history (dedupe consecutive duplicates)
      if (cmd.trim()) {
        setHistory(prev => {
          if (prev[prev.length - 1] === cmd) return prev;
          return [...prev, cmd].slice(-MAX_HISTORY);
        });
      }
      setHistIdx(-1);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [cwd, appendLine]);

  // Tab completion
  const requestCompletion = useCallback(async (line: string) => {
    const reqId = ++completionReqId.current;
    try {
      const r = await apiFetch<{ completions: string[] }>("/api/terminal/complete", {
        method: "POST",
        body: JSON.stringify({ line, cwd }),
      });
      if (reqId !== completionReqId.current) return; // stale
      if (r.completions.length === 0) {
        setCompletions({ open: false, items: [], index: 0, prefix: "" });
        return;
      }
      if (r.completions.length === 1) {
        // Direct apply
        applyCompletion(r.completions[0]);
        setCompletions({ open: false, items: [], index: 0, prefix: "" });
        return;
      }
      // Find common prefix
      const common = commonPrefix(r.completions);
      if (common && common.length > (line.split(" ").pop() || "").length) {
        applyCompletion(common);
      }
      setCompletions({ open: true, items: r.completions, index: 0, prefix: common });
    } catch { /* ignore */ }
  }, [cwd]);

  function applyCompletion(comp: string) {
    setInput(prev => {
      const parts = prev.split(" ");
      // If completing a path with /, keep only the basename
      const lastComp = comp.split("/").pop() || comp;
      parts[parts.length - 1] = lastComp;
      const next = parts.join(" ");
      // Add trailing space if completion is full (no further ambiguity)
      return next + " ";
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Tab — completion
    if (e.key === "Tab") {
      e.preventDefault();
      if (completions.open) {
        // Cycle to next completion
        setCompletions(c => ({
          ...c,
          index: (c.index + 1) % c.items.length,
        }));
        applyCompletion(completions.items[(completions.index + 1) % completions.items.length]);
      } else {
        requestCompletion(input);
      }
      return;
    }
    // Enter — execute
    if (e.key === "Enter") {
      e.preventDefault();
      setCompletions(c => ({ ...c, open: false }));
      if (running) return;
      const cmd = input;
      setInput("");
      if (cmd.trim()) runCommand(cmd);
      return;
    }
    // Up — history prev
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const next = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(history[next] || "");
      return;
    }
    // Down — history next
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === -1) return;
      const next = histIdx + 1;
      if (next >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(history[next] || "");
      }
      return;
    }
    // Ctrl+L — clear
    if (e.key.toLowerCase() === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setLines([]);
      return;
    }
    // Ctrl+C — cancel current input
    if (e.key.toLowerCase() === "c" && e.ctrlKey) {
      e.preventDefault();
      appendLine({ type: "input", text: input + "^C", cwd });
      setInput("");
      return;
    }
    // Ctrl+A — go to start
    if (e.key.toLowerCase() === "a" && e.ctrlKey) {
      e.preventDefault();
      inputRef.current?.setSelectionRange(0, 0);
      return;
    }
    // Ctrl+E — go to end
    if (e.key.toLowerCase() === "e" && e.ctrlKey) {
      e.preventDefault();
      const len = input.length;
      inputRef.current?.setSelectionRange(len, len);
      return;
    }
    // Ctrl+U — clear line
    if (e.key.toLowerCase() === "u" && e.ctrlKey) {
      e.preventDefault();
      setInput("");
      return;
    }
    // Ctrl+K — kill to end
    if (e.key.toLowerCase() === "k" && e.ctrlKey) {
      e.preventDefault();
      const selStart = inputRef.current?.selectionStart ?? input.length;
      setInput(prev => prev.slice(0, selStart));
      return;
    }
    // Ctrl+W — delete word
    if (e.key.toLowerCase() === "w" && e.ctrlKey) {
      e.preventDefault();
      const selStart = inputRef.current?.selectionStart ?? input.length;
      const before = input.slice(0, selStart);
      const m = before.match(/\S+\s*$/);
      if (m) {
        setInput(prev => prev.slice(0, selStart - m![0].length) + prev.slice(selStart));
      }
      return;
    }
    // Ctrl+R — reverse search (simple impl: search history)
    if (e.key.toLowerCase() === "r" && e.ctrlKey) {
      e.preventDefault();
      const q = input || "";
      const found = [...history].reverse().find(h => h.includes(q) && h !== q);
      if (found) setInput(found);
      return;
    }
    // Escape — close completions
    if (e.key === "Escape") {
      setCompletions(c => ({ ...c, open: false }));
      return;
    }
  }

  // Special key bar handlers
  function sendSpecial(key: string) {
    // Simulate keypress via state
    const fakeEvent = {
      key,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>;
    handleKeyDown(fakeEvent);
  }

  function sendCtrl(letter: string) {
    const fakeEvent = {
      key: letter.toLowerCase(),
      ctrlKey: true,
      metaKey: false,
      preventDefault: () => {},
    } as unknown as React.KeyboardEvent<HTMLInputElement>;
    handleKeyDown(fakeEvent);
  }

  function clearTerminal() {
    setLines([]);
  }

  function clearHistory() {
    if (confirm("Clear terminal history?")) {
      setHistory([]);
      localStorage.removeItem(STORAGE_HIST);
    }
  }

  const hostname = "ubu-prod-01";
  const user = "root";
  const prompt = `${user}@${hostname}:${cwd === "/" ? "/" : cwd}#`;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <TerminalSquare className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold">Terminal</h1>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={clearTerminal} title="Clear screen (Ctrl+L)">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-2 font-mono text-[12px] leading-relaxed bg-black/40"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map(line => (
          <div key={line.id} className="whitespace-pre-wrap break-all">
            {line.type === "input" && (
              <div className="text-foreground">
                <span className="text-emerald-500">{line.cwd ? `${user}@${hostname}:${line.cwd === "/" ? "/" : line.cwd}#` : prompt}</span>{" "}
                <span>{line.text}</span>
              </div>
            )}
            {line.type === "output" && (
              <div className="text-foreground/90 pl-0">{line.text}</div>
            )}
            {line.type === "stderr" && (
              <div className="text-red-400">{line.text}</div>
            )}
            {line.type === "system" && (
              <div className="text-muted-foreground italic">{line.text}</div>
            )}
          </div>
        ))}
        {/* Live prompt */}
        <div className="flex items-baseline mt-0.5">
          <span className="text-emerald-500 shrink-0">{prompt}</span>
          <span className="ml-1 inline-block w-px h-3.5 bg-foreground ml-0.5 animate-pulse" />
        </div>

        {/* Completion popup */}
        {completions.open && completions.items.length > 0 && (
          <Card className="mt-1 p-1 max-w-full max-h-32 overflow-y-auto scrollbar-thin bg-popover border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide px-1 pb-0.5">
              {completions.items.length} completions · Tab to cycle
            </div>
            {completions.items.map((item, i) => (
              <div
                key={item}
                className={cn(
                  "px-1.5 py-0.5 text-xs font-mono cursor-pointer rounded",
                  i === completions.index ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                )}
                onClick={() => {
                  applyCompletion(item);
                  setCompletions(c => ({ ...c, open: false }));
                  inputRef.current?.focus();
                }}
              >
                {item}
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Input bar — mobile-friendly text form */}
      <div className="border-t border-border bg-background p-2 space-y-2 safe-bottom">
        <div className="flex items-center gap-1.5">
          <span className="text-emerald-500 font-mono text-xs shrink-0 max-w-[40%] truncate">{prompt}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setCompletions(c => ({ ...c, open: false }));
            }}
            onKeyDown={handleKeyDown}
            disabled={running}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="type a command..."
            className="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-xs text-foreground placeholder:text-muted-foreground/60"
          />
          {running && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => {
              if (!running && input.trim()) {
                const cmd = input;
                setInput("");
                runCommand(cmd);
              }
            }}
            disabled={running || !input.trim()}
          >
            <CornerDownLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Special keys bar — horizontal scroll */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
          <SpecialKey label="Tab" onClick={() => sendSpecial("Tab")} />
          <SpecialKey icon={<ChevronUp className="w-3.5 h-3.5" />} label="" onClick={() => sendSpecial("ArrowUp")} />
          <SpecialKey icon={<ChevronDown className="w-3.5 h-3.5" />} label="" onClick={() => sendSpecial("ArrowDown")} />
          <SpecialKey icon={<ArrowLeft className="w-3.5 h-3.5" />} label="" onClick={() => { inputRef.current?.setSelectionRange((inputRef.current?.selectionStart ?? 0) - 1, (inputRef.current?.selectionStart ?? 0) - 1); }} />
          <SpecialKey icon={<ArrowRight className="w-3.5 h-3.5" />} label="" onClick={() => { inputRef.current?.setSelectionRange((inputRef.current?.selectionStart ?? 0) + 1, (inputRef.current?.selectionStart ?? 0) + 1); }} />
          <SpecialKey label="^C" onClick={() => sendCtrl("c")} />
          <SpecialKey label="^L" onClick={() => sendCtrl("l")} />
          <SpecialKey label="^U" onClick={() => sendCtrl("u")} />
          <SpecialKey label="^W" onClick={() => sendCtrl("w")} />
          <SpecialKey label="^A" onClick={() => sendCtrl("a")} />
          <SpecialKey label="^E" onClick={() => sendCtrl("e")} />
          <SpecialKey label="^R" onClick={() => sendCtrl("r")} />
          <SpecialKey icon={<X className="w-3 h-3" />} label="Clr" onClick={clearTerminal} />
        </div>
      </div>
    </div>
  );
}

function SpecialKey({
  icon, label, onClick,
}: {
  icon?: React.ReactNode;
  label: string;
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

function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (const s of strings.slice(1)) {
    while (!s.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  return prefix;
}
