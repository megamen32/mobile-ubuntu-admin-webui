"use client";

import { useSyncExternalStore, useCallback } from "react";
import {
  subscribe,
  getBookmarks,
  getBookmarksByType,
  isBookmarked,
  toggleBookmark,
  type BookmarkType,
} from "@/lib/bookmarks";

/**
 * React hook for bookmarks. Uses useSyncExternalStore for tear-free reads.
 */
export function useBookmarks() {
  const bookmarks = useSyncExternalStore(
    subscribe,
    getBookmarks,
    () => [] // SSR snapshot
  );

  return { bookmarks };
}

export function useBookmarksByType(type: BookmarkType) {
  const subscribeFn = useCallback((cb: () => void) => subscribe(cb), []);
  const getSnapshot = useCallback(() => getBookmarksByType(type), [type]);
  return useSyncExternalStore(subscribeFn, getSnapshot, () => []);
}

export function useIsBookmarked(type: BookmarkType, name: string) {
  const subscribeFn = useCallback((cb: () => void) => subscribe(cb), []);
  const getSnapshot = useCallback(() => isBookmarked(type, name), [type, name]);
  return useSyncExternalStore(subscribeFn, getSnapshot, () => false);
}

export function useToggleBookmark() {
  return useCallback(
    (type: BookmarkType, name: string, label?: string) => toggleBookmark(type, name, label),
    []
  );
}
