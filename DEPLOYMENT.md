# Deployment

> **⚠️ No Docker.** This app must run **on the host you want to admin** — it shells out to `systemctl`, `journalctl`, and spawns PTY bash sessions. If you run it inside a container, it would admin the container, not your host — completely useless.
>
> If you really want isolation, run it in a VM or LXC container with `systemd` as init.

---

## Quick start (bare metal, recommended)

```bash
# 1. Clone
git clone https://github.com/megamen32/mobile-ubuntu-admin-webui.git
cd mobile-ubuntu-admin-webui

# 2. Install Bun
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 3. Install deps + build
bun install
bun run build

# 4. Run with env
DATABASE_URL=file:./data/admin.db \
NODE_ENV=production \
bun run start

# 5. Open
open http://localhost:3000
```

First login accepts any non-empty username/password (sandbox fallback). For real auth, see [Hardening](#hardening) below.

---

## systemd service (auto-restart)

Create `/etc/systemd/system/ubuntu-admin.service`:

```ini
[Unit]
Description=Ubuntu Admin web panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mobile-ubuntu-admin-webui
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:/opt/mobile-ubuntu-admin-webui/data/admin.db
Environment=SHELL=/bin/bash
Environment=AUDIT_LOG_ENABLED=true
ExecStart=/usr/bin/node /opt/mobile-ubuntu-admin-webui/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

A ready-to-use copy is in `scripts/ubuntu-admin.service` — adjust `User` and `WorkingDirectory` to taste.

```bash
sudo cp scripts/ubuntu-admin.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ubuntu-admin
sudo journalctl -u ubuntu-admin -f   # check it's running
```

---

## Reverse proxy (TLS)

The app listens on `:3000`. **Always put it behind a TLS-terminating proxy** — Basic auth over HTTP is trivially sniffable.

### Caddy (auto-HTTPS, easiest)

```caddy
admin.example.com {
    reverse_proxy localhost:3000
}
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name admin.example.com;
    ssl_certificate     /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;

    client_max_body_size 100M;  # for file uploads

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Long-polling for PTY output — keep connections alive
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

---

## Hardening checklist

Before exposing to the internet, **do all of these**:

### 1. Remove sandbox auth fallback

In `src/app/api/auth/login/route.ts`, delete the block marked `// Sandbox fallback` — it currently accepts any non-empty credentials when `su` validation fails.

### 2. Add PAM validation

The default `verifyCredentials()` in `src/lib/server-exec.ts` uses `su -c true <user>` which requires the Next.js process to run as root (or with sudo). For non-root deployments, replace it with `pam-authenticate` via a tiny C binding, or put the app behind OAuth/SSO.

### 3. TLS only

Use Caddy (auto-HTTPS) or Nginx with Let's Encrypt. Never expose port 3000 directly to the internet.

### 4. Run as non-root with targeted sudo

Don't run Next.js as root. Instead, run as a dedicated user with specific sudo permissions:

```bash
# /etc/sudoers.d/ubuntu-admin
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/systemctl start *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/systemctl stop *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/systemctl restart *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/systemctl reload *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/systemctl enable *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/systemctl disable *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/systemctl status *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/journalctl *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/ufw *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/kill *
ubuntu-admin ALL=(root) NOPASSWD: /usr/bin/pkill *
```

Then update `src/lib/server-exec.ts` to prefix systemctl/ufw/kill commands with `sudo`.

### 5. Firewall + rate limiting

- Use UFW to restrict access to known IPs (the app now has a built-in UFW manager!):
  ```bash
  sudo ufw allow from 10.0.0.0/8 to any port 443 proto tcp
  sudo ufw deny 443
  ```
- App-level rate limiting on `/api/auth/login` is built in (see `RATE_LIMIT_LOGIN_PER_WINDOW` env var). Adjust as needed.

### 6. Audit log

App-level audit log (who did what via the web UI) is enabled by default. View it via the UI (Profile menu → Audit log) or query SQLite directly:

```bash
sqlite3 ./data/admin.db "SELECT datetime(ts/1000, 'unixepoch'), username, action, target FROM AuditLog ORDER BY ts DESC LIMIT 50;"
```

Disable by setting `AUDIT_LOG_ENABLED=false`.

### 7. Rotate credentials

Periodically force password changes. The 30-day rolling session expires on inactivity, but credentials in localStorage persist — anyone with browser access can extract them.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:./db/custom.db` | SQLite path. Use absolute path in production. |
| `SHELL` | `/bin/bash` | Shell used by PTY sessions |
| `AUDIT_LOG_ENABLED` | `true` | Set to `false` to disable audit logging |
| `RATE_LIMIT_LOGIN_PER_WINDOW` | `5` | Max login attempts per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) | Login rate-limit window size |
| `VAPID_PUBLIC_KEY` | (auto-generated) | Web Push public key — set for production stability |
| `VAPID_PRIVATE_KEY` | (auto-generated) | Web Push private key — set for production stability |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Web Push subject (contact email) |

To generate stable VAPID keys for production:
```bash
bunx web-push generate-vapid-keys
```

---

## Optional: install auto-format binaries

The file editor auto-format falls back to a minimal built-in formatter when these are missing. Install for full support:

```bash
sudo apt install prettier  # js/ts/json/html/css
pip install black           # python
sudo apt install golang     # gofmt
cargo install taplo         # toml
```

---

## Updating

```bash
cd /opt/mobile-ubuntu-admin-webui
git pull
bun install
bun run build
sudo systemctl restart ubuntu-admin
```

---

## Backup

SQLite DB lives at the path you set in `DATABASE_URL`. Back it up:

```bash
# Stop the service first (or use sqlite3 .backup for hot copy)
sudo systemctl stop ubuntu-admin
tar czf /backup/ubuntu-admin-$(date +%F).tar.gz /opt/mobile-ubuntu-admin-webui/data
sudo systemctl start ubuntu-admin
```

---

## Troubleshooting

### `systemctl` returns "System has not been booted with systemd"

You're running inside a container or VM without systemd as PID 1. Either:
- Run on the actual host (recommended)
- Use a VM with systemd (most VPS images do)
- The app falls back to mock mode in this case — useful only for demos

### PTY terminal can't connect

Check:
1. `/api/health` returns 200
2. Browser devtools shows POST `/api/pty/connect` returning 200
3. `GET /api/pty/output` is long-polling (held open up to 25s, then re-polls)

If connect works but no output appears, the PTY process may have died — click "Kill session" and "Reconnect" in the terminal header.

### File upload fails with 413

Your reverse proxy may have a body size limit. For Nginx:

```nginx
client_max_body_size 100M;
```

### Login rate limit too strict / too lax

Edit `.env` or set env vars:
```
RATE_LIMIT_LOGIN_PER_WINDOW=10   # allow 10 attempts
RATE_LIMIT_WINDOW_MS=3600000     # per hour
```

### Audit log is filling up the DB

Set up a cron job to purge old entries:

```bash
# /etc/cron.d/ubuntu-admin-purge
0 3 * * * root sqlite3 /opt/mobile-ubuntu-admin-webui/data/admin.db \
  "DELETE FROM AuditLog WHERE ts < unixepoch()*1000 - 90*86400*1000;"
```

Or disable audit logging entirely with `AUDIT_LOG_ENABLED=false`.
