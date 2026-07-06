"use client";

import { useHashRoute, buildHref } from "@/lib/use-hash-route";
import { getAuth, clearAuth, msUntilExpiry, SESSION_TTL } from "@/lib/auth";
import { useFailedServicesNotifications } from "@/lib/use-notifications";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Boxes,
  ScrollText,
  TerminalSquare,
  FolderTree,
  LogOut,
  Power,
  Bell,
  BellOff,
  Shield,
  History,
  Star,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Overview", icon: LayoutGrid },
  { path: "/services", label: "Services", icon: Boxes, matchPrefix: ["/service"] },
  { path: "/logs", label: "Logs", icon: ScrollText },
  { path: "/terminal", label: "Terminal", icon: TerminalSquare },
  { path: "/files", label: "Files", icon: FolderTree, matchPrefix: ["/files"] },
];

interface Props {
  children: React.ReactNode;
  onLogout: () => void;
}

export function AppShell({ children, onLogout }: Props) {
  const [route, navigate] = useHashRoute();
  const [auth, setAuthState] = useState(getAuth());
  const [expiryPct, setExpiryPct] = useState(100);
  const {
    permission,
    failedCount,
    enabled: pushEnabled,
    enable: enablePush,
    disable: disablePush,
  } = useFailedServicesNotifications();

  useEffect(() => {
    const update = () => {
      const a = getAuth();
      setAuthState(a);
      if (a) {
        const pct = Math.min(100, Math.max(0, (msUntilExpiry() / SESSION_TTL) * 100));
        setExpiryPct(pct);
      }
    };
    update();
    const t = setInterval(update, 60_000);
    window.addEventListener("ub-admin:auth-changed", update);
    return () => {
      clearInterval(t);
      window.removeEventListener("ub-admin:auth-changed", update);
    };
  }, []);

  const isActive = (item: NavItem): boolean => {
    if (item.path === "/") return route.path === "/" || route.path === "";
    if (item.matchPrefix) {
      return item.matchPrefix.some(p => route.path.startsWith(p));
    }
    return route.path.startsWith(item.path);
  };

  // Hide bottom nav in terminal (terminal has its own input dock)
  const hideBottomNav = route.path.startsWith("/terminal");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar — compact, mobile-first */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border safe-top">
        <div className="flex items-center justify-between px-3 h-12">
          <a
            href={buildHref("/")}
            className="flex items-center gap-2 min-w-0"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
          >
            <div className="w-7 h-7 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <Power className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate leading-tight">Ubuntu Admin</div>
              {auth?.serverLabel && (
                <div className="text-[10px] text-muted-foreground truncate leading-tight">
                  {auth.serverLabel} · {auth.username}
                </div>
              )}
            </div>
          </a>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2">
                <div className="w-7 h-7 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center text-xs font-semibold uppercase">
                  {auth?.username?.[0] || "?"}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{auth?.username || "Unknown"}</p>
                  {auth?.serverLabel && (
                    <p className="text-xs leading-none text-muted-foreground">
                      {auth.serverLabel}
                    </p>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                <div className="flex justify-between mb-1">
                  <span>Session expires in</span>
                  <span className="font-mono text-foreground">
                    {formatExpiry(msUntilExpiry())}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${expiryPct}%` }}
                  />
                </div>
              </div>
              <DropdownMenuSeparator />

              {/* Push notifications toggle */}
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {pushEnabled ? (
                      <Bell className="w-3.5 h-3.5 text-primary" />
                    ) : (
                      <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    Push alerts
                  </div>
                  <button
                    onClick={() => pushEnabled ? disablePush() : enablePush()}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium uppercase",
                      pushEnabled
                        ? "bg-destructive/15 text-destructive"
                        : "bg-primary/15 text-primary"
                    )}
                  >
                    {pushEnabled ? "Off" : "On"}
                  </button>
                </div>
                {failedCount > 0 && (
                  <div className="text-[10px] text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {failedCount} failed service{failedCount === 1 ? "" : "s"}
                  </div>
                )}
                {permission === "denied" && (
                  <div className="text-[10px] text-muted-foreground">
                    Permission denied — enable in browser settings
                  </div>
                )}
              </div>

              <DropdownMenuSeparator />

              {/* Quick links */}
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate("/sessions")}
              >
                <Shield className="w-4 h-4 mr-2" />
                Device sessions
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate("/audit")}
              >
                <History className="w-4 h-4 mr-2" />
                Audit log
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate("/bookmarks")}
              >
                <Star className="w-4 h-4 mr-2" />
                Bookmarks
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive cursor-pointer"
                onClick={() => {
                  clearAuth();
                  onLogout();
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main content — full bleed for max density */}
      <main className={cn(
        "flex-1 overflow-y-auto",
        hideBottomNav ? "pb-2" : "pb-20"
      )}>
        {children}
      </main>

      {/* Bottom navigation — mobile-first, hidden in terminal */}
      {!hideBottomNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border safe-bottom">
          <div className="flex items-stretch justify-around max-w-2xl mx-auto">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <a
                  key={item.path}
                  href={buildHref(item.path)}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(item.path);
                  }}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors min-h-[56px]",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    {item.label}
                  </span>
                  {active && (
                    <div className="absolute bottom-0 h-0.5 w-8 bg-primary rounded-full" />
                  )}
                </a>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

function formatExpiry(ms: number): string {
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days > 1) return `${days}d`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours > 1) return `${hours}h`;
  const mins = Math.floor(ms / 60_000);
  return `${mins}m`;
}
