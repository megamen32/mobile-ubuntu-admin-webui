"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Smartphone,
  Monitor,
  Globe,
  Clock,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DeviceSession {
  id: string;
  username: string;
  deviceId: string;
  label: string | null;
  userAgent: string | null;
  ip: string | null;
  firstSeen: string;
  lastSeen: string;
  ageDays: number;
  lastSeenAgo: number;
  revoked: boolean;
}

export function SessionsList() {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  async function load(force = false) {
    if (force) setRefreshing(true); else setLoading(true);
    try {
      const data = await apiFetch<{ sessions: DeviceSession[] }>("/api/sessions", {
        cacheKey: "sessions-list",
        maxAge: force ? 0 : 30_000,
      });
      setSessions(data.sessions);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function revoke(id: string, label: string) {
    if (!confirm(`Revoke session ${label || id}?`)) return;
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: "Basic " + btoa(`${auth.username}:${auth.password}`) },
      });
      toast.success("Session revoked");
      load(true);
    } catch (e: any) {
      toast.error(`Revoke failed: ${e?.message}`);
    }
  }

  const filtered = sessions.filter(s =>
    !search ||
    s.deviceId.toLowerCase().includes(search.toLowerCase()) ||
    s.label?.toLowerCase().includes(search.toLowerCase()) ||
    s.userAgent?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sessions</h1>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Active device sessions for your account. Revoke any you don't recognize.
        Note: revoking does NOT invalidate credentials — change your password if you suspect compromise.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter sessions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 bg-card text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading sessions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">
          No sessions found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <Card key={s.id} className="p-3">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {s.userAgent?.includes("Mobile") ? (
                    <Smartphone className="w-5 h-5 text-primary" />
                  ) : s.userAgent?.includes("Mac") || s.userAgent?.includes("Windows") || s.userAgent?.includes("Linux") ? (
                    <Monitor className="w-5 h-5 text-primary" />
                  ) : (
                    <Globe className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm truncate">
                      {s.label || s.deviceId.slice(0, 16)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => revoke(s.id, s.label || s.deviceId)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground truncate font-mono">
                    {s.userAgent?.slice(0, 80) || "unknown user agent"}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatLastSeen(s.lastSeenAgo)} ago
                    </Badge>
                    {s.ip && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {s.ip}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {s.ageDays}d old
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function formatLastSeen(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
