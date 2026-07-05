# Ubuntu Admin — Worklog

## Task
Build mobile-first admin web panel for Ubuntu servers with:
- Auth (localStorage, 30-day rolling expiry)
- systemd service management (start/stop/enable/disable + journalctl)
- Cached services list with background refresh (SWR)
- Mobile-friendly terminal with special keys + history + bash completion
- File manager with address bar + download + upload
- File editor with auto-wrap + auto-format (js/python/go/toml/html)
- URL-addressable service pages: /#/service/<name>

## Architecture
- Next.js 16 App Router, all routes served from `/` (sandbox constraint) via hash-based router
- Dark Ubuntu theme (aubergine background, orange accent #E95420)
- Bottom navigation (mobile-first): Overview / Services / Logs / Terminal / Files
- All API routes have mock fallback for preview sandbox (where systemd/journald aren't running)
- Real `systemctl`/`journalctl`/`bash -c` exec on actual Ubuntu deployment
- SWR pattern in `lib/api-client.ts`: cache in localStorage, serve stale, refresh in background
- Auth credentials stored in localStorage with `lastActivity` timestamp, refreshed on each API call

## Files
- `src/lib/auth.ts` — credentials store, 30-day rolling session
- `src/lib/use-hash-route.ts` — hash-based router for #/service/<name> etc.
- `src/lib/api-client.ts` — fetch wrapper with SWR caching + Basic auth
- `src/lib/server-exec.ts` — shell exec with systemd/journald detection
- `src/lib/mock-data.ts` — realistic mock units, logs, files for preview
- `src/lib/api-auth.ts` — Basic auth check helper for API routes
- `src/app/api/auth/login/route.ts` — login
- `src/app/api/services/route.ts` — list units (with type filter)
- `src/app/api/services/[name]/route.ts` — get status, control (start/stop/etc)
- `src/app/api/services/[name]/logs/route.ts` — journalctl -u
- `src/app/api/logs/route.ts` — general journalctl
- `src/app/api/terminal/exec/route.ts` — bash -c exec
- `src/app/api/terminal/complete/route.ts` — bash completion
- `src/app/api/files/route.ts` — dir listing + mkdir/delete/rename
- `src/app/api/files/download/route.ts` — file download
- `src/app/api/files/upload/route.ts` — file upload (multipart)
- `src/app/api/files/save/route.ts` — save file content
- `src/app/api/files/format/route.ts` — auto-format (prettier/black/gofmt/taplo with builtin fallback)
- `src/app/api/system/route.ts` — system info
- `src/components/admin/login-screen.tsx` — login form
- `src/components/admin/app-shell.tsx` — layout + bottom nav
- `src/components/admin/overview-page.tsx` — dashboard
- `src/components/admin/services/services-list.tsx` — services list with filters
- `src/components/admin/services/service-detail.tsx` — service detail + actions + logs
- `src/components/admin/logs/logs-viewer.tsx` — journalctl viewer with filters
- `src/components/admin/terminal/terminal-view.tsx` — terminal with special keys bar
- `src/components/admin/files/file-manager.tsx` — file browser
- `src/components/admin/files/file-editor.tsx` — CodeMirror editor

## Issues encountered & fixed
1. ✅ Initial `../../../_auth` import paths wrong — moved to `@/lib/api-auth` alias
2. ✅ `Tab` and `Ctrl` icons not exported from lucide-react — replaced with text labels
3. ✅ `@codemirror/legacy-modes` import path wrong — used `@codemirror/lang-go` and `@codemirror/legacy-modes/mode/toml` instead
4. ✅ `hasSystemd()` checked `--version` which succeeds even when systemd isn't PID 1 — switched to `systemctl is-system-running`
5. ✅ Multiple @codemirror/state versions causing "Unrecognized extension value" — fixed via `overrides` in package.json forcing 6.7.0
6. ✅ `/api/terminal/exec` was 404 — route was at `/api/terminal`, moved to `/api/terminal/exec/route.ts`

## Verified working (via Agent Browser)
- ✅ Login screen renders
- ✅ Login POST succeeds (sandbox accepts any non-empty creds)
- ✅ Overview page shows system info + services summary
- ✅ Services list shows 27 mock units with search + type/state filters
- ✅ Service detail page shows status, action buttons, journalctl logs
- ✅ Logs viewer loads with filters
- ✅ Terminal page loads with input + special keys bar (Tab, arrows, ^C, ^L, ^U, ^W, ^A, ^E, ^R)
- ✅ File manager shows real `/` directory contents
- ✅ File editor loads CodeMirror with nginx.conf content + Format/Save/Download/Wrap buttons

## Verified via direct API tests
- ✅ `/api/terminal/complete` returns real bash completions
- ✅ `/api/files/save` saves file content
- ✅ `/api/files/format` formats with builtin (prettier not installed in sandbox)
- ✅ `/api/services` returns mock units
- ✅ `/api/services/<name>` returns unit detail
- ✅ `/api/services/<name>/logs` returns mock journalctl
