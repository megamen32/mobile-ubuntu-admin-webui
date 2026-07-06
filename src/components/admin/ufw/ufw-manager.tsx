"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch, clearApiCache } from "@/lib/api-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Shield,
  ShieldOff,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Power,
  PowerOff,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UfwRule {
  action: string;
  direction: string;
  from: string;
  to: string;
  port?: string;
  proto?: string;
  raw: string;
}

interface UfwStatus {
  installed: boolean;
  enabled: boolean;
  defaultIncoming: string;
  defaultOutgoing: string;
  defaultForward: string;
  ipv6: boolean;
  logging: string;
  rules: UfwRule[];
  raw?: string;
  error?: string;
}

export function UfwManager() {
  const [status, setStatus] = useState<UfwStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [newRule, setNewRule] = useState("");
  const [newDirection, setNewDirection] = useState<"in" | "out" | "both">("in");
  const [newAction, setNewAction] = useState<"allow" | "deny" | "limit" | "reject">("allow");

  const load = useCallback(async (force = false) => {
    if (force) { setRefreshing(true); clearApiCache("ufw"); }
    else setLoading(true);
    try {
      const data = await apiFetch<UfwStatus>("/api/ufw", {
        cacheKey: "ufw",
        maxAge: force ? 0 : 30_000,
      });
      setStatus(data);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function call(action: string, body: any = {}, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setActing(action);
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      const res = await fetch("/api/ufw", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa(`${auth.username}:${auth.password}`),
        },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(data.output?.split("\n")[0] || `${action} OK`);
      await load(true);
    } catch (e: any) {
      toast.error(`${action} failed: ${e?.message}`);
    } finally {
      setActing(null);
    }
  }

  async function addRule() {
    if (!newRule.trim()) return;
    await call(newAction, { rule: newRule, direction: newDirection });
    setNewRule("");
  }

  async function deleteRule(rule: UfwRule) {
    // Reconstruct the rule string for delete
    let ruleStr = "";
    if (rule.port) {
      ruleStr = rule.proto ? `${rule.port}/${rule.proto}` : rule.port;
    } else if (rule.to !== "Anywhere") {
      ruleStr = rule.to;
    } else {
      ruleStr = "Anywhere";
    }
    // Add from-clause if specific source
    if (rule.from && rule.from !== "Anywhere") {
      ruleStr = `from ${rule.from} to any port ${rule.port || "any"}`;
    }
    await call("delete", { rule: ruleStr, direction: rule.direction.toLowerCase() as any });
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
        Loading UFW status...
      </div>
    );
  }

  if (status && !status.installed) {
    return (
      <div className="p-3 space-y-3">
        <h1 className="text-xl font-bold">Firewall (UFW)</h1>
        <Card className="p-4 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <div className="font-medium">UFW is not installed</div>
              <div className="text-sm text-muted-foreground">
                Install it with:
              </div>
              <code className="block text-xs bg-black/40 p-2 rounded font-mono">
                sudo apt install ufw
              </code>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Firewall (UFW)</h1>
          <p className="text-xs text-muted-foreground">
            {status?.rules.length || 0} rules · {status?.enabled ? "active" : "inactive"}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Status card */}
      <Card className={cn("p-3", status?.enabled ? "border-emerald-500/30" : "border-muted-foreground/30")}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {status?.enabled ? (
              <Shield className="w-5 h-5 text-emerald-500" />
            ) : (
              <ShieldOff className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="font-medium">
              {status?.enabled ? "Firewall active" : "Firewall inactive"}
            </span>
          </div>
          <div className="flex gap-1">
            {status?.enabled ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => call("disable", {}, "Disable firewall? This will allow ALL traffic.")}
                disabled={acting === "disable"}
              >
                <PowerOff className="w-3.5 h-3.5 mr-1.5" />
                Disable
              </Button>
            ) : (
              <Button
                variant="default"
                size="sm"
                className="h-8"
                onClick={() => call("enable", {}, "Enable firewall? Default: deny incoming, allow outgoing.")}
                disabled={acting === "enable"}
              >
                <Power className="w-3.5 h-3.5 mr-1.5" />
                Enable
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => call("reload")}
              disabled={acting === "reload"}
              title="Reload rules"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", acting === "reload" && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded bg-secondary/50 p-2">
            <div className="text-muted-foreground uppercase text-[10px]">Incoming</div>
            <div className="font-mono mt-0.5">{status?.defaultIncoming}</div>
          </div>
          <div className="rounded bg-secondary/50 p-2">
            <div className="text-muted-foreground uppercase text-[10px]">Outgoing</div>
            <div className="font-mono mt-0.5">{status?.defaultOutgoing}</div>
          </div>
          <div className="rounded bg-secondary/50 p-2">
            <div className="text-muted-foreground uppercase text-[10px]">Forward</div>
            <div className="font-mono mt-0.5">{status?.defaultForward}</div>
          </div>
        </div>
      </Card>

      {/* Add rule form */}
      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Plus className="w-3.5 h-3.5" />
          Add rule
        </div>
        <div className="flex gap-1.5">
          <select
            value={newAction}
            onChange={(e) => setNewAction(e.target.value as any)}
            className="bg-card border border-border rounded px-2 py-1.5 text-xs"
          >
            <option value="allow">allow</option>
            <option value="deny">deny</option>
            <option value="limit">limit</option>
            <option value="reject">reject</option>
          </select>
          <select
            value={newDirection}
            onChange={(e) => setNewDirection(e.target.value as any)}
            className="bg-card border border-border rounded px-2 py-1.5 text-xs"
          >
            <option value="in">in</option>
            <option value="out">out</option>
            <option value="both">both</option>
          </select>
          <Input
            type="text"
            placeholder="80/tcp, 443, from 10.0.0.0/8 to any port 22"
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRule()}
            className="flex-1 h-8 text-xs font-mono bg-card"
          />
          <Button
            size="sm"
            className="h-8"
            onClick={addRule}
            disabled={!newRule.trim() || acting === newAction}
          >
            Add
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground">
          Examples: <code>22/tcp</code>, <code>443</code>, <code>from 192.168.1.0/24 to any port 22 proto tcp</code>
        </div>
      </Card>

      {/* Rules list */}
      {status && status.rules.length > 0 ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide px-1">
            Active Rules
          </div>
          {status.rules.map((rule, i) => (
            <Card key={i} className="p-2.5 flex items-center gap-2">
              <div className={cn(
                "shrink-0 w-2 h-2 rounded-full",
                rule.action === "allow" && "bg-emerald-500",
                rule.action === "deny" && "bg-destructive",
                rule.action === "limit" && "bg-yellow-500",
                rule.action === "reject" && "bg-orange-500",
              )} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {rule.action}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {rule.direction}
                  </Badge>
                  <span className="font-mono text-xs">
                    {rule.port || rule.to}
                    {rule.proto && <span className="text-muted-foreground">/{rule.proto}</span>}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  from <span className="font-mono">{rule.from}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => deleteRule(rule)}
                disabled={acting === "delete"}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground py-8">
          <ShieldOff className="w-8 h-8 mx-auto mb-2 opacity-30" />
          No rules configured
        </div>
      )}

      {/* Warning if disabled */}
      {status && !status.enabled && (
        <Card className="p-3 border-yellow-500/30 bg-yellow-500/5">
          <div className="flex items-start gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Firewall is inactive</div>
              <div className="text-muted-foreground mt-1">
                All traffic is allowed. Click <strong>Enable</strong> to activate with current rules
                (default: deny incoming, allow outgoing).
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
