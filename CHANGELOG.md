# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-06

### Added
- **Docker support** — multi-stage Dockerfile, docker-compose.yml, .dockerignore
  - Non-root user, healthcheck, host systemd access via bind mounts
  - DEPLOYMENT.md with three deployment options (Docker / bare metal / Vercel warning)
  - Sample systemd unit file at `scripts/ubuntu-admin.service`
- **GitHub Actions CI** — `.github/workflows/ci.yml`
  - Lint + type check + build on every PR
  - Docker image build + smoke test (health check) on every push to main
- **Health endpoint** — `GET /api/health` for Docker healthcheck and load balancers
- **Web Push notifications** for failed services
  - Service Worker (`public/sw.js`) handles push events + offline cache
  - VAPID keys auto-generated, can be set via env vars for production stability
  - `useFailedServicesNotifications` hook polls `/api/notifications/failed-services` every 60s
  - Browser notifications + push to subscribed devices (multi-device support)
  - Profile menu toggle to enable/disable
  - Three new API routes: `/api/notifications/vapid`, `/subscribe`, `/failed-services`
- **App-level audit log** — every UI action recorded to SQLite
  - Tracks: service.start/stop/restart/enable/disable, file.save, terminal.exec, pty.connect, login.success/failed, session.revoke
  - Filter by action prefix (e.g. "service."), search, paginated (50/page)
  - Disable via `AUDIT_LOG_ENABLED=false` env var
  - 90-day retention recommended (purge helper in `src/lib/audit.ts`)
  - New Prisma model `AuditLog` with BigInt ts column
  - New `/audit` route + AuditLogViewer component
- **Rate limiting** — in-memory sliding window limiter
  - `src/lib/rate-limiter.ts` with configurable window/max per IP
  - Applied to `/api/auth/login` (5 attempts / 15 min) and `/api/pty/connect` (10/min)
  - Returns proper 429 with Retry-After header
  - Only resets on real auth success (not sandbox fallback)
- **Device session management**
  - New Prisma model `DeviceSession` (one row per user+device)
  - Sessions auto-registered on first API call
  - New `/api/sessions` and `/api/sessions/[id]` routes
  - New `/sessions` route + SessionsList component
  - Revoke any session from UI
- **Bookmarks** — pin services and files
  - Star icon on every service row (toggle)
  - Pinned services shown as chips at top of services list
  - Dedicated `/bookmarks` page for management
  - `src/lib/bookmarks.ts` + `useBookmarks` hook with `useSyncExternalStore`
  - Per-device localStorage (no server sync — fast)
- **PWA improvements**
  - Service Worker caches app shell for offline loading
  - Web Push subscription per device
  - Notification click handler focuses existing tab and navigates

### Changed
- `next.config.ts` — added `skipTrailingSlashRedirect: true` (fixes Socket.IO polling paths)
- Prisma schema — added `PushSubscription`, `AuditLog`, `DeviceSession` models
- Login API — now records audit entries (success + failure) and respects rate limit
- Service control API — records audit entries for every systemctl action
- PTY connect API — records audit entries + applies rate limit
- Profile dropdown menu — added Push alerts toggle, quick links to Sessions/Audit/Bookmarks

### Security
- Rate limiting protects login brute-force (5/15min default, env-configurable)
- Rate limiting protects PTY resource exhaustion (10/min per IP)
- Audit log enables post-incident investigation
- Device session list enables detection of unauthorized access

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
