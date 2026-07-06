"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Offline action queue — when a mutating API call fails due to network,
 * store it and retry when back online.
 *
 * Currently only service-control actions are queued (start/stop/restart/etc).
 * File edits and terminal commands are NOT queued (too dangerous to replay
 * without confirmation).
 *
 * Stored in localStorage so they survive page reload.
 */

const STORAGE_KEY = "ub-admin:offline-queue";

export interface QueuedAction {
  id: string;
  url: string;
  method: "POST" | "DELETE" | "PUT";
  body: any;
  description: string;        // human-readable ("Start nginx.service")
  queuedAt: number;
  authHeader: string;         // basic auth (needed when retrying)
}

let _cache: QueuedAction[] | null = null;
const listeners = new Set<() => void>();

function read(): QueuedAction[] {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : [];
  } catch {
    _cache = [];
  }
  return _cache || [];
}

function write(items: QueuedAction[]) {
  _cache = items;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
  listeners.forEach(fn => fn());
}

export function getQueuedActions(): QueuedAction[] {
  return read();
}

export function queueAction(action: Omit<QueuedAction, "id" | "queuedAt">): void {
  const items = read();
  const newItem: QueuedAction = {
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    queuedAt: Date.now(),
  };
  items.push(newItem);
  write(items);
}

export function removeAction(id: string): void {
  write(read().filter(a => a.id !== id));
}

export function clearQueue(): void {
  write([]);
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Process the queue — called when network comes back online.
 * Returns the number of successfully replayed actions.
 */
export async function processQueue(onProgress?: (action: QueuedAction, success: boolean, error?: string) => void): Promise<number> {
  const items = read();
  if (items.length === 0) return 0;

  let successCount = 0;
  const remaining: QueuedAction[] = [];

  for (const action of items) {
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": action.authHeader,
        },
        body: JSON.stringify(action.body),
      });
      if (res.ok) {
        successCount++;
        onProgress?.(action, true);
      } else {
        // 4xx = don't retry (client error)
        if (res.status >= 400 && res.status < 500) {
          onProgress?.(action, false, `HTTP ${res.status}`);
        } else {
          // 5xx = retry later
          remaining.push(action);
          onProgress?.(action, false, `HTTP ${res.status}`);
        }
      }
    } catch (e: any) {
      // Network still down — keep in queue
      remaining.push(action);
      onProgress?.(action, false, e?.message);
    }
  }

  write(remaining);
  return successCount;
}

/**
 * Hook for components to subscribe to queue state.
 */
export function useOfflineQueue() {
  const [actions, setActions] = useState<QueuedAction[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setActions(read());
    const unsub = subscribe(() => setActions(read()));

    const onOnline = () => {
      setIsOnline(true);
      // Auto-process queue when back online
      processQueue();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (typeof navigator !== "undefined") setIsOnline(navigator.onLine);

    // If we start online but have queued actions, process them
    if (typeof navigator !== "undefined" && navigator.onLine && read().length > 0) {
      processQueue();
    }

    return () => {
      unsub();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const addAction = useCallback((action: Omit<QueuedAction, "id" | "queuedAt">) => {
    queueAction(action);
  }, []);

  const remove = useCallback((id: string) => {
    removeAction(id);
  }, []);

  const clear = useCallback(() => {
    clearQueue();
  }, []);

  const retry = useCallback(() => {
    processQueue();
  }, []);

  return { actions, isOnline, addAction, remove, clear, retry };
}
