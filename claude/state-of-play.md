# State of play

**Read this first, then `git log`.** Never answer from memory about current state — Jay
works from two PCs and work lands between sessions.

This file is where things STAND. **`RESTORE.md` is what is TRUE** about the codebase, and
`CLAUDE.md` is the short pointer that travels everywhere. If this file and `RESTORE.md`
disagree, `RESTORE.md` and the code win and this file is stale.

Split by VOLATILITY, not by topic: anything that changes week to week lives here, so
`RESTORE.md` never has to be edited just because a status changed.

*Last updated: 5 Aug 2026, end of day.*

## Where things stand

**v1 MVP complete (22/22) and live at `https://adhquins-clubhub.com`.** Post-v1 refinement is
the current phase — usability work driven by Jay actually using it, not new infrastructure.

⚠️ **AUTH EMAIL IS DEAD.** Not degraded — nothing is delivered at all. See below.
**DO NOT INVITE THE COMMITTEE.**

⚠️ **The deployed `send-email` Edge Function is NOT in git.** Supabase has the Microsoft
Graph version; `origin/build/v1-mvp` still has the Resend version (`df03d67`). The repo is
the one that is wrong. Recovery instructions in
`claude/decisions/2026-08-05-microsoft-graph-and-5.7.708.md`.

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
| Club-branded auth email — ⚠️ **since moved to Microsoft Graph and now BLOCKED** | `23cedc8`, `a2565d6`, `df03d67` |

Earlier the same day: `db/schema/` re-captured after it was found to be missing an entire
table, a column, four policies and two functions — and that re-capture surfaced real drift
(`private.photo_player` had `search_path` pinned live but not in the committed migration).

## What is blocked, and on whom

**Auth email is BLOCKED on Microsoft.** Every application-submitted send fails with
`550 5.7.708 Service unavailable. Access denied, traffic not accepted from this IP`.
The Edge Function returns 200 — Graph accepts the message — and Exchange Online then
refuses to let it leave. Nothing is delivered. Support case **2608050030005980**, opened
5 Aug, replied to with test evidence the same day.

**The block is on the application send path, not the tenant.** This was proved, not
assumed: the same mailbox delivers fine via Outlook on the web and fails via Graph. Full
writeup, including what that rules out, in
`claude/decisions/2026-08-05-microsoft-graph-and-5.7.708.md`. An earlier conclusion that
this was a blanket new-tenant restriction with "nothing wrong on our side" was **wrong**.

**Resend is the fallback and is still fully configured** — domain verified, DKIM/SPF/MX
present, and `RESEND_API_KEY` still set in Supabase. A rollback is one function redeploy.
⚠️ **The `/auth/v1` fix must be ported into the Resend version first** or you ship mail
that delivers with a dead button. See `claude/decisions/2026-08-05-resend.md`.

**If auth email throws an unexplained 500**, check the `v1,whsec_` bug class first — a
bodyless 500 with nothing useful in `get_logs` almost certainly means the Edge Function's
own Logs tab in the Supabase dashboard (not the Invocations/API log the MCP tool surfaces)
has the real exception. Detail in `claude/decisions/2026-08-05-resend.md`.

**Domain move DONE and verified 5 Aug.** The app is live at
`https://adhquins-clubhub.com` with a valid Let's Encrypt certificate (expires 3 Nov 2026).
DNS moved from GoDaddy to Netlify DNS. `app.adhjrt.com` remains a working alias and was
deliberately not removed. Full writeup and the DNS traps in
`claude/decisions/2026-08-05-domain-move.md`.

**Still to do before anyone is invited:** lift 5.7.708 → verify DKIM → send a real magic
link and confirm it arrives, is not in spam, **the button signs you in**, and
`Authentication-Results` shows `dkim=pass` → reinstall the PWA from the new domain and
delete the old install → apply `New-ApplicationAccessPolicy`.

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
- ~~Doc reorganisation deliberately NOT done~~ — **this was stale and is now resolved.**
  `8713025` did the reorganisation, and the comment sweep went with it. Measured 5 Aug
  2026: **0 stale `docs/*.md` citations** across `src/` and `claude/`, and
  `claude/specs/design-system.md` is cited in 2 files, not the ~29 this entry feared.
  The cost estimate that justified deferring the work was wrong by an order of magnitude.
  Nothing outstanding here.

## Machines

`jay-pc` (user `jayjm`) verified 5 Aug 2026 at `5025497`, matching `origin/build/v1-mvp` —
no longer behind. `cafnet` (user `Jay`) last confirmed current 4 Aug; not re-checked since.

**Run `hostname` first, every session** — the bridge flaps and has silently reconnected to
the other PC mid-session, and the clone paths differ.

⚠️ **Untracked file in the repo root: `_transfer.b64`** (14,548 bytes, 3 Aug). Not in
`.gitignore`. Contents unexamined. **This repo is PUBLIC** — check what it is and either
ignore it or delete it, before a careless `git add` sweeps it in.

⚠️ **jay-pc's working tree has `core.fileMode` drift**: before this session's commit, every
tracked file showed as locally modified — full-file rewrite in `git diff`, executable bit
flipped 100644→100755 on files that should never be executable. Root cause not fully
diagnosed (likely OneDrive sync or an editor touching the exec bit; Windows checkouts
should normally run `core.fileMode=false` since NTFS doesn't model the POSIX bit the same
way). **Set to `false` in this session, 5 Aug**, which stops the mode noise; the CRLF/LF
content drift on files this session didn't touch is still there. **Do not run
`git add -A` on this machine until that's cleaned up** — it already wasn't allowed, but this
is why the rule exists, made concrete.
