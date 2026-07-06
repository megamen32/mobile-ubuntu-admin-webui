"use client";

import { useEffect, useState, useMemo } from "react";
import { apiFetch, clearApiCache } from "@/lib/api-client";
import { useHashRoute } from "@/lib/use-hash-route";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookmarksBar } from "@/components/admin/bookmarks-bar";
import { useIsBookmarked, useToggleBookmark } from "@/lib/use-bookmarks";
import {
  Search,
  RefreshCw,
  Play,
  Square,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UnitInfo {
  name: string;
  description: string;
  loadState: string;
  activeState: string;
  subState: string;
  enabled: string;
  type: string;
}

interface Props {
  // Optional filter — when set, show only this type
  filterType?: string;
}

export function ServicesList({ filterType }: Props) {
  const [, navigate] = useHashRoute();
  const [units, setUnits] = useState<UnitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>(filterType || "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function load(force = false) {
    if (force) {
      clearApiCache("services-list");
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const type = typeFilter === "all" ? "" : `?type=${typeFilter}`;
      const data = await apiFetch<{ units: UnitInfo[] }>(`/api/services${type}`, {
        cacheKey: `services-list:${typeFilter}`,
        maxAge: force ? 0 : 30_000,
      });
      setUnits(data.units);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // Refresh every 30s in background
    const t = setInterval(() => load(), 30_000);
    return () => clearInterval(t);
  }, [typeFilter]);

  const filtered = useMemo(() => {
    let out = units;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.description.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      out = out.filter(u => u.activeState === statusFilter);
    }
    return out;
  }, [units, search, statusFilter]);

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Services</h1>
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

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search services..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 bg-card"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3">
        {[
          { v: "all", label: "All" },
          { v: "service", label: "Services" },
          { v: "socket", label: "Sockets" },
          { v: "timer", label: "Timers" },
          { v: "target", label: "Targets" },
          { v: "mount", label: "Mounts" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setTypeFilter(t.v)}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors",
              typeFilter === t.v
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3">
        {[
          { v: "all", label: "Any state" },
          { v: "active", label: "Active" },
          { v: "inactive", label: "Inactive" },
          { v: "failed", label: "Failed" },
        ].map((t) => (
          <button
            key={t.v}
            onClick={() => setStatusFilter(t.v)}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors",
              statusFilter === t.v
                ? "bg-accent text-accent-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Bookmarks bar (only shows when bookmarks exist) */}
      {!search && statusFilter === "all" && (
        <BookmarksBar
          type="service"
          onOpen={(name) => navigate(`/service/${name}`)}
          variant="chip"
        />
      )}

      {/* List */}
      {loading && units.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading services...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          No services match your filters.
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((u) => (
            <ServiceRow key={u.name} unit={u} onClick={() => navigate(`/service/${u.name}`)} />
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center pt-2">
        {filtered.length} of {units.length} units · cached, refreshes every 30s
      </div>
    </div>
  );
}

function ServiceRow({ unit, onClick }: { unit: UnitInfo; onClick: () => void }) {
  const icon = getStateIcon(unit.activeState, unit.subState);
  const colorClass = getStateColor(unit.activeState);
  const isBookmarked = useIsBookmarked("service", unit.name);
  const toggle = useToggleBookmark();

  return (
    <Card
      className="p-2.5 cursor-pointer hover:bg-accent/50 transition-colors active:scale-[0.99]"
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5">
        <div className={cn("shrink-0", colorClass)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{unit.name}</div>
          <div className="text-xs text-muted-foreground truncate">{unit.description}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle("service", unit.name, unit.description);
          }}
          className={cn(
            "shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors",
            isBookmarked
              ? "text-primary hover:bg-primary/15"
              : "text-muted-foreground/40 hover:text-foreground hover:bg-secondary"
          )}
          title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
        >
          <Star className={cn("w-3.5 h-3.5", isBookmarked && "fill-current")} />
        </button>
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <span className={cn("text-[10px] font-mono uppercase px-1.5 py-0.5 rounded", colorClass, "bg-current/10")}>
            {unit.activeState}
          </span>
          <span className="text-[10px] text-muted-foreground">{unit.enabled}</span>
        </div>
      </div>
    </Card>
  );
}

function getStateIcon(active: string, sub: string): React.ReactNode {
  if (active === "active" && sub === "running") return <Play className="w-4 h-4 fill-current" />;
  if (active === "active") return <RotateCw className="w-4 h-4" />;
  if (active === "failed") return <AlertCircle className="w-4 h-4" />;
  if (active === "inactive") return <Circle className="w-4 h-4" />;
  return <Square className="w-4 h-4" />;
}

function getStateColor(active: string): string {
  if (active === "active") return "text-emerald-400";
  if (active === "failed") return "text-destructive";
  if (active === "inactive") return "text-muted-foreground";
  return "text-yellow-400";
}
