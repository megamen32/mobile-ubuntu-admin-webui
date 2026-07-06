"use client";

import { useOfflineQueue } from "@/lib/offline-queue";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CloudOff, RefreshCw, Trash2, Inbox } from "lucide-react";
import { toast } from "sonner";

export function OfflineQueuePage() {
  const { actions, isOnline, remove, clear, retry } = useOfflineQueue();

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Offline Queue</h1>
          <p className="text-xs text-muted-foreground">
            {actions.length} queued action{actions.length === 1 ? "" : "s"} · network {isOnline ? "online" : "offline"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              retry();
              toast.success("Retry triggered");
            }}
            disabled={!isOnline || actions.length === 0}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Retry all
          </Button>
          {actions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-destructive"
              onClick={() => {
                if (confirm("Clear all queued actions?")) {
                  clear();
                  toast.success("Queue cleared");
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {actions.length === 0 ? (
        <Card className="p-8 text-center">
          <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" />
          <div className="text-sm text-muted-foreground">
            Queue is empty.
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            When you perform actions while offline (e.g. starting a service),
            they'll appear here and auto-retry when you reconnect.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {!isOnline && (
            <Card className="p-3 border-yellow-500/30 bg-yellow-500/5">
              <div className="flex items-center gap-2 text-xs text-yellow-300">
                <CloudOff className="w-4 h-4" />
                You're offline — actions will auto-retry when connection is back.
              </div>
            </Card>
          )}
          {actions.map(action => (
            <Card key={action.id} className="p-2.5 flex items-center gap-2">
              <CloudOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{action.description}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Queued {new Date(action.queuedAt).toLocaleTimeString()} · {action.method} {action.url}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => remove(action.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
