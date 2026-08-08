# Changelog

Newest first. One line per shipped change, with the commit. Detail belongs in the commit
message and in `RESTORE.md`; this is the index.

⚠️ **This file stopped at 4 Aug for three days while `CLAUDE.md` advertised it as "what
changed, when".** Backfilled from `git log` on 7 Aug 2026 — the 5 to 7 Aug entries below
are one-liners taken from commit subjects, so they are accurate but thinner than the
hand-written 4 Aug ones. **Add the entry in the same breath as the commit.**

## 8 Aug 2026

- **8 Aug, no commit — LIVE DATABASE CHANGE.** Test data wiped: 316 players, 315
  contacts, 17 events, 1 invite. Seeded 6 obviously-fake players on U16 as a fixture for
  the pending-state RLS work. `U15` renamed to `U16`, duplicate empty `U16` deleted
  (14 teams). Jay's 2 logins, 2 memberships and his calendar token kept. Three things
  learned and recorded in `state-of-play.md`: `invites`/`invite_targets` are
  `NO ACTION` and block a team delete; `storage.objects` refuses SQL deletion outright;
  and nothing in the app can delete a login.
- `e3fbc60` — **Copy fix, and password auth is now LIVE on `main`.** Two screens stopped
  asserting things the app cannot know: the Accounts header said "2 people" while five
  logins existed (it counts people WITH ACCESS, not accounts), and Login's post-signup
  panel claimed an email had been sent when a repeat signup sends nothing. Both traced to
  one incident. `1244` tests, fault-injected.
- `6198ea6` — Empty commit to trigger the first branch deploy. Netlify only builds on a
  push event, so enabling branch deploys does not retroactively build a branch that was
  already pushed — the preview URL 404'd until this landed.
- `649072f` — **Email + password sign-up, sign-in and reset.** Step 1 of the self-registration decision; touches
  no RLS. New `src/lib/password.js` mirrors the live Supabase policy so a parent sees a
  live checklist instead of GoTrue's 422, which enumerates all four character sets every
  time and therefore never says which one is missing. Magic link and Google hidden behind
  `SHOW_PASSWORDLESS`, code intact. Two review bugs fixed rather than worked around:
  `ResetPassword`'s one-way `linkDead` latch, and sign-in with an empty password advising
  the parent to check an inbox.
- `40ba837` — Recorded the mothball rulings: hide the magic-link and Google buttons but
  keep the code, no feature flags, `claim_roster_access` stays live rather than
  mothballed, old roster data deleted not archived. `[skip ci]`
- `70182cc` — **Decision: parents self-register, and a `pending` membership state.** Spec
  for the U13/U16/U18 pilot. Records why the pending state must exist — `can_see_team()`
  is squad-wide, so immediate access on a self-declared age group would expose that
  squad's children — and two silent failures found while writing it. `[skip ci]`
- `0342003` — Recorded the branch flip as verified; refreshed the Machines table.
  `[skip ci]`
- `39d6c06` — Applied the `sync_profile_name` single-word fix live and re-captured
  `db/schema/functions.sql` with it. Verified on a probe table and fault-injected against
  the old derivation. `[skip ci]`
- `5ac7714` — Changelog catch-up for `eb8c385`, and recorded the catch-up regress.
  `[skip ci]`
- `eb8c385` — **`main` is now the production branch, not `build/v1-mvp`.** `main` was a
  strict ancestor (`0 25`), so a fast-forward. Updated the 8 hard-coded branch references
  across 5 instruction-bearing files — `.github/workflows/docs.yml` being the one that
  would have failed silently. Added `db/migrations/20260808_sync_profile_name_single_word.sql`
  (**not applied to the live database**), and corrected two stale `state-of-play.md` claims:
  the single-word-name bug fires from `handle_new_user()` on every signup, not from the name
  gate, and the `search_path` bullet still said "Not applied" under its own PINNED heading.
  `[skip ci]`
  ⚠️ **That "not applied to the live database" is now out of date: it WAS applied later
  the same day** — see the entry above it. Left as written, because the commit message it
  summarises said the same thing and was true when written.

## 7 Aug 2026

- `066df2c` — Changelog catch-up for `6a96d4c`. `[skip ci]`
  ⚠️ **A catch-up commit needs its own catch-up.** The coverage check exempts only `HEAD`,
  so every "catch up the changelog" commit becomes an unlisted `HEAD~1` the moment anything
  lands after it. This entry was added on 8 Aug when exactly that happened. **When you write
  a catch-up commit, list the PREVIOUS catch-up in it too, or the regress just moves along.**
- `6a96d4c` — Re-captured `db/schema/` after three days and ~14 migrations of drift.
  Nothing unintended found; `tables.sql` had been asserting the opposite of the truth
  about the `memberships` unique index. `[skip ci]`
- `f7ffa60` — Pinned `search_path` on `sync_profile_name`; the last non-noise security
  advisor finding. Testing it surfaced a latent single-word-name bug. `[skip ci]`
- `3c6fbbf` — `npm run docs:check` + CI: six documentation rules that can now fail a
  build. Fixed five dead pointers, a removed component cited in a live a11y contract,
  three stale runbooks and seven missing plan status lines. `[skip ci]`
- `c3c038b` — One home per machine fact (NODE_ENV was wrong in two of three files),
  refreshed the Machines table, backfilled this changelog. `[skip ci]`
- `1f75dae` — Audited `state-of-play.md` against the live database: six claims corrected,
  four gaps added. `[skip ci]`
- `f6b45bd` — Split `RESTORE.md`; reading order 1,115 → 732 lines. Fixed a `git add -A`
  sitting in its own push example. `[skip ci]`
- `5fbbc57` — The `friendlyAuthError` fix was already shipped; the file said otherwise. `[skip ci]`
- `8a92421` — Split status out of `RESTORE.md`, promoting the durable half. `[skip ci]`
- `79c91b1` — Restored 17 orphaned decision/handoff/plan docs to the repo. `[skip ci]`
- `bb6aca6` — `CLAUDE.md` corrections.
- `bf1d884` — Moved View As to `/admin` so the wordmark fits for admins.
- `c3acc92` — Club wordmark was truncating to "ABU DHABI HARLE…".
- `8e22dca` — Stat band sat flush against the fortnight strip.
- `12b0fe0` — Male/Female on a player, and everything that follows from it.
- `8ee3d91` — Country picker rendered the dial code twice.
- `3b7070b` — Privacy policy wrongly said parents see only their own children.
- `8254a45` — Contact and parent rows never rendered on More.
- `7aa73ad` — More shows your own details, your players and the calendar link.
- `44e4c93` — Removed the countdown, and the timer that fed it.
- `0aa3263` — Fortnight strip on the dashboard.
- `f517593` — Stopped calling a training session a fixture.
- `9ea243f` — Account name shows at wide, not desktop.
- `6008433` — Time-based greeting, and a My account button in the masthead.
- `319c853` — Stat band is staff-only.

## 6 Aug 2026

- `923c421` — Inter replaces Anton + Barlow + Barlow Condensed.
- `172ae23` — Added the Button component the app never had, plus the arrow badge.
- `c5315ba` — Press feedback, and a green the palette re-point missed.
- `d47c671` — Re-pointed the palette at the current club redesign.
- `054e896` — Open a player from their name, and show their face.
- `fd3f203` — Login explains the sign-out, survives the email cap, embeds cleanly.
- `9eebd7d` — Account deletion and a privacy policy.
- `c80f51e` — **Session guard:** stops supabase-js silently downgrading a signed-in
  request to `anon`. See `claude/decisions/2026-08-06-session-guard.md`.
- `57a04e0` — Granted anon EXECUTE on the two profiles helpers that lacked it. `[skip ci]`
- `d449d3c` — Translated Supabase's auth rate-limit error into something a parent can act on.
- `e1e8275` — **Roster auto-onboarding**, and a hard name gate at first sign-in.
- `174bffd` — Sign-in returns you to the page you started on, not the site root.
- `1af744a` — Save button stopped promising events it would refuse to add.
- `0975c06` — **Auth email rolled back to Resend** while Microsoft stays blocked.
- `c70be86` — Dropped two redundant RLS read policies. `[skip ci]`
- `28d9a02` — Baseline security response headers.
- `782086e` — App hands out feed links on our own domain, not Supabase's.
- `b68d341` — Calendar feed proxied through our own domain.
- `034d9d8` — Pitch carried into the subscription feed.

## 5 Aug 2026

- `5009efb` — Team Manager and Medic roles; staff role set centralised in `scope.js`.
- `73eeb38` — One session across several age groups, and a pitch.
- `2e26d35` — One `/admin` dashboard, and `/more` given back to everyone.
- `562b92c` — Add a training session once and get the whole term.
- `cb10861` — Plan for repeating events. `[skip ci]`
- `7ed389c` — Mail-scoping runbook fix: the group takes the DEFAULT domain. `[skip ci]`
- `f8300ad` — Covered the day sheet, and fixed two stale notes.
- `98abea6` — Tapping any calendar day opens that day, and can add an event.
- `e563079` — Recorded the domain move, Resend, and the 5.7.708 investigation. `[skip ci]`
- `a9e8492` — Recovered the deployed Microsoft Graph send-email function into git.
- `5025497` — Recorded the auth email fix and verification. `[skip ci]`
- `df03d67` — Corrected the Supabase webhook secret prefix in the send-email hook.
- `a2565d6` — Switched club auth email from Microsoft Graph to Resend.

## 4 Aug 2026

- `3c6b12c` — Runbook for defederating the M365 tenant from GoDaddy. ⚠️ **Now obsolete —
  see `CLAUDE.md`.** `[skip ci]`
- `8713025` — Reorganised `docs/` into `claude/specs`, `plans`, `runbooks`, `archive`. `[skip ci]`
- `3c14d2a` — Wrote down how this codebase actually behaves. `[skip ci]`
- `50bcd2b` — Added `CLAUDE.md`, pointing at the docs that already exist. `[skip ci]`
- `23cedc8` — Club-branded auth email via Microsoft Graph and the Send Email Hook, plus the
  domain runbook. **Built and deployed but INERT** until the Entra/M365/Supabase steps are
  done. Replaces Supabase's built-in mail (2/hour, no SLA).
- `7b3daa7` — Recorded the self-service and calendar-feed decisions in `RESTORE.md`.
- `7f533fd` — Calendar subscription feed for Google and Apple: `calendar_tokens`, three
  RPCs, and a `calendar` Edge Function serving iCalendar.
- `dd0d5c9` — Parents and players can maintain their own record: photo, own contact row and
  parent rows. `players.photo_path` goes through a SECURITY DEFINER function because RLS
  grants access to rows, not columns.
- `3a512c5` — Scope/read-only banner removed everywhere; player sheet leads with a large
  photo, parent contact laid out like the player's own.
- `da2811a` — Login copy no longer sends people hunting for an admin the app can reach
  itself. Corrected a stale note claiming Google OAuth was unconfigured.
- `aea42df` — Signup gated behind admin approval: `access_requests`, a RequestAccess screen,
  Dismiss/Restore on Accounts.
- `5a39f5d` — `vite.config.js` survives an ambient `NODE_ENV=production`.
- `7b6d7a4` — Re-captured `db/schema/` after the parents+photos migration, and fixed the
  drift it exposed.

## Earlier

See `git log`. This file starts on 4 Aug 2026; everything before it is in the
`.superpowers/sdd/` task ledgers and the commit history.
