# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please **DO NOT** open a public issue.

Instead, email **security@example.com** (replace with real contact before deploying) with:
- Description of the vulnerability
- Steps to reproduce
- Possible impact
- Suggested fix (if any)

You should receive a response within 48 hours. Please do not disclose the issue publicly until a fix has been released.

## Known Security Considerations

This project has a few intentional security trade-offs that you should be aware of before deployment:

### 🔴 Credentials stored in localStorage

By design, the user's username/password are stored in `localStorage` to enable rolling 30-day sessions without server-side session state. This means:

- **Anyone with browser access can extract the credentials** via devtools
- Browser extensions can read them
- XSS attacks would be catastrophic

**Mitigation**: Only deploy this on devices you trust. For multi-user or shared environments, switch to [NextAuth.js](https://next-auth.js.org/) with httpOnly session cookies.

### 🔴 Sandbox auth fallback

In `src/app/api/auth/login/route.ts`, the auth check falls back to "accept any non-empty credentials" when `su` validation fails. This is for the preview sandbox.

**Before production**: remove the fallback block and rely solely on `verifyCredentials()`. The fallback is clearly marked with a comment.

### 🟡 PTY shell runs as Next.js user

The PTY terminal spawns bash as the Next.js process user. If the process runs as root (necessary for full systemd control), users get root shell access.

**Mitigation**: 
- Run Next.js as a non-root user with specific sudo permissions for the systemctl commands you want to allow
- Or deploy behind a reverse proxy with proper auth + audit logging
- Never expose the app directly to the internet without strong auth

### 🟡 Shell injection in terminal/file APIs

The terminal executes `bash -c "<user input>"` by design — it's a terminal. The file APIs use `path.normalize()` and `path.basename()` to sanitize paths but don't enforce a chroot. Users can access any file the Next.js process can read.

**Mitigation**: Run Next.js as a user with appropriate file permissions. Consider a chroot or container if isolation is needed.

### 🟢 Basic auth over HTTPS

All API calls use `Authorization: Basic` header. This is only secure over HTTPS. Always deploy behind a TLS-terminating reverse proxy (Caddy, nginx, Traefik).

### 🟢 No SQL injection surface

The project uses Prisma with parameterized queries (when DB is used). No raw SQL.

## Hardening Checklist for Production

- [ ] Remove sandbox fallback in `src/app/api/auth/login/route.ts`
- [ ] Deploy behind HTTPS-only reverse proxy with HSTS
- [ ] Run Next.js as non-root user with specific sudo permissions
- [ ] Add rate limiting on `/api/auth/login` and PTY endpoints
- [ ] Configure audit logging for all systemctl actions
- [ ] Set up fail2ban or similar for repeated auth failures
- [ ] Use a firewall to restrict access to known IPs (if applicable)
- [ ] Enable CSP headers via `next.config.ts`
- [ ] Consider switching to NextAuth.js with httpOnly cookies
- [ ] Set up monitoring/alerting for unusual API patterns

## Disclosure Timeline

- **Day 0**: Vulnerability reported via email
- **Day 1-2**: Acknowledgment and initial assessment
- **Day 3-7**: Fix development (severity-dependent)
- **Day 7-14**: Patch release and public disclosure (after fix is deployed)
- **Day 30**: Public CVE filing if applicable

## Contact

- Security issues: **security@example.com** (replace before deploying)
- General issues: [GitHub Issues](https://github.com/megamen32/ubuntu-admin/issues)
