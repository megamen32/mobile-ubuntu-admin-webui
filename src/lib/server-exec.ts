import { spawn, exec as execCb } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import os from "os";

const exec = promisify(execCb);

/**
 * Server-side shell execution utilities.
 *
 * In a real Ubuntu deployment these run as the Next.js process user (root or
 * sudoer for systemd control). In the preview sandbox they fail — callers
 * must catch and fall back to mock data.
 */

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runShell(
  cmd: string,
  opts: { timeout?: number; cwd?: string } = {}
): Promise<ExecResult> {
  const { timeout = 30_000, cwd } = opts;
  try {
    const { stdout, stderr } = await exec(cmd, {
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      cwd,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: any) {
    if (err.killed && err.signal === "SIGTERM") {
      return { stdout: "", stderr: "Timeout", exitCode: 124 };
    }
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(err.message),
      exitCode: err.code ?? 1,
    };
  }
}

/** Detect if real systemd is available on this host (and PID 1 is systemd). */
let _hasSystemd: boolean | null = null;
export async function hasSystemd(): Promise<boolean> {
  if (_hasSystemd !== null) return _hasSystemd;
  try {
    // `is-system-running` actually checks if systemd is the init system.
    // `--version` succeeds even when systemd isn't running (binary exists).
    const r = await runShell("systemctl is-system-running 2>/dev/null", { timeout: 3000 });
    // Any of these states means systemd is actually running as init:
    _hasSystemd = ["running", "degraded", "maintenance", "starting", "stopping"].includes(r.stdout.trim());
  } catch {
    _hasSystemd = false;
  }
  return _hasSystemd;
}

/** Detect if journalctl works (i.e. journald is actually running). */
let _hasJournal: boolean | null = null;
export async function hasJournalctl(): Promise<boolean> {
  if (_hasJournal !== null) return _hasJournal;
  try {
    // `--list-boots` requires the journal to actually exist; `--version` doesn't.
    const r = await runShell("journalctl --list-boots --no-pager 2>/dev/null | head -1", { timeout: 3000 });
    _hasJournal = r.exitCode === 0 && r.stdout.trim().length > 0;
  } catch {
    _hasJournal = false;
  }
  return _hasJournal;
}

/** Detect if a binary is on PATH. */
const _binCache = new Map<string, boolean>();
export async function hasBin(bin: string): Promise<boolean> {
  if (_binCache.has(bin)) return _binCache.get(bin)!;
  const r = await runShell(`command -v ${bin} 2>/dev/null`, { timeout: 2000 });
  const ok = r.exitCode === 0 && r.stdout.trim().length > 0;
  _binCache.set(bin, ok);
  return ok;
}

/** Check basic auth against local system users via `su` or fallback PAM. */
export async function verifyCredentials(
  username: string,
  password: string
): Promise<boolean> {
  // Try `su` approach: `su -c true <user>` with password from stdin
  // This is portable but requires the Next.js process to run as root.
  try {
    const r = await runShell(
      `echo ${JSON.stringify(password)} | su -c 'exit 0' ${JSON.stringify(username)} 2>/dev/null`,
      { timeout: 5000 }
    );
    if (r.exitCode === 0) return true;
  } catch { /* fallthrough */ }
  // Fallback: accept any non-empty pair in preview (dev mode)
  // In production, deploy behind a reverse proxy with proper PAM auth.
  return false;
}
