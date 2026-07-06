<div align="center">

<img src="docs/assets/banner.svg" alt="Ubuntu Admin Banner" width="100%"/>

# 🟠 Ubuntu Admin

### Mobile-first server control panel for Ubuntu

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?style=for-the-badge&logo=shadcnui&logoColor=white)](https://ui.shadcn.com/)
[![node-pty](https://img.shields.io/badge/node--pty-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://github.com/microsoft/node-pty)
[![License](https://img.shields.io/badge/License-MIT-E95420?style=for-the-badge)](LICENSE)

<p>
  <strong>systemd management</strong> · <strong>real PTY terminal</strong> · <strong>file editor</strong> · <strong>journalctl viewer</strong>
</p>

<p>
  <em>Browser-based admin panel designed for phones first. Authenticate once, manage your box from anywhere — even on a tiny screen.</em>
</p>

---

</div>

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🟢 systemd Control
- List / filter / search all units (services, sockets, timers, targets, mounts)
- **One-tap actions**: start, stop, restart, reload, enable, disable
- Per-service detail page with `systemctl status` output
- Inline `journalctl -u <name>` viewer with selectable line count
- Direct deep-links: open `#/service/nginx.service` in a new tab

</td>
<td width="50%" valign="top">

### 📡 Real PTY Terminal
- Full bash session via `node-pty` — not a fake shell
- Run **TUI apps**: `htop`, `vim`, `nano`, `top`, `mc`, `btop`
- `xterm.js` renderer with proper ANSI 256-color support
- Auto-resize via `ResizeObserver`
- Mobile special-keys bar: Tab, arrows, Home/End, ^C/^L/^U/^W/^A/^E/^R/^K/^Z
- **Falls back to simple text-mode** for quick one-shot commands

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📁 File Manager
- Real filesystem browsing with address bar
- Breadcrumb navigation, home/up buttons
- Upload (multipart), download, mkdir, delete, rename
- File-type icons (code, text, folder)
- **Open any file in the editor** at `#/files/edit?path=...`

</td>
<td width="50%" valign="top">

### ✏️ Code Editor
- CodeMirror 6 with syntax highlighting
- Languages: **js, ts, py, go, toml, html, css, json, rust, md**
- Auto-format via `prettier` / `black` / `gofmt` / `taplo` (with builtin fallback)
- Word-wrap toggle, line numbers, bracket matching, autocompletion
- `Ctrl+S` to save, dirty-state indicator

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📜 Log Viewer
- General `journalctl` with filters (since, priority, unit, line count)
- Auto-refresh every 10s (pausable)
- Auto-scroll toggle, **colorized output** (ERROR / WARN / DEBUG)
- Download logs as `.log` file
- Mock fallback in preview sandbox

</td>
<td width="50%" valign="top">

### 🚀 Performance & UX
- **SWR caching** — instant response from localStorage, refresh in background
- **Rolling 30-day session** — credentials stored locally, refreshed on each call
- Mobile-first bottom nav (44px+ touch targets, iOS safe areas)
- Dark Ubuntu theme (aubergine + orange #E95420)
- PWA-ready (installable, standalone display mode)
- All routes hash-addressable — deep links work in new tabs
- **Command palette** — search icon in header + `Cmd+K` / `Ctrl+K` shortcut
- **Offline mode** — service worker caches shell, actions queued and replayed when back online

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🖥️ Process Viewer
- `ps aux`-style list with CPU%, MEM%, RSS, command
- Sort by CPU / MEM / PID / name (click column headers)
- Auto-refresh every 5s (pausable)
- Filter by command, user, or PID
- **Kill processes**: SIGTERM (graceful) or SIGKILL (force)
- Mobile-optimized stacked layout

</td>
<td width="50%" valign="top">

### 🔥 UFW Firewall Manager
- View status (active/inactive, default policies, IPv6, logging)
- Add rules: `allow` / `deny` / `limit` / `reject`
- Per-rule direction: `in` / `out` / `both`
- Delete rules, enable/disable firewall, reload
- Syntax help: `22/tcp`, `443`, `from 10.0.0.0/8 to any port 22`
- All actions audited

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🛡️ Audit Log & Security
- **App-level audit log** — every UI action (service control, file edit, login) recorded
- Filter by action type, search across entries, paginated (50/page)
- Disable via `AUDIT_LOG_ENABLED=false` env var
- **Rate limiting** on `/api/auth/login` (5 attempts / 15 min, configurable)
- **Device session list** — see all active sessions, revoke any you don't recognize
- Web Push notifications when services fail (subscribe via profile menu)

</td>
<td width="50%" valign="top">

### ⭐ Bookmarks
- **Pin services and files** — star icon on every service row
- Pinned items shown at the top of services list (chips)
- Dedicated `/bookmarks` page for management
- Stored per-device in localStorage (no server sync — fast)

</td>
</tr>
</table>

---

## 📸 Screenshots

<div align="center">

### 🏠 Overview Dashboard
<img src="docs/screenshots/01-overview.png" alt="Overview" width="280"/>

*System info, services summary, failed services alert*

---

### 📦 Services List with Bookmarks
<img src="docs/screenshots/02-services.png" alt="Services" width="280"/>

*27 units with type/status filters, search, and bookmark chips*

---

### ⚙️ Service Detail
<img src="docs/screenshots/03-service-detail.png" alt="Service Detail" width="280"/>

*Status badges, action buttons, inline journalctl*

---

### 🖥️ PTY Terminal (TUI-ready)
<img src="docs/screenshots/07-pty-terminal.png" alt="PTY Terminal" width="280"/>

*Real bash with xterm.js — runs htop, vim, nano*

---

### 📂 File Manager
<img src="docs/screenshots/05-files.png" alt="Files" width="280"/>

*Address bar, breadcrumbs, upload/download*

---

### ✏️ File Editor
<img src="docs/screenshots/06-file-editor.png" alt="File Editor" width="280"/>

*CodeMirror with syntax highlighting and auto-format*

---

### 📜 Audit Log
<img src="docs/screenshots/10-audit-log.png" alt="Audit Log" width="280"/>

*Every UI action tracked — who, what, when, from where*

---

### 🛡️ Device Sessions
<img src="docs/screenshots/11-sessions.png" alt="Sessions" width="280"/>

*See active sessions, revoke compromised devices*

---

### 🖥️ Process Viewer
<img src="docs/screenshots/14-processes.png" alt="Processes" width="280"/>

*`ps aux`-style list, sort by CPU/MEM, kill with SIGTERM/SIGKILL*

---

### 🔥 UFW Firewall Manager
<img src="docs/screenshots/15-ufw.png" alt="UFW" width="280"/>

*Status, rules, enable/disable, add/deny ports*

---

### 🔍 Command Palette
<img src="docs/screenshots/16-command-palette.png" alt="Command Palette" width="280"/>

*Search services, files, and actions — `Cmd+K` or tap search icon*

</div>

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Browser (Mobile / Desktop)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  Overview    │  │  Services    │  │  Logs        │         │
│  │  Dashboard   │  │  + Detail    │  │  Viewer      │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  PTY Terminal│  │  File Mgr    │  │  File Editor │         │
│  │  (xterm.js)  │  │  (address bar)│  │ (CodeMirror) │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌──────────────────────────────────────────────────────┐     │
│  │  SWR Cache (localStorage) + 30-day rolling session   │     │
│  └──────────────────────────────────────────────────────┘     │
└────────────────────────────────┬───────────────────────────────┘
                                 │ Basic Auth
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router                         │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  API Routes (port 3000)                              │      │
│  │  • /api/auth/login     • /api/services/[name]        │      │
│  │  • /api/services       • /api/services/[name]/logs   │      │
│  │  • /api/logs           • /api/terminal/exec          │      │
│  │  • /api/files          • /api/terminal/complete      │      │
│  │  • /api/files/save     • /api/files/upload           │      │
│  │  • /api/files/download • /api/files/format           │      │
│  │  • /api/pty/connect    • /api/pty/input              │      │
│  │  • /api/pty/output     • /api/pty/resize             │      │
│  │  • /api/pty/kill       • /api/system                 │      │
│  └──────────────────────────────────────────────────────┘      │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  systemd /   │  │  bash -c     │  │  node-pty    │         │
│  │  journalctl  │  │  (stateless) │  │  (PTY pool)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
└────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

> **⚠️ Not Docker.** This app must run **on the host you want to admin** — it shells out to `systemctl`, `journalctl`, and spawns PTY bash sessions. Running it in a container would admin the container, not your host. See [DEPLOYMENT.md](DEPLOYMENT.md) for details.

### Prerequisites
- Ubuntu 20.04+ (or any systemd-based Linux) — installed on the host you want to manage
- Bun (or Node.js 18+)
- Root or sudoer account (for `systemctl` to actually control services)

### Install

```bash
git clone https://github.com/megamen32/mobile-ubuntu-admin-webui.git
cd mobile-ubuntu-admin-webui
bun install
```

### Develop

```bash
bun run dev        # starts Next.js on :3000
```

Open http://localhost:3000, enter any username/password (preview mode accepts any non-empty pair).

### Production

```bash
bun run build
bun run start      # or: use the systemd unit in scripts/ubuntu-admin.service
```

For real auth, deploy behind a reverse proxy with PAM/sudo validation, then remove the fallback in `src/app/api/auth/login/route.ts`. Full guide in [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 📱 Mobile Usage

The whole UI is **mobile-first**:
- Install as PWA (Add to Home Screen) for full-screen standalone experience
- Bottom navigation with 5 tabs (Overview / Services / Logs / Terminal / Files)
- 44px+ touch targets, iOS safe-area insets
- Special-keys bar in terminal for keys missing on mobile keyboards
- Compact mode: PTY terminal uses full viewport with hidden bottom nav

---

## 🔐 Authentication

- Credentials stored in `localStorage` (intentional — enables rolling sessions)
- Each API call sends `Authorization: Basic <base64(user:pass)>` header
- `lastActivity` timestamp refreshed on every call → **rolling 30-day expiry**
- Active sessions never expire; only idle ones do
- Click your avatar (top-right) to see remaining session time and sign out

**Production warning**: storing passwords in localStorage is intentional for this admin tool, but means anyone with browser access can extract them. For multi-user production deployments, switch to NextAuth.js with proper session tokens.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 (strict) |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| State | React hooks + localStorage (no Redux/Zustand needed) |
| Caching | SWR pattern in `lib/api-client.ts` |
| Terminal | xterm.js 6 + node-pty 1.1 |
| Editor | CodeMirror 6 + language extensions |
| Auth | Basic auth + rolling 30-day localStorage session |
| Icons | lucide-react |
| Notifications | sonner |
| Charts | recharts (available, not yet used) |

---

## 📂 Project Structure

```
src/
├── app/
│   ├── api/                      # All API routes
│   │   ├── auth/login/
│   │   ├── services/             # List, [name], [name]/logs
│   │   ├── logs/                 # General journalctl
│   │   ├── terminal/             # exec, complete
│   │   ├── pty/                  # connect, input, output, resize, kill
│   │   ├── files/                # CRUD, download, upload, save, format
│   │   └── system/               # System info
│   ├── layout.tsx                # Dark theme + PWA manifest
│   ├── page.tsx                  # Hash-based router
│   └── globals.css               # Ubuntu theme + scrollbar styles
│
├── components/admin/
│   ├── login-screen.tsx
│   ├── app-shell.tsx             # Bottom nav + sticky header
│   ├── overview-page.tsx
│   ├── services/
│   │   ├── services-list.tsx
│   │   └── service-detail.tsx
│   ├── logs/logs-viewer.tsx
│   ├── terminal/
│   │   ├── terminal-wrapper.tsx  # Mode switcher
│   │   ├── pty-terminal.tsx      # xterm.js + HTTP long-polling
│   │   └── terminal-view.tsx     # Simple text-mode
│   └── files/
│       ├── file-manager.tsx
│       └── file-editor.tsx       # CodeMirror 6
│
├── lib/
│   ├── auth.ts                   # 30-day rolling session
│   ├── use-hash-route.ts         # #/service/nginx.service etc.
│   ├── api-client.ts             # SWR cache + Basic auth
│   ├── api-auth.ts               # Server-side auth check
│   ├── server-exec.ts            # bash exec + systemd detection
│   ├── pty-sessions/             # In-process PTY pool
│   │   └── index.ts
│   └── mock-data.ts              # Preview sandbox fallback
│
└── mini-services/
    └── pty-service/              # Standalone socket.io PTY (reference)
```

---

## 🎯 Design Decisions

### Why HTTP long-polling for PTY instead of WebSocket?
Originally implemented as a socket.io mini-service on port 3003, but Next.js rewrites couldn't reliably proxy WebSockets in some sandboxed environments. Moved PTY server inside the Next.js process using HTTP long-polling on port 3000. This keeps everything on a single externally-visible port and avoids proxy issues. The standalone `pty-service` is kept in `mini-services/` as reference for production deployments that prefer process isolation.

### Why hash-based routing?
The preview environment serves everything from `/`. Hash-based routing (`#/services`, `#/service/nginx.service`) lets users open service pages in new browser tabs without server-side route configuration. Each route is fully addressable and bookmarkable.

### Why localStorage for credentials?
The user requested rolling 30-day sessions refreshed on each use. Storing credentials locally (instead of a session token) lets the client re-authenticate each API call independently — no server-side session store needed, no token expiry race conditions. Trade-off: anyone with browser access can extract credentials. For multi-user production, use NextAuth.js with httpOnly cookies.

### Why mock fallback in API routes?
The preview sandbox doesn't have systemd running as PID 1. Each API route checks `hasSystemd()` / `hasJournalctl()` and returns realistic mock data when unavailable. This makes the UI fully demoable without a real Ubuntu host. On a real server, mock is never triggered.

---

## 🔧 Configuration

| Environment | Default | Description |
|------------|---------|-------------|
| `SHELL` | `/bin/bash` | Shell used by PTY sessions |
| `HOME` | `/home/<user>` | Initial cwd for PTY |
| `PORT` | `3000` | Next.js port |

For auto-format support, optionally install:
```bash
sudo apt install prettier  # js/ts/json/html/css
pip install black           # python
sudo apt install golang     # gofmt
cargo install taplo         # toml
```
Built-in formatters are used as fallback when binaries are missing.

---

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development setup
```bash
bun install
bun run lint     # ESLint
bun run dev      # http://localhost:3000
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- [Ubuntu](https://ubuntu.com/) — Aubergine + Orange color palette
- [shadcn/ui](https://ui.shadcn.com/) — Component system
- [xterm.js](https://xtermjs.org/) — Terminal renderer
- [CodeMirror](https://codemirror.net/) — Code editor
- [node-pty](https://github.com/microsoft/node-pty) — PTY bindings

---

<div align="center">

**Built with 🟠 by [megamen32](https://github.com/megamen32)**

⭐ Star this repo if it helped you!

</div>
