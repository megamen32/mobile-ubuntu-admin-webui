"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useHashRoute } from "@/lib/use-hash-route";
import { useBookmarks } from "@/lib/use-bookmarks";
import { apiFetch } from "@/lib/api-client";
import {
  Search,
  ArrowRight,
  Boxes,
  ScrollText,
  TerminalSquare,
  FolderTree,
  Cpu,
  Flame,
  Shield,
  History,
  Star,
  Power,
  LayoutGrid,
  CornerDownLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const [, navigate] = useHashRoute();
  const { bookmarks } = useBookmarks();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [services, setServices] = useState<{ name: string; description: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load services list for searching
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const data = await apiFetch<{ units: { name: string; description: string }[] }>(
          "/api/services?type=service",
          { cacheKey: "services-list:service", maxAge: 60_000 }
        );
        setServices(data.units);
      } catch { /* ignore */ }
    })();
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const commands: CommandItem[] = useMemo(() => {
    const nav: CommandItem[] = [
      { id: "nav-home", label: "Overview", hint: "Dashboard", icon: LayoutGrid, action: () => navigate("/"), keywords: ["home", "dashboard", "main"] },
      { id: "nav-services", label: "Services", hint: "List all units", icon: Boxes, action: () => navigate("/services"), keywords: ["systemd", "units"] },
      { id: "nav-logs", label: "Logs", hint: "journalctl viewer", icon: ScrollText, action: () => navigate("/logs"), keywords: ["journal", "log"] },
      { id: "nav-terminal", label: "Terminal", hint: "PTY bash", icon: TerminalSquare, action: () => navigate("/terminal"), keywords: ["shell", "bash", "pty"] },
      { id: "nav-files", label: "Files", hint: "File manager", icon: FolderTree, action: () => navigate("/files"), keywords: ["file", "browse"] },
      { id: "nav-processes", label: "Processes", hint: "Running processes", icon: Cpu, action: () => navigate("/processes"), keywords: ["top", "ps", "kill"] },
      { id: "nav-ufw", label: "Firewall", hint: "UFW management", icon: Flame, action: () => navigate("/ufw"), keywords: ["ufw", "firewall", "ports"] },
      { id: "nav-sessions", label: "Sessions", hint: "Device sessions", icon: Shield, action: () => navigate("/sessions"), keywords: ["device", "session"] },
      { id: "nav-audit", label: "Audit log", hint: "Action history", icon: History, action: () => navigate("/audit"), keywords: ["history", "audit"] },
      { id: "nav-bookmarks", label: "Bookmarks", hint: "Pinned items", icon: Star, action: () => navigate("/bookmarks"), keywords: ["star", "pin"] },
    ];

    // Bookmarks
    const bmItems: CommandItem[] = bookmarks.map(b => ({
      id: `bm-${b.type}-${b.name}`,
      label: b.label || b.name,
      hint: `Bookmarked ${b.type}`,
      icon: Star,
      action: () => {
        if (b.type === "service") navigate(`/service/${b.name}`);
        else navigate(`/files/edit?path=${encodeURIComponent(b.name)}`);
      },
      keywords: ["bookmark", "pinned", b.type, b.name],
    }));

    // Services (matching query)
    const svcItems: CommandItem[] = services
      .filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.description.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20)
      .map(s => ({
        id: `svc-${s.name}`,
        label: s.name,
        hint: s.description,
        icon: Power,
        action: () => navigate(`/service/${s.name}`),
        keywords: ["service", s.name, s.description],
      }));

    return [...nav, ...bmItems, ...svcItems];
  }, [navigate, bookmarks, services, query]);

  const filtered = useMemo(() => {
    if (!query) return commands.slice(0, 30);
    const q = query.toLowerCase();
    return commands
      .filter(c =>
        c.label.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q) ||
        c.keywords?.some(k => k.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [commands, query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selectedIndex];
      if (item) {
        item.action();
        onOpenChange(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-black/60 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search services, files, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-secondary">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          ) : (
            <div className="py-1">
              {filtered.map((item, i) => {
                const Icon = item.icon;
                const selected = i === selectedIndex;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      item.action();
                      onOpenChange(false);
                    }}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-left",
                      selected ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm truncate", selected && "text-primary font-medium")}>
                        {item.label}
                      </div>
                      {item.hint && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {item.hint}
                        </div>
                      )}
                    </div>
                    {selected && <CornerDownLeft className="w-3 h-3 text-muted-foreground shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-border bg-secondary/30 flex items-center justify-between text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <kbd className="px-1 py-0.5 rounded bg-secondary font-mono">↑↓</kbd>
            <span>navigate</span>
            <kbd className="px-1 py-0.5 rounded bg-secondary font-mono">↵</kbd>
            <span>select</span>
          </div>
          <div>{filtered.length} results</div>
        </div>
      </div>
    </div>
  );
}
