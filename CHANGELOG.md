# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-07-05

### Added
- **PTY terminal mode** with `node-pty` + `xterm.js` for full TUI application support
  - Run `htop`, `vim`, `nano`, `top`, `mc` etc directly in the browser
  - HTTP long-polling on port 3000 (no separate WebSocket service needed)
  - In-process PTY pool with 30-minute idle reaper
  - Session persistence via `sessionStorage`
- **Mode switcher** between PTY (full TUI) and Simple (text-based) terminal modes
- **File editor** with CodeMirror 6:
  - Syntax highlighting for js, ts, py, go, toml, html, css, json, rust, md
  - Auto-format via prettier/black/gofmt/taplo with builtin fallback
  - Word-wrap toggle, bracket matching, autocompletion
  - `Ctrl+S` keyboard shortcut for save
- **File manager**: upload (multipart), download, mkdir, delete, rename
- **Logs viewer** with journalctl filters (since, priority, unit, lines)
  - Auto-refresh every 10s (pausable)
  - Auto-scroll toggle
  - Colorized output (ERROR/WARN/DEBUG)
  - Download as `.log` file
- **Overview dashboard** with system info, services summary, failed services alert
- **Hash-based routing** — deep links work in new browser tabs
  - `#/services`, `#/service/<name>`, `#/logs`, `#/terminal`, `#/files`, `#/files/edit?path=...`
- **SWR caching** pattern in `lib/api-client.ts` for instant mobile UX
- **Rolling 30-day auth session** with `lastActivity` refresh on each API call
- **PWA manifest** for installable mobile experience
- **Auto-resize** for PTY terminal via `ResizeObserver`
- Special keys bar in terminal: Tab, ↑↓←→, Home/End, PgUp/PgDn, Ins/Del/Esc, ^C/^D/^L/^Z/^R/^A/^E/^W/^U/^K
- Mock fallback for preview sandbox (when systemd/journald unavailable)
- Mobile-first bottom navigation with 5 tabs
- Dark Ubuntu theme (aubergine + orange #E95420)
- iOS safe-area insets for notched devices

### Changed
- Initial public release

### Security
- Basic auth on all API routes via `Authorization: Basic <base64(user:pass)>` header
- Server-side credential validation via `su -c true <user>` (with sandbox fallback)
- `skipTrailingSlashRedirect` enabled to fix Socket.IO polling paths

## [0.1.0] - 2026-06-15

### Added
- Initial project scaffold
- Next.js 16 + TypeScript + Tailwind CSS + shadcn/ui setup
