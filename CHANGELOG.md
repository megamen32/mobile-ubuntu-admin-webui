# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-07-06

### Multi-server support — complete

This release adds full multi-server management via SSH. One UI instance can
manage unlimited remote servers. No agent installation needed on targets —
only SSH access required.

#### What works on remote servers
- **Services** — `systemctl list/start/stop/restart/enable/disable` via SSH exec
- **Logs** — `journalctl -f` real-time SSE stream via SSH exec channel
- **Terminal** — real bash PTY via SSH shell channel (TUI apps work: htop, vim, nano)
- **Files** — SFTP browse/read/write/upload/download/mkdir/delete/rename
- **File editor** — CodeMirror with syntax highlighting, auto-format via SSH exec
- **Processes** — `ps aux` via SSH, kill by PID (SIGTERM/SIGKILL)
- **Firewall** — `ufw status/allow/deny/limit/reject` via SSH
- **System info** — hostname, uptime, memory, disk, distro via SSH

#### Architecture
- SSH proxy model: UI runs on one host, connects to remotes via `ssh2`
- Persistent SSH connection pool (5-min idle reaper, auto-reconnect)
- Two abstractions hide all complexity:
  1. `getServerContext(req).exec(cmd)` — local `runShell` or SSH `execCommand`
  2. `getFsProvider(req)` — local `fs/promises` or SFTP
- API routes don't know or care if they're running locally or remotely

#### Auth methods (both supported per server)
- **SSH key** — key files in `~/.ssh/`, registry stores only filename
- **Password** — stored in SQLite (use key auth in production)

#### Server management
- `/servers` page: add/edit/delete/test servers
- Server switcher in header: switch between servers with one tap
- Test connection button with latency display
- Health status (green/red/gray) in switcher dropdown
- SSH key dropdown auto-populated from `~/.ssh/`

### Added
- `src/lib/ssh-pool.ts` — SSH connection pool with exec/shell/test
- `src/lib/ssh-keys.ts` — list SSH keys in `~/.ssh/`
- `src/lib/server-context.ts` — server context abstraction (local vs SSH)
- `src/lib/server-context-client.ts` — client-side server ID state
- `src/lib/fs-provider.ts` — FsProvider interface (LocalFsProvider + SftpProvider)
- `src/lib/pty-sessions/index.ts` — rewritten with PtyTransport abstraction
- `src/app/api/servers/` — CRUD routes (list, create, update, delete, test)
- `src/components/admin/server-switcher.tsx` — header dropdown
- `src/components/admin/servers-page.tsx` — manage servers UI
- Prisma `Server` model

### Changed
- All `/api/services/*` routes use `getServerContext(req).exec()`
- All `/api/files/*` routes use `getFsProvider(req)`
- `/api/pty/connect` opens SSH shell when `X-Server-Id` is set
- `/api/logs/stream` (SSE) uses SSH exec channel for remote journalctl
- `/api/processes`, `/api/ufw`, `/api/files/format` use `ctx.exec()`
- `apiClient` sends `X-Server-Id` header on every request
- `useLogStream` adds `?server=` query param for SSE auth
- Bottom nav: added "Servers" to More menu

### Security
- **Removed `db/custom.db` from git tracking** — may have contained sensitive data
  (audit logs, server credentials). Added `db/*.db` to `.gitignore`.
  Anyone with an old clone: delete local `db/custom.db` and run `bun run db:push`.
- SSH passwords stored plaintext in SQLite — use key auth in production
- SSH connections pooled per server (no cross-server leakage)
- All SSH operations audited via `server.*` action types

### Verified on real server
Tested against `vusa.bezrabotnyi.com` (Debian 13, root, password auth):
- ✅ 140 systemd units listed
- ✅ 206 processes listed
- ✅ File system browsed via SFTP
- ✅ `/etc/hostname` read via SFTP
- ✅ UFW status: enabled, deny incoming, 0 rules
- ✅ PTY terminal: real bash session, `hostname` command returned `vusa.bezrabotnyi.com`
- ✅ System info: Debian 13 (trixie), 2 CPU, 4.2GB RAM

## [0.5.0] - 2026-07-06

### Added — Multi-server (Phase 1: services, logs, processes, UFW)
- SSH proxy architecture via `ssh2`
- `src/lib/ssh-pool.ts` — persistent SSH connection pool
- `src/lib/server-context.ts` — `getServerContext(req)` abstraction
- Prisma `Server` model (id, name, host, port, username, authMethod, keyName, etc.)
- `/api/servers` CRUD routes + `/api/servers/[id]/test` connection test
- `ServerSwitcher` component in header
- `ServersPage` with add/edit/delete/test UI
- SSH key dropdown (auto-populated from `~/.ssh/`)
- Updated services/processes/ufw/logs routes to use `ctx.exec()`

## [0.4.1] - 2026-07-06

### Added — SSE real-time log streaming
- `GET /api/logs/stream` — journalctl -f as SSE
- `GET /api/services/[name]/logs/stream` — per-service SSE
- `useLogStream` hook with auto-reconnect and backpressure
- LogsViewer rewritten to use SSE (instant updates, no polling)
- ServiceDetail journalctl panel uses SSE
- Auth via query string for EventSource (can't send headers)

## [0.4.0] - 2026-07-06

### Added
- Process viewer (`ps aux` with sort/filter/kill)
- UFW firewall manager (status, allow/deny/limit/reject, enable/disable)
- Command palette (search icon + Cmd+K)
- PWA offline mode (service worker v2, offline banner, action queue)
- Bottom nav restructured: 5 primary + More dropdown

### Removed
- Docker support (app must run on host it admins)
- GitHub Actions CI (was Docker-focused)

### Added
- **Process viewer** — `ps aux`-style list with sorting (CPU/MEM/PID/name), filtering, auto-refresh (5s), and kill (SIGTERM/SIGKILL)
  - New API: `GET /api/processes`, `DELETE /api/processes/[pid]?signal=term|kill|hup`
  - New UI: `/processes` route with ProcessViewer component
  - Mobile-optimized stacked layout, desktop grid layout
  - Color-coded high CPU (>50%) and high MEM (>30%) values
  - Zombie process detection (yellow border)
- **UFW firewall manager** — full firewall management
  - View status (active/inactive, default policies, IPv6, logging)
  - Add rules: `allow` / `deny` / `limit` / `reject` with direction (`in`/`out`/`both`)
  - Delete rules, enable/disable firewall, reload
  - Syntax help in UI: `22/tcp`, `443`, `from 10.0.0.0/8 to any port 22`
  - All actions audited via `ufw.*` action type
  - New API: `GET /api/ufw`, `POST /api/ufw`
  - New UI: `/ufw` route with UfwManager component
- **Command palette** — mobile-first search
  - Search icon in header (always visible on mobile)
  - `Cmd+K` / `Ctrl+K` shortcut on desktop
  - Searches: navigation routes, bookmarks, systemd services
  - Arrow keys to navigate, Enter to select, Escape to close
  - New UI: CommandPalette component
- **PWA offline mode** — work without connection
  - Service Worker v2: network-first for API, stale-while-revalidate for static, cache navigation
  - Synthetic offline fallback page with auto-reload
  - Offline banner shown when network drops (auto-hides when back)
  - Offline action queue: failed mutations stored in localStorage, auto-retried on reconnect
  - New `/queue` page to view/clear/retry queue
  - `useOnlineStatus` hook with periodic health check (30s)
  - `useOfflineQueue` hook with auto-process on `online` event

### Changed
- Bottom navigation restructured: 5 primary tabs (Home, Services, Logs, Terminal, Files) + "More" dropdown for Processes, Firewall, Audit, Sessions, Bookmarks
- Service Worker upgraded to v2 with better caching strategy and offline fallback page
- Profile menu shows offline queue count when actions are queued
- DEPLOYMENT.md rewritten — bare metal is now the only recommended path

### Removed
- **Docker support** — Dockerfile, docker-compose.yml, .dockerignore deleted
  - Rationale: this app must run on the host it admins (it shells out to systemctl/journalctl/bash). Running in a container would admin the container, not the host — useless. See DEPLOYMENT.md for bare-metal instructions.
- GitHub Actions CI workflow removed (was Docker-focused)

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
