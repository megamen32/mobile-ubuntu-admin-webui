"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  ts: string;  // BigInt returned as string
  username: string;
  action: string;
  target: string | null;
  ip: string | null;
  result: string;
  error: string | null;
  meta: string | null;
}

export function AuditLogViewer() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  async function load(force = false) {
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (actionFilter) params.set("action", actionFilter);
      const data = await apiFetch<{ entries: AuditEntry[]; total: number }>(
        `/api/audit?${params.toString()}`,
        { cacheKey: `audit:${offset}:${actionFilter}`, maxAge: force ? 0 : 15_000 }
      );
      setEntries(data.entries);
      setTotal(data.total);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [offset, actionFilter]);

  const filtered = search
    ? entries.filter(e =>
        e.action.toLowerCase().includes(search.toLowerCase()) ||
        e.target?.toLowerCase().includes(search.toLowerCase()) ||
        e.username.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Audit Log</h1>
          <p className="text-xs text-muted-foreground">
            Who did what via the web UI · {total} total entries
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search action, target, or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-md"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-3 px-3">
          {[
            { v: "", label: "All" },
            { v: "service.", label: "Services" },
            { v: "file.", label: "Files" },
            { v: "terminal.", label: "Terminal" },
            { v: "pty.", label: "PTY" },
            { v: "login.", label: "Login" },
            { v: "session.", label: "Sessions" },
          ].map(f => (
            <button
              key={f.v}
              onClick={() => { setActionFilter(f.v); setOffset(0); }}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-xs font-medium",
                actionFilter === f.v
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          No audit entries match.
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(e => (
            <Card key={e.id} className="p-2.5 flex items-center gap-3">
              <div className="shrink-0">
                {e.result === "ok" && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {e.result === "error" && <XCircle className="w-4 h-4 text-destructive" />}
                {e.result === "denied" && <AlertCircle className="w-4 h-4 text-yellow-400" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-medium">{e.action}</span>
                  {e.target && (
                    <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
                      {e.target}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  <span>{new Date(Number(e.ts)).toLocaleString()}</span>
                  <span>·</span>
                  <span className="font-medium">{e.username}</span>
                  {e.ip && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{e.ip}</span>
                    </>
                  )}
                </div>
                {e.error && (
                  <div className="text-[10px] text-destructive mt-0.5 truncate font-mono">
                    {e.error}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
