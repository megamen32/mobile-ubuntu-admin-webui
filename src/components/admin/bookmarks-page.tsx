"use client";

import { useBookmarks, useToggleBookmark } from "@/lib/use-bookmarks";
import { useHashRoute } from "@/lib/use-hash-route";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, X, Boxes, FileText } from "lucide-react";

export function BookmarksPage() {
  const { bookmarks } = useBookmarks();
  const toggle = useToggleBookmark();
  const [, navigate] = useHashRoute();

  const services = bookmarks.filter(b => b.type === "service");
  const files = bookmarks.filter(b => b.type === "file");

  return (
    <div className="p-3 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Bookmarks</h1>
        <p className="text-xs text-muted-foreground">
          Pinned services and files. Stored on this device only.
        </p>
      </div>

      {bookmarks.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12">
          No bookmarks yet. Tap the star icon on a service or file to pin it.
        </div>
      )}

      {/* Services */}
      {services.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
            <Boxes className="w-3 h-3" />
            Services ({services.length})
          </div>
          {services.map(b => (
            <Card key={`s-${b.name}`} className="p-2.5 flex items-center gap-2">
              <Star className="w-3.5 h-3.5 fill-current text-primary shrink-0" />
              <button
                className="text-sm font-medium truncate flex-1 text-left"
                onClick={() => navigate(`/service/${b.name}`)}
              >
                {b.label || b.name}
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => toggle("service", b.name, b.label)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
            <FileText className="w-3 h-3" />
            Files ({files.length})
          </div>
          {files.map(b => (
            <Card key={`f-${b.name}`} className="p-2.5 flex items-center gap-2">
              <Star className="w-3.5 h-3.5 fill-current text-primary shrink-0" />
              <button
                className="text-sm font-mono truncate flex-1 text-left"
                onClick={() => navigate(`/files/edit?path=${encodeURIComponent(b.name)}`)}
              >
                {b.name}
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => toggle("file", b.name, b.label)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
