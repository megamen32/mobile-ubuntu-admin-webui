"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";

/**
 * Client-side server context.
 *
 * The selected server ID is stored in localStorage and sent as
 * `X-Server-Id` header on every API request (via apiClient wrapper).
 *
 * Default: "local" (the host running this app).
 */

const STORAGE_KEY = "ub-admin:server-id";

let currentServerId: string = "local";
const listeners = new Set<() => void>();

function readFromStorage(): string {
  if (typeof window === "undefined") return "local";
  try {
    return localStorage.getItem(STORAGE_KEY) || "local";
  } catch {
    return "local";
  }
}

function writeToStorage(id: string) {
  currentServerId = id;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch { /* ignore */ }
  }
  listeners.forEach(fn => fn());
}

// Initialize from storage on module load (client-side)
if (typeof window !== "undefined") {
  currentServerId = readFromStorage();
}

export function getCurrentServerId(): string {
  return currentServerId;
}

export function setCurrentServerId(id: string) {
  writeToStorage(id);
  // Dispatch event so apiClient can pick up the change
  window.dispatchEvent(new CustomEvent("ub-admin:server-changed", { detail: { id } }));
}

export function subscribeToServer(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * React hook — returns current server ID and a setter.
 * Re-renders when server changes.
 */
export function useCurrentServer(): [string, (id: string) => void] {
  const serverId = useSyncExternalStore(
    subscribeToServer,
    () => currentServerId,
    () => "local"
  );

  // Re-read from storage on mount (in case it was set in another tab)
  useEffect(() => {
    const stored = readFromStorage();
    if (stored !== currentServerId) {
      writeToStorage(stored);
    }
  }, []);

  return [serverId, setCurrentServerId];
}
