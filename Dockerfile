# syntax=docker/dockerfile:1.7

# =============================================================================
# Stage 1: deps — install all dependencies (incl. devDeps for build)
# =============================================================================
FROM node:20-slim AS deps
WORKDIR /app

# System deps for node-pty (needs build tools) and Prisma engines
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy lockfile + package.json first for cache
COPY package.json bun.lock* yarn.lock* package-lock.json* ./
COPY prisma ./prisma

# Install with npm (universal, no bun in image). Uses install-scripts for node-pty.
RUN npm install --legacy-peer-deps --include=dev

# =============================================================================
# Stage 2: builder — compile Next.js standalone output
# =============================================================================
FROM node:20-slim AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Prisma client
RUN npx prisma generate

# Build Next.js (produces .next/standalone with output: "standalone")
RUN npm run build

# =============================================================================
# Stage 3: runtime — minimal image, non-root user, only production deps
# =============================================================================
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Mark that we're in a real Linux env (not preview sandbox) — disables mock fallback
ENV UBUNTU_ADMIN_REAL=1

# Runtime system deps:
#  - systemd: systemctl + journalctl (for service management)
#  - bash: PTY shell
#  - ca-certificates curl: healthchecks
#  - optional formatters (installed if user wants auto-format; commented out to keep image slim)
RUN apt-get update && apt-get install -y --no-install-recommends \
    systemd \
    systemd-sysv \
    bash \
    ca-certificates \
    curl \
    # prettier \
    # golang-go \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for the app (PTY sessions will run as this user).
# In production: grant targeted sudo permissions for systemctl, not full root.
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home admin

# Copy standalone Next.js build
COPY --from=builder --chown=admin:nodejs /app/.next/standalone ./
COPY --from=builder --chown=admin:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=admin:nodejs /app/public ./public

# Copy Prisma client + schema + migrations
COPY --from=builder --chown=admin:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=admin:nodejs /app/prisma ./prisma
COPY --from=builder --chown=admin:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# node-pty prebuilt binary needs to be present
COPY --from=builder --chown=admin:nodejs /app/node_modules/node-pty ./node_modules/node-pty

# DB volume (SQLite file lives here)
RUN mkdir -p /app/data && chown admin:nodejs /app/data
VOLUME ["/app/data"]

# Make sure systemd dir exists for journalctl
RUN mkdir -p /run/systemd/system

# Drop to non-root
USER admin

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:3000/api/health || exit 1

# Next.js standalone server (no `next start` needed)
CMD ["node", "server.js"]
