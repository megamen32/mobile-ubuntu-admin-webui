"use client";

import { useState, useEffect } from "react";
import { TerminalView } from "./terminal-view";
import { PtyTerminal } from "./pty-terminal";

const STORAGE_KEY = "ub-admin:terminal-mode";

type Mode = "pty" | "simple";

export function TerminalWrapper() {
  const [mode, setMode] = useState<Mode>("pty");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as Mode) || "pty";
    setMode(saved);
    setLoaded(true);
  }, []);

  function switchMode(newMode: Mode) {
    setMode(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
        Loading terminal...
      </div>
    );
  }

  if (mode === "pty") {
    return <PtyTerminal onSwitchToSimple={() => switchMode("simple")} />;
  }
  return <TerminalView onSwitchToPty={() => switchMode("pty")} />;
}
