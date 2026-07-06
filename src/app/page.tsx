"use client";

import { useEffect, useState } from "react";
import { getAuth } from "@/lib/auth";
import { useHashRoute } from "@/lib/use-hash-route";
import { LoginScreen } from "@/components/admin/login-screen";
import { AppShell } from "@/components/admin/app-shell";
import { OverviewPage } from "@/components/admin/overview-page";
import { ServicesList } from "@/components/admin/services/services-list";
import { ServiceDetail } from "@/components/admin/services/service-detail";
import { LogsViewer } from "@/components/admin/logs/logs-viewer";
import { TerminalView } from "@/components/admin/terminal/terminal-view";
import { TerminalWrapper } from "@/components/admin/terminal/terminal-wrapper";
import { FileManager } from "@/components/admin/files/file-manager";
import { FileEditor } from "@/components/admin/files/file-editor";
import { SessionsList } from "@/components/admin/sessions/sessions-list";
import { AuditLogViewer } from "@/components/admin/audit/audit-log-viewer";
import { BookmarksPage } from "@/components/admin/bookmarks-page";

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [route] = useHashRoute();

  useEffect(() => {
    const check = () => {
      setAuthed(getAuth() !== null);
    };
    check();
    window.addEventListener("ub-admin:auth-changed", check);
    return () => window.removeEventListener("ub-admin:auth-changed", check);
  }, []);

  // Show splash while checking auth
  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 rounded-md border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  // Render based on hash route
  const content = renderRoute(route);

  // Terminal & editor go full-bleed (no shell padding)
  const isFullBleed = route.path.startsWith("/terminal") || route.path.startsWith("/files/edit");

  if (isFullBleed) {
    return (
      <AppShell onLogout={() => setAuthed(false)}>
        {content}
      </AppShell>
    );
  }

  return (
    <AppShell onLogout={() => setAuthed(false)}>
      {content}
    </AppShell>
  );
}

function renderRoute(route: { path: string; segments: string[]; query: URLSearchParams }) {
  const { path, segments, query } = route;

  // /service/[name]
  if (segments[0] === "service" && segments[1]) {
    return <ServiceDetail unitName={decodeURIComponent(segments[1])} />;
  }

  // /services
  if (segments[0] === "services") {
    return <ServicesList />;
  }

  // /logs
  if (segments[0] === "logs") {
    const unit = query.get("unit") || undefined;
    return <LogsViewer presetUnit={unit} />;
  }

  // /terminal
  if (segments[0] === "terminal") {
    return <TerminalWrapper />;
  }

  // /files/edit?path=...
  if (segments[0] === "files" && segments[1] === "edit") {
    const p = query.get("path");
    if (p) return <FileEditor filePath={p} />;
    return <FileManager />;
  }

  // /files
  if (segments[0] === "files") {
    return <FileManager />;
  }

  // /sessions
  if (segments[0] === "sessions") {
    return <SessionsList />;
  }

  // /audit
  if (segments[0] === "audit") {
    return <AuditLogViewer />;
  }

  // /bookmarks
  if (segments[0] === "bookmarks") {
    return <BookmarksPage />;
  }

  // Default: overview
  return <OverviewPage />;
}
