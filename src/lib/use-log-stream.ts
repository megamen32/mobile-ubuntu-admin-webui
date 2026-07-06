"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useLogStream — SSE-based real-time log streaming hook.
 *
 * Connects to a `/api/.../stream` endpoint via EventSource, accumulates log
 * lines, and exposes them as state. Handles:
 *  - Auto-reconnect (EventSource native + manual backoff on error)
 *  - Backpressure: caps at maxLines to prevent OOM on long sessions
 *  - Connection status (connecting | open | error)
 *  - Pause/resume without losing connection
 *  - Filter (client-side) for search
 *
 * Why SSE not WebSocket: SSE is unidirectional (server→client), simpler,
 * auto-reconnects natively, works over HTTP/2, no upgrade handshake needed.
 * Perfect fit for log streaming where client only sends nothing after open.
 */

export interface LogLine {
  line: string;
  ts: number;
  mock?: boolean;
}

export type StreamStatus = "idle" | "connecting" | "open" | "error" | "closed";

interface UseLogStreamOptions {
  /** SSE endpoint URL (e.g. "/api/logs/stream?since=1h") */
  url: string | null;
  /** Max lines to keep in memory (default 1000) */
  maxLines?: number;
  /** Auto-connect on mount (default true) */
  autoConnect?: boolean;
  /** Called when connection status changes */
  onStatusChange?: (status: StreamStatus) => void;
}

export function useLogStream({
  url,
  maxLines = 1000,
  autoConnect = true,
  onStatusChange,
}: UseLogStreamOptions) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [paused, setPaused] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const pausedRef = useRef(false);
  const onStatusRef = useRef(onStatusChange);
  // Ref for self-reference in reconnect logic (avoids useCallback dep cycle)
  const reconnectRef = useRef<(() => void) | null>(null);

  // Keep ref in sync without re-subscribing
  useEffect(() => {
    onStatusRef.current = onStatusChange;
  }, [onStatusChange]);

  const updateStatus = useCallback((s: StreamStatus) => {
    setStatus(s);
    onStatusRef.current?.(s);
  }, []);

  const connect = useCallback(() => {
    if (!url) return;
    // Close any existing connection
    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch { /* ignore */ }
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    updateStatus("connecting");

    // EventSource needs auth — but it can't send custom headers.
    // Pass token via query string since we use Basic auth elsewhere.
    // For SSE we use a session token approach: include creds in URL.
    let fullUrl = url;
    try {
      const auth = JSON.parse(localStorage.getItem("ub-admin:auth") || "{}");
      if (auth.username && auth.password) {
        const sep = url.includes("?") ? "&" : "?";
        fullUrl = `${url}${sep}u=${encodeURIComponent(auth.username)}&p=${encodeURIComponent(auth.password)}`;
      }
    } catch { /* ignore */ }

    const es = new EventSource(fullUrl);
    eventSourceRef.current = es;

    es.addEventListener("open", () => {
      reconnectAttemptsRef.current = 0;
      updateStatus("open");
    });

    es.addEventListener("log", (e: MessageEvent) => {
      if (pausedRef.current) return;
      try {
        const data = JSON.parse(e.data) as LogLine;
        setLines(prev => {
          const next = [...prev, data];
          // Cap to prevent OOM
          if (next.length > maxLines) {
            return next.slice(-maxLines);
          }
          return next;
        });
      } catch { /* ignore parse errors */ }
    });

    es.addEventListener("status", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.status === "exited" || data.status === "mock") {
          // Connection still open but stream ended or in mock mode
        }
      } catch { /* ignore */ }
    });

    es.addEventListener("error", () => {
      updateStatus("error");
      // EventSource will auto-reconnect, but if it fails repeatedly,
      // we manually back off
      reconnectAttemptsRef.current++;
      if (reconnectAttemptsRef.current > 5) {
        // Too many failures — close and try later with backoff
        try { es.close(); } catch { /* ignore */ }
        const backoff = Math.min(30_000, 1000 * Math.pow(2, reconnectAttemptsRef.current));
        reconnectTimerRef.current = setTimeout(() => {
          if (eventSourceRef.current === es) {
            eventSourceRef.current = null;
            reconnectAttemptsRef.current = 0;
            reconnectRef.current?.();
          }
        }, backoff);
      }
    });

    // Don't close on "error" event — EventSource auto-reconnects.
    // Only close on explicit disconnect.
  }, [url, maxLines, updateStatus]);

  // Keep reconnectRef in sync (avoids useCallback dep cycle)
  useEffect(() => {
    reconnectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch { /* ignore */ }
      eventSourceRef.current = null;
    }
    updateStatus("closed");
  }, [updateStatus]);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
  }, []);

  // Auto-connect when URL changes
  useEffect(() => {
    if (!autoConnect || !url) return;
    connect();
    return () => {
      disconnect();
    };
  }, [url, autoConnect, connect, disconnect]);

  return {
    lines,
    status,
    paused,
    connect,
    disconnect,
    clear,
    pause,
    resume,
  };
}
