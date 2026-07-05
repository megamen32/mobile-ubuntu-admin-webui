"use client";

import { useState, useEffect } from "react";
import { setAuth, getAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal, Lock, User, Loader2, Server } from "lucide-react";

interface Props {
  onLogin: () => void;
}

export function LoginScreen({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [serverLabel, setServerLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from existing auth (e.g. expired — prefill username)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ub-admin:auth");
      if (raw) {
        const a = JSON.parse(raw);
        if (a.username) setUsername(a.username);
        if (a.serverLabel) setServerLabel(a.serverLabel);
      }
    } catch { /* ignore */ }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({ error: "Login failed" }));
        throw new Error(b.error || "Login failed");
      }
      // Save credentials client-side. Note: storing password in localStorage
      // is intentional per user requirement (rolling 30-day session).
      setAuth(username, password, serverLabel || undefined);
      onLogin();
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 safe-top safe-bottom">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30">
            <Terminal className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Ubuntu Admin</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mobile-first server control
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="username" className="text-xs uppercase tracking-wide text-muted-foreground">
              Username
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9 h-12 bg-card border-border"
                placeholder="root"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs uppercase tracking-wide text-muted-foreground">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 h-12 bg-card border-border"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="server" className="text-xs uppercase tracking-wide text-muted-foreground">
              Server label <span className="opacity-60">(optional)</span>
            </Label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="server"
                type="text"
                value={serverLabel}
                onChange={(e) => setServerLabel(e.target.value)}
                className="pl-9 h-12 bg-card border-border"
                placeholder="prod-web-01"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full h-12 text-base font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <p className="text-xs text-center text-muted-foreground leading-relaxed">
          Credentials stored locally on this device. Session expires after 30 days of inactivity.
        </p>
      </div>
    </div>
  );
}
