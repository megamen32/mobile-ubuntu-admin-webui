"use client";

/**
 * Bookmarks — pinned services and files shown at the top of lists.
 *
 * Stored in localStorage (per-device preferences). Future enhancement:
 * sync to server via /api/bookmarks for cross-device consistency.
 */

const STORAGE_KEY = "ub-admin:bookmarks";

export type BookmarkType = "service" | "file";

export interface Bookmark {
  type: BookmarkType;
  name: string;        // for service: "nginx.service"; for file: full path
  label?: string;      // optional user label
  addedAt: number;
}

let _cache: Bookmark[] | null = null;
const listeners = new Set<() => void>();

function read(): Bookmark[] {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : [];
  } catch {
    _cache = [];
  }
  return _cache || [];
}

function write(bm: Bookmark[]) {
  _cache = bm;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bm));
  } catch { /* ignore */ }
  // Notify subscribers
  listeners.forEach(fn => fn());
}

export function getBookmarks(): Bookmark[] {
  return read();
}

export function getBookmarksByType(type: BookmarkType): Bookmark[] {
  return read().filter(b => b.type === type);
}

export function isBookmarked(type: BookmarkType, name: string): boolean {
  return read().some(b => b.type === type && b.name === name);
}

export function addBookmark(type: BookmarkType, name: string, label?: string): void {
  if (isBookmarked(type, name)) return;
  const bm = read();
  bm.push({ type, name, label, addedAt: Date.now() });
  write(bm);
}

export function removeBookmark(type: BookmarkType, name: string): void {
  write(read().filter(b => !(b.type === type && b.name === name)));
}

export function toggleBookmark(type: BookmarkType, name: string, label?: string): boolean {
  if (isBookmarked(type, name)) {
    removeBookmark(type, name);
    return false;
  }
  addBookmark(type, name, label);
  return true;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
