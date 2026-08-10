# Changelog

Newest first. One line per shipped change, with the commit. Detail belongs in the commit
message and in `RESTORE.md`; this is the index.

⚠️ **This file stopped at 4 Aug for three days while `CLAUDE.md` advertised it as "what
changed, when".** Backfilled from `git log` on 7 Aug 2026 — the 5 to 7 Aug entries below
are one-liners taken from commit subjects, so they are accurate but thinner than the
hand-written 4 Aug ones. **Add the entry in the same breath as the commit.**

## 10 Aug 2026

- **10 Aug — `claude/state-of-play.md` rewritten, 591 lines to 283, and a session
  handoff written.** ⚠️ **Its own audit had already found the pattern and this
  edition is organised around it: every wrong claim in that file's history was a
  rotted MEASUREMENT, never a wrong ruling.** So the rulings and traps are kept in
  full and separated out as the durable half; the dated status is short; and no
  number a query can produce is quoted anywhere — the queries are given instead.
  What went: the layered history of its own corrections, and the shipped-on-date
  sections that duplicate this changelog and `claude/handoffs/`.
  ⚠️ **AND THE REWRITE CAUGHT A CLAIM THAT HAD GONE FALSE.** The file rested
  "nothing sends email of its own accord" on `pg_net` not being installed. It IS
  installed (0.20.4, measured), and `private.notify_pending_membership` calls
  `net.http_post` on every pending membership insert — that is how approval emails
  fire, and has been since 9 Aug. True when written, carried past the change that
  falsified it.
- **10 Aug — the clone check became a gate.** `scripts/session-guard.mjs` plus a
  SessionStart hook in `.claude/settings.json`: it says so, loudly, when the
  clone is SHALLOW or BEHIND `origin/main`. ⚠️ **The reasoning matters more than
  the script.** `CLAUDE.md` reading-order step 2 is the most useful rule in this
  repo and it keeps being skipped — not defied, skipped, because a rule in prose
  has to be remembered at exactly the right moment. Four incidents in four days,
  every one with a written warning already against it. Compare with what stopped
  the moment `main` was protected: pushing to the wrong branch, force-pushing
  over work, merging without tests. Those became structural. ⚠️ **It never
  blocks** — a SessionStart hook that refuses to start is one flaky network call
  from making the repo unusable, and it is silent when the clone is fine, so it
  does not become another thing people stop reading.
- `b96a729` — **The club name stopped truncating, and the hero stopped repeating
  itself.**
- **10 Aug — the club's name stopped truncating, and the hero stopped
  repeating itself.** Two instances of one thing: the design was built at a
  size the club has outgrown.
  (1) ⚠️ **The masthead rendered "ABU…"** at the `desktop` breakpoint (820px,
  where the top nav replaces the bottom tab bar) — on every screen, for every
  role. The 8 Aug note in `tests/app-shell.test.jsx` recorded truncation at
  ~1114px and fixed the ACCOUNT NAME's breakpoint; the club name itself was
  left to truncate and was far worse. It is STRUCTURAL: every other item in
  that row is `shrink-0`, so the wordmark is the only thing that can give and
  it gives everything — at 840px the row needs ~690px before the wordmark
  starts, leaving ~150px for something wanting 257. No width setting fixes
  that. The name is now painted only at `wide`, with "Quins Club Hub" carrying
  the identity below it. ⚠️ `sr-only`, not `hidden`, so the page keeps exactly
  one h1 at every width. ⚠️ Shortening it to "Harlequins" or "ADH Quins" was
  rejected — both invent a wordmark the club does not use.
  (2) **The dashboard hero said the same word twice**, the same defect fixed in
  the fixture row: eyebrow "NEXT TRAINING · U16B CONTACT" over a 42px
  "TRAINING". The squad now moves up into the headline when the title only
  echoes the type, and out of the eyebrow — so the headline always carries the
  most specific fact available. ⚠️ **NO TEST COVERED THE BROKEN CASE**, which
  is why it shipped: every training fixture in `tests/dashboard.test.jsx` is
  NAMED ("U10 skills session"), while every session in the real database is
  titled "Training".
- `fe2fe20` — **Quieter fixture rows, an honest fixture count, and a squad select.**
- **10 Aug — the squad filter became a select. It was a pill row.**
  design-system.md §4.8 specifies a `.pill-row` here and it was right when it
  was written — against four age groups. At 18 it wrapped to FOUR lines on a
  laptop, putting ~150px of filter chrome above the first fixture on Schedule:
  sub-tabs, four lines of squad pills, then the event-type row. The controls
  took more of the screen than the thing being controlled. ⚠️ **And most of
  them led nowhere** — two squads had events, thirteen pills opened an empty
  list; on Roster the row said so out loud, "U6 Tag · 0" four lines deep.
  A select is one line at any club size, which is what matters for a club
  heading to 600-700 players. ⚠️ **The cost, recorded so nobody re-litigates it
  blind:** one tap to switch squad becomes tap-choose-dismiss. Judged worth it
  because fifteen pills over three lines is not a control anyone reads. Jay's
  call. ⚠️ The per-squad COUNTS survived into the option labels — they are why
  the Roster row was tolerable at all. ⚠️ `PillButton` stays: Schedule's
  sub-tabs and event-type row are still pill rows and correctly so, at four
  options each. `TeamPills.jsx` renamed to `src/components/TeamFilter.jsx`.
- **10 Aug — the three senior squads removed from the live database.**
  Senior Men 1st XV, Senior Men 2nd XV and Women's XV, all with zero players,
  events, memberships, invites and invite targets — verified before the delete,
  so nothing cascaded. 15 age groups now, all youth. ⚠️ **CONSEQUENCE:**
  `register_my_player` picks 'player' or 'parent' from `teams.is_senior`, so
  with no senior squad every self-registration now creates a parent. Dormant,
  not broken — it returns with the first senior side. Restore SQL is in the
  commit that removed them.
- **10 Aug — the fixture row stopped saying the same word twice, and a known
  pitch now reads louder than a TBD one.** A training titled "Training" rendered
  a green "Training" chip with a bold "Training" heading directly beneath it —
  the row's two heaviest treatments carrying one fact. `titleRepeatsType` in
  `src/lib/eventFormat.js` drops the echo, so the bold line in a list belongs
  only to matches and to sessions somebody named ("Extra session before
  Saracens" keeps its title). Venue and pitch are now separate elements so a
  known pitch can sit a step darker. ⚠️ **`Pitch TBD` still renders** — Jay's
  ruling: without it nobody can tell "no pitch allocated yet" from "the app
  didn't say", and the calendar feed already argues the same for LOCATION.
  ⚠️ The KNOWN pitch is darkened rather than the TBD lightened: `ink-faint` is
  already the lightest AA-safe token on that surface.
  ⚠️ **A LARGER RESTRUCTURE WAS PROPOSED AND REJECTED ON EVIDENCE.** Grouping
  the schedule by month with hoisted constants was designed and agreed — then
  a realistic September was seeded and the existing list read fine, because
  matches, socials and a second squad break up the trainings on their own. The
  "wall of identical rows" was an artefact of a database holding one squad and
  one repeating series. Judge list density against real data, not seed data.
- **10 Aug — a realistic September seeded into the live database.** Sixteen
  events for U16B and U16G: four matches across three venues, a named extra
  session, a barbecue, and one back-dated result so Results and the dashboard's
  Last result card are not empty. All carry
  `group_id = 5eed0000-0000-4000-8000-000000000001`, so
  `delete from events where group_id = '5eed0000-0000-4000-8000-000000000001'`
  removes every one and touches nothing else. Inserts only — no existing row
  was modified.
- `38b82a9` — **The club-wide contact list is no longer kept on people's devices.**
  Jay's call: keep the offline copy where it earns its place and drop it where
  it does not. `addf3c4` purges the cache when the signed-in person changes,
  which closes the one-device-two-people hole — but it cannot help with a phone
  left unlocked or a laptop stolen, and for that the answer is not to store the
  sensitive things at all. KEPT: fixtures, training times, age-group names,
  squad lists, availability, a player's own contact and parent rows, and the
  caller's OWN membership and profile rows. DROPPED: the three club-wide admin
  reads — `listClubMembers` (every family's name, email and phone),
  `listPendingProfiles`, `listAccessRequests`.
  ⚠️ **The FILTER is the discriminator, not the table.** `memberships` and
  `profiles` are each read two ways, once scoped to the caller and once
  club-wide; excluding by path alone would leave the app unable to render
  anything offline, because every screen reads the caller's own memberships to
  know what they may see.
  ⚠️ **And the match is anchored on `?` or `&`** — a bare
  `search.includes('id=eq.')` is also satisfied by `club_id=eq.`, so a future
  club-wide read filtered on some other id column would be silently re-admitted
  by a check that reads as correct. `tests/pwa-cache-rules.test.js` pins that
  case. ⚠️ Devices stop holding the list only once each has loaded this build.
- `37970b9` — **`db/schema/` reconciled against live: ZERO DRIFT.** Not a
  re-capture; nothing had changed, so nothing was rewritten. 35 policies, 29
  function bodies, 29 functions' security settings, 4 triggers, 25 constraints,
  27 indexes, the RLS state of all 13 tables and the `player-photos` bucket
  settings all matched. ⚠️ **`public.accept_invite` still carries its
  incomplete-invite guard** — the regression this directory exists to catch has
  not recurred. Both objects the 7 Aug capture missed (`events_group_id_idx`,
  `invites_role_check`) are correctly recorded. Supabase's security linter was
  run alongside and produced nothing this repo had not already written down.
  ⚠️ **Column and table GRANTs remain uncovered** — a clean reconciliation here
  is not evidence about them. Recorded in `db/schema/README.md`.
- `addf3c4` — **The offline REST cache is now scoped to one person, and a token
  refresh no longer unmounts the routed screen.** Four fixes from a
  full-codebase review, plus `.github/workflows/test.yml`: `main` deploys on
  push and the unit suite had never run anywhere but a laptop, so Netlify's
  `npm run build` caught a compile error and **nothing caught a failing test**.
  ⚠️ The cache leak was confirmed by inspection on the deploy preview before the
  fix went in, not only by reading the code — `listClubMembers()` is unfiltered,
  so its url carries no user identifier and was shared by every caller,
  admin and coach alike. ⚠️ Deploying does not purge what is already on club
  devices; the owner check on load does that, once per device.

## 9 Aug 2026

- **9 Aug — the offline REST cache was not per-person, and a token refresh was
  unmounting the screen.** Four fixes from a full-codebase review, none of them
  visible on screen.
  (1) ⚠️ `vite.config.js` caches `GET /rest/v1/*` in Cache Storage, which is
  keyed by URL and scoped to the ORIGIN rather than to the person — and
  `listClubMembers()` produces a byte-identical url for an admin on
  /admin/accounts and a coach on /approvals. So an admin's club-wide member list
  (every name, email and phone) sat on a shared club laptop after sign-out, and
  NetworkFirst would hand it to the next person to open that screen with no
  signal. `src/lib/apiCache.js` purges it on every sign-out path and on any
  change of owner. ⚠️ **Deploying this does not purge what is already on club
  devices** — the owner check on load is what does that, once each device has
  run this build.
  (2) `MembershipProvider` keyed its effect on the `session` OBJECT, which
  supabase-js rebuilds on every token refresh — roughly hourly while the app is
  open — so the load re-ran, `loading` went true, `AppShell`'s `ready` gate went
  false, and the routed screen UNMOUNTED under whoever was using it, taking an
  open EventForm sheet and everything typed into it. Keyed on the uid now.
  (3) `NamePrompt` never primed `useMyProfile`'s cache, so a first sign-in
  answered the name gate and then read as nameless — or as the Google name it
  had just been told was wrong — for the rest of the session.
  (4) The membership-load error state had no sign-out. It was the one branch of
  `AppShell` not honouring "someone who cannot get in must always be able to get
  out".
- **9 Aug — the unit suite now runs in CI.** `.github/workflows/test.yml`.
  ⚠️ `main` deploys on push and the only workflow was `docs.yml`, so nothing ran
  vitest before a release: Netlify's `npm run build` caught a compile error and
  **nothing at all caught a failing test**. Two things the workflow has to do
  that are not obvious from reading `package.json` — supply placeholder
  `VITE_SUPABASE_*` vars, because `src/lib/supabase.js` throws at IMPORT time
  and ten files otherwise fail to COLLECT rather than to assert; and run
  `npm run build` first, because `tests/press-feedback.test.js` inspects the
  built stylesheet in `dist/`.
- `f42cc23` — **The handoff stopped naming a tip SHA, and gained the scale work.**
- `d9dc63f` — **Four indexes and an `availability` policy merge, for 700 players not 6.**
  ⚠️ LIVE DATABASE CHANGE. See the entry above this list's date heading in
  `claude/schema-history.md` for the reasoning; the equivalence proof is
  `db/tests/rls-availability-equivalence.sql`.
- `5332eff` — **Cold-start tested the handoff, and fixed what it could not answer.**
  A fresh agent given only the handoff rated it 6/10. ⚠️ **The branch trap:** this clone
  sat on a local branch named `feat/password-auth` at `main`'s tip, and
  `git rev-list --left-right --count` returned `0 0` because it compares SHAs, not branch
  names. Also a dead pointer telling document-reading sessions to read a commit message,
  and two contradictions introduced by that morning's own corrections.
- **9 Aug, LIVE DATABASE CHANGE — `scale_indexes_and_availability_policy_merge`.**
  Jay: the club is heading for **600-700 players, possibly double in parent
  accounts**. Four indexes (`availability(player_id)`, `memberships(team_id)`,
  `memberships(player_id)`, `players(team_id)`) and the four `availability`
  policies merged into one per command. ⚠️ `availability(player_id)` was the one
  real defect of 135 advisor lints — ~70,000 rows at full size, and the existing
  unique index on `(event_id, player_id)` **does not cover it**. ⚠️ The merge was
  proved equivalent across seven caller types by
  `db/tests/rls-availability-equivalence.sql`, fault-injected both ways. ⚠️ And
  it surfaced a latent gap left deliberately unfixed: **`can_edit_team` does not
  check `status`**, so a pending coach would pass every policy built on it.
- `f561736` — **The handoff was describing a world two commits old.** It listed
  `db/schema/` as stale and the `Greeting.jsx` magic-link comment as open after `6df8ee5`
  had closed both. ⚠️ Also recorded that **a shallow clone (`--depth`) implies
  `--single-branch`** — a session using one saw only `origin/main` and reported
  `build/v1-mvp` deleted. It was not.
- `6df8ee5` — **`db/schema/` re-captured against live, and nine claims in `RESTORE.md`
  corrected.** ⚠️ The 7 Aug capture's "Nothing unintended was found" was **wrong**: two
  objects live since 5 Aug had no line in the files, and `invites_role_check` asserted four
  roles when the database has had six. Plus five `proacl` lines that did not match, three
  attributable to no migration — and **Postgres keeps no timestamp for a GRANT**, so that
  cannot be settled from the catalogue. ⚠️ **`db/schema/` captures no table or column
  grants**, and **`apply_migration` strips `--` comments before executing**. In `RESTORE.md`:
  "an admin sees all 15 teams" (wrong policy, wrong count), "zero memberships reads zero
  rows including `teams`" (false since 8 Aug), and "CHANGE ONE, CHANGE BOTH" on
  `can_see_team` — **that mirror is broken deliberately** and the old line invited a "fix".
- `c1a223c` — **The 9 Aug handoff, and three decision records that were never committed.**
  ⚠️ All three of that day's decision records existed only in the Claude project — the same
  failure this repo records against 4-7 Aug, caught by `docs:check` flagging a broken path
  reference rather than by anyone noticing. ⚠️ One of them carried a live secret in plain
  text; **this repo is public**, so the committed copy names the secret and not its value.
  Also backfilled `52023db` from 8 Aug, which the coverage check caught as missing.
- `ebe3b6f` — **Schedule: a Matches/Training/Socials filter on Upcoming**, seen by
  everyone, and the head renamed to "Schedule". An unrecognised stored filter shows
  EVERYTHING, never an empty list; each filter carries its own empty message, because one
  shared "No upcoming fixtures yet" tells a parent who tapped Socials that the club has
  nothing on.
- `bd41b13` — **The Quick actions heading had no gap above it on mobile.** `BlockTitle`'s
  `first:mt-0` is right for the desktop two-column layout and wrong the moment the columns
  stack. MEASURED with Playwright (0px → 18px at 390px) — **no test in this repo can see
  this bug**, jsdom has no layout.
- `08fe678` — **"My memberships" meant "every membership I can read".** `loadMyMemberships`
  never filtered by profile id, so RLS decided the answer — and for an admin RLS returns
  the whole club. Jay saw two test players under "Your players". It would have hit coaches
  and managers the same way.
- `e03332b` — **The parent phone was lost on save, and the You card now needs an Edit
  tap.** `player_parents` stores one E.164 string; the editor holds two fields. PlayerForm
  converted both ways inline, MyPlayerForm did neither. One implementation now, in
  `src/lib/parentRows.js`. ⚠️ The commit that fixed it also **overstated it** — fault
  injection proved an untouched save kept the number. Comments corrected.
- `67cb5a5` — **A plain-text alternative on every email, honest copy, and a corrected DNS
  diagnosis.** ❌ A session told Jay his SPF/DKIM/DMARC were missing, from a lookup at
  `send.adhquins-clubhub.com`. **Resend puts the bounce domain one level BELOW the sending
  domain** — they are at `send.send.…` and were all Verified. He was one step from editing
  DNS that did not need editing.
- `fe5a308` — **Auth links now land on the club's own domain.** `/auth/confirm` redeems
  the `token_hash` with `verifyOtp`, so no email points at `lusmshimxdcxpnrktlgz.supabase.co`
  any more. Sender domain ≠ link domain is a phishing signature and was the one concrete
  spam cause found. `safeNext` refuses other origins, lookalike hosts, `//host` and `/\host`.
- `f7755a9` — **An Edit person sheet** — name, phone, role and squads in one place, email
  deliberately not editable. ⚠️ The first version **shipped a crash**: `displayName` was
  declared inside a `.map` callback and the moved rows left that closure, blanking the
  whole screen.
- `0b30ebc` — **Squad-scoped approvals, approval emails, the weekday in the schedule, and
  in-place player edit.** Approval is an RPC, NOT a widened policy: `memb manage` is
  `FOR ALL`, so a coach clause would also have granted role changes — including to admin —
  reassignment and deletion. The migration aborts if that policy is ever not admin-only.
- `0c4dd7b` — **Gender is required on the single-gender squads**, and a mismatch warns
  loudly without ever blocking. ⚠️ The suffix must TOUCH the digits — `U6 Tag` ends in a G.
- `e19e21b` — **The real 15 youth + 3 senior squads, and a SAFEGUARDING fix.**
  `/^u(\d{1,2})\b/i` needs a word boundary after the digits and a letter is a word
  character, so `U12G QR` matched nothing, the band came back `null`, and `allowsOwnContact`
  read `null` as "a senior side: adults" — offering a 12-year-old girls' squad the child's
  own contact fields. Squads renamed IN PLACE so 6 players, 26 events and 1 membership
  survived.

## 8 Aug 2026

- `52023db` — **Masthead wrap on a real phone, and a parent can now edit their own name
  and phone.** ⚠️ **Missed from this file until 9 Aug** — the changelog check caught it.
  The wordmark broke across two lines because a flex line does not wrap, so the only way
  the span could give ground was to break its own text. A hypothesis about the tap target
  was recorded as WRONG rather than quietly dropped. ⚠️ And the hole found while building
  it: **RLS grants ROWS, NOT COLUMNS**, so "profile update own" let a person rewrite any
  column on their own profile — including the email an admin reads when approving a
  stranger. Column privileges are now an explicit allow-list.
- `7765ebe` — **Parents register their own player and wait for approval.** `team read`
  had to be widened or the age-group dropdown was permanently empty for exactly the
  person who needed it. Approval is ADMIN-only, not "coach or admin" as the spec assumed.
  1317 tests.
- `212022b` — **The pending membership state, `register_my_player`, and an RLS harness.**
  Measured the danger first: a brand-new parent could see the WHOLE squad. `can_see_team`
  now requires `status='active'`; a new `is_attached_to_team` gates fixtures only.
  `db/tests/rls-pending-membership.sql` is safe to re-run on production. `[skip ci]`
- `dc7d900` — **Event end time, additional info, and cancelling the rest of a series.**
  The calendar had been inventing an end time; it now uses the real one. The edge-function
  change was INERT until `calendar_events_for_token()`'s `RETURNS TABLE` was widened — the
  same failure that hid the pitch for a day. 1290 tests.
- `ae96828` — Corrected three rotted claims (the 200/hour email ceiling, the yahoo backup
  admin, the rollout-blocker framing) and recorded that password auth is live. `[skip ci]`
- `5917386` — Recorded the test-data wipe and the three things it taught us. `[skip ci]`
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
