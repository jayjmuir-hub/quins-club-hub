# State of play

**Read this first, then `git log`.** Never answer from memory about current state — Jay
works from two PCs and work lands between sessions.

This file is where things STAND. **`RESTORE.md` is what is TRUE** about the codebase, and
`CLAUDE.md` is the short pointer that travels everywhere. If this file and `RESTORE.md`
disagree, `RESTORE.md` and the code win and this file is stale.

Split by VOLATILITY, not by topic: anything that changes week to week lives here, so
`RESTORE.md` never has to be edited just because a status changed.

*Last updated: 4 Aug 2026.*

## Where things stand

**v1 MVP complete (22/22) and live at `app.adhjrt.com`.** Post-v1 refinement is the current
phase — usability work driven by Jay actually using it, not new infrastructure.

**940 tests passing, build clean**, on `build/v1-mvp`. Netlify auto-deploys on push to that
branch. `main` holds only the initial scaffold commit.

## Shipped 4 Aug 2026

All live, deployed, and verified in the deployed bundle.

| What | Commit |
|---|---|
| Signup approval gate (`access_requests`, RequestAccess screen, Dismiss/Restore) | `aea42df` |
| Login copy — stopped sending people to find an admin out of band | `da2811a` |
| Scope/read-only banner removed everywhere; player sheet reworked | `3a512c5` |
| Self-service profile editing for parents and players | `dd0d5c9` |
| Calendar subscription feed for Google/Apple | `7f533fd` |
| Club-branded auth email via Microsoft Graph (built, NOT yet switched on) | `23cedc8` |

Earlier the same day: `db/schema/` re-captured after it was found to be missing an entire
table, a column, four policies and two functions — and that re-capture surfaced real drift
(`private.photo_player` had `search_path` pinned live but not in the committed migration).

## What is blocked, and on whom

**Auth email is still Supabase's built-in service: 2 messages/hour, no SLA, explicitly not
for production. DO NOT INVITE THE COMMITTEE UNTIL THIS IS DONE.** The replacement is built
and deployed but inert until Jay completes the Microsoft 365 / Entra / Supabase steps in
`claude/runbooks/email-and-domain.md`.

**Domain move pending.** Jay has bought `adhquins-clubhub.com`. The app AND the email move
there together — an email from one domain linking to another is the pattern people are
taught to distrust. **Do it before inviting anyone**: this is a PWA, installs pin to their
origin, and a later move costs every member a delete-and-reinstall. Today the only install
is Jay's.

## Open, not blocking

- Nobody is emailed when an access request arrives — Jay has to look at the Accounts screen.
- No rate limit on account creation (only on what an account can do, which is nothing).
- Smoke tests outstanding on a real phone: parents/photos, the access gate, self-service
  editing, the calendar feed.
- `/more` (Admin) and `/accounts` overlap — `/more`'s member list duplicates what
  `/accounts` does properly. Suggested: strip the list, move Invite next to Accounts.
  Raised, not approved. `/overview` is genuinely separate and should stay.
- "Managers" — Jay mentioned the role; it does not exist (admin/coach/parent/player).
  Unresolved whether it's a real role or shorthand for coaches.
- `saveParents` is delete-then-write, not atomic.
- No index on `memberships.profile_id`.
- Audit trail deferred; `access_requests.decided_by/at` is a first fragment.
- Single-club assumption in `clubId` derivation, `is_admin_anywhere()` and
  `can_admin_see_pending()` — revisit together if a second club ever appears.
- Stale docs: `claude/runbooks/e2e-roles.md`, `deploy.md`, `first-admin.md` still mention Wild Apricot.
  The real plan is integration with the club's new AWS site.
- Doc reorganisation (`claude/specs/`, `plans/`, `runbooks/`) discussed, deliberately NOT
  done — it costs a ~60-file comment sweep because `claude/specs/design-system.md` alone is cited in
  29 files. Do it when nothing else is in flight, or not at all.

## Machines

`jay-pc` (user `jayjm`) is behind at `2244f0a` and needs a `git pull`. `cafnet` (user `Jay`)
is current. **Run `hostname` first, every session** — the bridge flaps and has silently
reconnected to the other PC mid-session, and the clone paths differ.
