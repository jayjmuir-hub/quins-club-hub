# Quins Club Hub — notes for Claude

Club-management PWA for Abu Dhabi Harlequins RFC — fixtures, roster and
per-player availability, with role-based access enforced server-side by
Supabase Row-Level Security.

**This file is deliberately short. The real documentation already exists:**

| Read this | For |
|---|---|
| `RESTORE.md` | **Start here.** Session resume, what's built, deployment status, "rulings that cost real effort to discover", infrastructure facts, and what's outstanding |
| `claude/archive/quins-v1-mvp.md` | The implementation plan |
| `claude/specs/design-system.md` | The visual spec |
| `claude/runbooks/deploy.md`, `claude/runbooks/email-and-domain.md`, `claude/runbooks/first-admin.md` | Operational procedures |
| `claude/runbooks/e2e-roles.md`, `claude/specs/accessibility.md` | Test and a11y contracts |
| `claude/state-of-play.md` | Where things stand TODAY, and what is blocked on whom. The volatile half — `RESTORE.md` holds the durable truth |
| `claude/writing-to-github-from-claude.md` | The exact push route, and the ways it has failed |

Do not restate any of that here. A second copy is a copy that drifts.

## ⚠️ The rules that must reach you wherever you are running

**Duplicated on purpose.** The full working-habits set is
`~/GitHub/claude-rules/rules.md` and the Claude project's Instructions box —
but **a session gets neither unless it is in that project**, and a file on disk
is only read if someone goes looking. This repo travels everywhere, so the
rules that are expensive to break are repeated here. Keep the block short and
identical wherever it appears, so drift shows up in a diff.

1. **Never `git add -A`.** Stage explicit paths. `.env` is gitignored and only
   `.env.example` is tracked — never let a sweeping add be the thing standing
   between a Supabase key and a public repo.
2. **Never put a secret in a tool call, a URL or a commit.** The `sb_secret_…`
   key never touches this app, this repo, or a chat. The publishable key is
   public by design and is fine. If a secret is disclosed — including by Jay
   pasting it — say so and tell him to rotate it.
3. **⚠️ `build/v1-mvp` IS THE PRODUCTION BRANCH.** It deploys to
   https://app.adhjrt.com. A push there is a live release, not a save. Show the
   diff and get an explicit yes; a stop hook asking is not Jay asking. Use
   `[skip ci]` for docs-only commits and verify by the deploy id not moving.
4. **Never answer from memory about current state.** `git fetch origin` first —
   Jay works from two PCs and work lands between sessions.
5. **Read the RESPONSE, not the screenshot.** The same coloured box hides
   different failures.
6. **Prove every new test assertion against an injected fault**, and verify live
   after deploying. A green suite is not a working site.

## Facts worth having before you touch anything

**⚠️ This is NOT the adhjrt repo.** Different repo, different site, different
deploy branch. `jayjmuir-hub/quins-club-hub` is **public**. Clones:
cafnet `C:\Users\Jay\GitHub\quins-club-hub`, jay-pc
`C:\Users\jayjm\GitHub\quins-club-hub`. Check which machine is bridged before
touching anything — the Windows user names differ.

**Writes go through real git on the PC, via the Desktop Commander bridge.** No
MCP-server fallback. Never the account-level GitHub connector — it is OAuth,
read-only, and 403s on writes. Always `GIT_TERMINAL_PROMPT=0`, so a missing
credential fails fast instead of hanging.

**⚠️ cafnet has `NODE_ENV=production` set machine-wide.** A plain `npm install`
there silently removes dev dependencies including vitest — use
`npm install --include=dev`. Vitest itself is handled in `vite.config.js`
(commit `5a39f5d`); the install side cannot be fixed in-repo. Without this,
535 of 900 tests fail with an error that points at React, not at the cause.

**Stack:** Vite + React, Tailwind, Supabase (Postgres 17), Netlify. `npm test`
is vitest; `npm run build` is the production build.
