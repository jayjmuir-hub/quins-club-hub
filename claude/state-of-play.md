# State of play

**Read this first, then `git log`.** Never answer from memory about current state — Jay
works from two PCs and work lands between sessions.

This file is where things STAND. **`RESTORE.md` is what is TRUE** about the codebase, and
`CLAUDE.md` is the short pointer that travels everywhere. If this file and `RESTORE.md`
disagree, `RESTORE.md` and the code win and this file is stale.

Split by VOLATILITY, not by topic: anything that changes week to week lives here, so
`RESTORE.md` never has to be edited just because a status changed.

*Last updated: 5 Aug 2026.*

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
| Club-branded auth email, now via Resend — **live and verified 5 Aug** | `23cedc8`, `df03d67` |

Earlier the same day: `db/schema/` re-captured after it was found to be missing an entire
table, a column, four policies and two functions — and that re-capture surfaced real drift
(`private.photo_player` had `search_path` pinned live but not in the committed migration).

## What is blocked, and on whom

**Auth email is live on Resend as of 5 Aug 2026** — sign-in, recovery, email-change and
invite all route through the `send-email` Edge Function, verified end-to-end with a real
magic-link send to `jayjmuir@gmail.com` (delivered, confirmed in Resend's dashboard). The
`DO NOT INVITE THE COMMITTEE` blocker from earlier this week is lifted on the email side.

Getting here took two separate fixes on 5 Aug, not one: switching the provider from
Microsoft Graph to Resend (`23cedc8`), and then a code bug found only once the Resend setup
was otherwise complete — `SEND_EMAIL_HOOK_SECRET` from Supabase's Send Email Hook screen is
formatted `v1,whsec_<base64>`, not the bare `whsec_<base64>` the code assumed, so every
request was crashing before it ever reached Resend (`df03d67`, full writeup in
`claude/decisions/2026-08-05-resend.md`). **If auth email breaks again, check that bug
class first** — a bodyless 500 with nothing useful in `get_logs` almost certainly means the
Edge Function's own Logs tab in the Supabase dashboard (not the Invocations/API log the MCP
tool surfaces) has the real exception.

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

`jay-pc` (user `jayjm`) verified 5 Aug 2026 at `df03d67`, matching `origin/build/v1-mvp` —
no longer behind. `cafnet` (user `Jay`) last confirmed current 4 Aug; not re-checked since.
**Run `hostname` first, every session** — the bridge flaps and has silently reconnected to
the other PC mid-session, and the clone paths differ.

⚠️ **jay-pc's working tree has `core.fileMode` drift**: before this session's commit, every
tracked file showed as locally modified — full-file rewrite in `git diff`, executable bit
flipped 100644→100755 on files that should never be executable. Root cause not fully
diagnosed (likely OneDrive sync or an editor touching the exec bit; Windows checkouts
should normally run `core.fileMode=false` since NTFS doesn't model the POSIX bit the same
way). **Set to `false` in this session, 5 Aug**, which stops the mode noise; the CRLF/LF
content drift on files this session didn't touch is still there. **Do not run
`git add -A` on this machine until that's cleaned up** — it already wasn't allowed, but this
is why the rule exists, made concrete.
