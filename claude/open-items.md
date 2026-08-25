# Open items

**Known, not blocking, not forgotten.** Split out of `state-of-play.md` on
14 Aug 2026 so that file could go back to being about today.

⚠️ **MOST OF THIS IS THE 13 Aug 2026 PRODUCTION-READINESS AUDIT, AND THIS IS THE
ONLY RECORD OF IT.** The report itself was a session artefact and was never
committed, deliberately — it was a dated verdict. **An item deleted from here is
a finding that ceases to exist.** Tick things off by striking them through with
the evidence, never by removing the line.

Everything is **not started** unless it says otherwise. Ordered by cost to fix.

## Needs Jay (account creations — Claude does not do these)

- ✅ ~~**Leaked-password protection is OFF.** Supabase → Authentication → Policies.~~
  — **IT IS ON. Read off the dashboard 15 Aug 2026**, after Jay said he thought
  he had already done it and this file said otherwise for two days.
  ⚠️ **AND THE POINTER WAS WRONG TOO, WHICH IS PROBABLY WHY IT LOOKED UNDONE.**
  The setting is not under Authentication → Policies; it is
  **Authentication → Attack Protection**, as "Prevent use of leaked passwords",
  and it shows a green ENABLED badge rather than a toggle. Anyone following the
  old direction landed on the RLS policies list and found nothing to switch.
  ⚠️ **THE ADVISOR AGREES, AND ITS SILENCE IS THE EVIDENCE.** Supabase emits an
  `auth_leaked_password_protection` lint when this is off; `get_advisors` returned
  16 security lints and not that one. **A missing lint only counts because the
  same call returned others** — an empty result would have proved nothing, which
  is the trap `CLAUDE.md` rule 6 exists for.
- **Captcha protection on the auth endpoints is OFF** — same screen, measured the
  same day, `aria-checked="false"`. ⚠️ **RECORDED, NOT RECOMMENDED.** It is a
  real gap and it also puts a challenge in front of every sign-up and password
  reset for a club of a few hundred families, most of them arriving from a
  WhatsApp link on a phone. Nobody has weighed that trade yet, and this line
  exists so the next person knows the switch is there and untouched rather than
  considered and rejected.
- **Flip "Confirm email" OFF** — Supabase → Authentication → Sign In / Providers
  → Email. Jay's 25 Aug 2026 decision
  (`claude/decisions/2026-08-25-remove-email-confirmation.md`): signup no longer
  gates on opening a link; a welcome mail replaces the confirmation. ⚠️ **LAST
  step, after** the `notify-welcome` function is deployed and
  `db/migrations/20260825_welcome_email_no_confirm.sql` is applied — everything
  in code is keyed on rows being born confirmed, so nothing changes until this
  click, and the click is safe the moment those two are live. Once flipped:
  `notify-unfinished-signup` + the `signup_nudges` machinery lose their audience
  (only the pre-flip limbo cohort remains), and the send-email `signup` template
  becomes unreachable for new signups — all mothballed, not deleted, same ruling
  shape as passwordless.
- ✅ **Monitoring — DONE, 16 Aug 2026.** "Detection today is somebody
  telling Jay" was the 13 Aug audit's finding. Two **Better Stack** monitors are
  now live on the free tier, 3-minute checks, e-mail alerts:
  `https://adhquins-clubhub.com/` and the calendar feed at
  `/calendar.ics?token=<Jay's token>`. ✅ **E-mail delivery is PROVEN** — Jay ran
  *Send test alert* and it arrived.
  ✅ **DETECTION IS PROVEN TOO — the drill was RUN, 16 Aug 2026, not just written
  down.** The live site was disabled for **4m 15s** (09:44:04 to 09:48:19 UTC).
  Both monitors opened an incident at **09:44**, e-mail alerts arrived, and the
  incidents auto-resolved by 09:52 once the site was back.
  ⚠️ **DETECTION WAS UNDER A MINUTE, NOT THE THREE THE CHECK INTERVAL IMPLIES** —
  worth knowing before anyone "fixes" the frequency on the strength of the
  setting rather than the measurement.
  ✅ **SENTRY IS LIVE TOO — 16 Aug 2026**, EU region, proven by firing a real
  unhandled rejection on the live site: the lazy chunk loaded, POSTed, got 200,
  and the issue appeared. The entry bundle grew **0.3 KB** (259.6 → 259.9 gzip);
  the 159 KB SDK stays in its own chunk.
  ⚠️ **STACK TRACES ARE MINIFIED** — the smoke-test issue reads `?(<anonymous>)`
  as its location.
  No source maps are uploaded, so an error gives the message, page, browser and
  affected count but no file and line. **The trigger for adding them is the first
  real error nobody can place**, not a tidiness urge — it costs a build secret and
  a Vite plugin.
  ⚠️ **KEYWORD MATCHING IS A PAID FEATURE ON BETTER STACK, AND THE RUNBOOK SAID
  OTHERWISE UNTIL IT WAS SEEN ON THE SIGNUP SCREEN.** The 'Alert us when' dropdown
  carries a **Billable** badge; its keyword and status-code options exist in the UI
  but selecting one risks moving the account to a paid tier. So both monitors use
  the free "URL becomes unavailable" check. **The recommendation had been written
  from research rather than from the product**, which is the same failure as the
  Sentry bundle-size estimate three items down.
  ⚠️ **THE ONE FAILURE THIS CANNOT SEE**: if the `/calendar.ics` proxy rule were
  deleted from `netlify.toml`, the path would fall through to the SPA catch-all
  and answer **200 with the app's HTML** — every calendar subscription in the club
  broken, monitor green. Everything else is caught, because the monitor carries a
  real token and the feed only answers 200 when it genuinely built. **Do not swap
  provider to close it**: UptimeRobot's free tier has keyword monitors but is
  personal/non-commercial only, and StatusCake deactivates accounts idle 90 days.

## Cheap (under an hour each)

- ✅ ~~**The suite passes with 5–7 "Unhandled Errors" every run — measured 23 Aug
  2026 on `main` at `c593795`.** `TypeError: The "event" argument must be an
  instance of Event` from undici's WebSocket, originating in five screen suites
  whose screens subscribe to Supabase realtime unmocked, so jsdom opened a REAL
  socket to the project during `npm test`.~~ — **FIXED 24 Aug 2026**: a
  never-connecting WebSocket stub in `src/test/setup.js`, jsdom-only so the
  node-environment files (which only need the global to EXIST) are untouched.
  Measured both sides: 3 unhandled errors on 3 files before, 0 across all 175
  after, full suite green. The vite.config.js note about
  `delete globalThis.WebSocket` as a fault-injection technique still stands —
  the stub replaces, never deletes.

- **Training plans follow-ups from the 21 Aug 2026 whole-branch review** (none
  blocking): client-side age validation on the drill and template forms (a typo
  of 99 surfaces a raw `drills_min_age_check`); `saveTemplate`/`saveSessionBlocks`
  are two round trips (caveat recorded in the spec; an RPC would close it);
  a `.gitattributes` decision — the system `core.autocrlf=true` flattens CRLF test
  files on `git add` and cost one review round; no test for the embed sort in
  `listTemplates`/`getSession`; the three screens are 600–760 lines (seams named
  in their headers).

- ✅ ~~**`authenticated` holds TRUNCATE on every table it holds anything on**,
  including `memberships`, `player_parents` and (as of 18 Aug 2026)
  `push_subscriptions` — found while capturing that table's grants, measured
  against the first two as controls to confirm it is systemic rather than
  new. **TRUNCATE is not filtered by RLS at all** — Postgres never applies row
  security to it — so any signed-in member currently holds the ability to
  empty any table outright, RLS policies notwithstanding.~~ — **REVOKED
  19 Aug 2026**, on all 31 tables that had it, plus the `postgres` default
  privilege so the next table does not arrive with it.
  `db/migrations/20260819_revoke_truncate_from_authenticated.sql`,
  `db/tests/truncate-grants.sql`.

  ✅ **"Wants its own harness proving nothing legitimate needs it" — that was
  this item's condition, and it was met three ways.** No code anywhere issues a
  SQL TRUNCATE (every `truncate` in `src/` is a Tailwind class); PostgREST
  exposes no TRUNCATE verb; and **three tables had already been running without
  it** — `photo_backup_runs` since 13 Aug, `photo_orphan_scans` since 16 Aug,
  `membership_audit` since 17 Aug — one of them carrying the photo backup the
  club depends on. The exceptions were the argument, not a footnote.

  ⚠️ **THE CAPABILITY WAS DEMONSTRATED RATHER THAN READ OFF A CATALOGUE ROW.**
  A throwaway table created down our own migration path, then `set local role
  authenticated; truncate` — it really emptied. A throwaway rather than
  `players` on purpose: the real roster would have proved the same thing while
  taking an ACCESS EXCLUSIVE lock on a live club mid-onboarding, and it would
  not have shown that the DEFAULT is live as well as the existing grants.

- ⛔ **`authenticated` CAN TRUNCATE `storage.objects`, AND WE ARE NOT ALLOWED TO
  FIX IT.** Five tables outside `public` — `storage.objects`,
  `storage.buckets`, `storage.buckets_analytics`, `net.http_request_queue`,
  `net._http_response`. `storage.objects` is the row behind every player photo,
  so this is not an academic leftover; the `net` pair carry a PUBLIC grant, so
  `anon` holds them too. Measured 19 Aug 2026.

  ⚠️ **AND THE WAY THE FIX FAILS IS THE THING TO REMEMBER: A REVOKE ISSUED BY
  SOMEONE WHO IS NOT THE GRANTOR SUCCEEDS AND DOES NOTHING.** No error, no
  failed statement — `revoke truncate on storage.objects from authenticated`
  ran clean as `postgres` and `has_table_privilege` still returned true
  afterwards. Postgres only removes grants YOU made, and the grantor here is
  `supabase_storage_admin`. **A migration listing these tables would apply
  cleanly, review as correct, and be a lie**, which is why
  `20260819_revoke_truncate_from_authenticated.sql` names them and asserts
  nothing about them.

  ⚠️ **Do not "fix" this by asserting it in a harness either** — an assertion we
  know to be false is worse than a gap somebody can read about. This is an item
  against Supabase, not against us. Same threat model as the `public` one was:
  no PostgREST verb, so it needs a direct connection with a stolen JWT.
- ✅ ~~**`public.register_my_player` is executable by `anon`, and it looks
  deliberate when it is not.** Measured on production 16 Aug 2026 while adding
  `request_staff_role`:

  ```
  register_my_player   postgres=X anon=X authenticated=X service_role=X
  accept_invite        postgres=X        authenticated=X service_role=X
  claim_roster_access  postgres=X        authenticated=X service_role=X
  set_admin_rights     postgres=X        authenticated=X service_role=X
  ```

  ⚠️ **NOT A HOLE, WHICH IS WHY IT IS HERE AND NOT HIGHER UP.** Every guard in
  that function keys on `auth.uid()`, so an anon caller is refused at the first
  line with `42501`. The problem is that three comparable RPCs do *not* carry the
  grant, so anybody reading the ACLs will conclude the difference was a decision.
  It was not: Supabase ships `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON
  FUNCTIONS TO anon, authenticated, service_role`, so a new function arrives with
  an EXPLICIT anon grant, and `revoke all … from public` does not remove it —
  it only removes the implicit PUBLIC entry. Whoever wrote the tightened three
  added an explicit `revoke … from anon`; whoever wrote this one did not.~~ —
  **REVOKED 18 Aug 2026.**
  `db/migrations/20260818_revoke_anon_execute_register_my_player.sql`.

  ⚠️ **A SEPARATE FILE HAD CALLED THIS GRANT DELIBERATE, FOR FIVE DAYS, ON THE
  SAME MISREADING THIS ITEM WARNS ABOUT.** `db/tests/grants.sql` §3b — written
  13 Aug, three days before this item — named `register_my_player` alongside
  `calendar_events_for_token` as one of "TWO ALLOWED ENTRIES ARE DELIBERATE AND
  MUST NOT BE TIDIED", citing the two migrations that re-granted it explicitly
  as evidence of a decision. **An explicit grant is evidence someone typed it,
  not evidence someone decided it** — reading the two migrations shows both are
  restating a DROP/CREATE side-effect to avoid an outage, and neither gives a
  reason `anon` itself needs this function. A harness got the same fact this
  item was built to catch wrong, in the opposite direction, and would have
  failed loudly the moment anyone acted on THIS item without also fixing that
  one. Both are now consistent.

  ⚠️ **AND THE GRANT WAS FUNCTIONALLY INERT, WHICH ANSWERS WHY REVOKING IT
  BROKE NOTHING.** A PostgREST call only executes as the `anon` role when it
  carries no session; a signed-in user's calls run as `authenticated` whatever
  this grant said. So the only caller who could ever reach the function AS
  `anon` is one the `auth.uid() is null` guard was always going to refuse one
  line later. Measured after the revoke, inside a rolled-back transaction: a
  signed-in call with a deliberately bad team id still reaches past the
  auth/email guards and fails on `22023 "That age group does not exist"` —
  identical to before. `request_staff_role` was tightened at creation and
  carries the full explanation in its migration header; this one now matches.

- ✅ ~~**No dependency scanning.** No Dependabot, no `npm audit` step.~~ —
  **both shipped 15 Aug 2026.** `.github/dependabot.yml` watches npm weekly and
  the workflow actions monthly, grouped so minor and patch arrive as one
  reviewable pull request and majors arrive alone; `npm audit --omit=dev
  --audit-level=high` is a step of the `test` job, which is one of the two
  REQUIRED checks, so it gates from the moment it merged.
  ⚠️ **`--omit=dev` IS THE DESIGN, NOT A SHORTCUT.** Measured the same day: the
  full tree carries **10 advisories — 5 moderate, 4 high, 1 CRITICAL — and eight
  of them, including the critical (`vitest`), are devDependencies that never
  ship.** Gating on the full tree would let a critical in a test runner block a
  fix to the live site.
  ⚠️ **AND `high` RATHER THAN `moderate` BECAUSE THE TWO PRODUCTION ADVISORIES
  HAVE NO NON-BREAKING FIX** — see the item below. Gating at `moderate` would
  red every build from the day it merged, and a permanently red gate teaches
  people to ignore the gate. **Drop it to `moderate` the day react-router 7
  lands.**
  ✅ **Proved it can fail rather than assuming**: the same command at
  `--audit-level=moderate` exits 1 today, at `high` it exits 0.
- ✅ ~~**The two production advisories are `react-router`, and the ONLY fix is a
  major version.**~~ — **taken, 15 Aug 2026. `npm audit --omit=dev` is now 0.**
  react-router-dom 6.30.4 → 7.18.2, and the whole tree is down to 4 findings from
  the 10 that were there when scanning was switched on the same morning.
  ⚠️ **IT WAS A BUMP RATHER THAN A MIGRATION ONLY BECAUSE THIS APP USES NO DATA
  ROUTER.** It uses the declarative API and nothing else, so v7's changes did not
  reach it. An app on `createBrowserRouter` would have had a real piece of work
  here.
  ⚠️ **Exercised in a real browser, not only in jsdom** — every test uses
  `MemoryRouter` and the app ships `BrowserRouter`, so navigation was driven in
  Chromium: `/` → Schedule → `/roster`, URL and content both changing.
  ⚠️ **`react-dom` 19 WAS OFFERED AND REFUSED** the same day (#152): Dependabot
  bumped `react-dom` while leaving `react` at 18, and `npm ci` fails outright with
  `Conflicting peer dependency: react@19.2.8`. **React 18 → 19 is a migration and
  wants its own piece of work**, with both packages moved together — not a
  dependency PR.
- ~~**The old note, kept for its reasoning:**~~ ⚠️ **Re-measured 15 Aug 2026 and the old note was right about
  what ships but silent about the rest**: production is exactly 2 moderate, both
  react-router, and **neither is exploitable here** — `safeNext()` blocks
  `//host` and `/\host`, and the third advisory in the set is SSR hydration,
  which this app does not do. Recorded so nobody re-panics at the same output.
  ⚠️ **`npm audit` SAYS `fixAvailable: true` AND THAT IS MISLEADING.** The
  advisory range is `6.0.0-alpha.0 - 7.17.0`, and the installed 6.30.4 is
  already the newest v6 — so the "available fix" is **react-router-dom 7.18.2, a
  major**, i.e. a migration rather than a bump. That is why Dependabot is
  configured to bring majors as their own pull request.
- ✅ ~~**No `LICENSE`, no `SECURITY.md`** on a public repo running children's-data
  infrastructure.~~ — **both shipped 14 Aug 2026.** `LICENSE.md` is all rights
  reserved, held by Abu Dhabi Harlequins RFC (Jay's call; there was no prior
  ruling — every "licence" in `claude/` was an M365 seat). `SECURITY.md` sends
  reports to `admin@adhquins-clubhub.com`, which is already the app's public
  contact on the privacy and account-deletion screens, and rules out a GitHub
  issue as a disclosure route.
  ⚠️ **Named `.md` on purpose** — a bare `LICENSE` misses
  `scripts/netlify-ignore.mjs`'s `/^[^/]+\.md$/` and would deploy.
  ✅ **`package.json` now carries `"license": "UNLICENSED"`** — folded in on
  15 Aug 2026 exactly as this line asked, alongside the DMARC chore that was
  going to build anyway. ⚠️ **It is `UNLICENSED`, not a SPDX id, and that is
  correct**: npm reserves that string for a package that is deliberately not
  open source, which is what "all rights reserved" means in `LICENSE.md`.
- **CSP is `frame-ancestors 'none'` and nothing else.** `netlify.toml` explains why
  and the reasoning is sound — a wrong `connect-src` breaks the app silently for
  anyone holding a cached service worker. It stays here because it is the only thing
  that would contain a compromised npm dependency. Do `connect-src` first, and test
  against a browser that already has a service worker registered.
- ✅ ~~**CI pins Node 20.**~~ — **all three workflows pin Node 24 as of 15 Aug
  2026**, matching both dev PCs, and the eight files that were stuck in jsdom
  now run in `node`. Measured on the move: `environment` across those eight went
  to **3ms**.
  ⚠️ **PROVED THE BUMP IS WHAT FIXED THEM**, using the technique `vite.config.js`
  already documented: `delete globalThis.WebSocket` in `src/test/setup.js` turns
  a dev machine into a Node 20 runner, and with it the eight fail with the exact
  CI error. Without it they pass. A green run alone would not have shown which
  change was responsible.
  ✅ **NETLIFY'S BUILD NODE IS NOW PINNED — `NODE_VERSION = "24"` in
  `netlify.toml`, 24 Aug 2026, in the same PR as the vite 8 pair below.** It was
  unpinned (no `.nvmrc`, no `.node-version`, nothing in `netlify.toml`) and the
  production build ran on whatever Netlify defaulted to, which CI never proved.
  Pinning waited for Jay's call because it alters the runtime a live release is
  built on; the vite 8 upgrade forced the question and Jay took it.

## The four dependency majors, parked 17 Aug 2026

**Dependabot opened five majors at 00:15 on 17 Aug. One was taken; these four were
parked, each for a measured reason and not for nervousness.** Jay's call, having
been shown what each one actually fails with. ⚠️ **Every one of them is ALSO red on
`docs-check`, which is structural and means nothing** — see
`claude/runbooks/session-and-push.md`. **Read the `test` line, not the tick count.**

- **react 18.3.1 → 19.2.8.** `ERESOLVE` at install: `react-dom` stays at 18.3.1
  and the peer ranges cannot be satisfied. ⚠️ **The exact mirror of #152**, which
  bumped `react-dom` and left `react` behind — so this has now failed in both
  directions, which is the evidence that it is a migration and not a bump. Both
  packages have to move in one change. The ruling above still stands.
- ✅ **vite 5.4.21 → 8.2.2 and `@vitejs/plugin-react` 4.7.0 → 6.1.0 TAKEN
  TOGETHER, 24 Aug 2026, exactly as this item prescribed** — one PR carrying
  both, with the Node pin above in the same change. The mutual block was real
  and the finding held: each had failed alone (vite 8 because plugin-react 4
  refuses it; plugin-react 6 because it declares `"vite": "^8.0.0"` — exactly 8,
  not "7 or newer"). The clean route was a from-scratch lockfile resolve —
  an incremental install fights the existing tree over plugin-react 6's
  *optional* Babel-8/oxc peer chain; regenerating `package-lock.json` settles
  it without pulling any of those peers in. Suite green on the pair
  (nothing needed changing), build green, dependabot's #354/#355 closed in
  favour of the combined PR.
- **tailwindcss 3.4.19 → 4.3.3 is a migration, and the install is not what
  breaks.** `npm ci` succeeds; **the BUILD fails on `src/index.css`**. Three things
  in this repo are v3-shaped: the `@tailwind base/components/utilities` trio at the
  top of that file, `postcss.config.js` naming `tailwindcss` directly where v4
  wants `@tailwindcss/postcss`, and a **377-line `tailwind.config.js`** that v4
  expects as CSS-first `@theme`.
  ⚠️ **THERE IS A REAL PRIZE IN IT, WHICH IS WHY THIS IS PARKED RATHER THAN
  REFUSED.** `src/index.css`'s token layer exists only to mirror
  `tailwind.config.js` "exactly", by hand, with a comment telling the next person
  to change both — v4 would make them one source and delete that whole class of
  drift. It is a day's careful work against the visual contract of a live site,
  with `claude/specs/design-system.md` to keep in step. **It wants a plan, not a
  merge.**

## One migration each

- **Positions staff-only, the two follow-ups (25 Aug 2026).**
  `db/migrations/20260825_positions_staff_only.sql` moves position/unit into
  staff-only tables and NULLS `players.position` / `players.unit`. Left open
  deliberately:
  1. ✅ ~~**A later migration DROPS the two nulled columns**~~ — **DONE, same
     day, after the deploy**: `20260825_drop_players_position_unit.sql`.
     Evidence, in order: live bundle grepped for the new code first; both
     columns measured all-NULL (nothing had re-written them); every deployed
     players read is `select('*')` so nothing names the columns; a
     rolled-back dry-run dropped them with no dependents; then the real drop,
     and `information_schema.columns` no longer lists either.
  2. ✅ ~~**Re-capture `db/schema/`** after the migration applies~~ — **the
     pieces this change touched are captured, 25 Aug**: players' column list
     and prose, player_positions + player_units DDL in tables.sql (verified
     against information_schema and pg_indexes), and the three `manage`
     policies in policies.sql (verified against pg_policies). ⚠️ **The wider
     drift is NOT fixed and is the item below.**
  Also: ~~the screenshot harness has NO playerTiers stub (it never did), so its
  roster shots now render "Position not set" where the stub players carried
  inline positions — cosmetic, but a stub returning the maps is the fix when
  the shots are next regenerated~~ — **DONE the same day**:
  `harness/stubs/playerTiers.js` landed with the three-view roster builder
  (PR #420), aliased in `harness/vite.config.js` and held to export parity by
  `tests/harness-stubs.test.js`. It returns empty maps on purpose — grades and
  positions are decoration on the screens under shoot, and their rendering has
  its own tests.

- **`db/schema/tables.sql` is FIFTEEN TABLES behind the live database —
  measured 25 Aug 2026.** `information_schema.tables` lists 57 base tables in
  `public`; the capture holds 42. Missing: availability_nudges, chat_prefs,
  conversation_members, feedback (policies captured, table DDL not),
  membership_audit, membership_vouches, message_reactions, message_stars,
  nicknames, notification_opt_outs, player_grades, push_subscriptions,
  signup_nudges, and until 25 Aug player_positions/player_units (those two
  now captured). This is the exact drift the directory's README warns about,
  at a size where the diff stops being reviewable. A full re-capture is its
  own session's work — not absorbed into the positions change on purpose.

- **`anon` holds full table privileges on `public`.** ⚠️ **Re-measured 14 Aug 2026:
  it is 23 of the 24 tables, not the "seven" this line used to claim** — seven was a
  sample read as a total. The exception is `photo_backup_runs`, created 13 Aug with
  an explicit revoke. Source is Supabase's default privileges. **Safe today by its
  POLICIES, not by its grants** — which is the thing this repo's rules say not to
  rely on, and it was confirmed safe by measurement: `set local role anon` sees zero
  rows on ten tables where the same counts unprivileged return real ones.
  ✅ ~~**APPLIED TO PRODUCTION 14 Aug 2026**~~ —
  `db/migrations/20260814_revoke_anon_table_privileges.sql` and
  `db/tests/anon-table-grants.sql`. **Measured after: `anon` holds SELECT,
  INSERT, UPDATE and DELETE on 0 of 24 tables; `authenticated` and
  `service_role` still hold all 24.**
  ✅ **AND THE PROTECTION DEMONSTRABLY MOVED FROM POLICY TO GRANT.** `set local
  role anon; select … from teams` used to return zero rows silently; it now
  raises `42501: permission denied for table teams`. ⚠️ **That distinction is
  the whole point of the change** — and the error names the missing GRANT, so
  it is refused by the gate this was aimed at rather than by something earlier.
  ✅ **The calendar feed was smoke-tested after applying** — `/calendar.ics`
  with a bogus token returned **200, `content-type: text/calendar;
  charset=utf-8`, a real `BEGIN:VCALENDAR` body**. It is SECURITY DEFINER and
  never depended on an anon table grant, but it is the one thing here that
  could not be repaired if it broke.
  ⚠️ **THAT PROBE NO LONGER RETURNS 200, AND THE LINE ABOVE IS KEPT AS THE
  RECORD OF 14 Aug RATHER THAN CORRECTED.** Re-run 18 Aug 2026: a bogus token
  now answers **404, `content-type: text/plain; charset=UTF-8`, body
  `Not found`**. The edge function tightened at some point between the two
  dates — arguably an improvement, since an invalid token no longer receives a
  valid-looking empty calendar.
  ✅ **IT IS NOT THE FAILURE THIS LINE EXISTS TO CATCH.** The dangerous case is
  the SPA catch-all answering **200 with the app's HTML**, which the free uptime
  check cannot see (`claude/runbooks/monitoring.md`). A plain-text 404 is the
  edge function itself refusing, so the proxy is still wired.
  ⚠️ **AND IT IS NOT A REGRESSION FROM THE 18 Aug RELEASES** — measured against
  the PREVIOUS production deploy's permalink as well as the current one, and
  both answer identically.
  ⚠️ **WHAT WAS NOT VERIFIED: THAT A VALID TOKEN STILL RETURNS 200.** That needs
  a real token, which is an unrevocable credential in a URL (see the item below)
  and was deliberately not used. **The Better Stack monitor carries a real one
  and is the thing that would catch a genuine break** — so treat its silence,
  not this paragraph, as the evidence the feed works.
  ⚠️ **IT REMAINS A PARTIAL FIX:** the
  `postgres` default privilege can be closed, the `supabase_admin` one cannot, so a
  table created down that path still arrives open. The harness walks every table
  rather than trusting either default.
- **18 RLS policies re-evaluate an `auth.*` call per row.** ⚠️ **This line said "call
  `auth.uid()` bare" and that is wrong in a way that would make a migration miss
  one:** 17 of the 18 call `auth.uid()`, and the 18th — `invites / invites read own`
  — calls `auth.jwt()`. The count comes from Supabase's own `auth_rls_initplan`
  lint; a string search for `auth.uid()` finds only 17. There are **19 bare calls**
  across those 18 policies, because `calendar_tokens / calendar token own` and
  `social_ideas / social idea create` carry two each. Fix is `(select auth.uid())`
  and changes no meaning.
  ✅ ~~**APPLIED TO PRODUCTION 14 Aug 2026**~~ —
  `db/migrations/20260814_rls_initplan_wrap_auth_calls.sql` and
  `db/tests/rls-initplan.sql`. Equivalence was proved BEFORE applying, by
  comparing the expressions Postgres RE-PRINTS before and after, normalised for
  the wrapper: 60 policies in, 60 out, zero differences in meaning.
  **Measured after applying: 60 policies still 60, bare calls 0, wrapped 24, and
  Supabase's `auth_rls_initplan` lint went from 18 entries to none.**
  ⚠️ **THE ADVISOR IS STILL NOISY AND THAT IS NOT A FAILURE** — 132 lints
  remain, of which **100 are `multiple_permissive_policies`**, a separate
  question this migration never touched. Do not read a noisy advisor as this
  having not worked; read the lint NAME.
  ✅ **THE HOUSE STYLE ALREADY EXISTS — SIX POLICIES USE THE WRAPPED FORM**, all
  on `announcements` and `announcement_reads`, shipped 14 Aug. So this is
  following a precedent in the schema, not inventing one; copy those.
  ⚠️ **An earlier draft of this line claimed no policy used the wrapped form.**
  That came from a query that listed only policies with BARE calls — the wrapped
  ones were filtered out before they could be counted, and the absence was read
  as evidence. The same mistake as reading an empty search as proof of absence,
  which `CLAUDE.md` rule 6 exists to stop.

## ✅ The Supabase security advisor — walked in full, 15 Aug 2026

**16 warnings. Fourteen are deliberate and correctly guarded; two are untidy
grants worth one small migration. Nothing here is a hole.** This section exists
because the list had never been read, and "16 unknown warnings" is a worse state
than a longer list of understood ones. **Re-run `get_advisors` rather than
trusting these counts.**

⚠️ **THE ADVISOR FLAGS EXPOSURE, NOT VULNERABILITY.** Fifteen of the sixteen say
"this `SECURITY DEFINER` function can be called through the API", which is TRUE
of every RPC this app has — it is how the app works. The question the lint cannot
answer, and this walk did, is whether each function guards itself.

**What was checked, and what it found:**

- **All fourteen `public` `SECURITY DEFINER` functions set `search_path`
  explicitly** — twelve to `public`, and `delete_my_account` and
  `photo_backup_list_objects` to the empty string. That is the hardening the
  lint's dangerous cousin is about, and it was already done.
- **Every mutating function enforces its own authorisation**, by its own code
  and not by the grant: `set_admin_rights` requires `private.is_super_admin()`,
  `approve_membership` requires `private.can_approve_team()`, the
  `set_own_player_*` pair check ownership, `accept_invite` matches the invite's
  email against the caller's, and `delete_my_account` refuses the last admin.
- **Every reading function is scoped**: `my_squad_staff` by
  `private.can_see_team()`, `announcement_audience` and `announcement_stats` by
  author-or-admin, `calendar_events_for_token` by the memberships attached to
  the token itself.
- **`photo_backup_list_objects` is `service_role` only** and is correctly absent
  from the advisor's list.

**Measured against production, not reasoned about:**

| Probe | Result |
|---|---|
| `private.squad_expects_gender` via REST, anon key | **404** — the `private` schema is not exposed by PostgREST |
| `public.my_squad_staff` via REST, anon key | **401** — granted to `authenticated` only |
| `public.register_my_player` via REST, anon key | **42501 "You must be signed in."** |
| `public.calendar_events_for_token` via REST, anon key, bogus token | **`[]`** |
| `select auth.uid()` under `set local role anon` | **null**, which is what makes the guard above fire |

⚠️ **THE `register_my_player` PROBE WAS BUILT SO IT COULD NOT WRITE EVEN IF THE
GUARD HAD FAILED** — it passed a team id that does not exist, so the second
guard would have stopped it before any insert. Confirmed after the fact: zero
rows created. **A probe against production has to be safe in the branch where it
proves you wrong.**

### The two worth a migration

- ✅ ~~**`public.register_my_player` has `anon` EXECUTE and does not need it.**
  No hole — the body's first statement refuses a null `auth.uid()`, proven
  above — but the grant is unnecessary, and revoking it is the same reasoning
  as the 14 Aug table-privilege revoke: protection should come from the GRANT,
  not only from the code behind it. The app calls this as `authenticated`, so
  nothing legitimate loses access.
  `revoke execute on function public.register_my_player(text, uuid, text, boolean, boolean, boolean) from anon;`~~
  — **DONE, 18 Aug 2026.** Full account, and the harness that had called this
  grant deliberate on the strength of the same misreading, in the "Cheap"
  section above.
- **Ten `private.` functions carry an `anon` EXECUTE grant**, including
  `squad_expects_gender`, which is also the one function the advisor flags for a
  mutable `search_path`. ⚠️ **IT IS `SECURITY INVOKER`, SO THE search_path LINT
  IS MILD** — it runs with the caller's own privileges and gains nothing from a
  hijacked path — and the schema is unreachable through the API anyway (404
  above). Worth setting `search_path` for hygiene, since it is called from inside
  a `SECURITY DEFINER` function, and worth revoking grants that were never meant
  to exist. **Low priority and honestly labelled as such.**

## The status check the approval gate never had

- ✅ **FIXED — `private.can_approve_team` did not require `status = 'active'`.**
  Found 17 Aug 2026 by chasing an "Unnamed player" in the live approval queue,
  which turned out to be a `request_staff_role` row. Its two siblings
  (`can_see_team`, `can_edit_team`) both carry the test; this one did not, and
  had not needed to until a pending STAFF row became possible on 16 Aug.
  Measured on production in a rolled-back transaction with an invented club —
  **pending coach: ALLOWED; active coach: ALLOWED; coach of another squad:
  refused** — then re-measured with the fix applied inside the same transaction,
  where only the first line changed.
  `db/migrations/20260817_approve_requires_active_membership.sql`,
  `db/tests/approve-status-gate.sql`, and the client half in `src/lib/scope.js`.
  ⚠️ **IT WAS NOT ONLY THE APPROVE BUTTON.**
  `private.can_squad_staff_see_pending` calls `can_approve_team`, and backs the
  policy letting an approver read a pending registrant's NAME and EMAIL. So the
  same omission exposed those to somebody who had merely asked to coach.
  ⚠️ **AND THE EXISTING HARNESS COULD NOT HAVE CAUGHT IT.**
  `db/tests/rls-squad-staff-approval.sql` tests a medic, a coach of another
  squad, and a parent self-approving — but every staff row in its fixture is
  `'active'`, because when it was written on 9 Aug a pending staff row could not
  exist. Same for every membership fixture in `tests/` — none carried a `status`
  at all, though the column is NOT NULL. **A new writer was added and the old
  readers were not audited: the screen, the SQL gate, and the tests all missed
  it for the same reason.**

- ✅ ~~**`private.is_admin` HAS THE SAME OMISSION AND WAS DELIBERATELY LEFT.**
  It tests role and club and never status. **Not reachable today** — measured
  17 Aug 2026, production held **zero** admin memberships that were not active,
  and `request_staff_role` refuses any role but coach/manager/medic, so nothing
  can currently create one. It was left alone because `is_admin` backs most of
  the admin RLS surface, and adding a condition to it changes the blast radius
  from one function to every admin policy on a live site.
  **Re-measure the count before assuming it is still unreachable**; the moment
  any path can create a pending admin row, this becomes the same bug with a
  bigger radius.~~ — **APPLIED TO PRODUCTION 18 Aug 2026.** Jay's call, having
  been shown the blast radius measured rather than described.
  `db/migrations/20260818_admin_gates_require_active_membership.sql`,
  `db/tests/admin-status-gate.sql`, and the client half in `src/lib/scope.js`.

  ⚠️ **IT WAS FOUR FUNCTIONS, NOT ONE, AND THE LINE ABOVE NAMED ONLY THE ONE
  SOMEBODY ALREADY KNEW.** Found by asking production which functions mention
  `memberships` and not `status`, rather than by grepping for `is_admin`:

  | Function | Backs | Had a status test |
  |---|---|---|
  | `private.is_admin(uuid)` | 15 policies, 9 tables | no |
  | `private.is_admin_anywhere()` | `access_requests`, `photo_backup_runs` | no |
  | `private.shares_admin_club(uuid)` | `profiles` ×2 | no |
  | `private.can_admin_see_pending(uuid)` | `profiles` | no |

  ⚠️ **THE LAST TWO WERE THE ONES THAT MATTERED, AND THEY ARE THE ONES NOBODY
  HAD NAMED.** They back `profiles`, so a pending admin row could read every
  member's NAME and E-MAIL — the same thing the 17 Aug bug leaked, by a
  different route. Fixing only `is_admin` would have closed this item while
  leaving that open.

  ✅ **Measured under RLS, before and after, in a rolled-back transaction on
  production with an invented club.** A pending admin read **1** profile row
  belonging to another member before, **0** after; an active admin reads **1**
  throughout, which is the control that stops "refuse everybody" passing as a
  fix. The four functions answered `true/true/true/true` to a pending admin
  before and `false/false/false/false` after, with an ordinary parent `false`
  throughout as the second control.
  ✅ **The harness injects the four pre-18 Aug bodies back and confirms it
  fails** — a green run from it means something.

  ⚠️ **THREE MORE FUNCTIONS OMIT THE TEST AND WERE LEFT, ON PURPOSE.**
  `private.is_attached_to_team` and `private.is_own_player` answer for PARENTS
  and PLAYERS too, and **a pending parent row is the ordinary registration
  state — reachable today, unlike a pending admin.** Whether a parent awaiting
  approval should see their child's squad is a design question with a real
  answer either way, not a hole, and changing it under cover of a security fix
  would alter what live families see mid-registration.
  `private.may_set_staff_photo` delegates to `is_admin` and `can_edit_team`, so
  its caller side is already fixed.

  ⚠️ **AND THE DEFERRAL WAS RECORDED IN A WAY THAT COULD NOT FIND THE OTHER
  THREE.** Both this file and `db/schema/functions.sql` wrote it as
  "`private.is_admin` still has the same omission" — the NAME already known,
  not the QUESTION. **A deferral is worth writing down as the question it
  leaves open**, because the name only finds what somebody had already looked
  at.

## ✅ `npm run db:check` RUNS AGAIN — fixed 18 Aug 2026

- ✅ ~~**Every SQL harness is currently unrunnable, because ONE of them cannot
  fail.** `scripts/db-check.mjs` checks its files before it connects and stops
  the whole run if any is unsafe. Today it stops on:

  ```
  db-check: REFUSING TO RUN. These harnesses cannot FAIL:
    head-coach-flag.sql: no "raise exception" anywhere
  ```

  `db/tests/head-coach-flag.sql` arrived in `caddd7f` (#228) with its
  assertions written as SELECTs, which the runner reports `ok` for whatever
  number comes back. **The runner is right and the harness is wrong** — this is
  the gate working, not a bug in the gate.
  ⚠️ **THE COST IS THAT NOTHING ELSE RUNS EITHER.** The refusal is all-or-
  nothing by design (an unsafe file must not be reachable part way down a run),
  so every other harness — including `db/tests/admin-status-gate.sql`, added
  18 Aug — is currently unreachable through its own runner. That is precisely
  the state `claude/runbooks/db-harnesses.md` exists to prevent: "a check nobody
  RUNS is not a check."
  ⚠️ **AND IT WAS NOT NOTICED FOR A REASON WORTH KNOWING**: the nightly
  `.github/workflows/db-check.yml` is inert until a `SUPABASE_DB_URL` secret
  exists, so it reports "did not run" and PASSES. Nothing was ever going to go
  red. **Fix is to wrap that file's expectations in `do $$ … raise exception …
  end $$;`**, which is a small piece of work on somebody else's assertions and
  wants doing on purpose rather than in passing.~~ — **DONE the same day.**
  `db/tests/head-coach-flag.sql` now judges its six answers in a `do $$ … raise
  exception … end $$;` block instead of printing them under an `EXPECTED:`
  comment for a human to compare.

  ✅ **The runner gets past its static gate**: `npm run db:check` now stops at
  "no connection string" — which is Jay's to supply — rather than refusing the
  files. That is the measurement, not the absence of the old message.
  ✅ **Run against production in a rolled-back transaction: all six pass, and
  the self-test fires** — dropping the one-head-coach-per-squad index flips
  assertion 3 from `refused (23505)` to `ALLOWED` while assertion 4 stays
  `refused (23514)`. That second half is a new control: without it, a fault
  wider than the one named would flip check 3 for the wrong reason.
  ✅ **AND THE NEW VERDICT BLOCK WAS PROVED TO FAIL**, by feeding it a table
  with one planted wrong answer: it raised
  `HEAD COACH: "1 backfill flags the titled head coach" answered not flagged,
  expected FLAGGED.` **A check that has never failed is not a check — which is
  the entire reason this item existed.**

  ⚠️ **THE SQLSTATES ARE PART OF THE ASSERTION NOW.** `23505` is the unique
  index refusing a second head coach; `23514` is the CHECK refusing a non-coach.
  A change that swapped one guarantee for the other would leave both lines
  reading "refused" and the old eyeball comparison would have shrugged.

  ⚠️ **THE NIGHTLY IS STILL INERT.** Fixing the harness did not add the
  `SUPABASE_DB_URL` secret, so `.github/workflows/db-check.yml` continues to
  report "did not run" and pass. **Until Jay adds it, these harnesses run only
  when somebody runs them** — which is the same failure one step further back.
  Settings → Secrets and variables → Actions → New repository secret.

  ✅ **THE SECRET WAS ADDED 19 Aug 2026 AND THE RUNNER NOW RUNS.** What it
  found on its first real execution is the point of this whole item: **14 of
  34 harnesses failed**, and they had been failing silently for up to nine
  days. Thirteen are now fixed. **Two remain and are recorded here rather than
  quietly dropped.**

  ✅ **BOTH REMAINING FAILURES WERE RESOLVED THE SAME DAY, AND NEITHER WAS
  WHAT IT LOOKED LIKE.** All **34 harnesses now pass, with all 34 self-tests
  firing.**

  ✅ **`rls-squad-staff-approval.sql` was NOT a disclosure.** It reported
  `pending membership rows still visible: U16 coach -> 2`, which reads exactly
  like a coach seeing rows they should not. **Measured instead of assumed:**
  production held 2 genuine pending registrations at the time, the fixture's
  own two rows were both correctly approved, and a U16B coach was measured
  seeing **0** pending rows belonging to any other squad. RLS was right.
  ⚠️ **The harness counted every pending row in the CLUB rather than its own**,
  so it would have gone red on any night a real family was waiting for
  approval — a check whose result depended on the live roster. Now scoped to
  the two profiles it creates.

  ✅ **`rls-availability-equivalence.sql` is REPOINTED, not deleted** (rule 7).
  It was written to compare a policy merge before and after, and the merge
  shipped 9 Aug — so the fault could no longer be injected and it aborted every
  night. The seven-caller matrix it proved is now asserted directly against the
  merged policies that ship today.
  ⚠️ **Repointing it caught three real behaviour changes since 9 Aug**, all
  deliberate and each owned by another migration: a PENDING coach lost access
  when the admin gates began requiring an active membership (18 Aug); a PENDING
  parent GAINED the ability to see their own child's answer (the "app lost my
  answer" fix); and `anon` moved from silently matching nothing to being refused
  by the table grant (14 Aug).
  ⚠️ **AND ITS ORIGINAL SELF-TEST HAD QUIETLY STOPPED WORKING.** It dropped the
  `can_edit_team` arm of `avail read` — load-bearing on 9 Aug, when that
  function ignored status. Since 18 Aug it requires an active membership, so
  every caller it admits is already admitted by `can_see_team`: **the arm is
  redundant today and removing it moves nothing**, meaning the self-test would
  have passed while proving nothing. It now drops `is_own_player` instead,
  which genuinely blinds a parent to their own child's answer.
  ⚠️ **The redundant arm was KEPT.** It costs one boolean and is what stops
  `avail read` drifting if that status test is ever taken back out.

  ✅ **CLOSED 20 Aug 2026 — THE RUNNER RUNS.** This said the set that had never
  met its own runner "keeps growing", and named `db/tests/approval-push.sql`.
  `SUPABASE_DB_URL` was set on **19 Aug 12:50 UTC** and the nightly at
  **20 Aug 04:01 executed 34 harnesses**, approval-push among them, reporting
  "All harnesses passed." The distinction this item was built on — "the harness
  is green" versus "the harness runs" — is now true in both directions.
  ⚠️ **AND IT IMMEDIATELY TAUGHT A THIRD THING, WHICH IS WHY THIS STAYS HERE.**
  approval-push and notice-push passed that 04:01 run **by coincidence**: both
  compared the whole audience's notified devices against one person's, equal
  only while a single person had subscribed. Subscribers went 1 → 8 during the
  day and both would have gone red the next morning, for a change nobody made.
  **A green nightly is evidence about the moment it ran and nothing else.**
  Fixed in `7390a2c`; `claude/runbooks/db-harnesses.md` carries the rule.
  ✅ Before trusting the paste route for DDL, the rollback itself was proved:
  a throwaway `create table` inside `begin`/`rollback` was gone afterwards,
  **with a control confirming the same query could see a table that does
  exist** — otherwise the zero proves only that the query found nothing.

## Real gaps, no cheap fix

- 🟡 **No audit log — NARROWED 17 Aug 2026, NOT CLOSED.** `public.membership_audit`
  now records every grant, change and revoke of a MEMBERSHIP, including
  super-admin, written by a trigger on the row and readable at
  `/admin/rights-log` by super admins only. **⚠️ THAT IS ONE OF THE FOUR THINGS
  THIS ITEM LISTED.** Still unrecorded: **who deleted a player**, and **who edited
  a child's contact details**. `events.created_by`, `availability.updated_by` and
  `attendance.recorded_by` remain single overwritten columns rather than history.
  ⚠️ **DO NOT READ THE NEW SCREEN AS "we have an audit log".** It answers "who
  gave this person access", and nothing else — a deleted player still leaves no
  trace at all, which is the more alarming of the two gaps on a club whose members
  are children.
  ⚠️ **AND IT STARTS AT 17 Aug 2026.** There is no history before that date and
  none can be reconstructed, so an empty log is not evidence that nothing
  happened. The screen says so in its empty state.
- **The whole app is one JavaScript chunk** and every parent downloads all of it.
  ⚠️ Re-measure rather than citing an old figure. Two fixes, biggest first:
  `flag-icons` is imported whole for a phone country picker and is most of the CSS
  plus megabytes of SVG; and route-level `React.lazy` on `AdminDashboard`,
  `MatchSheet`, `PlayerImport` and `Allocation` — the admin half is used by three
  people and shipped to everyone.
  ⚠️ `tests/pwa-build.test.js` and `tests/button-sweep.test.js` READ `dist/`, so run
  `npm run build && npm test`, never `npm test` alone, when touching this.

  ✅ **THE FLAG HALF IS FIXED — 17 Aug 2026. The CSS claim was RIGHT and the
  reason nobody had found was the BUNDLER, not the library.** `flag-icons`
  itself is 28 kB raw / **2.36 kB gzip** — 2.5% of the stylesheet, so anyone who
  measured the package would have concluded this item was wrong and moved on.
  What made it 88.6% of the built CSS was Vite's `build.assetsInlineLimit`
  (4096 bytes by default), which had written **400 of the 542 flag images
  straight into `index.css` as `data:` URIs**. Measured on the same build with
  only that option changed:

  | | before | after |
  |---|---|---|
  | `index.css` | 475.15 kB (gzip **95.74**) | 84.31 kB (gzip **18.37**) |
  | `.fi-` rules | 420,823 of 475,154 chars | unchanged in count, now `url()` refs |
  | flags inlined | 400 | **0** |
  | PWA precache | 1682.76 KiB | **1301.08 KiB** |

  ⚠️ **IT COUNTED TWICE, WHICH IS WHY IT BEAT THE JS SPLIT.** The stylesheet is
  render-blocking AND precached, so ~77 kB gzip of other countries' flags was
  downloaded before first paint and again into every install — for a component
  that draws ONE flag, on the registration and profile forms only.
  ⚠️ **AND `PhoneInput`'s OWN HEADER ALREADY CLAIMED THE FIXED BEHAVIOUR** —
  "because they are CSS background images the browser only fetches the handful
  actually painted". True of flag-icons and defeated underneath it. **A design
  rationale can be correct about the library and wrong about the build.**
  ⚠️ **THE WORKBOX `globIgnores` AIMED AT THIS AND MATCHES NOTHING** — see the
  note now in `vite.config.js`. Deleting all three patterns produces an
  identical precache. It guarded a door the flags never used.

  ✅ ~~**THE `React.lazy` HALF IS MEASURED BUT NOT TAKEN.**~~ — **EXAMINED IN
  FULL AND CLOSED, 18 Aug 2026. Jay's call.
  `claude/decisions/2026-08-18-no-route-level-code-splitting.md` is the ruling;
  read it before re-proposing this.** Built as a spike, measured three ways,
  reverted — nothing was committed to `src/`.

  ⚠️ **THE SAVING WAS BIGGER THAN THE FIGURE THIS ITEM CARRIED, NOT SMALLER.**
  The −27.26 kB above covered the `/admin` screens only; splitting the coach
  screens (`Lineup`, `GameTime`, `MatchSheet`, `Accounts`) as well measured
  **283.51 → 244.08 kB gzip, −39.43**. It was not refused for being too small.

  ⚠️ **IT WAS REFUSED BECAUSE THE BEST ARGUMENT FOR IT IS FALSE, AND THAT IS
  THE PART WORTH KEEPING.** The case was that splitting makes every DEPLOY
  cheaper for members — one chunk today means one edited screen re-downloads
  the whole app. **Tested: one rendered string changed in `Allocation.jsx` moved
  EVERY chunk hash, all twenty.** Lazy chunks import their shared code from the
  entry chunk, so a leaf change bumps the entry, and the entry bump rewrites
  every sibling's import. **Deploys cost members exactly what they cost today.**
  Fixing that needs a `manualChunks` vendor split, which is its own piece of work.

  ⚠️ **THE PRECACHE NOTE ABOVE WAS RIGHT AND IS NOW MEASURED FURTHER**: splitting
  alone takes the install 1301.07 → 1305.66 KiB, i.e. **larger**. Leaving the
  desktop-only admin chunks out via `globIgnores` gets it to **1228.44 KiB
  (−72.63)**, and taking `Accounts` with them to 1194.26 KiB — **recommended
  against**, because `/approvals` renders `Accounts` and that is a coach on a
  phone at a pitch. A chunk left out of the precache has no offline story at all;
  `runtimeCaching` covers Supabase REST GETs, not JavaScript.

  ⚠️ **AND THE MEASUREMENT READ FALSE TWICE BEFORE IT READ TRUE.** A comment
  added to a screen rebuilt byte-identically (the minifier strips it), and so did
  an exported `const` nobody imports (Rollup tree-shakes it). Both said "one edit
  changes nothing", the opposite of the truth. **Only an edit to a rendered
  string moves a hash** — confirm the marker is present in `dist/` before
  trusting any before/after bundle comparison.
- **The calendar token is an unrevocable, non-expiring credential in a URL**, and
  nobody can see if one has leaked. ⛔ **Do not add an expiry** — a feed that dies on
  a timer produces a club-wide "my calendar stopped working" with no way to warn
  anyone. The cheap fix is visibility: `last_used_at`, shown on the subscribe screen,
  plus an admin-side reset.
- ✅ ~~**`saveParents` is delete-then-write**, so a failure between the two loses a child's
  parent records. ⚠️ Not the same as the deliberate two-call split for player
  contacts, where a partial failure surfaces distinctly; here it surfaces as missing
  data.~~ — **FIXED 18 Aug 2026.**
  `db/migrations/20260818_save_player_parents_atomically.sql`,
  `db/tests/save-player-parents.sql`, and the client half in `src/data/parents.js`.
  `public.save_player_parents` does the delete, the updates and the inserts in one
  statement, so a child's list either ends up exactly as submitted or is untouched.

  ⚠️ **THE LINE ABOVE OVERSTATED IT, AND THE OVERSTATEMENT IS WORTH KEEPING.**
  "Loses a child's parent records" is not what usually happened. The DELETE only
  removed rows NOT in the submitted set, so **a plain edit was always safe** —
  every kept row carries an id and nothing was deleted. The damage needed a row
  to be **removed in the same sitting**: then the removal applied, the edits did
  not, and **the screen said the save had failed.** The record left behind was
  one nobody chose, and the user had been told it did not exist.
  **An overstated finding is one the next person disproves in five minutes and
  then stops trusting the file.** The honest version is narrower and still worth
  fixing.

  ✅ **Measured on production in a rolled-back transaction**: replaying the old
  delete-then-write sequence left **1 of 2 rows**. That replay is kept as the
  harness's self-test, because "the row count did not change" is an assertion
  that would pass against a table nothing ever touches.
  ⚠️ **AND IT COULD NOT BE MODELLED WITH AN EXCEPTION BLOCK ROUND BOTH HALVES** —
  `begin … exception` opens a SUBTRANSACTION, which rolls the DELETE back too and
  makes the old code look atomic. It never was: the DELETE and the UPDATE were
  separate PostgREST requests, so the first COMMITTED before the second was sent.
  The harness leaves the DELETE outside any handler and fails only the step after
  it.

  ⚠️ **THE `PlayerForm` PREFILL GUARD IS STILL LOAD-BEARING.** A failed parent
  read sets `parentsStatus` to 'error' and the submit handler skips the parent
  write entirely. That stops an EMPTY editor being saved over rows that were
  never loaded — a correct-but-unwanted write rather than a failed one, which no
  amount of atomicity helps with. **Do not delete it as redundant.**

  ⚠️ **THE FUNCTION IS `SECURITY INVOKER`**, so the two existing policies on
  `player_parents` still decide who may write and this added no authorisation
  surface. Proved in the harness by a coach of another squad being refused.
  **If anyone ever makes it `SECURITY DEFINER`, it needs a guard the same
  minute.**
- **`social_ideas` uploads the image BEFORE inserting the row**, so a failed insert
  orphans an object that appears on no screen and nothing sweeps.
- **`supabase_migrations.schema_migrations` is polluted** — many stale rows, a dozen
  of one name. ⚠️ **Supabase branching replays that history, so branching does not
  work on this project** (tried 13 Aug, `MIGRATIONS_FAILED`, zero tables). Cleaning it
  is a prerequisite for having any staging environment. **Use a rolled-back
  transaction on production instead** — the house style for `db/tests/*.sql`.

## Shipped but never exercised by a real person

- **The match sheet** — no coach has filled one in during a real match.
  ⚠️ **BUT IT HAS NOW HAD ITS FIRST REAL ENCOUNTER, AND THAT CHANGES WHAT THIS
  ITEM MEANS.** Jay opened it on a phone and shared one on 16 Aug 2026. Three
  bugs fell out, all fixed and live in `d576bb1`: the facsimile collapsed at
  phone width and the share photographed the collapse, the away TRIES had no
  box, and the 22 never populated from the lineup. **So this is no longer
  "untouched by reality" — the KNOWN bugs are gone, and what is left is the
  half nobody can test from a desk**: a coach filling one in for a real match,
  and the picture arriving at RCM — the same open question already recorded
  against the lineup image, and for the same reason: both go through
  `src/lib/shareImage.js`, and no query can see a WhatsApp group.
- **The scoring model** — no coach has entered a real score.
- **Staff photos** — nobody has uploaded one in the real app.
- **The photo backup restores** — copying is not restoring, and nobody has ever got a
  photograph back. ⛔ **Tabled by Jay.**
- **Realtime's safety half** — nobody has watched a non-admin *fail* to receive a
  change for a squad they are not in. ⚠️ **That test must be an EDIT, never a DELETE**:
  Supabase does not apply RLS to delete events, so a deleted fixture reaches every
  subscriber regardless of squad and would read as a leak that is not one.
  ⚠️ **The thundering herd is real now that realtime works** — every subscriber in
  scope refetches on any change. Nothing at today's size; the least-tested thing in
  the app at the 1500 members Jay expects, and SQL cannot measure it.
- **`/notices` has no real-browser coverage.** `harness/` carries only the pure
  `NoticeBoard` card, so the composer and the receipts sheet cannot be reached there.
- **`attendance` is empty.** Anything computed from it — a percentage, consecutive
  absences, an "at risk" flag — has no data to stand on and no way to have its
  thresholds judged. Take some registers first.

## Deferred by Jay, still deferred

- **The `group_id` multi-squad edit/cancel.** A series can be edited; a group cannot.
  Reaching across squads has a different blast radius, because there RLS makes the
  write genuinely partial rather than all-or-nothing.
- **Test data cleanup.**

## Supabase security advisor — read through, not yet actioned

Run `get_advisors` rather than trusting this list. As of 14 Aug 2026:

- ✅ **Leaked-password protection no longer appears** — Jay turned it on. Recorded
  because the evidence is the ABSENCE of a lint, which this repo has misread
  before; confirm on the dashboard if it ever matters.
- ✅ **`private.events_result_from_components` is pinned**
  (`20260814_pin_scoring_trigger_search_path.sql`), and
  `db/tests/search-path.sql` now guards the whole schema.
- ⛔ **`private.squad_expects_gender` stays unpinned deliberately.** Do not
  "finish the job" — the reasoning is in `db/schema/functions.sql` and the
  harness names it as an exemption rather than counting.
- ✅ **The two lint types newer than the 13 Aug audit were READ THROUGH IN FULL
  on 24 Aug 2026, and there were no findings.** What was measured, in the
  database rather than in the advisor's prose:
  - **`anon` + `public` schema:** exactly ONE `SECURITY DEFINER` function is
    executable — `calendar_events_for_token`, deliberate and asserted both
    directions by `db/tests/grants.sql` §3b. The advisor's `anon` lint lists
    only it. Nothing else.
  - **`authenticated` + `public` schema:** every listed function is the app's
    own RPC API, and each is expected to SELF-GATE because SECURITY DEFINER
    bypasses RLS. The risky ones were read in source, not assumed:
    `set_admin_rights` gates on `is_super_admin` and raises;
    `welfare_overview`, `approval_recipients`, `announcement_stats`,
    `storage_usage`, `publish_training`, `clear_channel` gate on `is_admin`
    variants; `message_read_stats` filters on `private.can_edit_team` **as a
    WHERE predicate** (a keyword probe for `raise` misses it — it refuses by
    returning nothing); `pitch_occupancy` requires an active staff/admin
    membership and redacts by column selection; `set_staff_photo` gates on
    `may_set_staff_photo` plus path ownership.
  - **`private` schema:** many helpers carry the Postgres-default PUBLIC
    execute bit, including for `anon` — and it is UNREACHABLE: `anon` has **no
    USAGE on the `private` schema** (measured:
    `has_schema_privilege('anon','private','usage')` = false), and PostgREST
    does not expose the schema. `authenticated` keeps USAGE because RLS
    policies call these helpers as the querying role. Tidiness option, not a
    gap: new `private` functions could revoke default execute, but nothing is
    open through it today.
  - The three `rls_enabled_no_policy` INFO lints (`availability_nudges`,
    `photo_orphan_scans`, `signup_nudges`) are RLS-on with zero policies —
    **deny-all to client roles**, which is correct for service-role-only
    tables.
  ⚠️ **THIS LINE ITSELF CARRIED THE STALE CLAIM UNTIL 18 Aug 2026** — it named
  `register_my_player` as deliberate too, on the same evidence (an explicit
  re-grant in two migrations) that `claude/open-items.md`'s "Cheap" section had
  already, elsewhere in this same file, correctly identified as NOT a decision.
  Two sections of one file disagreed about one grant for five days. Revoked;
  see the "Cheap" section entry for the full account.

## Shipped but never seen against real data

⚠️ **These are not known-broken. They are known-UNVERIFIED**, which is a
different claim and the one this repo has confused before. Each shipped with a
green suite and has never been exercised by a human on the live site.

- ✅ ~~**Push notifications have never been received by a real browser.**~~ —
  **RECEIVED, 23 Aug 2026, on a real iPhone that is not Jay's.** A notice and a
  U13 Mixed fixture change, posted by Jay from another device, both arrived on
  the lock screen of the club iPhone signed in as a parent of that squad;
  `push-send` logged two POST 200s at 07:26 and 07:27 UTC. The ONE thing the
  server-side smoke tests could not prove is now proven — **on iPhone AND
  Android.** The Android test followed at 07:48 UTC the same morning: Chrome
  on Jay's Android, signed in as a parent-only account on U13 Mixed, a
  fixture change by Jay's main account from his laptop, banner in the shade.
  Two more `push-send` POST 200s. (The club's one earlier FCM subscription,
  from 20 Aug, was already dead and was deleted by `push-send` during the
  first notice — Google answered 404/410 — which is the self-cleaning
  behaviour working as designed.)
  ⚠️ **The first attempt found a bug before it could test anything**: the
  second person to sign in on that phone could not turn notifications on —
  `db/migrations/20260823_push_subscription_takeover.sql`, fixed and deployed
  the same morning. The rest of this item is kept for what it records about
  the smoke tests. Built and
  deployed 18 Aug 2026 — `claude/plans/2026-08-18-push-notifications.md`. Every
  server-side piece was smoke-tested LIVE against production: a real trigger
  fire, a real Vault-stored VAPID key, a real signed JWT, real RFC 8291
  encryption, a real HTTP POST, a real 410 cleaning up its own subscription
  row. **None of that proves a real browser can decrypt and show one** — the
  one thing only an actual person, subscribing from an installed PWA, can
  close. The first real test is a member turning the toggle on in
  More → Notifications and getting a reply on a report.
  ⚠️ **On iPhone this needs the app added to the Home Screen first** (iOS
  16.4+) — the UI says so, but nobody has confirmed that message reads clearly
  to somebody who has never done it.

- **The staff-request queue has never been seen with a real row in it.** Built
  17 Aug 2026 after Jay found a coach's request rendered as "Unnamed player".
  ⚠️ **AND IT CANNOT BE SEEN TODAY**: production has **zero** pending
  memberships — the one real staff request was approved by Jay, deliberately,
  at 11:16 UTC that morning. So the section is correct-by-test and unseen by
  anyone, and it renders only when non-empty, meaning the live site shows
  exactly what it showed before. **The first real look at it will be the next
  person who asks to help with a squad.**
  ⚠️ Its vouching controls are also unexercised — `membership_vouches` is empty.
- **The tier-eligibility warning has never had anything to render.** It was
  verified present in the live bundle on the day it shipped, which proves the code
  deployed and proves nothing else. **Measured on production 17 Aug 2026: the club
  has 1 fixture carrying a tier and 4 graded players, and the two do not overlap.**
  Seven children are picked on that fixture and **none of them is graded at all**,
  so there is no row in the database on which the sentence could appear.
  ✅ **THAT ZERO IS A FACT ABOUT THE CLUB, NOT A BROKEN QUERY** — the control was
  run: all 4 grades join to real players, and **all 4 graded children ARE picked in
  lineups**, just in the two lineups whose fixtures carry no tier. So both halves of
  the feature are in live use and have simply never met.
  ⚠️ **SO ITS SILENCE ON THE LIVE SITE IS NOT EVIDENCE THAT IT WORKS.** A coach
  opening that lineup today sees exactly what they would see if the feature had
  never been built — which is also the state a broken read would produce, since the
  screen is deliberately built to fall silent rather than fail. **The first real
  test is a graded child picked for a tiered fixture**, and nothing has produced
  one yet. Re-run the counts rather than trusting these.
- **The coach roster's nested grouping** (`cf8a221`, `3044872`) — tier, then
  forwards and backs. Every test runs in jsdom against invented squads. Nobody
  has yet opened the real U16B roster and confirmed the headings, the counts, or
  that the constant-column rule hides what it should. **The club-wide view will
  show one "Not graded" heading over everything until more players are graded**;
  that is expected, not a bug.
  ⚠️ **THE "TIDY FIX" THIS ITEM PROPOSED IS NOW HALF-DONE, BY A DIFFERENT ROUTE.**
  It suggested defaulting to tier grouping only when the roster is filtered to a
  single squad. What shipped on 15 Aug (`de82481`) instead drops tier and
  forwards/backs entirely when every squad in view is **U10 or below**, because
  those squads have no grades and no positions to group by — `src/lib/minis.js`.
  A club-wide view, or any view containing one U11+ squad, still defaults to tier
  and still shows the single "Not graded" heading. **So the complaint this item
  records is unchanged for the squads it was actually about.**
- **The all-day calendar entry has never reached a phone.**
- ✅ ~~**THREE FEATURES SHIPPED TO PRODUCTION ON 15 Aug AND NONE HAS BEEN LOOKED
  AT.**~~ — **Jay opened the live site on a phone at the end of that day, after
  eight deploys, and reported no problems.** That closes the biggest unknown of
  the day: sign-in and tab navigation work under react-router 7, which was the
  one failure nobody could have detected from here.
  ⚠️ **BE PRECISE ABOUT WHAT "it's fine" ESTABLISHES.** It is one person, on one
  device, looking — not a per-item verification, and not a check against a real
  photograph or a large squad. What it rules out is the class of failure that
  would have been obvious: a blank screen, a broken route, a page that lurches.
  It does not rule out a wrong colour on a state edge nobody happened to look
  at, or a tile that only misbehaves at a size his own squads do not have.
  ⚠️ **THE ITEMS BELOW ARE STILL UNVERIFIED IN THE NARROW SENSE THEY DESCRIBE**,
  and are kept for that reason rather than deleted. In particular the contact
  tiles have STILL never been drawn with a real photograph — two of fifteen
  staff have one, and neither sits on a squad that was opened.
  The original entry, kept because the reasoning outlives the verdict:
  The Home redesign (`d5b8667`), the minis simplification (`de82481`) and the
  squad-contact tiles (`03de5ca`). ⚠️ **Every visual claim made about them was
  measured in the harness against INVENTED data**, which is the right tool and is
  not the same as having seen them. The specific things a browser cannot settle:
  - **The contact tiles have never been drawn with a real photograph.** The
    harness stands one in with a 1×1 pink PNG stretched by `object-cover`, so
    the scrim's whole job — holding white text legible over an unknown image —
    is untested against an actual face. Two staff have photos; thirteen do not.
    ✅ **THIS ONE PAID OUT ON 15 Aug 2026, AND IT IS THE BEST ARGUMENT IN THIS
    FILE FOR KEEPING SUCH ITEMS.** The first real photograph put on a real tile
    exposed a bug no harness could have: the photo positioner did not position
    anything. `SquadStaffCard` had no `object-position`, so `object-cover`
    centred every crop and the lead tile cut the top off a head. A 1×1 PNG has
    no top of a head to cut off — **the fixture was incapable of failing.**
    ⚠️ **The scrim half of this item is still unverified** and the entry stays
    for it.
  - **Almost every squad will render an even grid, not the featured tile**,
    because the lead is chosen by title and only two people are titled "Head
    Coach". That is the design working, and it will look like the feature is
    missing. Setting titles on `/admin/staff` is the lever.
  - **The collapse only appears for a parent attached to more than one squad**,
    which is two of the club's twelve.
  - **The skeleton holds the first screenful and the page still grows below it.**
    Measured at 390×844: the loading block goes from 110px to 942px, against a
    loaded page of about 1,800. The honest claim is "nothing above the fold
    moves", and whether that is enough is a question only a phone can answer.
- **`src/lib/shareImage.js` revokes its blob URL on the line after `link.click()`,
  and never puts the anchor in the document.** DESKTOP DOWNLOAD PATH ONLY — the
  phone takes the `navigator.canShare({files})` branch above it and never reaches
  this code, so it cannot be behind any share problem reported from a phone.
  Chrome tolerates both (the download starts synchronously inside `click()`);
  Firefox has historically required the anchor to be IN the DOM, and an immediate
  revoke is a documented race elsewhere.
  ⚠️ **NOT FIXED, AND DELIBERATELY SO: IT HAS NEVER BEEN SEEN TO FAIL.** Noticed
  16 Aug 2026 only because instrumenting the share to measure the PNG's size
  revoked the URL before an async reader could load it — which is a fact about
  the instrument, not evidence about Firefox. Fixing shared code on a hunch is
  how a working path acquires a regression. **The trigger is somebody reporting
  that Share does nothing on a desktop browser**; the fix is two lines
  (`document.body.append(link)` … `link.remove()`, and revoke on a later tick).
- **The lineup image has never been seen to reach a WhatsApp group.** Rows exist
  in `lineups` and `lineup_players` — measured 15 Aug 2026, so a team HAS been
  picked and saved against production — but the image is the actual deliverable
  and no query can tell you whether one arrived. Moved here from
  `claude/plans/2026-08-14-match-lineups.md`, whose status header had claimed the
  whole feature was unmerged for two pull requests after it went live.
- **The RCM match sheet, the register and the noticeboard have no rows at all.**
  All three shipped and all three are empty, so every screen that reads them has
  only ever been seen in its empty state on the live site. ⚠️ **Empty is the
  CORRECT state for a club three days into onboarding — this is a note, not a
  fault.** Run the query in `claude/state-of-play.md` rather than trusting this
  sentence.
- **Nothing is graded and no player has two positions** beyond what Jay entered
  by hand while testing, so neither the tier column nor the position chips have
  been seen on a realistic roster.

## Not built, and deliberately so

- ✅ ~~**Nothing compares a player's grade against a fixture's tier.** Both exist —
  `player_grades.tier` and `events.tier` — and an eligibility warning in the
  lineup picker ("graded C, this is an A-tier fixture") was offered and not
  taken up. Recorded so the next session knows the data is already there and the
  absence is a choice, not an oversight.~~ — **BUILT AND LIVE, 17 Aug 2026**
  (`ae98b8f`). `src/lib/tierEligibility.js`, rendered by `src/screens/Lineup.jsx`,
  spec at `claude/plans/2026-08-17-lineup-eligibility-warning.md`. Jay took it up
  the day after this line recorded that he had not.
  ⚠️ **THIS FILE WAS THE SECOND PLACE THAT STALE CLAIM SURVIVED, AND IT OUTLIVED
  THE FIRST BY A COMMIT.** `2ac2782` corrected
  `claude/plans/2026-08-14-tiers-and-game-time.md` for saying the same feature was
  unbuilt; this line said it too, in different words, and was not looked for.
  **The reason generalises: a "deliberately not built" note is a STATUS claim
  wearing a RULING's clothes.** Everything around it in this file is a finding that
  stays true until someone acts on it, so nothing about the wording suggests it
  needs re-reading the moment the thing ships. **When a decision to not build
  something is reversed, grep for the feature, not for the plan that named it.**
  The section is kept rather than emptied, per this file's rule at the top.

## Unexplained

- **One phantom test failure in `tests/notice-board.test.jsx`** does not fit the
  timeout mechanism fixed on 14 Aug — the file is synchronous and runs in ~160ms. It
  was never reproduced and its message was never recorded. **If a phantom failure
  appears again, capture the MESSAGE, not the file name.**

- 🆕 **THE MESSAGE, CAPTURED — 17 Aug 2026.** A full `npm test` reports
  **unhandled errors** that fail no test and appear in no single-file run:

  ```
  Serialized Error: { code: 'ERR_INVALID_ARG_TYPE' }
  ❯ node_modules/undici/lib/web/fetch/index.js:1119:19
  ❯ processTicksAndRejections node:internal/process/task_queues:104:5
  originated in "tests/dashboard-availability.test.jsx" / "tests/dashboard.test.jsx"
  ```

  ⚠️ **IT IS NOT THE FILE IT NAMES, AND THE COUNT MOVES BETWEEN RUNS** — two
  errors on one run, three on the next, naming a different pair. Vitest says so
  itself: the error is thrown *while* that file is running, not by it.
  ⚠️ **PRE-EXISTING, AND THAT WAS MEASURED RATHER THAN ASSUMED.** The audit that
  found it ran the full suite on its own branch (3 errors) and again with its
  changes stashed (2 errors), so it is not attributable to the flag or
  dead-code work. `tests/dashboard-availability.test.jsx` alone: **2 passed, 0
  errors.**
  ⚠️ **IT IS AN UNHANDLED REJECTION IN `undici`'s FETCH, ESCAPING A TEST THAT
  HAS ALREADY FINISHED** — the shape of a component firing a real request during
  teardown because a mock did not cover a path. **The suite is green and this is
  not a failure; it is an un-awaited promise nobody owns**, and the next person
  to chase it should look for a fetch that outlives its test rather than at
  either file's assertions.
