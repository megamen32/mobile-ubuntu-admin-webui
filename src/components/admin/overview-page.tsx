"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useHashRoute } from "@/lib/use-hash-route";
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Boxes,
  Clock,
  ArrowRight,
} from "lucide-react";

interface SystemInfo {
  hostname: string;
  distro?: string;
  platform: string;
  arch: string;
  uptime: number;
  loadavg: number[];
  cpus: number;
  totalMem: number;
  freeMem: number;
  disk?: { size: string; used: string; avail: string; percent: string };
  ts: number;
}

interface UnitInfo {
  name: string;
  activeState: string;
  subState: string;
  enabled: string;
}

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(b: number): string {
  if (b > 1e9) return (b / 1e9).toFixed(1) + " GB";
  if (b > 1e6) return (b / 1e6).toFixed(0) + " MB";
  if (b > 1e3) return (b / 1e3).toFixed(0) + " KB";
  return b + " B";
}

export function OverviewPage() {
  const [, navigate] = useHashRoute();
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const s = await apiFetch<SystemInfo>("/api/system", { cacheKey: "system", maxAge: 60_000 });
        if (mounted) setSys(s);
      } catch { /* ignore */ }
      try {
        const u = await apiFetch<{ units: UnitInfo[] }>("/api/services?type=service", {
          cacheKey: "services-list:service",
          maxAge: 30_000,
        });
        if (mounted) setUnits(u.units);
      } catch { /* ignore */ }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const activeCount = units.filter(u => u.activeState === "active").length;
  const failedCount = units.filter(u => u.activeState === "failed").length;
  const memUsed = sys ? sys.totalMem - sys.freeMem : 0;
  const memPct = sys ? (memUsed / sys.totalMem) * 100 : 0;

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Overview</h1>
        {sys && (
          <p className="text-sm text-muted-foreground">
            {sys.hostname} · {sys.distro || sys.platform}
          </p>
        )}
      </div>

      {/* System info cards */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Uptime"
          value={sys ? formatUptime(sys.uptime) : "—"}
          accent="default"
        />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Load avg"
          value={sys ? sys.loadavg.map(l => l.toFixed(2)).join(" ") : "—"}
          accent={sys && sys.loadavg[0] > sys.cpus ? "danger" : "default"}
        />
        <StatCard
          icon={<Cpu className="w-4 h-4" />}
          label="CPU cores"
          value={sys ? String(sys.cpus) : "—"}
          accent="default"
        />
        <StatCard
          icon={<MemoryStick className="w-4 h-4" />}
          label="Memory"
          value={sys ? `${formatBytes(memUsed)} / ${formatBytes(sys.totalMem)}` : "—"}
          accent={memPct > 85 ? "danger" : "default"}
          sub={sys ? `${memPct.toFixed(0)}% used` : undefined}
        />
      </div>

      {/* Disk usage */}
      {sys?.disk && (
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <HardDrive className="w-4 h-4 text-muted-foreground" />
              Disk usage
            </div>
            <span className="text-xs text-muted-foreground">{sys.disk.percent}</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary"
              style={{ width: sys.disk.percent }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
            <span>{sys.disk.used} used</span>
            <span>{sys.disk.avail} free · {sys.disk.size} total</span>
          </div>
        </Card>
      )}

      {/* Services summary */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Services</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => navigate("/services")}
          >
            View all <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-secondary/50 p-2">
            <div className="text-lg font-bold text-primary">{activeCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Active</div>
          </div>
          <div className="rounded-md bg-secondary/50 p-2">
            <div className="text-lg font-bold text-muted-foreground">{units.length - activeCount - failedCount}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Inactive</div>
          </div>
          <div className="rounded-md bg-destructive/15 p-2">
            <div className="text-lg font-bold text-destructive">{failedCount}</div>
            <div className="text-[10px] text-destructive/80 uppercase">Failed</div>
          </div>
        </div>
      </Card>

      {/* Quick failed services */}
      {failedCount > 0 && (
        <Card className="p-3 border-destructive/30">
          <h3 className="text-xs font-semibold text-destructive uppercase mb-2">Failed services</h3>
          <div className="space-y-1">
            {units.filter(u => u.activeState === "failed").slice(0, 5).map(u => (
              <button
                key={u.name}
                onClick={() => navigate(`/service/${u.name}`)}
                className="block w-full text-left text-sm py-1.5 px-2 rounded hover:bg-secondary/50 transition-colors truncate"
              >
                <span className="text-foreground">{u.name}</span>
                <span className="text-destructive ml-2 text-xs">{u.subState}</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {loading && !sys && (
        <div className="text-center text-sm text-muted-foreground py-12">
          Loading system info...
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "danger";
}) {
  return (
    <Card className={`p-3 ${accent === "danger" ? "border-destructive/30" : ""}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
        {icon}
        <span className="uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-base font-semibold font-mono truncate ${accent === "danger" ? "text-destructive" : ""}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
