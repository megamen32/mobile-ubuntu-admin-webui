"use client";

/**
 * Auth utilities — credentials stored in localStorage.
 *
 * Behaviour:
 *  - On login, store credentials + `lastActivity` timestamp.
 *  - On each authenticated API call (via apiFetch), `lastActivity` is refreshed.
 *  - If `now - lastActivity > 30 days`, session is considered expired and
 *    user is forced back to login.
 *
 * The 30-day window is rolling: every activity resets the timer, so an
 * actively-used session never expires.
 */

const STORAGE_KEY = "ub-admin:auth";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AuthState {
  username: string;
  password: string; // stored locally so we can re-auth API calls
  lastActivity: number; // epoch ms
  serverLabel?: string; // optional hostname label
}

export function getAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthState;
    if (!parsed.username || !parsed.password) return null;
    const age = Date.now() - (parsed.lastActivity ?? 0);
    if (age > SESSION_TTL_MS) {
      // expired — clear and force re-login
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function setAuth(username: string, password: string, serverLabel?: string) {
  const state: AuthState = {
    username,
    password,
    lastActivity: Date.now(),
    serverLabel,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Notify other tabs/components
  window.dispatchEvent(new Event("ub-admin:auth-changed"));
  return state;
}

export function touchAuth() {
  const cur = getAuth();
  if (!cur) return;
  cur.lastActivity = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("ub-admin:auth-changed"));
}

export function msUntilExpiry(): number {
  const a = getAuth();
  if (!a) return 0;
  const expires = a.lastActivity + SESSION_TTL_MS;
  return Math.max(0, expires - Date.now());
}

export const SESSION_TTL = SESSION_TTL_MS;
