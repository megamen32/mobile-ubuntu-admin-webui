"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { apiFetch, apiPost, clearApiCache } from "@/lib/api-client";
import { useLogStream } from "@/lib/use-log-stream";
import { useHashRoute } from "@/lib/use-hash-route";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  Power,
  PowerOff,
  RefreshCw,
  Loader2,
  Terminal,
  Clock,
  Cpu,
  MemoryStick,
  FileText,
  ChevronDown,
  ChevronRight,
  Radio,
  Pause,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UnitStatus {
  name: string;
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
  enabled: string;
  mainPID?: string;
  memoryBytes?: number;
  cpuNs?: number;
  fragmentPath?: string;
}

interface Props {
  unitName: string;
}

export function ServiceDetail({ unitName }: Props) {
  const [, navigate] = useHashRoute();
  const [unit, setUnit] = useState<UnitStatus | null>(null);
  const [statusText, setStatusText] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  // Logs panel state — SSE streaming
  const [logsOpen, setLogsOpen] = useState(true);
  const [logLines, setLogLines] = useState(100);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const logStreamUrl = useMemo(
    () => `/api/services/${encodeURIComponent(unitName)}/logs/stream?lines=${logLines}`,
    [unitName, logLines]
  );
  const {
    lines: streamLines,
    status: streamStatus,
    paused: streamPaused,
    pause: pauseStream,
    resume: resumeStream,
    clear: clearStream,
  } = useLogStream({
    url: logsOpen ? logStreamUrl : null,
    maxLines: 500,
    autoConnect: true,
  });

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const data = await apiFetch<{ unit: UnitStatus; statusText: string }>(
        `/api/services/${encodeURIComponent(unitName)}`,
        { cacheKey: `service:${unitName}`, maxAge: force ? 0 : 10_000 }
      );
      setUnit(data.unit);
      setStatusText(data.statusText);
    } catch (e: any) {
      toast.error(`Failed to load: ${e?.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [unitName]);

  useEffect(() => { load(); }, [load]);

  // Auto-scroll log panel on new lines
  useEffect(() => {
    if (logsOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamLines, logsOpen]);

  // Background refresh of service status
  useEffect(() => {
    const t = setInterval(() => load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function handleAction(action: string) {
    setActing(action);
    try {
      await apiPost(`/api/services/${encodeURIComponent(unitName)}`, { action });
      clearApiCache(`service:${unitName}`);
      clearApiCache("services-list");
      toast.success(`${action} ${unitName}: OK`);
      await load(true);
      // SSE stream auto-resumes — no need to manually reload logs
    } catch (e: any) {
      toast.error(`${action} failed: ${e?.message}`);
    } finally {
      setActing(null);
    }
  }

  const isActive = unit?.activeState === "active";
  const isFailed = unit?.activeState === "failed";
  const isEnabled = unit?.enabled === "enabled";

  return (
    <div className="p-3 space-y-3">
      {/* Back button + title */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/services")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold truncate">{unitName}</h1>
          {unit?.description && (
            <p className="text-xs text-muted-foreground truncate">{unit.description}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Status badges */}
      {unit && (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={cn(
            "text-xs",
            isActive ? "border-emerald-500/50 text-emerald-400" :
            isFailed ? "border-destructive/50 text-destructive" :
            "border-muted-foreground/30 text-muted-foreground"
          )}>
            {unit.activeState} ({unit.subState})
          </Badge>
          <Badge variant="outline" className="text-xs">
            {unit.enabled}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {unit.loadState}
          </Badge>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <ActionButton
          icon={<Play className="w-4 h-4" />}
          label="Start"
          onClick={() => handleAction("start")}
          loading={acting === "start"}
          disabled={isActive || !!acting}
          variant="default"
        />
        <ActionButton
          icon={<Square className="w-4 h-4" />}
          label="Stop"
          onClick={() => handleAction("stop")}
          loading={acting === "stop"}
          disabled={!isActive || !!acting}
          variant="destructive"
        />
        <ActionButton
          icon={<RotateCw className="w-4 h-4" />}
          label="Restart"
          onClick={() => handleAction("restart")}
          loading={acting === "restart"}
          disabled={!!acting}
          variant="secondary"
        />
        <ActionButton
          icon={<Power className="w-4 h-4" />}
          label="Enable"
          onClick={() => handleAction("enable")}
          loading={acting === "enable"}
          disabled={isEnabled || !!acting}
          variant="secondary"
        />
        <ActionButton
          icon={<PowerOff className="w-4 h-4" />}
          label="Disable"
          onClick={() => handleAction("disable")}
          loading={acting === "disable"}
          disabled={!isEnabled || !!acting}
          variant="secondary"
        />
        <ActionButton
          icon={<RotateCw className="w-4 h-4" />}
          label="Reload"
          onClick={() => handleAction("reload")}
          loading={acting === "reload"}
          disabled={!!acting}
          variant="secondary"
        />
      </div>

      {/* Quick stats */}
      {unit && (unit.mainPID || unit.memoryBytes || unit.fragmentPath) && (
        <Card className="p-3">
          <div className="space-y-1.5 text-xs">
            {unit.mainPID && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Main PID</span>
                <span className="font-mono">{unit.mainPID}</span>
              </div>
            )}
            {unit.memoryBytes !== undefined && unit.memoryBytes > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <MemoryStick className="w-3 h-3" /> Memory
                </span>
                <span className="font-mono">{formatBytes(Number(unit.memoryBytes))}</span>
              </div>
            )}
            {unit.cpuNs !== undefined && Number(unit.cpuNs) > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> CPU time
                </span>
                <span className="font-mono">{(Number(unit.cpuNs) / 1e9).toFixed(2)}s</span>
              </div>
            )}
            {unit.fragmentPath && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground flex items-center gap-1 shrink-0">
                  <FileText className="w-3 h-3" /> Unit file
                </span>
                <button
                  className="font-mono text-primary truncate hover:underline text-right"
                  onClick={() => navigate(`/files/edit?path=${encodeURIComponent(unit.fragmentPath!)}`)}
                >
                  {unit.fragmentPath}
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Logs panel — SSE live streaming */}
      <Card className="overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors"
          onClick={() => setLogsOpen(o => !o)}
        >
          <div className="flex items-center gap-2">
            {logsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">journalctl</span>
            <Badge variant="outline" className="text-[10px]">
              <Radio
                className={cn("w-3 h-3 mr-1", streamStatus === "open" && "animate-pulse")}
                style={{ color: streamStatus === "open" ? "#10b981" : streamStatus === "error" ? "#ef4444" : "#9ca3af" }}
              />
              {streamStatus === "open" ? "live" : streamStatus}
            </Badge>
            {streamLines[0]?.mock && (
              <Badge variant="outline" className="text-[10px] text-yellow-500">mock</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={logLines}
              onChange={(e) => setLogLines(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="text-xs bg-secondary border border-border rounded px-1.5 py-0.5"
            >
              <option value={50}>50 init</option>
              <option value={100}>100 init</option>
              <option value={200}>200 init</option>
              <option value={500}>500 init</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => {
                e.stopPropagation();
                if (streamPaused) resumeStream(); else pauseStream();
              }}
              title={streamPaused ? "Resume" : "Pause"}
            >
              {streamPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={(e) => { e.stopPropagation(); clearStream(); }}
              title="Clear"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </button>
        {logsOpen && (
          <div className="border-t border-border">
            <div className="max-h-96 overflow-y-auto scrollbar-thin p-2 font-mono text-[11px] leading-relaxed bg-black/30">
              {streamStatus === "connecting" && streamLines.length === 0 ? (
                <div className="text-muted-foreground text-center py-6 flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Connecting to stream...
                </div>
              ) : streamLines.length === 0 ? (
                <div className="text-muted-foreground text-center py-6">Waiting for logs...</div>
              ) : (
                streamLines.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all hover:bg-white/5 px-1 py-0.5">
                    {colorizeLog(line.line)}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </Card>

      {/* systemctl status output */}
      {statusText && (
        <Card className="overflow-hidden">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">systemctl status</span>
          </div>
          <pre className="p-3 text-[11px] font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto scrollbar-thin bg-black/30">
            {statusText}
          </pre>
        </Card>
      )}

      {loading && !unit && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading service...
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon, label, onClick, loading, disabled, variant,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  variant: "default" | "secondary" | "destructive";
}) {
  return (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      className="h-14 flex-col gap-0.5 text-xs"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span>{label}</span>
    </Button>
  );
}

function formatBytes(b: number): string {
  if (b > 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b > 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b > 1e3) return (b / 1e3).toFixed(0) + " KB";
  return b + " B";
}

function colorizeLog(line: string): React.ReactNode {
  if (/\bERROR\b|\bFATAL\b|failed/i.test(line)) {
    return <span className="text-red-400">{line}</span>;
  }
  if (/\bWARN/i.test(line)) {
    return <span className="text-yellow-400">{line}</span>;
  }
  if (/\bDEBUG\b/i.test(line)) {
    return <span className="text-blue-400">{line}</span>;
  }
  return <span className="text-foreground/90">{line}</span>;
}
