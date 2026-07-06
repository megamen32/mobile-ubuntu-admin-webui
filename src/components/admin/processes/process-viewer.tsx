"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { apiFetch, clearApiCache } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  RefreshCw,
  Loader2,
  Skull,
  AlertTriangle,
  Cpu,
  MemoryStick,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ProcessInfo {
  pid: number;
  user: string;
  cpu: number;
  mem: number;
  vsz: number;
  rss: number;
  tty: string;
  stat: string;
  start: string;
  time: string;
  command: string;
}

type SortKey = "cpu" | "mem" | "pid" | "name";

export function ProcessViewer() {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [killing, setKilling] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async (force = false) => {
    if (force) { setRefreshing(true); clearApiCache("processes"); }
    else setLoading(true);
    try {
      const data = await apiFetch<{ processes: ProcessInfo[]; total: number }>(
        `/api/processes?sort=${sort}&limit=100`,
        { cacheKey: "processes", maxAge: force ? 0 : 5_000 }
      );
      setProcesses(data.processes);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sort]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => load(), 5_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const sorted = useMemo(() => {
    let out = [...processes];
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(p =>
        p.command.toLowerCase().includes(q) ||
        p.user.toLowerCase().includes(q) ||
        String(p.pid).includes(q)
      );
    }
    out.sort((a, b) => {
      let cmp = 0;
      switch (sort) {
        case "mem": cmp = a.mem - b.mem; break;
        case "pid": cmp = a.pid - b.pid; break;
        case "name": cmp = a.command.localeCompare(b.command); break;
        case "cpu":
        default:
          cmp = a.cpu - b.cpu;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return out;
  }, [processes, search, sort, sortDir]);

  function toggleSort(key: SortKey) {
    if (sort === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSort(key);
      setSortDir(key === "pid" || key === "name" ? "asc" : "desc");
    }
  }

  async function kill(pid: number, signal: "term" | "kill" = "term") {
    if (!confirm(`Send SIG${signal === "kill" ? "KILL" : "TERM"} to PID ${pid}?`)) return;
    setKilling(pid);
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      const res = await fetch(`/api/processes/${pid}?signal=${signal}`, {
        method: "DELETE",
        headers: { Authorization: "Basic " + btoa(`${auth.username}:${auth.password}`) },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toast.success(`Sent SIG${signal === "kill" ? "KILL" : "TERM"} to PID ${pid}`);
      setTimeout(() => load(true), 500);
    } catch (e: any) {
      toast.error(`Kill failed: ${e?.message}`);
    } finally {
      setKilling(null);
    }
  }

  const totalCpu = processes.reduce((sum, p) => sum + p.cpu, 0);
  const totalMem = processes.reduce((sum, p) => sum + p.mem, 0);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Processes</h1>
          <p className="text-xs text-muted-foreground">
            {processes.length} processes · Σ CPU {totalCpu.toFixed(1)}% · Σ MEM {totalMem.toFixed(1)}%
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", autoRefresh && "text-primary")}
            onClick={() => setAutoRefresh(a => !a)}
            title={autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
          >
            {autoRefresh ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Filter by command, user, or PID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 bg-card text-sm"
        />
      </div>

      {/* Sort header (desktop only — too cramped on mobile) */}
      <div className="hidden sm:grid grid-cols-12 gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <button onClick={() => toggleSort("pid")} className="col-span-1 flex items-center gap-0.5">
          PID {sort === "pid" && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </button>
        <div className="col-span-2">User</div>
        <button onClick={() => toggleSort("cpu")} className="col-span-2 flex items-center gap-0.5">
          <Cpu className="w-3 h-3" /> CPU {sort === "cpu" && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </button>
        <button onClick={() => toggleSort("mem")} className="col-span-2 flex items-center gap-0.5">
          <MemoryStick className="w-3 h-3" /> MEM {sort === "mem" && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </button>
        <button onClick={() => toggleSort("name")} className="col-span-4 flex items-center gap-0.5">
          Command {sort === "name" && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        </button>
        <div className="col-span-1 text-right">Kill</div>
      </div>

      {/* List */}
      {loading && processes.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading processes...
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          No processes match your filter.
        </div>
      ) : (
        <div className="space-y-0.5">
          {sorted.map(p => (
            <ProcessRow
              key={p.pid}
              p={p}
              killing={killing === p.pid}
              onKillTerm={() => kill(p.pid, "term")}
              onKillForce={() => kill(p.pid, "kill")}
            />
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center pt-2">
        Showing {sorted.length} of {processes.length} processes · refreshes every 5s
      </div>
    </div>
  );
}

function ProcessRow({
  p,
  killing,
  onKillTerm,
  onKillForce,
}: {
  p: ProcessInfo;
  killing: boolean;
  onKillTerm: () => void;
  onKillForce: () => void;
}) {
  const isHighCpu = p.cpu > 50;
  const isHighMem = p.mem > 30;
  const isZombie = p.stat === "Z";

  return (
    <Card className={cn(
      "p-2 hover:bg-accent/50 transition-colors",
      isZombie && "border-yellow-500/30 bg-yellow-500/5",
    )}>
      {/* Desktop layout */}
      <div className="hidden sm:grid grid-cols-12 gap-2 items-center text-xs">
        <div className="col-span-1 font-mono text-muted-foreground">{p.pid}</div>
        <div className="col-span-2 truncate">{p.user}</div>
        <div className={cn("col-span-2 font-mono", isHighCpu && "text-yellow-400")}>
          {p.cpu.toFixed(1)}%
        </div>
        <div className={cn("col-span-2 font-mono", isHighMem && "text-yellow-400")}>
          {p.mem.toFixed(1)}%
        </div>
        <div className="col-span-4 truncate font-mono text-foreground/90" title={p.command}>
          {isZombie && <AlertTriangle className="w-3 h-3 inline mr-1 text-yellow-400" />}
          {p.command}
        </div>
        <div className="col-span-1 flex justify-end gap-0.5">
          <button
            onClick={onKillTerm}
            disabled={killing}
            className="w-6 h-6 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center disabled:opacity-50"
            title="SIGTERM (graceful)"
          >
            {killing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Skull className="w-3 h-3" />}
          </button>
          <button
            onClick={onKillForce}
            disabled={killing}
            className="w-6 h-6 rounded hover:bg-destructive/30 text-muted-foreground hover:text-destructive flex items-center justify-center disabled:opacity-50"
            title="SIGKILL (force)"
          >
            <span className="text-[10px] font-bold">-9</span>
          </button>
        </div>
      </div>

      {/* Mobile layout — stacked */}
      <div className="sm:hidden space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground shrink-0">#{p.pid}</span>
            <span className="text-xs font-mono truncate" title={p.command}>
              {isZombie && <AlertTriangle className="w-3 h-3 inline mr-1 text-yellow-400" />}
              {p.command}
            </span>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <button
              onClick={onKillTerm}
              disabled={killing}
              className="w-7 h-7 rounded bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center disabled:opacity-50"
              title="SIGTERM"
            >
              {killing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Skull className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onKillForce}
              disabled={killing}
              className="w-7 h-7 rounded bg-secondary hover:bg-destructive/30 text-muted-foreground hover:text-destructive flex items-center justify-center text-[10px] font-bold disabled:opacity-50"
              title="SIGKILL"
            >
              -9
            </button>
          </div>
        </div>
        <div className="flex gap-3 text-[10px] text-muted-foreground">
          <span>{p.user}</span>
          <span className={cn("font-mono", isHighCpu && "text-yellow-400")}>CPU {p.cpu.toFixed(1)}%</span>
          <span className={cn("font-mono", isHighMem && "text-yellow-400")}>MEM {p.mem.toFixed(1)}%</span>
          <span className="font-mono">RSS {formatKB(p.rss)}</span>
        </div>
      </div>
    </Card>
  );
}

function formatKB(kb: number): string {
  if (kb > 1024 * 1024) return (kb / 1024 / 1024).toFixed(1) + " GB";
  if (kb > 1024) return (kb / 1024).toFixed(0) + " MB";
  return kb + " KB";
}
