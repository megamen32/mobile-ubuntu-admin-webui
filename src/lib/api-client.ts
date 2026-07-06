"use client";

import { getAuth, touchAuth, clearAuth } from "./auth";

/**
 * API client with:
 *  - Basic auth header (username:password) sent on every request
 *  - Local in-memory + localStorage cache for snappy mobile UX
 *  - Stale-while-revalidate: return cached data instantly, refresh in background
 *  - Touch auth session on each successful call (rolling 30-day expiry)
 */

const CACHE_PREFIX = "ub-admin:cache:";

interface CacheEntry<T> {
  data: T;
  ts: number;
}

function readCache<T>(key: string): CacheEntry<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, ts: Date.now() } as CacheEntry<T>)
    );
  } catch {
    // quota exceeded — clear old caches
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  }
}

export function clearApiCache(prefix?: string) {
  if (typeof window === "undefined") return;
  const target = prefix ? CACHE_PREFIX + prefix : CACHE_PREFIX;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(target)) localStorage.removeItem(k);
  }
}

function authHeader(): string | null {
  const a = getAuth();
  if (!a) return null;
  return "Basic " + btoa(`${a.username}:${a.password}`);
}

export interface FetchOptions extends RequestInit {
  /** If true, cache the response and serve stale-while-revalidate */
  cacheKey?: string;
  /** Max age in ms before cache is considered stale (default 30s) */
  maxAge?: number;
  /** Don't send body — used by GET */
}

export async function apiFetch<T>(
  url: string,
  opts: FetchOptions = {}
): Promise<T> {
  const { cacheKey, maxAge = 30_000, ...init } = opts;
  const auth = authHeader();
  if (!auth) {
    clearAuth();
    throw new Error("UNAUTHENTICATED");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", auth);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Multi-server: send X-Server-Id header if a remote server is selected
  // Read from localStorage directly (avoids circular dep with React)
  if (typeof window !== "undefined") {
    try {
      const serverId = localStorage.getItem("ub-admin:server-id");
      if (serverId && serverId !== "local") {
        headers.set("X-Server-Id", serverId);
      }
    } catch { /* ignore */ }
  }

  // SWR pattern: return cached data immediately if present, refresh in bg
  if (cacheKey) {
    const cached = readCache<T>(cacheKey);
    if (cached) {
      // Fire background refresh if stale
      if (Date.now() - cached.ts > maxAge) {
        fetch(url, { ...init, headers })
          .then(async (r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            const data = (await r.json()) as T;
            writeCache(cacheKey, data);
            touchAuth();
            // notify subscribers
            window.dispatchEvent(
              new CustomEvent("ub-admin:cache-updated", { detail: { key: cacheKey } })
            );
          })
          .catch(() => {/* swallow background errors */});
      }
      return cached.data;
    }
  }

  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    clearAuth();
    throw new Error("UNAUTHENTICATED");
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.error) msg = errBody.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const data = (await res.json()) as T;
  touchAuth();
  if (cacheKey) writeCache(cacheKey, data);
  return data;
}

/** POST without parsing JSON body — used for terminal exec, file save etc. */
export async function apiPost<T>(
  url: string,
  body: unknown,
  opts: FetchOptions = {}
): Promise<T> {
  return apiFetch<T>(url, {
    ...opts,
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Subscribe to cache updates for a given key (for SWR re-render) */
export function onCacheUpdate(key: string, cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const ce = e as CustomEvent;
    if (ce.detail?.key === key) cb();
  };
  window.addEventListener("ub-admin:cache-updated", handler);
  return () => window.removeEventListener("ub-admin:cache-updated", handler);
}
