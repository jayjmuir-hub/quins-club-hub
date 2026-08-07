# Quins Club Hub — notes for Claude

Club-management PWA for Abu Dhabi Harlequins RFC — fixtures, roster and
per-player availability, with role-based access enforced server-side by
Supabase Row-Level Security.

**This file is the single home for the rules.** They used to live here, in
the Claude project's Instructions box, and in `~/GitHub/claude-rules/rules.md`
simultaneously, kept identical by discipline. Discipline failed and they
drifted in both directions. This repo travels to every session — cloud,
local, in-project or not — so the rules live here and the other two places
point at this file.

**Content is a different matter: do not restate the docs below here.**
A second copy of a *fact* is a copy that drifts. A single copy of a *rule*
in the one place that always travels is the opposite problem.

## Reading order — and who wins when they disagree

1. **This file.** The rules.
2. **Confirm you are current before believing anything.**
   `git fetch origin`, then
   `git rev-list --left-right --count origin/build/v1-mvp...HEAD`
   must return `0 0`. If it does not, STOP and tell Jay. He works from two
   PCs and work lands between sessions; a stale clone has already caused a
   rejected commit and a fast-forward of three commits.
3. **`claude/state-of-play.md`** — where things STAND today, and what is
   blocked on whom. The volatile half.
4. **`RESTORE.md`** — what is TRUE about the codebase. Architecture, schema,
   RLS, "how this codebase actually behaves", and the rulings that cost real
   effort to discover. The durable half.

**Precedence: the code wins, then `RESTORE.md`, then `state-of-play.md`,
then this file.** Anything else in `claude/` is history, not instruction.

⚠️ Both `state-of-play.md` and `RESTORE.md` have at times opened with
"read this first". Only step 3 above is the entry point. If you find that
line elsewhere, it is stale — fix it, don't obey it.

## Where the rest of the documentation is

| Read | For |
|---|---|
| `claude/decisions/` | **The rulings.** Why a settled question was settled. Read the relevant one BEFORE re-opening any argument — several are tombstones over ideas already examined in full and killed |
| `claude/plans/` | Feature plans, dated. Superseded by the code once shipped |
| `claude/specs/design-system.md`, `claude/specs/accessibility.md` | The visual and a11y contracts |
| `claude/runbooks/deploy.md`, `email-and-domain.md`, `first-admin.md`, `e2e-roles.md`, `scope-mail-send.md` | Operational procedures |
| `claude/writing-to-github-from-claude.md` | The exact push route, and the ways it has failed |
| `claude/archive/quins-v1-mvp.md` | The original implementation plan. History |
| `claude/changelog.md` | What changed, when |

⚠️ **`claude/runbooks/defederate-m365.md` is OBSOLETE. Do not follow it.**
Defederation was examined in full on 4 Aug and is dead; the tombstone in
`claude/decisions/` says why, with evidence. Do not re-open it, and do not
propose buying an M365 licence — same session, same verdict.

## ⚠️ The rules that must reach you wherever you are running

1. **Never `git add -A`. Stage explicit paths.** `.env` is gitignored and
   only `.env.example` is tracked — never let a sweeping add be the thing
   standing between a Supabase key and a public repo.
2. **Never put a secret in a tool call, a URL or a commit.** The
   `sb_secret_…` key never touches this app, this repo, or a chat. The
   publishable key is public by design and is fine. If a secret is disclosed
   — including by Jay pasting it — say so and tell him to rotate it.
3. **⚠️ `build/v1-mvp` IS THE PRODUCTION BRANCH.** It deploys to
   https://app.adhjrt.com. A push there is a live release, not a save. Show
   the diff and get an explicit yes. **A stop hook asking is not Jay asking.**
   Use `[skip ci]` for docs-only commits and verify by the deploy id not
   moving — not by the build log.
4. **Never answer from memory about current state.** See reading-order
   step 2. This is the rule broken most often and it is the cheapest to keep.
5. **Read the RESPONSE, not the screenshot.** The same coloured box hides
   different failures. Get the status code and the actual message before
   forming a theory.
6. **Prove every new assertion against an injected fault**, and verify live
   after deploying. A green suite is not a working site. A measurement that
   merely confirms your own change was applied is not a verification.
   **Before trusting a negative search, confirm the search can find something
   you know is there** — an empty result has been read as proof of absence
   here, twice, and was wrong both times.
   ⚠️ **Commit before injecting a fault.** `git checkout -- <file>` reverts
   to the last COMMIT, not to "before my last edit", and has wiped
   uncommitted work.
7. **If a rot-detecting anchor can no longer be triggered, repoint it —
   never delete it.**

## Facts worth having before you touch anything

**⚠️ This is NOT the adhjrt repo.** Different repo, different site, different
deploy branch. Never commit this app's work into `…\GitHub\adhjrt`, whose
root is a published website.

**`jayjmuir-hub/quins-club-hub` is PUBLIC.** Nothing secret goes in it, in a
commit, or in a chat. Clones: cafnet `C:\Users\Jay\GitHub\quins-club-hub`,
jay-pc `C:\Users\jayjm\GitHub\quins-club-hub`. ⚠️ **Run `hostname` first,
every session** — the Windows user names differ.

**Writes go through real git on the PC, via the Desktop Commander bridge.**
No MCP-server fallback. Never the account-level GitHub connector — it is
OAuth, read-only, and 403s on writes. Always `GIT_TERMINAL_PROMPT=0`, so a
missing credential fails fast instead of hanging.

**⚠️ Claude never creates accounts, handles passwords or payment, or touches
the `sb_secret_…` key or any Entra client secret.** Jay does those; Claude
writes the exact click-by-click steps.

**⚠️ cafnet has `NODE_ENV=production` set machine-wide.** A plain
`npm install` there silently removes dev dependencies including vitest — use
`npm install --include=dev`. Vitest itself is handled in `vite.config.js`
(commit `5a39f5d`); the install side cannot be fixed in-repo. Without this,
most of the suite fails with an error that points at React, not at the cause.

**Stack:** Vite + React, Tailwind, Supabase (Postgres 17, ref
`lusmshimxdcxpnrktlgz`), Netlify (project `quins-club-hub`). `npm test` is
vitest; `npm run build` is the production build.
