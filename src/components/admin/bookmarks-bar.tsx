"use client";

import { useBookmarksByType, useToggleBookmark, type BookmarkType } from "@/lib/use-bookmarks";
import { Star, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  type: BookmarkType;
  onOpen?: (name: string) => void;
  /** Render each bookmark as a row (default) or compact chips */
  variant?: "row" | "chip";
  /** For file bookmarks, show path more compactly */
  showPath?: boolean;
}

export function BookmarksBar({ type, onOpen, variant = "row", showPath = false }: Props) {
  const bookmarks = useBookmarksByType(type);
  const toggle = useToggleBookmark();

  if (bookmarks.length === 0) return null;

  if (variant === "chip") {
    return (
      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-3 px-3 pb-1">
        {bookmarks.map(b => (
          <div key={b.name} className="shrink-0 group relative">
            <button
              onClick={() => onOpen?.(b.name)}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors pr-7"
            >
              <Star className="w-3 h-3 inline mr-1 fill-current" />
              {showPath ? b.name.split("/").pop() : b.label || b.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggle(type, b.name, b.label);
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary/20 hover:bg-primary/40 flex items-center justify-center text-primary"
              title="Remove bookmark"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide px-1">
        <Star className="w-3 h-3 fill-current text-primary" />
        Pinned
      </div>
      {bookmarks.map(b => (
        <div
          key={b.name}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-md",
            "bg-primary/5 border border-primary/20",
            onOpen && "cursor-pointer hover:bg-primary/10"
          )}
          onClick={() => onOpen?.(b.name)}
        >
          <Star className="w-3.5 h-3.5 fill-current text-primary shrink-0" />
          <span className="text-sm font-medium truncate flex-1">
            {showPath ? b.name : b.label || b.name}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggle(type, b.name, b.label);
            }}
            className="shrink-0 w-5 h-5 rounded-full hover:bg-primary/20 flex items-center justify-center text-muted-foreground hover:text-primary"
            title="Remove bookmark"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
