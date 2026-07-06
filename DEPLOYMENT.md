# Deployment

Three deployment options, from simplest to most production-ready.

---

## Option 1: Docker (recommended)

### Quick start

```bash
# 1. Clone
git clone https://github.com/megamen32/ubuntu-admin.git
cd ubuntu-admin

# 2. Configure
cp .env.example .env
# Edit .env to taste (ports, rate limits, audit toggle)

# 3. Build and run
docker compose up -d --build

# 4. Open
open http://localhost:3000
```

First login accepts any non-empty username/password (sandbox fallback). For real auth, see [Hardening](#hardening) below.

### What you get

- **Multi-stage Docker build** — final image ~250MB, non-root user
- **SQLite persistence** via Docker volume (`admin-data`)
- **Healthcheck** at `/api/health`
- **Auto-restart** on crash (`restart: unless-stopped`)
- **Host systemd access** via bind mounts (optional, see below)

### Logs

```bash
docker compose logs -f ubuntu-admin
```

### Updating

```bash
git pull
docker compose up -d --build
```

### Backup

```bash
# SQLite DB lives in the volume — back it up with:
docker run --rm -v ubuntu-admin_admin-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/admin-$(date +%F).tar.gz /data
```

---

## Option 2: Bare metal with Bun

For when you already have Node/Bun on the box and don't want Docker.

```bash
# 1. Clone
git clone https://github.com/megamen32/ubuntu-admin.git
cd ubuntu-admin

# 2. Install Bun (if not present)
curl -fsSL https://bun.sh/install | bash

# 3. Install deps
bun install

# 4. Build
bun run build

# 5. Run with env
DATABASE_URL=file:./data/admin.db \
NODE_ENV=production \
bun run start

# 6. (Optional) systemd unit for auto-restart
sudo cp scripts/ubuntu-admin.service /etc/systemd/system/
sudo systemctl enable --now ubuntu-admin
```

Sample systemd unit (`scripts/ubuntu-admin.service`):

```ini
[Unit]
Description=Ubuntu Admin web panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/ubuntu-admin
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:/opt/ubuntu-admin/data/admin.db
Environment=SHELL=/bin/bash
ExecStart=/usr/bin/node /opt/ubuntu-admin/.next/standalone/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Reverse proxy (Caddy / Nginx)

The app listens on `:3000`. Put it behind a TLS-terminating proxy:

**Caddy** (auto HTTPS):
```caddy
admin.example.com {
    reverse_proxy localhost:3000
}
```

**Nginx**:
```nginx
server {
    listen 443 ssl http2;
    server_name admin.example.com;
    ssl_certificate     /etc/letsencrypt/live/admin.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Option 3: Vercel / serverless (NOT recommended)

⚠️ **PTY terminal will not work** on serverless platforms (Vercel, Netlify, Cloudflare Workers) — they don't support long-lived processes or `node-pty`. Other features work but lose usefulness without a real systemd to manage.

If you really want to try: deploy as usual, but expect PTY and real `systemctl` to be non-functional. Useful only as a demo.

---

## Hardening

Before exposing to the internet, **do all of these**:

### 1. Remove sandbox auth fallback

In `src/app/api/auth/login/route.ts`, delete the block marked `// Sandbox fallback` — it currently accepts any non-empty credentials when `su` validation fails.

### 2. Add PAM validation

The default `verifyCredentials()` in `src/lib/server-exec.ts` uses `su -c true <user>` which requires the Next.js process to run as root (or with sudo). For non-root deployments, replace it with `pam-authenticate` via a tiny C binding, or put the app behind OAuth/SSO.

### 3. TLS only

Use Caddy (auto-HTTPS) or Nginx with Let's Encrypt. Never expose port 3000 directly to the internet — Basic auth over HTTP is trivially sniffable.

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
```

Then update `src/lib/server-exec.ts` to prefix systemctl commands with `sudo`.

### 5. Firewall + rate limiting

- Use UFW to restrict access to known IPs:
  ```bash
  sudo ufw allow from 10.0.0.0/8 to any port 443 proto tcp
  sudo ufw deny 443
  ```
- App-level rate limiting on `/api/auth/login` is built in (see `RATE_LIMIT_LOGIN_PER_WINDOW` env var). Adjust as needed.

### 6. Audit log

App-level audit log (who did what via the web UI) is enabled by default. View it via the UI (Profile menu → Audit log) or query SQLite directly:

```bash
sqlite3 /app/data/admin.db "SELECT * FROM AuditLog ORDER BY ts DESC LIMIT 50;"
```

Disable by setting `AUDIT_LOG_ENABLED=false`.

### 7. Rotate credentials

Periodically force password changes. The 30-day rolling session expires on inactivity, but credentials in localStorage persist — anyone with browser access can extract them.

---

## Troubleshooting

### `systemctl` fails inside Docker container

The container needs to talk to the host's systemd. Make sure `docker-compose.yml` has:

```yaml
volumes:
  - /var/log/journal:/var/log/journal:ro
  - /run/systemd:/run/systemd:ro
privileged: false
cap_add:
  - SYS_ADMIN
  - SYS_PTRACE
security_opt:
  - seccomp:unconfined
pid: host
```

If it still doesn't work, your host may not have systemd running (e.g. WSL1, certain containers). In that case, the app falls back to mock mode — useful for demos only.

### `node-pty` install fails

The Docker image installs build tools (python3, make, g++) in the deps stage. If building manually on the host:

```bash
# Ubuntu/Debian
sudo apt install python3 make g++

# macOS
xcode-select --install
```

### PTY terminal can't connect

Check:
1. `/api/health` returns 200
2. Browser devtools shows POST `/api/pty/connect` returning 200
3. `GET /api/pty/output` is long-polling (held open up to 25s, then re-polls)

If connect works but no output appears, the PTY process may have died — click "Kill session" and "Reconnect" in the terminal header.

### File upload fails with 413

Your reverse proxy may have a body size limit. For Caddy, no limit by default. For Nginx:

```nginx
client_max_body_size 100M;
```
