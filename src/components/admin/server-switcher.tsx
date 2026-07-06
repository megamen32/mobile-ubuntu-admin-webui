"use client";

import { useEffect, useState } from "react";
import { apiFetch, clearApiCache } from "@/lib/api-client";
import { useCurrentServer, setCurrentServerId } from "@/lib/server-context-client";
import { useHashRoute } from "@/lib/use-hash-route";
import { Button } from "@/components/ui/button";
import {
  Server,
  ServerCog,
  ChevronDown,
  Check,
  Plus,
  CircleDot,
  Circle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ServerInfo {
  id: string;
  name: string;
  host: string;
  label?: string;
  isLocal: boolean;
  lastOk?: boolean;
  lastSeen?: string;
}

interface ServersResponse {
  local: ServerInfo;
  servers: ServerInfo[];
  availableKeys: string[];
}

export function ServerSwitcher() {
  const [currentServerId, setCurrentServer] = useCurrentServer();
  const [, navigate] = useHashRoute();
  const [data, setData] = useState<ServersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch<ServersResponse>("/api/servers", {
        cacheKey: "servers-list",
        maxAge: 60_000,
      });
      setData(d);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const allServers: ServerInfo[] = data ? [data.local, ...data.servers] : [];

  const current = allServers.find(s => s.id === currentServerId) || allServers[0];

  function selectServer(id: string) {
    setCurrentServer(id);
    // Clear all API caches — data from old server is invalid
    clearApiCache();
    // Reload to refresh all data
    setTimeout(() => window.location.reload(), 100);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 max-w-[180px]"
          title={current ? `${current.name} (${current.host})` : "Select server"}
        >
          <Server className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs truncate ml-1">
            {current?.name || "select"}
          </span>
          <ChevronDown className="w-3 h-3 ml-0.5 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          Servers
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {loading && (
          <div className="px-2 py-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading...
          </div>
        )}

        {!loading && allServers.map(s => {
          const isCurrent = s.id === currentServerId;
          return (
            <DropdownMenuItem
              key={s.id}
              className="cursor-pointer"
              onClick={() => selectServer(s.id)}
            >
              <div className="flex items-center gap-2 w-full">
                {isCurrent ? (
                  <CircleDot className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <Circle className={cn(
                    "w-3.5 h-3.5 shrink-0",
                    s.lastOk === false ? "text-destructive" : "text-muted-foreground"
                  )} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate font-mono">
                    {s.host}
                    {s.label && <span className="ml-1">· {s.label}</span>}
                  </div>
                </div>
                {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </div>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => navigate("/servers")}
        >
          <ServerCog className="w-4 h-4 mr-2" />
          Manage servers
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
