# Contributing to Ubuntu Admin

First off, thanks for taking the time to contribute! 🎉

The following is a set of guidelines for contributing to this project.

## Code of Conduct

Be excellent to each other. Harassment of any kind will not be tolerated.

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report:
- Check the [existing issues](https://github.com/megamen32/ubuntu-admin/issues) for duplicates
- Verify the bug exists on the latest `main` branch

When filing a bug report, include:
- **OS and version** (e.g. Ubuntu 22.04)
- **Browser and version** (especially if mobile)
- **Steps to reproduce** the issue
- **Expected vs actual behavior**
- **Screenshots** if applicable
- **Console errors** (open browser devtools)
- **Server logs** — check `dev.log` or `server.log`

### Suggesting Enhancements

Enhancement suggestions are tracked as [GitHub issues](https://github.com/megamen32/ubuntu-admin/issues). Include:
- **Use case** — what problem does this solve?
- **Proposed solution** — describe the desired behavior
- **Alternatives considered** — what other approaches did you consider?
- **Mockups** if UI-related

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes (`bun run lint`)
5. Make sure your code lints (`bun run lint`)
6. Issue that pull request!

## Development Setup

```bash
# Clone your fork
git clone https://github.com/<your-username>/ubuntu-admin.git
cd ubuntu-admin

# Install dependencies
bun install

# Start dev server
bun run dev
```

The app runs at http://localhost:3000.

## Style Guide

### TypeScript
- Use TypeScript strict mode
- Prefer `interface` over `type` for object shapes
- Avoid `any` — use `unknown` and narrow with type guards
- Use `const` by default, `let` only when reassignment is needed

### React
- Functional components only (no class components)
- Use hooks for state and side effects
- One component per file
- Keep components small and focused
- Use `useCallback` for handlers passed to memoized children

### CSS / Tailwind
- Use Tailwind utility classes — avoid custom CSS unless necessary
- Mobile-first: write mobile styles first, add `sm:`, `md:` for larger screens
- 44px minimum touch targets on interactive elements
- Use semantic colors: `bg-background`, `text-foreground`, `border-border`
- Avoid indigo/blue (Ubuntu theme is aubergine + orange)

### API Routes
- Always check auth at the top: `const auth = checkAuth(req); if (!auth.ok) return unauthorized();`
- Validate input before using it
- Return JSON with consistent shape: `{ ok: true, ... }` or `{ error: string }`
- Use `runtime = "nodejs"` and `dynamic = "force-dynamic"` for routes that exec commands
- Mock fallback for sandbox preview when systemd/journald unavailable

### Git Commit Messages
- Use the present tense: "Add feature" not "Added feature"
- Use the imperative mood: "Move cursor to" not "Moves cursor to"
- Limit the first line to 72 characters
- Reference issues and pull requests liberally after the first line

```
Add PTY session idle reaper

Kills sessions that have been inactive for more than 30 minutes.
Prevents zombie bash processes from accumulating on long-running
deployments.

Closes #42
```

## Project Structure

See [README.md](README.md#-project-structure) for the full layout.

Key directories:
- `src/app/api/` — API routes (one folder per resource)
- `src/components/admin/` — UI components grouped by feature
- `src/lib/` — Shared utilities (auth, caching, exec, etc.)

## Testing

Currently the project doesn't have automated tests (contributions welcome!).
Manual testing checklist before submitting a PR:

- [ ] Login works with any non-empty credentials (preview mode)
- [ ] Overview page loads system info and services summary
- [ ] Services list filters work (type, status, search)
- [ ] Service detail page shows status, action buttons, and logs
- [ ] Service control actions (start/stop/restart/enable/disable) succeed
- [ ] Logs viewer loads with filters and auto-refresh
- [ ] PTY terminal connects and shows bash prompt
- [ ] PTY terminal can run commands (`ls`, `pwd`, `echo`)
- [ ] TUI apps work (`htop`, `vim`, `nano` if installed)
- [ ] File manager browses real filesystem
- [ ] File upload, download, mkdir, delete all work
- [ ] File editor opens, syntax highlighting works
- [ ] File save and auto-format work
- [ ] Logout clears credentials
- [ ] Lint passes: `bun run lint`

## Release Process

Releases are managed via GitHub Releases:
1. Update version in `package.json`
2. Update `CHANGELOG.md` (when one exists)
3. Create a git tag: `git tag v0.x.y && git push --tags`
4. Create a GitHub Release with release notes

## Questions?

Feel free to [open an issue](https://github.com/megamen32/ubuntu-admin/issues/new) with the `question` label.

---

Thanks! 🚀
