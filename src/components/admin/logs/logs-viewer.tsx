"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { apiFetch, clearApiCache } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Loader2,
  Search,
  ChevronDown,
  Download,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  presetUnit?: string;
}

export function LogsViewer({ presetUnit }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState(500);
  const [since, setSince] = useState("1h");
  const [priority, setPriority] = useState("all");
  const [unit, setUnit] = useState(presetUnit || "");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (force = false) => {
    if (force) { setRefreshing(true); clearApiCache("general-logs"); } else { setLoading(true); }
    try {
      const params = new URLSearchParams();
      params.set("lines", String(lines));
      if (since) params.set("since", since);
      if (priority !== "all") params.set("priority", priority);
      if (unit) params.set("unit", unit);
      const data = await apiFetch<{ logs: string[] }>(`/api/logs?${params.toString()}`, {
        cacheKey: "general-logs",
        maxAge: force ? 0 : 10_000,
      });
      setLogs(data.logs);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lines, since, priority, unit]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(), 10_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const filtered = useMemo(() => {
    if (!search) return logs;
    const q = search.toLowerCase();
    return logs.filter(l => l.toLowerCase().includes(q));
  }, [logs, search]);

  function downloadLogs() {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-${unit || "system"}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-3 space-y-3 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Logs</h1>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setAutoRefresh(a => !a)}
            title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
          >
            {autoRefresh ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => downloadLogs()}
            title="Download"
          >
            <Download className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => load(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            placeholder="Unit (e.g. nginx.service)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="h-9 bg-card text-sm"
          />
          <select
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="h-9 bg-card border border-border rounded px-2 text-sm"
          >
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="24h">24h</option>
            <option value="3d">3d</option>
            <option value="7d">7d</option>
            <option value="">all</option>
          </select>
        </div>
        <div className="flex gap-2">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-9 bg-card border border-border rounded px-2 text-sm flex-1"
          >
            <option value="all">All priorities</option>
            <option value="emerg">Emergency</option>
            <option value="alert">Alert</option>
            <option value="crit">Critical</option>
            <option value="err">Error</option>
            <option value="warning">Warning</option>
            <option value="notice">Notice</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <select
            value={lines}
            onChange={(e) => setLines(Number(e.target.value))}
            className="h-9 bg-card border border-border rounded px-2 text-sm"
          >
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-card text-sm"
          />
        </div>
      </div>

      {/* Log output */}
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-secondary/30">
          <span className="text-xs text-muted-foreground">
            {filtered.length} {search ? `of ${logs.length}` : ""} lines
          </span>
          <button
            onClick={() => setAutoScroll(a => !a)}
            className={cn(
              "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded",
              autoScroll ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            )}
          >
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 font-mono text-[11px] leading-relaxed bg-black/40">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Loading logs...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-muted-foreground text-center py-12">No logs match filters</div>
          ) : (
            filtered.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all hover:bg-white/5 px-1 py-0.5">
                {colorizeLog(line)}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </Card>
    </div>
  );
}

function colorizeLog(line: string): React.ReactNode {
  // journalctl short-iso format: 2025-01-15T10:23:45+00:00 hostname process[pid]: message
  const m = line.match(/^(\S+)(\s+\S+)(\s+\S+?)(\[\d+\])?:\s(.*)$/);
  if (m) {
    const [, ts, host, proc, pid, msg] = m;
    const msgLower = msg.toLowerCase();
    let msgClass = "text-foreground/90";
    if (/\berror\b|\bfail|\bfatal|\bpanic|\bcrash/.test(msgLower)) msgClass = "text-red-400";
    else if (/\bwarn|\bdeprecat/.test(msgLower)) msgClass = "text-yellow-400";
    else if (/\bdebug\b/.test(msgLower)) msgClass = "text-blue-400";
    return (
      <>
        <span className="text-cyan-600">{ts}</span>
        <span className="text-purple-400">{host}</span>
        <span className="text-emerald-500">{proc}{pid}</span>
        <span className="text-muted-foreground">: </span>
        <span className={msgClass}>{msg}</span>
      </>
    );
  }
  if (/error|fail|fatal/i.test(line)) return <span className="text-red-400">{line}</span>;
  if (/warn/i.test(line)) return <span className="text-yellow-400">{line}</span>;
  return <span className="text-foreground/90">{line}</span>;
}
