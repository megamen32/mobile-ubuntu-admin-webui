import { NextRequest, NextResponse } from "next/server";
import { checkAuth, unauthorized } from "@/lib/api-auth";
import { runShell, hasBin } from "@/lib/server-exec";
import fs from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/files/format
 *   { path: string, content: string, lang: "js"|"ts"|"py"|"go"|"toml"|"html"|"css"|"json" }
 * Returns { content: string, formatter: string, mock: boolean }
 *
 * Auto-format using available system binaries:
 *  - js/ts/json/html/css: prettier (if installed) or built-in minimal
 *  - py: black (if installed)
 *  - go: gofmt (if installed)
 *  - toml: taplo (if installed) or simple key sorting
 */

const MAX_INPUT = 1024 * 1024; // 1MB

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return unauthorized();

  try {
    const body = await req.json();
    const filePath = String(body.path || "");
    const content = String(body.content ?? "");
    const lang = String(body.lang || inferLang(filePath));

    if (content.length > MAX_INPUT) {
      return NextResponse.json({ error: "Input too large for formatting" }, { status: 413 });
    }

    // Try real formatters
    let formatted = "";
    let formatter = "";
    let mock = false;

    if (lang === "js" || lang === "ts" || lang === "json" || lang === "html" || lang === "css") {
      if (await hasBin("prettier")) {
        const r = await runShell(
          `prettier --parser ${getPrettierParser(lang)} --stdin`,
          { timeout: 10_000 }
        );
        // Write content to stdin via heredoc
        const safe = content.replace(/'/g, "'\\''");
        const r2 = await runShell(`printf '%s' '${safe}' | prettier --parser ${getPrettierParser(lang)} 2>/dev/null`, { timeout: 10_000 });
        if (r2.exitCode === 0 && r2.stdout) {
          formatted = r2.stdout;
          formatter = "prettier";
        }
      }
    }

    if (lang === "py" && !formatted) {
      if (await hasBin("black")) {
        const safe = content.replace(/'/g, "'\\''");
        const r = await runShell(`printf '%s' '${safe}' | black -q - 2>/dev/null`, { timeout: 15_000 });
        if (r.exitCode === 0 && r.stdout) {
          formatted = r.stdout;
          formatter = "black";
        }
      }
    }

    if (lang === "go" && !formatted) {
      if (await hasBin("gofmt")) {
        const safe = content.replace(/'/g, "'\\''");
        const r = await runShell(`printf '%s' '${safe}' | gofmt 2>/dev/null`, { timeout: 10_000 });
        if (r.exitCode === 0 && r.stdout) {
          formatted = r.stdout;
          formatter = "gofmt";
        }
      }
    }

    if (lang === "toml" && !formatted) {
      if (await hasBin("taplo")) {
        const safe = content.replace(/'/g, "'\\''");
        const r = await runShell(`printf '%s' '${safe}' | taplo format - 2>/dev/null`, { timeout: 10_000 });
        if (r.exitCode === 0 && r.stdout) {
          formatted = r.stdout;
          formatter = "taplo";
        }
      }
    }

    // Fallback: built-in minimal formatters
    if (!formatted) {
      formatted = builtinFormat(content, lang);
      formatter = "builtin";
      mock = true;
    }

    return NextResponse.json({
      content: formatted,
      formatter,
      mock,
      ts: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Format failed" }, { status: 500 });
  }
}

function getPrettierParser(lang: string): string {
  switch (lang) {
    case "js": return "babel";
    case "ts": return "babel-ts";
    case "json": return "json";
    case "html": return "html";
    case "css": return "css";
    default: return "babel";
  }
}

function inferLang(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (ext === "ts") return "ts";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs") return "js";
  if (ext === "py") return "py";
  if (ext === "go") return "go";
  if (ext === "toml") return "toml";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "css") return "css";
  if (ext === "json") return "json";
  return "js";
}

/** Minimal in-process formatter — fallback when no system binary available. */
function builtinFormat(src: string, lang: string): string {
  if (lang === "json") {
    try { return JSON.stringify(JSON.parse(src), null, 2) + "\n"; } catch { return src; }
  }
  if (lang === "html") {
    // very basic: collapse multiple blank lines, trim trailing space
    return src
      .split("\n")
      .map(l => l.replace(/\s+$/g, ""))
      .filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n") + "\n";
  }
  if (lang === "toml") {
    // Simple: keep sections together, trim trailing whitespace
    const lines = src.split("\n").map(l => l.replace(/\s+$/g, ""));
    return lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }
  if (lang === "go") {
    // Tabs for indentation — convert leading 2-space to tab
    return src
      .split("\n")
      .map(l => l.replace(/^  /g, "\t").replace(/\t  /g, "\t\t"))
      .join("\n");
  }
  // Default: just trim trailing whitespace and ensure final newline
  return src.split("\n").map(l => l.replace(/\s+$/g, "")).join("\n") + "\n";
}
