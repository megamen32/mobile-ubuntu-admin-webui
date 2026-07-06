"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch, clearApiCache } from "@/lib/api-client";
import { useHashRoute } from "@/lib/use-hash-route";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Server,
  ServerCog,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  Lock,
  Save,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ServerInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: string;
  keyName?: string;
  label?: string;
  lastSeen?: string;
  lastOk?: boolean;
  isLocal: boolean;
}

interface ServersResponse {
  local: ServerInfo;
  servers: ServerInfo[];
  availableKeys: string[];
}

export function ServersPage() {
  const [, navigate] = useHashRoute();
  const [data, setData] = useState<ServersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<ServerInfo | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) { setRefreshing(true); clearApiCache("servers-list"); }
    else setLoading(true);
    try {
      const d = await apiFetch<ServersResponse>("/api/servers", {
        cacheKey: "servers-list",
        maxAge: force ? 0 : 30_000,
      });
      setData(d);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteServer(s: ServerInfo) {
    if (!confirm(`Delete server "${s.name}"?`)) return;
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      await fetch(`/api/servers/${s.id}`, {
        method: "DELETE",
        headers: { Authorization: "Basic " + btoa(`${auth.username}:${auth.password}`) },
      });
      toast.success(`Deleted ${s.name}`);
      load(true);
    } catch (e: any) {
      toast.error(`Delete failed: ${e?.message}`);
    }
  }

  async function testServer(s: ServerInfo) {
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      const res = await fetch(`/api/servers/${s.id}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa(`${auth.username}:${auth.password}`),
        },
        body: "{}",
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`✓ ${s.name}: connected in ${data.latencyMs}ms`);
      } else {
        toast.error(`✗ ${s.name}: ${data.error}`);
      }
      load(true);
    } catch (e: any) {
      toast.error(`Test failed: ${e?.message}`);
    }
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Servers</h1>
            <p className="text-xs text-muted-foreground">
              {data?.servers.length || 0} remote server{(data?.servers.length || 0) === 1 ? "" : "s"} registered
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="default"
            size="sm"
            className="h-8"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add
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

      {/* Local server (always present) */}
      {data?.local && (
        <Card className="p-3 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{data.local.name}</span>
                <Badge variant="outline" className="text-[10px] text-primary">this server</Badge>
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">
                {data.local.host} · runs this app
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Remote servers */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading servers...
        </div>
      ) : (data?.servers.length || 0) === 0 ? (
        <Card className="p-6 text-center">
          <ServerCog className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" />
          <div className="text-sm text-muted-foreground mb-2">
            No remote servers registered.
          </div>
          <div className="text-xs text-muted-foreground mb-4">
            Add a server to manage it via SSH from this panel.
          </div>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add server
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {data!.servers.map(s => (
            <Card key={s.id} className="p-3">
              <div className="flex items-center gap-3">
                <div className="shrink-0">
                  {s.lastOk === true ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : s.lastOk === false ? (
                    <XCircle className="w-5 h-5 text-destructive" />
                  ) : (
                    <Server className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{s.name}</span>
                    {s.label && (
                      <Badge variant="outline" className="text-[10px]">{s.label}</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {s.authMethod === "key" ? <Key className="w-2.5 h-2.5 mr-0.5" /> : <Lock className="w-2.5 h-2.5 mr-0.5" />}
                      {s.authMethod}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                    {s.username}@{s.host}:{s.port}
                    {s.keyName && <span className="ml-1 text-muted-foreground/60">· key: {s.keyName}</span>}
                  </div>
                  {s.lastSeen && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Last seen: {new Date(s.lastSeen).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => testServer(s)}
                  >
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setEditing(s)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteServer(s)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {(showAdd || editing) && (
        <ServerForm
          server={editing}
          availableKeys={data?.availableKeys || []}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(true); }}
        />
      )}
    </div>
  );
}

function ServerForm({
  server,
  availableKeys,
  onClose,
  onSaved,
}: {
  server: ServerInfo | null;
  availableKeys: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(server?.name || "");
  const [host, setHost] = useState(server?.host || "");
  const [port, setPort] = useState(String(server?.port || 22));
  const [username, setUsername] = useState(server?.username || "root");
  const [authMethod, setAuthMethod] = useState<"key" | "password">(server?.authMethod as any || "key");
  const [password, setPassword] = useState("");
  const [keyName, setKeyName] = useState(server?.keyName || availableKeys[0] || "");
  const [passphrase, setPassphrase] = useState("");
  const [label, setLabel] = useState(server?.label || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name || !host || !username) {
      toast.error("Name, host, username required");
      return;
    }
    setSaving(true);
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      const body: any = {
        name, host, port: Number(port), username, authMethod, label,
      };
      if (authMethod === "key") {
        body.keyName = keyName;
        if (passphrase) body.passphrase = passphrase;
      } else {
        if (password) body.password = password;
      }

      const url = server ? `/api/servers/${server.id}` : "/api/servers";
      const method = server ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa(`${auth.username}:${auth.password}`),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(server ? "Server updated" : "Server added");
      onSaved();
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-md p-4 space-y-3 max-h-[90vh] overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {server ? "Edit server" : "Add server"}
          </h2>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="prod-web-01" className="h-9" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Host</label>
              <Input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.10" className="h-9 font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground">Port</label>
              <Input type="number" value={port} onChange={e => setPort(e.target.value)} className="h-9 font-mono text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Username</label>
            <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="root" className="h-9 font-mono text-sm" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Label (optional)</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="production" className="h-9" />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Auth method</label>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setAuthMethod("key")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-xs font-medium border",
                  authMethod === "key"
                    ? "bg-primary/15 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                <Key className="w-3 h-3 inline mr-1" />
                SSH key
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod("password")}
                className={cn(
                  "flex-1 px-3 py-1.5 rounded text-xs font-medium border",
                  authMethod === "password"
                    ? "bg-primary/15 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                <Lock className="w-3 h-3 inline mr-1" />
                Password
              </button>
            </div>
          </div>

          {authMethod === "key" ? (
            <>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Key file (from ~/.ssh/)
                </label>
                {availableKeys.length > 0 ? (
                  <select
                    value={keyName}
                    onChange={e => setKeyName(e.target.value)}
                    className="w-full h-9 bg-card border border-border rounded px-2 text-sm font-mono"
                  >
                    {availableKeys.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                ) : (
                  <Input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="id_rsa" className="h-9 font-mono text-sm" />
                )}
                {availableKeys.length === 0 && (
                  <p className="text-[10px] text-yellow-500 mt-1">
                    No keys found in ~/.ssh/. Enter key filename manually.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Passphrase (optional)
                </label>
                <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="only if key is encrypted" className="h-9" />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground">
                Password {server && <span className="opacity-60">(leave blank to keep current)</span>}
              </label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="h-9" />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {server ? "Save" : "Add"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
