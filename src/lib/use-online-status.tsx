"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi, CloudOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * useOnlineStatus — tracks browser online/offline state via:
 *  - navigator.onLine (initial)
 *  - 'online' / 'offline' window events (real-time)
 *  - Periodic fetch to /api/health as a sanity check (every 30s)
 *    (navigator.onLine can be misleading on flaky connections)
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Sanity check: ping /api/health every 30s
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!cancelled) setOnline(res.ok);
      } catch {
        if (!cancelled) setOnline(false);
      }
    };
    const t = setInterval(checkHealth, 30_000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(t);
    };
  }, []);

  return online;
}

/**
 * OfflineBanner — sticky banner shown when network is down.
 * Mount once at the app root.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [show, setShow] = useState(false);

  // Small delay to avoid flicker on initial load
  useEffect(() => {
    if (!online) {
      const t = setTimeout(() => setShow(true), 500);
      return () => clearTimeout(t);
    }
    setShow(false);
  }, [online]);

  if (!show) return null;

  return (
    <div className={cn(
      "sticky top-12 z-30 px-3 py-1.5 text-xs flex items-center justify-center gap-2",
      "bg-yellow-500/15 border-b border-yellow-500/30 text-yellow-300",
    )}>
      <CloudOff className="w-3.5 h-3.5" />
      <span>You're offline. Showing cached data — actions are queued.</span>
    </div>
  );
}
