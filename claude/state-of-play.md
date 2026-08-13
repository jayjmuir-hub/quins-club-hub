# State of play

**Entry point per `CLAUDE.md` step 3.** Where things STAND. `RESTORE.md` is what is
TRUE about the codebase. **If this file and `RESTORE.md` disagree, `RESTORE.md` and
the code win and this file is stale.**

*Rewritten 10 Aug 2026. It had reached 591 lines by accretion — every correction
appended in place, so a third of it was the history of its own wrongness.*

## ⚠️ How to read this file

Its own audit found the pattern, and this edition is organised around it:

> **Every wrong claim in this file's history was a rotted MEASUREMENT. Never a
> wrong ruling.** Counts, row totals and "there is exactly one X" decayed within
> days; the reasoning never did.

So: **§Rulings and traps is durable — trust it.** §Where things stand is dated and
rots — check it. **No number is quoted anywhere that a query can produce**; the
queries are in §Numbers. If you find yourself citing a figure from this file,
you are using it wrong.

Detail lives elsewhere and is not repeated here: `claude/changelog.md` indexes every
shipped change, `claude/handoffs/` records sessions, `claude/decisions/` holds the
rulings in full, `claude/schema-history.md` the reasoning behind each migration.

## Where things stand

**v1 MVP live at `https://adhquins-clubhub.com`** (Let's Encrypt, expires 3 Nov
2026). ⚠️ **The canonical origin is hard-coded** as `CALENDAR_ORIGIN` in
`src/data/calendar.js`, and a subscribed calendar URL cannot be changed remotely
once a parent holds one.

✅ **`app.adhjrt.com` IS RETIRED — 12 Aug 2026, and it no longer resolves.**
It was the app's original address, kept as a working alias from 5 Aug so that
Jay's PWA install and anything already shared kept working. Retired because
nobody but Jay uses the app, so the blast radius was one home-screen icon and
would only ever grow. Removed in three places — the Supabase redirect
allow-list, the Netlify domain alias, and the DNS record that went with it —
and verified NXDOMAIN against `8.8.8.8` with the `adhjrt.com` zone itself as a
live control. Reasoning:
`claude/decisions/2026-08-12-retire-app-alias.md`.

**Only Jay uses the app.** No parent or coach has been onboarded. That makes almost
any change cheap right now, and it will not stay that way.

Current phase is post-v1 refinement driven by Jay using the app — not new
infrastructure.

### As of 10 Aug 2026

- **`main` is protected.** No direct push, no force-push, no deletion. `test` and
  `docs-check` must pass before merge. Branches self-delete on merge; squash is the
  only merge method. Owner bypass is ON deliberately — the guard is against
  accidents, not decisions.
- **The unit suite runs in CI** (`.github/workflows/test.yml`). Until today it ran
  nowhere but a laptop while `main` deployed on push.
- **`build/v1-mvp` and the five stale `feat/*` branches are deleted.** `main` is the
  only branch. ⚠️ **The rollback is republishing an earlier deploy from Netlify's
  deploy list**, never a branch — that is why `build/v1-mvp` was safe to remove.
- **The three senior squads are deleted.** All youth now. ⚠️ **Consequence:**
  `register_my_player` picks 'player' or 'parent' from `teams.is_senior`, so with no
  senior squad every self-registration creates a parent. Dormant, not broken.
- **`db/schema/` reconciled against live — zero drift.** Policies, function bodies,
  function security settings, triggers, constraints, indexes, RLS state and the
  bucket settings all matched. `public.accept_invite` still carries its
  incomplete-invite guard.
  ❌ **AND IT STOPPED BEING TRUE LATER THE SAME DAY — see 11 Aug below.**
  `super_admin_and_rights` was applied after this reconciliation ran. **This line
  is left standing as a dated measurement, which is all it ever was**; it was
  quoted as current state for two days, and that is the failure, not the line.
- **The masthead stopped truncating** (it rendered "ABU…" at the `desktop`
  breakpoint on every screen) and the **dashboard hero stopped repeating itself**.
  ⚠️ Structural, not a width: every other item in that row is `shrink-0`, so the
  wordmark absorbs all overflow. The name is painted only at `wide`.

### As of 11 Aug 2026

A single long session, all of it shipped to `main` and live. **Nothing below is
half-built** — where something is missing it says so.

- **The whole pitch stack landed**: `public.pitches` (the club's real fifteen), clash
  detection, the setup screen, the allocation grid, the request loop, and the email.
  Detail is in §Rulings under the pitch entry — it is long because Jay ruled on most
  of it.
- **The super-admin tier and per-admin rights are live**, with Jay's two accounts as
  the only supers.
- **`private.can_edit_team` now checks membership STATUS.** It did not, so a PENDING
  staff member could edit their squad's events. Harness:
  `db/tests/rls-can-edit-team-status.sql`.
- **A series can be edited, not only cancelled**, via `set_series_time_from` — the one
  `SECURITY INVOKER` function in the schema, deliberately.
- **Admin event reads are paged** (`fetchAllPages`, `MAX_TOTAL_ROWS = 5000`) and the
  schedule uses a rolling window (`src/lib/eventWindow.js`, 12 months back, 6
  forward). PostgREST's `db-max-rows` is 1000, so an unbounded read was silently
  truncating rather than failing.
- **Buttons all route through `<Button>`**, and phone overflow was fixed for real —
  `harness/check-overflow.mjs` is the gate.

⚠️ **`bfcb571` is not yet in `claude/changelog.md`, and that is correct.**
`docs-check` allows the changelog to be exactly one commit behind, because a commit
cannot cite its own SHA. **The NEXT PR must add it.** This is not a nicety: the check
went red on PR #37 for exactly this reason, having been skipped once already on #36.
✅ **Done in `cc49604`.** The same rule now applies to `5979c21`.

- ✅ **A U13+ PLAYER CAN REGISTER THEMSELVES** (`5979c21`). "Add your player" asks
  *is this you, or your child?* for squads that permit it, and the membership role
  becomes `player` instead of `parent`. ⚠️ **The permission is a COLUMN
  (`teams.self_registration_allowed`), never the squad's name** — the same rule
  `is_senior` exists for, so that renaming a squad cannot hand an account a role it
  should not have. ⚠️ **The database refuses it, not just the form**: errcode
  `0A000`, deliberately absent from the map in `src/data/members.js` so the sentence
  naming the squad reaches the person. ⚠️ **The 3-arg `register_my_player` is
  DROPPED** — Postgres prefers an exact arity match, so leaving it would have left
  every client resolving to a function with no self-registration support and nothing
  failing to say so. ⚠️ **The role is cosmetic** — no policy distinguishes `parent`
  from `player` — which is what made this safe; if that changes, this is the line
  that was relied on.
- ⚠️ **`db/schema/` HAD DRIFTED FOR TWO DAYS AND IS NOW RE-CAPTURED.** Seven objects
  were live with no entry in the directory at all: `private.is_super_admin`,
  `public.set_admin_rights`, the `memb no self promotion` policy,
  `memberships.is_super` / `.admin_rights`, `private.notify_pitch_request`, its two
  triggers, and `teams.self_registration_allowed`. Detail and the reasoning are in
  `db/schema/README.md`; three items are worth carrying here because they change how
  you READ that directory:
  ⚠️ **`policies.sql` said "Every policy is PERMISSIVE" and that had inverted** —
  `memb no self promotion` is RESTRICTIVE, the only one in the schema, and a
  restrictive policy takes rows away rather than adding them.
  ⚠️ **Its RLS-enabled list stopped at thirteen tables while live had sixteen.** All
  sixteen do have RLS on. But that list is the only thing in the repo that would show
  a table created WITHOUT it, and Supabase's defaults hand `anon` full rights on any
  new `public` table.
  ⚠️ **The `pitches` and `pitch_requests` blocks were the migrations' DDL pasted in,
  not a capture** — inline unnamed constraints, so neither `pitches_club_id_name_key`
  nor `pitch_requests_status_check` existed as a string in the repo and a drop or
  rename would have diffed to nothing. **Pasting the migration produces a file that
  looks complete.**

### As of 12 Aug 2026

⚠️ **BACKFILL, 12 Aug: the four entries immediately below were MISSING FROM THIS FILE
ENTIRELY** while §Open said one of them had never been started. They shipped on 11-12
Aug across PRs #51-#60 and only `claude/changelog.md` recorded them. **This file is
step 3 of the reading order — a feature absent from it is a feature the next session
will propose building.**

- ✅ **LEAGUE TEAMS AND FIXTURES ARE LIVE** (`725d0e6`, `ee85430`, `102fa48`,
  `18e4e12` — PRs #51-#56). A squad fields more than one side in a competition, so a
  league team is its own object with an `rcm_name` and a division, managed from the
  Club tab. ⚠️ **The name is unique per SQUAD, not per club** (`102fa48`) — two age
  groups may both run an "ADHQ2". ⚠️ **Competition is a CHOICE — League or Tournament —
  not free text** (`18e4e12`). Plan:
  `claude/plans/2026-08-11-league-teams-and-fixtures.md` and its implementation half.
- ✅ **THE RCM OFFICIAL MATCH RESULT SHEET IS LIVE, AND SO IS THE CLUB YOUTH MANAGER
  PORTAL** (`3c64990`, PR #57). Three tables, the editor at `/match-sheet/:eventId`,
  and the manager's list at `/admin/youth` behind the `youth` right — which had existed
  in `ADMIN_RIGHTS` since 10 Aug and granted access to nothing.
  ⚠️ **THE LAYOUT IS A FACSIMILE OF THE REAL FORM**, which Jay supplied mid-build, and
  three things could only have come from the document: the 22 run in **two columns**
  each with its own FR; **FINAL SCORE / TRIES are POSITIONAL — HOME then AWAY, not us
  and them**, so an away fixture puts our score in the right-hand pair while the
  database stores us/them; and **CLUB is the club, HOME TEAM is the LEAGUE
  TEAM**.
  ⚠️ **THE COLUMN THAT LINE ONCE NAMED IS GONE.** It said "the database still stores
  `score_us`", meaning `match_sheets.score_us` — dropped 12 Aug with `score_them`,
  `tries_us` and `tries_them`. **The positional rule is unchanged and is still the
  point**; only the table holding the numbers moved, to `public.events`. See the
  scoring entry below.
  ⚠️ **`complete` MEANS READY TO SEND, NEVER SENT.** Nothing in this app can know
  whether RCM received anything — submission is a human dropping a file into a WhatsApp
  group.
  ⚠️ **`full_name` is stored as TEXT even when `player_id` is set** — the form demands
  the name "as per registration", and a submitted sheet is history that must survive a
  player being renamed or removed. ⚠️ **The old third reason, "the club only has 7
  players", is RETIRED** — Jay ruled on 12 Aug to build for the loaded club. The
  conclusion stands; that justification must not be cited again.
  ⚠️ **Share generates a real PNG** (`html2canvas`, imported lazily) because
  `wa.me/?text=` carries text only. That overturned the plan's "no new dependency"
  line, knowingly.
  ⚠️ **SHIPPED IS NOT EXERCISED: no coach has filled one in during a real match.**
- ✅ **AN EVENT CAN BE DUPLICATED, AND THREE TYPE MARKS MEAN SOMETHING** (`ea0b8ac`,
  PR #59).
- ✅ **THE APP TELLS PEOPLE IT INSTALLS** (`a309092`, PR #60) — a real button on
  Android, instructions elsewhere.

- ✅ **THE THREE CLUB JOBS ARE NAMED AND THE VOLUNTEERS ARE NOT** (`78649aa`).
  **Club Youth Manager**, **Pitch Management**, **Social Media Management** — in the
  app, in code comments, in the decision records and in conversation.
  ⚠️ **Two of the three are not job titles, and that is deliberate**, so five
  sentences were reworded rather than the words changed back. Reverting a label to
  "…Manager" silently un-fixes three screens and both pitch emails.
  ⚠️ **The names survive in `claude/handoffs/`, `claude/plans/` and `db/migrations/`**
  — dated records of a moment. `scripts/docs-check.mjs` exempts exactly those and
  fails a build on a name anywhere else, in code as well as docs.
- ✅ **`/admin` IS A CHOOSER; EACH JOB IS ITS OWN PORTAL** (`78649aa`). Four cards,
  each entering a space with its own tabs. ⚠️ **Every card renders for every admin**;
  not holding the job, or the job having no screen, greys it, and **a grey card is
  not a link in the markup.** ⚠️ **Navigation only — nothing was narrowed.** A portal
  holder is still a full admin. ⚠️ **Only bare `/admin` changed**; every URL under it
  is untouched.
  ~~⚠️ **`Social Media Management` is a grey card saying "No screen yet"**~~
  ✅ **OPENED THE SAME DAY.** Adding its two tabs to `PORTALS` was the only change the
  chooser needed — no edit to `PortalChooser`, which is what that empty `tabs` array
  was for. **Every portal now has at least one screen**, so a test asserts the
  no-tabs rule against a synthetic portal rather than a real one; the rule outlived
  its last real example.
- ✅ **SOCIAL MEDIA MANAGEMENT IS LIVE** — `/admin/social` (what's on) and
  `/admin/social/ideas` (the inbox), plus "Send a post idea" on More for every member.
  ⚠️ **It does NOT touch `player-photos`, and that is a RULING, not an omission.**
  Submitted images live in a second private bucket, `social-ideas`, and were chosen by
  a member for publication. A "pick a squad photo" button is a new conversation.
  ⚠️ **`from_staff` is stamped by a trigger, never sent by the client.**
  ⚠️ **UPDATE is column-granted** to `status`, `decision_note`, `decided_by`,
  `decided_at` — so marking an idea cannot rewrite the submitter's words.
  ⚠️ **Deleting removes the storage object FIRST, the row second.** Storage cannot be
  cleared by SQL (`42501`); row-first orphans the exact image being removed.
  ⚠️ **The consent line on the form is a PROMPT, NOT A CONTROL.** Any member can put an
  image into club storage, it may contain other people's children, and the manager is
  the only gate. A real gate would be a second reviewer or a consent register, and
  neither exists. Reasoning:
  `claude/decisions/2026-08-12-social-media-management.md`.
- ✅ **PITCH MANAGEMENT HAS A FULL CALENDAR — Day, Week and Month** (12 Aug 2026,
  `/admin/allocation`). ⚠️ **IT OPENS ON MONTH, AND THAT SUPERSEDES THE 11 AUG
  "OPENS ON TODAY, IN DAY VIEW" RULING.** The calendar first shipped with Day
  still the landing view and the question was PUT TO JAY rather than answered by
  whoever was typing; he changed it. Still anchored on today — it opens on THIS
  month with today circled.
  ⚠️ **The week starts MONDAY**, because the UAE weekend is Sat–Sun and rugby is
  played on it: a Sunday-start week splits the two days Pitch Management cares
  about across two screens.
  ⚠️ **The month grid pads with REAL neighbouring days, never blanks** — a fixture
  on 1 March in February's last row must still be visible.
  ⚠️ **Clash and waiting-for-a-pitch are marked by SHAPE as well as colour** (filled
  dot vs hollow ring) and spelled out in the aria-label.
  ⚠️ **`src/lib/calendarGrid.js` is tested in a NON-UTC zone** — every bug it can
  have is a time-zone bug, and under a UTC runner they all pass.
- ✅ **AN "App" BUTTON IS IN THE MASTHEAD**, and it means GET the app, not GO to it:
  the Club Hub IS the app, so it opens the install route. ⚠️ **That route was
  previously reachable ONLY from a banner that sets a localStorage flag and never
  renders again** — anyone who tapped "Not now" once had no way back.
  ❌ **ITS GREEN WAS SAMPLED OFF adhjrt.com AND FAILED THE BUILD.** `#3bd070` is the
  **RETIRED** brand green — that site still runs the pre-6-Aug palette — and
  `tests/press-feedback.test.js` exists to catch exactly that. **Do not sample
  colours from adhjrt.com; it is not the source the palette was re-pointed at.**
- ✅ **DESKTOP: THE CONTENT WELL IS 1360px AT `wide`**, up from 1120. A 1440px
  monitor was leaving 320px empty. The masthead and view-as bar move with it or
  they stop lining up with the content beneath.
  ⚠️ **`shadow-card` IS NOW A PAIR** — a 1px contact shadow plus a wide ambient one
  — rather than the prototype's single wide blur. `claude/specs/design-system.md`
  records the divergence rather than being rewritten over it.
  ⚠️ **THE MASTHEAD ROW'S REAL BUFFER IS THE `flex-1` SPACER, AND IT BREAKS AT
  +190px.** Measured 12 Aug by growing a probe until the wordmark truncated. An
  earlier attempt computed "headroom" as the h1's own width minus its natural text
  width — **a number that calculation can only ever return as ~0** — and the account
  first name was deleted on the strength of it before the probe disagreed.

- ✅ **THE SCORING MODEL IS LIVE, ALL FIVE STEPS.** Plan:
  `claude/plans/2026-08-12-scoring-model.md`, now marked SHIPPED. Tries,
  conversions, penalties and drop goals are recorded per side **on the FIXTURE**
  — Jay ruled one score, and `match_sheets.score_us` / `score_them` /
  `tries_us` / `tries_them` are **DROPPED**.
  ⚠️ **AND THE DROP BROKE THE LIVE SITE FOR ABOUT TEN MINUTES, WHICH IS THE
  MOST TRANSFERABLE THING IN THIS ENTRY.** It was applied the moment nothing in
  the BRANCH read those columns — which felt like the plan's "run last" — while
  `main` was still deployed and its bundle still sent all four on every save.
  PostgREST answers a write naming a missing column with **400 / PGRST204**, so
  **Save draft and Submit failed on the live match sheet** while the pull
  request waited. Undone by re-adding them (they were all NULL, so it cost
  nothing) and re-applied once the new bundle was serving.
  ✅ **RESOLVED. The drop is back on, live, and the repo agrees with it.**
  Verified the way this file keeps saying to: **the SERVED BUNDLE first** —
  fetch `/index.html`, read the `/assets/index-*.js` name out of it, fetch that
  and search it — which found all three new strings AND the absence of the old
  `Away final score` box, a control on both sides. Then the columns: all four
  answer `400 / 42703` through PostgREST while `manager_phone` and `id` answer
  200, and the whole new write path (`events`' eight components,
  `teams.scoring_kinds`) resolves against live.
  ⚠️ **THE RULE: A DESTRUCTIVE SCHEMA CHANGE AGAINST A LIVE SPA IS DEPLOY-FIRST,
  DROP-SECOND.** An ADDITIVE one is safe in either order — an old bundle never
  mentions a new column — which is why `manager_phone` going in early was fine
  and this was not. **"Nothing reads it" has to mean nothing anyone is RUNNING,
  not nothing in the repo.**
  ⚠️ **`result_us` / `result_them` ARE DERIVED, BY A TRIGGER, AND THE GUARD IS
  PER SIDE.** A side with no components keeps whatever result it already had.
  That is not defensiveness: fixtures exist whose result was typed by hand before
  components existed, and an unconditional recompute turns a real 22–12 into 0–0
  with no error anywhere. Proved by injecting exactly that fault —
  `db/tests/scoring.sql` carries the injection and it goes red.
  ⚠️ **THE RULES ARE WRITTEN TWICE, ON PURPOSE, AND BOTH COPIES ARE INSIDE THIS
  APP.** `src/lib/scoring.js` and `private.scoring_kinds_for_team` hold the same
  three thresholds (≤11 / 12–13 / ≥14). The alternative was worse: a trigger
  summing every component while the JS ignores the kinds a squad may not score
  means **the form shows one total and the database stores another, and both look
  plausible.** What is copied is three thresholds, not fifteen rows.
  ⚠️ **AN UNKNOWN BAND FAILS OPEN — DELIBERATELY THE OPPOSITE OF
  `allowsOwnContact`, WHICH FAILS CLOSED.** Do not unify them. The harm is
  asymmetric in opposite directions: there it is a twelve-year-old's own phone
  number, here it is a coach who cannot record a drop goal that was kicked.
  ⚠️ **THE CLUB CAN OVERRIDE ANY SQUAD WITHOUT A DEPLOY** — `teams.scoring_kinds`,
  set from the Club tab, **a COLUMN and never the squad's name** (the same rule
  `is_senior` and `self_registration_allowed` carry). NULL means "use the band",
  never "scores nothing", and clearing writes NULL rather than freezing today's
  list in place.
  ⚠️ **THE ENTRY BOXES SIT OUTSIDE THE RCM FACSIMILE, AND THAT IS A RULING, NOT A
  LAYOUT PREFERENCE.** The real form has two boxes per side; drawing four inside
  it would photograph as a form the governing body never issued, and the
  photograph is the whole artefact. The form's FINAL SCORE and TRIES are now
  derived text.
  ⚠️ **`EventForm`'S SCORE BOXES GO READ-ONLY ON A FIXTURE WITH COMPONENTS**, and
  this was a genuine silent bug rather than a nicety: that form does not send the
  components, so the trigger recomputed from the stored ones and overwrote what
  was typed — 30–0 in, 22–12 back, nothing saying why.
  ⚠️ **`getEvent()` EMBEDS `teams.scoring_kinds`, AND THE EMBED IS A COLUMN LIST.**
  Drop that name and nothing breaks — the club's override is silently ignored and
  the coach gets the band default.
  ⚠️ **NO COACH HAS ENTERED A REAL SCORE THIS WAY.** Verified in a real browser
  against stub data and against production SQL; unexercised by a real match.
- ✅ **THE MATCH SHEET FINALLY HAS A REAL-BROWSER SCENARIO** (`match-sheet` in
  `harness/main.jsx`), and it is the widest screen in the app. ⚠️ **Unlike the
  three sheet scenarios, this one is genuinely MEASURED** — MatchSheet is routed,
  not a `Sheet`, so it is in the document's `scrollWidth`. Zero overflow at
  320/360/375/390/414, and **the measurement was proved red first** with a 900px
  probe (611px of overflow at 320) — the same injection that stayed green inside
  a `Sheet`. ⚠️ **`npm run check:overflow` was NOT run**: Playwright is still not
  a dependency and is not installed on jay-pc, so this was driven in Chromium by
  hand.
- ✅ **`notify-pitch-request` WAS REDEPLOYED** (version 3) so the pitch emails match
  the new wording. ⚠️ **An edge function is NOT part of the Netlify build** — merging
  the app changes nothing about the mail. Verified live: the endpoint returns its own
  `unauthorised` body to a wrong secret, which is what proves the request reached the
  function rather than being bounced by a JWT gate.
- ⚠️ **THE SERVICE WORKER SERVED THE OLD APP FOR MINUTES AFTER A GREEN DEPLOY, and it
  looked exactly like a failed release.** `/admin` still redirected to Accounts and
  still drew the old tab row while Netlify said `main@78649aa` Published. **Check the
  SERVED BUNDLE, not the browser**: fetch `/index.html`, read the `/assets/index-*.js`
  name out of it, fetch that and search it for a string only the new build has. That
  is independent of every cache and it is the check that settled it.

### As of 13 Aug 2026

- ✅ **SUPABASE IS ON PRO AND RESEND IS ON PRO — Jay bought both, 13 Aug 2026.**
  Measured, not reported: `get_organization` returns `plan: "pro"` for
  `vfjhsondxhnkijckovzt`. **What that changed by itself, with no action from
  anyone:** daily backups with 7-day retention now exist; the project no longer
  **pauses after 7 days idle**; storage went 1 GB → 100 GB; Supabase log retention
  went 1 day → 7 days.
  ⚠️ **PRO GAVE A BACKUP MECHANISM AND NOT A RESTORE. Nobody has restored one, so
  nothing is yet known to be recoverable** — the same distinction this file draws
  everywhere else between a thing existing and a thing being measured. The drill is
  `claude/runbooks/backup-restore-drill.md` and it is **NOT DONE**.
  ⚠️ **PITR IS A FURTHER PAID ADD-ON AND WAS DELIBERATELY NOT BOUGHT.** At 14 MB
  the worst case daily backups lose is one day of availability edits. Do not
  propose it again without a new reason.
  ❌ **BRANCHING IS AVAILABLE AND DOES NOT WORK ON THIS PROJECT. TRIED 13 Aug 2026,
  STATUS `MIGRATIONS_FAILED`, ZERO TABLES IN `public`.** This was written as "now
  available and unused — the fix for every-migration-is-a-live-experiment" and that
  lasted about ten minutes.
  ⚠️ **WHY, AND IT IS A CONSEQUENCE THIS REPO ALREADY PREDICTED IN ANOTHER
  CONTEXT.** A branch replays the parent's migration HISTORY into a fresh database.
  Measured the same day: `supabase_migrations.schema_migrations` holds **89 rows, 12
  of them named `accept_invite_multi_target`** — the stale rows `RESTORE.md` records
  as *"all stale and each one reverts the function if re-run"*. The history is not
  replayable, so the feature that depends on replaying it cannot work.
  ⚠️ **THE TWO FACTS WERE BOTH ALREADY WRITTEN DOWN AND NOBODY HAD PUT THEM
  TOGETHER**: "the migration table is polluted" and "branching replays migrations".
  The cost of the gap was one failed branch and about a tenth of a cent.
  ⚠️ **SO M10 — "no staging" — IS NOT FIXED BY PRO, AND IS WORSE THAN THE AUDIT
  SAID.** Cleaning `schema_migrations` is now a prerequisite for having a staging
  environment at all, not merely tidiness. Do not propose "just use a branch"
  again until it is done and a branch has been observed reaching
  `MIGRATIONS_PASSED`.
  ✅ **WHAT TO USE INSTEAD, AND IT IS BETTER THAN THE BRANCH WOULD HAVE BEEN:
  a transaction on production that ROLLS BACK.** Verified 13 Aug that the Supabase
  MCP honours `begin; … rollback;` — probed with a throwaway table before anything
  was relied on. It runs against the REAL schema and the REAL data, where a branch
  carries `with_data: false` and would have needed the fixtures seeding by hand.
  The pattern is already the house style for `db/tests/*.sql`.
  ⚠️ **Branches bill by the hour ($0.01344, measured) — if one is ever created
  again, create, use, delete.**
  ⚠️ **THE SPEND CAP IS THE ONE THAT CAN BITE, AND IT INTERACTS WITH A KNOWN HOLE.**
  With the cap ON, exceeding quota RESTRICTS the project rather than billing — an
  outage. With it OFF, overage is billed. **Do not turn it off before the
  `social-ideas` storage write policy is fixed**: that policy has no membership
  check, so today any account with a login can upload unboundedly, and 100 GB of
  headroom turns that from "breaks player photos" into "runs up a bill".
- ⚠️ **A PRODUCTION READINESS AUDIT WAS RUN ON 13 Aug 2026** and its findings are
  NOT all recorded here — the report is a session artefact, not a repo document.
  The ones that became work are in §Open. **Its two most load-bearing measurements,
  both live:** `events` has no index on `team_id` or `starts_at`, and the live
  performance advisor returns 18 `auth_rls_initplan` plus 100
  `multiple_permissive_policies` warnings.
  ⚠️ **AND ONE ABOUT THE SUITE, WHICH IS THE ONE NOTHING ELSE WOULD HAVE CAUGHT:
  `npm test` IS NOT DETERMINISTIC.** Two full runs, same tree, same command,
  minutes apart: **4 failed** in `tests/admin-dashboard.test.jsx`, then **1904
  passed**. That file alone passes 17/17. `test` is a REQUIRED check on a protected
  `main` that deploys live, so this cuts both ways — a red run that is fine trains
  people to re-run, and a green run proves less than it appears to. **Do not
  dismiss a single red CI run on this repo as "the flaky one" until this is fixed.**

### ⚠️ Test data currently in the live database

Two sets, both to be removed before a pilot:

- **Six `Test Player` rows** — a fixture for the pending-state RLS work.
⚠️ **"SEEDED" DOES NOT MEAN "SAFE TO MODIFY", AND A SESSION LEARNED THAT BY
DESTROYING A RESULT ON 12 Aug 2026.** The completed U16B match sheet is attached
to a fixture **inside** the seeded September group, so the seeded block is no
longer purely synthetic — a human has used one of its rows. A migration test
selected a "seeded" event by `group_id`, wrote components to it, and then nulled
`result_us` / `result_them` on the way out, wiping a real 22-12 that the same
session had measured minutes earlier. **Select a test row by its id, after
looking at it — never by the group.** Jay ruled the loss acceptable ("just test
data"); the trap is not.

- **A seeded September**, all carrying one `group_id`:
  `delete from events where group_id = '5eed0000-0000-4000-8000-000000000001';`
  Inserts only; nothing existing was modified. ⚠️ **Worth keeping until the design
  work settles** — see the "judge against real data" lesson in
  `claude/handoffs/2026-08-10-session.md`.

Restoring the senior squads, if wanted:

```sql
insert into teams (id, club_id, name, sort_order, is_senior) values
 ('a0cfbdf8-5a21-4c41-9af4-a62b5115220f','00000000-0000-0000-0000-0000000000ad','Senior Men 1st XV',16,true),
 ('eca8a660-400e-4af0-ae2a-19c96d1baadc','00000000-0000-0000-0000-0000000000ad','Senior Men 2nd XV',17,true),
 ('2a7ae0f1-2cc4-4bf2-9847-46f33086c7fa','00000000-0000-0000-0000-0000000000ad',E'Women\'s XV',18,true);
```

## ⚠️ Rulings and traps

Durable. Each cost real time to find.

### Accounts, email and onboarding

- **Magic link cannot be disabled.** Supabase has no setting for email *sign-in*,
  only sign-up. `SHOW_PASSWORDLESS` in `src/screens/Login.jsx` hides the button and
  nothing more. **Do not tell anyone passwords are the only way in.**
- **Nothing in the app can delete a LOGIN.** Revoking access removes a membership;
  dismissing clears a list. The auth user survives both, can still sign in, and —
  because GoTrue answers a repeat signup with 200 and sends nothing — cannot
  register again and gets no error either. Only the dashboard or SQL deletes a
  login. **A pre-pilot wipe must include `auth.users`.**
- **Supabase's auth-email ceiling is 200/hour.** ❌ Three documents once said 2/hour
  and a session repeated it to Jay as the live blocker. **Re-read the dashboard.**
- **Resend free is the other wall.** ⚠️ Its usage figures are rendered by a
  `number-flow-react` web component whose shadow DOM holds every digit 0-9 per
  column — text extraction and `aria-label` both return nonsense. **Read that page
  from a screenshot, or expand the row.**
- ⚠️ **Hitting the cap does not look like a limit.** Resend returns
  `429 daily_quota_exceeded` → the auth hook returns 500 → GoTrue returns
  `500 unexpected_failure`. The rate-limit pattern `/rate limit|too many
  requests|429/i` matches none of those words. `friendlyAuthError` in
  `src/screens/Login.jsx` already handles it via a second pattern.
- ✅ **THERE IS NO ROSTER IMPORT, AND THE ROLLOUT IS NOT BLOCKED ON ONE — Jay,
  10 Aug 2026.** This file said "nobody has recorded where the real roster lives"
  and told every session to ask him. **Asked and answered: parents will most likely
  onboard themselves, and the old roster most likely never goes in at all.**
  ⚠️ **Stop raising it.** It is settled, and re-asking a closed question is its own
  kind of rot. Reasoning, and what still has to be true for self-onboarding to work:
  `claude/decisions/2026-08-10-no-roster-import.md`.
  ✅ **AND THE FIRST THING THAT HAD TO BE TRUE IS NOW TRUE.** Granting **Player**
  access used to require picking an EXISTING roster player, so a login for a child who
  was not already on the roster could not be granted at all — which, given no import,
  is nearly every player. `AccessBuilder` now offers "They're not on the roster yet —
  add them", CREATES the player and grants against it. ⚠️ **It creates rather than
  using the parent's `player_id`-null fallback**: `is_own_player` needs a real
  `player_id`, so a null one would grant an account that could never touch its own
  availability, photo or gender. ⚠️ **The player is created LAST**, after every
  refusal, so a rejected grant never leaves an orphan child on the roster.
  ⚠️ **Found by Jay using the app on 10 Aug**, not by any test — the whole onboarding
  path is still unexercised by a real second person.
- ✅ **THE RESEND CAP IS GONE — Jay bought Resend Pro, 13 Aug 2026.** This line
  used to read *"Removing the Resend cap is pay-as-you-go, ~$0.90 per 1,000. A
  purchase, so Jay does it, not the assistant."* He did it.
  ⚠️ **THE 100/DAY CEILING NO LONGER EXISTS, AND THAT REMOVES A BRAKE NOBODY
  DESIGNED.** The cap used to stop a runaway sender at 100. There are now FIVE
  things drawing on one Resend key — auth mail via `send-email`, plus
  `notify-approval`, `notify-pitch-request` and `notify-access-request` — and a
  loop on any of them now sends thousands of REAL emails to REAL volunteers
  instead of stopping. **The throttle that was wanted for "you will run out" is
  still wanted, for "Resend can suspend `send.adhquins-clubhub.com` over spam
  complaints".** Same fix, different reason; do not read the upgrade as closing it.
  ⚠️ **Measure the monthly allowance on the Resend dashboard rather than citing a
  number here** — and remember the shadow-DOM trap two bullets up: read that page
  from a screenshot.
- **`jayjmuir@yahoo.com` is Jay's deliberate backup — and as of 10 Aug 2026 a backup
  SUPER admin.** Any "a coach cannot see X" test using it is invalid. Use a
  purpose-made account. ⚠️ **Both of Jay's accounts are super**, on purpose: the flag
  can only be granted by an existing super admin, so a single super account is one
  lost password away from needing SQL to recover. ⚠️ **It also means two accounts can
  hand out club-wide authority**, so the backup is no longer merely a way back in.
- **`reynekeett@gmail.com` is a THIRD, LEGITIMATE admin — confirmed by Jay 10 Aug**
  after it was flagged as unrecognised. Ordinary admin, not super. Recorded so the
  next session does not raise it again as a stray.
- **No rate limit on account creation** — only on what an account can do, which
  without a membership is nothing.

### Database

- ✅ **TABLE AND COLUMN GRANTS ARE NOW CAPTURED** in `db/schema/grants.sql`, so a
  clean reconciliation finally means something about them. Checked two ways:
  `scripts/docs-check.mjs` fails the build if a migration grants on a table the
  capture does not name, and `db/tests/grants.sql` asserts the invariant against
  live and injects the fault to prove it can fail. ⚠️ **Neither sees live from CI**
  — the repo is public, so there are no credentials — so re-capturing WITH the
  migration is still the mechanism, not a formality.
- ⚠️ **THE SUPABASE DASHBOARD OFFERS TO DESTROY THAT PROTECTION IN ONE CLICK, AND
  PRESENTS IT AS TIDYING UP.** Under **Integrations → Data API → Settings → Exposed
  tables**, twelve of the thirteen `public` tables carry a green tick and
  `public.profiles` is AMBER with a warning: *"This table has custom grants. Select
  it to override with standard Data API grants for anon, authenticated, and
  service_role."* ⚠️ **The "problem" it offers to fix IS the protection** — the
  column grants below. Clicking it hands table-level UPDATE back and undoes them,
  with no confirmation saying so, no test failing, and no visible change in the app.
  **Do not click it. The amber row is correct and must stay amber.** Seen 10 Aug;
  detail in `db/schema/grants.sql` §4.
- ⚠️ **`profiles.email` is protected by a COLUMN GRANT, not by a policy.** Only five
  columns are updatable by `authenticated`: `full_name`, `first_name`, `last_name`,
  `name_confirmed_at`, `phone`. RLS authorises the ROW — and `profile update club
  admin` authorises an admin against **every member row in the club** — so without
  that ceiling both UPDATE policies read as "may rewrite anyone's login email".
  **`policies.sql` cannot tell you this**; `profile update own` reads as "a member
  may edit their own profile", full stop. Adding a column to `profiles` is therefore
  a decision: ungranted, a save fails with something that looks exactly like an RLS
  refusal.
- ⚠️ **Supabase's DEFAULT privileges give `anon` full table rights on every new table
  in `public`.** So a table created without RLS is not "unhardened", it is open to
  anyone with the project URL — and nothing in the `create table` says so. Every
  table currently has RLS on, and `db/tests/grants.sql` now asserts it.
- ⚠️ **The column revoke was applied to `authenticated` only; `anon` keeps table-level
  UPDATE on `profiles`.** Measured 10 Aug: no live hole, because both UPDATE policies
  are role `PUBLIC` and both fail for a null uid (`id = auth.uid()` is null, not
  true). But the defence-in-depth is one-sided. Recorded rather than changed —
  revoking it is a one-line migration with a real chance of breaking a signup path
  nobody has re-tested.
- ✅ **The register is live.** `src/screens/Register.jsx`, opened from the event
  detail sheet on Schedule and the Dashboard, ⚠️ **only for an event that has
  already STARTED**, and only for someone who can edit the squad. ⚠️ **"Not
  recorded" is never a stored row** — it is the absence of one. Defaulting to
  `absent` would manufacture an absence for every session a coach forgot to take,
  and those would feed the percentage. ⚠️ **It is NOT behind
  `FEATURES.availability`**: attendance shipped INSTEAD of RSVP, and tying them to
  one flag would switch both on together.
- ⚠️ **`availability` IS RSVP, `attendance` IS THE FACT. Do not compute one from
  the other.** `availability.status` is `in`/`out`/`maybe`, set before the event by
  the player or parent; `attendance.status` is `present`/`absent`/`excused`, set
  after it by a coach. Every "attendance %" feature that reads `availability` is
  reporting who SAID they would come as who CAME. New 10 Aug 2026.
- ⚠️ **The attendance PERCENTAGE is `present / (present + absent)`.** `excused` is
  excluded from BOTH sides on purpose, so a player away injured or on holiday is
  not ranked as uncommitted. There is deliberately no `late`.
- ⚠️ **`attendance` reads NARROWER than every other team-scoped table.** Staff see
  the squad (`can_edit_team`); a parent sees **only their own child**
  (`is_own_player`) — not `can_see_team`, because "which children miss training,
  and how often" is safeguarding-adjacent. ⚠️ **`is_own_player` appears in its read
  policy and in NO write policy**: a parent must never mark their own child
  present, since the value of the number is that somebody else recorded it. If
  either of those is ever "corrected" to match the house style, the feature is
  worthless. Harness: `db/tests/attendance.sql`.
- ⚠️ **`apply_migration` strips `--` comments before executing.** A function's
  reasoning lives in the migration file and never in the database; a re-capture
  cannot bring it back.
- ✅ **`private.can_edit_team` NOW CHECKS `status`** (10 Aug 2026,
  `db/migrations/20260810_can_edit_team_status.sql`, harness
  `db/tests/rls-can-edit-team-status.sql`). ⚠️ **This OVERTURNED a deliberate
  decision, not an oversight** — the 8 Aug migration said in as many words that it
  was "deliberately NOT status-gated" because a pending coach cannot arise and "an
  unreachable branch is a lie about the model". That premise still holds; Jay ruled
  the other way, on the argument that **thirteen** policies hang off it (events,
  players, contacts, parents, all four attendance, three availability writes, an arm
  of `avail read`, and player-photo storage) and would all open at once the day
  anything grants staff access through a pending state.
  ⚠️ **Consequence, correcting the old note: the `avail read` policy's `can_edit_team`
  arm IS now genuinely redundant** (can_edit_team is a strict subset of can_see_team
  once both require active). Left in place deliberately.
  ⚠️ **`private.is_attached_to_team` IS STILL STATUS-BLIND AND MUST STAY THAT WAY.**
  It gates `event read`, and a pending parent seeing fixtures is what makes signing
  in worth anything before approval. **Measured 10 Aug: a pending coach reads events
  (34) and cannot read players (0) or contacts (0). All three are correct.** Do not
  "finish the job" here.
- **Approval is an RPC (`approve_membership`), NOT a widened policy.** `memb manage`
  is `FOR ALL`, so a coach clause would also grant role changes (including promotion
  to admin), squad reassignment and deletion. The migration aborts if `memb manage`
  is ever found not to be admin-only. **Do not "simplify" this into a policy.**
- **A Postgres self-assignment (`set x = x`) does NOT fire a `distinct from`
  check.** A migration doing exactly that reported success and changed nothing.
  **Read the rows back.**
- **`invites` and `invite_targets` are `ON DELETE NO ACTION` against `teams` and
  `players`.** Wipe order: events → players → invite_targets → invites → teams.
- **Storage is NOT wiped by SQL.** `delete from storage.objects` raises
  `42501 Direct deletion from storage tables is not allowed`. **A wipe script cannot
  clear `player-photos`** — do it from the dashboard.
- **`db/migrations/` holds fewer files than there are applied migrations.**
  Supabase's own list is authoritative. Detail in `claude/schema-history.md`.
- **Do not size an optimisation from `EXPLAIN ANALYZE` on this schema** — wall time
  is inflated roughly 4x.

### The app

- ⚠️ **A `shrink-0` ACTION GROUP IN A PAGE HEADER CAN TAKE THE WHOLE APP WITH IT.**
  Every screen's header is a `justify-between` row: title left, `shrink-0` buttons
  right. When it does not fit, the row does not clip — **the DOCUMENT gets wider than
  the viewport**, and after that every element sized to the viewport renders short or
  clipped. Schedule did this on 10 Aug: the masthead stopped reaching the right edge
  and an open `Sheet` lost its close button and every field value, three screens from
  the cause. ⚠️ **The bottom nav looked perfect throughout because it is `fixed`**,
  which is what makes one bug read as four. Fixed with `flex-wrap` + `min-w-0`;
  **`min-w-0` is the load-bearing half** — it lets the title shrink and absorb the
  row. ⚠️ **Only Schedule was ever broken**: Roster's header was given the same
  classes for consistency and does not overflow without them.
  Guarded two ways — `tests/page-header-wrap.test.js` (source, in CI, pins the class)
  and `harness/check-overflow.mjs` (real Chromium, by hand, measures the thing).
- ⚠️ **A FAULT INJECTION THAT DOES NOT APPLY LOOKS EXACTLY LIKE A PASSING TEST, AND
  ON WINDOWS THE COMMONEST CAUSE IS LINE ENDINGS.** 12 Aug 2026: an injection meant to
  remove the unique tiebreak from `listPlayers`' page sort came back GREEN. The edit
  had silently matched nothing — the script searched for `
` and the working tree is
  **CRLF** (`.gitattributes` pins only `*.mjs`, `*.sql` and `*.sh` to LF, not `*.js`).
  **The green run was evidence about the SCRIPT, not about the code.** Re-done with a
  whitespace-tolerant pattern that PRINTS how many bytes it removed, it went red
  immediately. **Make an injection prove it landed before you believe its result** —
  the same corollary as the entry below, arriving by a different route.
- ⚠️ **`git checkout -- <file>` REVERTS TO THE LAST COMMIT, AND IT COST UNCOMMITTED
  WORK TWICE IN ONE SESSION ON 12 Aug 2026** — `src/data/players.js` and then
  `src/data/limits.js`, both while cleaning up after a fault injection. `CLAUDE.md`
  rule 6 already says **commit before injecting a fault**; it was not followed, and
  the only reason nothing was lost is that a copy had been taken first by luck rather
  than by process. ⚠️ **The second loss was the more instructive one: the symptom was
  `fetchByIds is not a function` in a test file that had not been touched**, which
  reads as a bad import rather than as a reverted module.
- ⚠️ **NEVER TRUST A FAULT INJECTION THAT REVERTS PART OF A FIX.** Proving the
  overflow gate, the first attempt reverted `flex-wrap` but left `min-w-0`, came back
  green, and was reported to Jay as evidence the fix was unnecessary. **It was
  evidence of nothing** — the bug had never been restored. The full pre-fix markup
  fails 8 of 140 pairs. Rule 6 says prove an assertion against an injected fault; this
  is the corollary — **prove the injection**.
- ⚠️ **A RESPONSIVE CHECK MUST INCLUDE 360px.** The overflow gate first ran
  320/375/414 and reported green on the exact screen Jay was holding: Schedule
  overflowed 53px at 320, **13px at 360**, and nothing at 375. **360 is the commonest
  Android width** (a 1440px panel at DPR 4). A width list that straddles it is a check
  that agrees with you.
- ⚠️ **An unparseable name once fell through to the LEAST SAFE answer.**
  `src/lib/ageGroup.js` used `\b` after the digits; a letter is a word character, so
  `U12G QR` matched nothing, the band came back `null`, and `allowsOwnContact` reads
  `null` as "a senior side: adults". The app offered a twelve-year-old girls' squad
  the child's own email and phone fields. **The lesson is the null default, not the
  regex.**
- **The single-gender suffix must TOUCH the digits** — `U6 Tag` ends in a G. Named
  squads use word boundaries, because `name.includes('men')` is also true of
  "Development". Blank gender on a single-gender squad is refused; a mismatch
  **warns loudly and never blocks** — Jay's ruling.
- **Verify security headers from inside a browser, never `curl` alone.** The service
  worker once served `index.html` from cache without them: `curl` showed all five, a
  real browser showed `x-frame-options: null`.
- **`navigateFallbackDenylist: [/^\/calendar\.ics$/]` is load-bearing** — without it
  the service worker answers the feed with `index.html`. And **a 200 is not proof a
  file exists**: the SPA catch-all answers any unknown path with `index.html`. Check
  `content-type`.
- **No query in `src/data/` is paginated**, `src/screens/Schedule.jsx` loads every
  event in scope and filters in memory, and realtime triggers a full refetch on any
  change in scope. All three were right at six players and stop being right somewhere
  between 100 and 700.
  ⚠️ **"They will show as a slow screen long before anything errors" was WRONG, and
  wrong in the dangerous direction — corrected 10 Aug.** What waits at the end of an
  unbounded `select('*')` is a SHORT ANSWER THAT LOOKS COMPLETE: PostgREST applies a
  `db-max-rows` ceiling and returns the first N rows with HTTP 200 and no indication
  anything was left out. A roster missing a child, with no error anywhere. The same
  silence as the zero-row 200 and the empty search read as proof of absence.
  ✅ **`listEvents` and `listPlayers` now cap and THROW** (`src/data/limits.js`): they
  ask for one row more than `MAX_ROWS` and refuse to hand back a truncated list.
  Nothing is faster; the truncation is merely no longer silent.
  ✅ **`db-max-rows` IS 1000 — measured 10 Aug off the dashboard**, so `MAX_ROWS`
  900 (a request for 901) sits under it and the detector can fire. No query can read
  it; it is a PostgREST setting in no catalogue. ⚠️ **The setting has MOVED** — not
  Settings → API any more, but **Integrations → Data API → Settings → Max rows**.
  **If it is ever lowered below 901 the detector stops working silently.** Also
  measured: `authenticated` carries `statement_timeout=8s`, so the far end of this is
  an 8-second failure, not a hang.
  ✅ **THE DATE WINDOW IS DONE — `src/lib/eventWindow.js`, 12 months back and 6
  forward, rolling.** Schedule and Dashboard both pass it; the "no caller passes one"
  era is over and a test fails if either stops. ⚠️ **It is a READ FILTER, NOT
  RETENTION — nothing is deleted, ever**, and events outside it stay in the calendar
  feed and reachable by paging the calendar, which widens the window and refetches.
  ⚠️ **12 back is not a taste call**: Results is derived from the SAME fetch as
  Upcoming, so a lookback shorter than a season empties the season-in-review screen
  partway through the season. Jay's question — "in 6 months will I still be able to
  see events from Sept?" — is the headline test in `tests/event-window.test.js`.
  ✅ **AND THE ADMIN/ALL-SQUADS CASE IS PAGED** (10 Aug). `listEvents` no longer sends
  one capped request that threw above 900 rows — `fetchAllPages` in
  `src/data/limits.js` walks `.range()` until a short page arrives. ⚠️ **The
  guarantee is unchanged: everything, or a throw. Never some of it.** A second
  ceiling, `MAX_TOTAL_ROWS` (5,000), stops a runaway loop and is a PRODUCT limit, not
  a PostgREST one — roughly 3× the club's realistic worst case.
  ⚠️ **`order` must end in a UNIQUE column and `events` pages by `starts_at, id`.**
  `.range()` is OFFSET/LIMIT; two events can share a `starts_at` (a Saturday of
  age-group matches all at 09:00 is normal), and an under-specified sort lets Postgres
  order tied rows differently between pages — returning one twice and dropping another
  with no error anywhere.
  ✅ **`listPlayers` NOW PAGES TOO** (12 Aug 2026), by `full_name, id` — and the
  unique tiebreak is load-bearing for the same reason `events` pages by
  `starts_at, id`: `full_name` is NOT unique, two players called Sam Ahmed is
  ordinary, and this club deliberately holds no squad numbers to tell them apart.
  ⚠️ **AND A SECOND LIMIT WAS FOUND THAT NOBODY HAD MEASURED, WHICH BITES BEFORE
  `MAX_ROWS` DOES.** PostgREST takes `.in()` as a query **STRING**, so a uuid costs
  ~37 bytes of URL. Measured against this project with real uuids:
  **300 ids → 11,196-byte URL → 200; 400 ids → 14,896 bytes → the fetch THREW;
  900 ids → 33,396 bytes → 400.** `MAX_ROWS` does nothing about it — the request
  never gets far enough to return a row.
  ⚠️ **THE 400-ID FAILURE IS THE DANGEROUS ONE: it is not a status, it is a
  connection failure**, so it reads as a bad network rather than as a request built
  wrong. Only the far end of the range answers honestly.
  ⚠️ **THE CLUB LANDS ON THAT CLIFF** — fifteen squads at ~25 players is ~375,
  between the last size measured working and the first measured failing. Four
  readers were exposed and are now chunked at 200 via `fetchByIds`:
  `listContactsForPlayers`, `listParentsForPlayers`, `listAvailabilityForEvents`
  and `listMatchSheetsFor`. ⚠️ **`listEvents` and `listPlayers` are NOT affected** —
  their `.in()` is on `team_id`, at most fifteen values.
- **`saveParents` is delete-then-write, not atomic.**
- ✅ **AVAILABILITY / RSVP IS ON — Jay, 10 Aug 2026.** `FEATURES.availability` in
  `src/lib/features.js` is **true**. It was false from 29 Jul because the club was not
  ready to rely on digital RSVP; that was a readiness call, and Jay withdrew it after
  asking **"where is the availability function?" twice in one day** — which is what an
  undocumented flag costs. The flip needed no other change, exactly as the flag's own
  comment promised: it gates EventDetail's two entry points and nothing else, and the
  screen, table, policies, realtime subscription and tests were live throughout.
  ⚠️ **Nobody has used RSVP in anger.** It is switched on and unit-tested, not
  exercised by a real parent.
- ⚠️ **AND IT WAS HIDING A DEAD BUTTON.** `EventDetail` rendered "Set my
  availability" from Schedule AND the Dashboard, but only Schedule ever passed
  `onOpenAvailability`, and the call was `onOpenAvailability?.(event)` — so on the
  home screen the button drew itself, invited a tap and swallowed it. Fixed 10 Aug:
  the Dashboard passes the handler, and the button now renders **only** when a
  handler exists, so a forgetful caller gets no button rather than a lying one.
  Covered by `tests/dashboard-availability.test.jsx`, which mocks the flag ON — the
  reason no existing test caught it is that they all drove Schedule.
- ✅ **THE BUTTONS ARE ROUTED. The sweep is done, and what stays raw is deliberate.**
  Every action button in `src/` — anything carrying a fill or a hairline border — goes
  through `src/components/Button.jsx`, plus three `<Link>`s via `as={Link}`. ⚠️ **The
  rest stay raw ON PURPOSE and the component's header lists each category**: layout
  boxes (FixtureRow, Roster's row, Schedule's cells — routing these reintroduces the
  Chromium UA content-centring bug no jsdom test can see), masthead chrome, toggles
  and tabs, text links, pills and icons. **Do not "finish the job".** Two variants were
  added for the destructive cluster that already existed by hand — `danger` (the
  confirm) and `dangerQuiet` (what arms it), both with no sweep and no bloom.
  Reasoning: `claude/decisions/2026-08-10-button-routing.md`.
  ⚠️ **Three defects fell out of the sweep that nothing could have caught:**
  Schedule's day-sheet "Add event" carried `hover:bg-brand-dark` — **there is no
  `brand.dark` in `tailwind.config.js`**, it was the only use of that name anywhere in
  `src`, so Tailwind emitted nothing and that one button had no hover state at all;
  Dashboard's `BUTTON_BASE`/`BUTTON_GHOST` were both dead; and `FOOTER_BUTTON` in
  `EventDetail`/`PlayerDetail` would have left `rounded-[11px]` racing `rounded-btn` on
  equal specificity, since `className` is appended last.
  ❌ **THE "VERIFIED IN A REAL BROWSER" CLAIM FOR THIS SWEEP WAS WORTHLESS, AND JAY
  CAUGHT IT BY LOOKING.** The sign-in screen was measured on production and on
  deploy-preview-18, and everything came back as designed — 8px radius, 12px padding,
  47px tall, 3px `brand-deep` bottom edge. ⚠️ **But `Login.jsx` was ALREADY routed
  before this sweep** — one of the three files that already imported `Button` — so
  that screen is byte-identical before and after, and the look being admired there
  shipped the day before in `87c7566`/PR #16. **The measurement confirmed the previous
  commit's work and was cited as evidence for this one.** Rule 6 warns that a
  measurement merely confirming your own change was applied is not a verification;
  this did not even do that. **The signed-out path contains NOTHING this sweep
  touched, so it is the one place that can never verify it.**
  ✅ **THAT GAP IS NOW PARTLY CLOSED BY A REAL BROWSER GATE.**
  `harness/check-overflow.mjs` drives all 28 harness scenarios through Chromium at
  **320/360/375/390/414px** and fails on a document wider than its viewport, naming
  the offending element. `npm run harness`, then `npm run check:overflow`. It renders
  the real components against the real stylesheet with stubbed data, so it reaches
  every screen behind the login **without an account** — which is what made the
  authenticated screens unverifiable before.
  ⚠️ **It is not in CI**: Playwright is deliberately not a dependency (~300MB), so
  this is a gate somebody RUNS before a release, not one that runs itself.
  ⚠️ **AND IT IS BLIND TO ANYTHING INSIDE A SHEET — measured 12 Aug 2026.**
  `src/components/Sheet.jsx` renders `position:fixed inset-0` and sets
  `document.body.style.overflow = 'hidden'` while open, so a sheet's contents are
  not in the document's `scrollWidth` and **cannot fail a document-width check
  whatever they do.** Proved by injecting a 900px `shrink-0` button into an open
  event sheet: **the gate stayed green.** This applies to the `availability`,
  `playerform` and `event-detail` scenarios — they verify the sheet BOOTS and
  that the page behind it is clean, and **a clean run has never said anything
  about a sheet's own layout.** Do not quote one as if it had; measure the row in
  Chromium instead. ⚠️ **The way this was caught is the transferable part: the
  first injection came back green and a CONTROL was injected rather than the
  result being accepted. An injection that fails to go red is data about the
  CHECK, not a clean bill of health for the code.**
  ⚠️ **It is layout-only.** It proves nothing about whether the buttons LOOK right —
  the taller tap target and the 8px corner on Dashboard, Schedule, Roster, Accounts
  and every sheet are still unlooked-at by a human.
  ⚠️ **AND THE HEADLINE EFFECT IS INVISIBLE ON A PHONE.** The sweep and bloom are
  `hover:` effects, and a touch device has no hover — so on the device this app is
  actually used on, standing on a pitch, what ships is the taller tap target, the 8px
  corner and the 3px bottom edge, and nothing moves at all. That is inherent to hover
  rather than something the sweep got wrong, but it was never written down and it
  means the motion study chose between three options that only desktop users see.
- ⚠️ **THE BUTTON AUDIT WAS PUBLISHED WRONG TWICE, AND THE SECOND TIME WAS THE
  CORRECTION.** ❌ The original (`87c7566`, PR #16) claimed "105 raw buttons carrying
  the same padding + radius + weight signature" and read `rounded-[11px]`'s
  occurrences as drifting button radii; its grep had counted every element with that
  radius plus padding and called them all buttons. ❌ **The correction that replaced it
  (`8a83ba6`) published its own figures — "117 occurrences", "only 20 `<button>`s use
  it", "98 are not buttons" — and re-measurement on 10 Aug during the routing sweep
  did not reproduce them either.** A straight `grep -o` gives 118 occurrences, and any
  attempt to count "buttons using it" depends on how you decide where an opening tag
  ends, which JSX comments containing the text `<button>` quietly break.
  ✅ **THE DURABLE FACT, WHICH NEEDS NO NUMBER: `rounded-[11px]` is the app's general
  SURFACE radius — alerts, inputs, panels and cards — used correctly and consistently.
  It is NOT a drifting button token, it will NOT disappear, and `rounded-btn` at 8px is
  meant to differ from it.** A control you press should not share a corner with the
  card it sits on.
  ⚠️ **The lesson is the one this file's own §How to read already states, and it now
  has a third instance: every wrong claim here has been a rotted MEASUREMENT.** Both
  button counts were wrong, both were quoted as evidence, and the second was written
  while correcting the first. **Stop publishing counts of this.** The invariant is
  enforced by `tests/button-sweep.test.js` instead, which cannot go stale.
  ⚠️ The wrong figures are in `claude/changelog.md`'s 10 Aug entries, in PR #16's and
  PR #17's descriptions and in two commit messages, none of which can be edited.
  ⚠️ The sweep and bloom are **primary actions only**: on everything they read
  cheap, and a glowing "Cancel" draws the eye to the destructive choice. The two
  `danger` variants get neither, for the same reason.
- **Single-club assumption** in `clubId` derivation, `is_admin_anywhere()` and
  `can_admin_see_pending()`. Revisit together if a second club appears.
- **The changelog is allowed to be exactly one commit behind** — a commit cannot
  cite its own SHA — so the NEXT commit must always catch it up.
- ✅ **`[skip ci]` IS NOW BANNED, and the deploy skip is a gate.** It suppressed the
  required checks as well as the Netlify build — GitHub Actions matches it on the
  HEAD commit for `push` and `pull_request` alike — leaving a docs-only PR
  unmergeable. `scripts/netlify-ignore.mjs` decides the deploy from the DIFF
  instead, wired as `ignore` in `netlify.toml`. ⚠️ **Its exit code is inverted**
  (0 cancels the build), and a cancelled build reports as a SUCCESS in Netlify's
  UI — so getting it backwards would stop deploying the site with a green deploy
  list. That inversion is what the end-to-end tests pin.

### ⚠️ THE DATABASE DOES MAKE OUTBOUND HTTP CALLS — corrected 10 Aug 2026

This file said for days that "`pg_net`, `http` and `pg_cron` are still not
installed, so the database cannot make an outbound HTTP call at all", and rested the
conclusion "nothing sends email of its own accord" on it.

**`pg_net` is installed** (0.20.4, measured 10 Aug), and
`private.notify_pending_membership` calls `net.http_post` on every pending
membership insert. That is how approval emails fire. `supabase_vault` is installed
too and holds the endpoint and secret. `http` and `pg_cron` are still absent.

**So the database sends mail of its own accord, by design, since 9 Aug.** The claim
was true when written and was carried forward past the change that falsified it —
which is exactly the failure mode this file exists to catch, and it took three weeks
to notice.

## Checked and genuinely fine — do not "fix" these

- **`player-photos` is PRIVATE** and every table in `public` has RLS enabled.
- **Anon-executable `SECURITY DEFINER` functions all fail safe**, but by different
  routes: `claim_roster_access` on an explicit `auth.uid() is null` guard;
  `set_own_player_gender` and `set_own_player_photo` via `private.is_own_player()`,
  which cannot match a null uid. ⚠️ **`calendar_events_for_token` has no uid guard
  at all, deliberately** — it is the calendar feed, anon is the point, and the token
  is the gate. **Do not "fix" it to match the others.**
- **`private.squad_expects_gender` has no pinned `search_path`.** Recorded, not
  fixed: it is `SECURITY INVOKER`, `IMMUTABLE`, and touches no table.
- ❌ **"LEAKED-PASSWORD PROTECTION IS OFF BECAUSE IT IS A PAID-PLAN FEATURE AND
  THE ORG IS ON FREE. SETTLED 6 AUG." — THAT IS NO LONGER WHY, AND IT NO LONGER
  BELONGS IN THIS SECTION.** The org is on **Pro** (measured 13 Aug 2026,
  `get_organization` → `plan: "pro"`). The plan stopped being the blocker; the
  toggle is simply still off, measured the same day. **This is a to-do, not a
  ruling** — moved to §Open below. Left here as a struck-through line rather than
  deleted, because "settled" is exactly the word that stops the next session
  looking.
- ⚠️ **The unindexed foreign keys — THIS RULING IS NOW PARTLY WRONG, AND ITS OWN
  LAST LINE IS WHAT CAUGHT IT.** *"An index on an empty table is pointless.
  ⚠️ Re-measure before citing this once real data lands."* The re-measurement was
  done on 13 Aug and the ruling holds for foreign keys and **not** for
  `events.starts_at`, which is not a foreign key, is the column every schedule
  read SORTS on, and appears in no index at all. Measured live: `events` carries
  exactly `events_pkey`, `events_series_id_idx`, `events_group_id_idx`. See §Open.

## Numbers — do not cite, measure

Every count this file ever carried rotted within days. Run these instead.

```sql
-- rows
select 'players' t, count(*) from players
union all select 'teams', count(*) from teams
union all select 'events', count(*) from events
union all select 'memberships', count(*) from memberships;

-- what is actually applied
select version, name from supabase_migrations.schema_migrations order by version desc limit 20;

-- WHO IS ACTUALLY EMAILED when a coach asks for a pitch. Do not assume anybody
-- holds Pitch Management — as of 11 Aug nobody did and it returns Jay twice.
select p.full_name, m.is_super, m.admin_rights
from memberships m join profiles p on p.id = m.profile_id
where m.role = 'admin' and m.status = 'active'
  and (m.is_super or m.admin_rights @> array['pitches']::text[]);
```

For the test suite, run `npm test`. ⚠️ **No count belongs in this file**: previous
editions carried four different ones and every one rotted. <!-- count-ok -->

For clone state, `git rev-list --left-right --count origin/main...HEAD` — see
`CLAUDE.md` reading-order step 2 for why no other probe answers that question.
⚠️ **A shallow clone implies `--single-branch`**, so `git branch -r` will show only
`origin/main` and can read as "every other branch was deleted". It also breaks
`--force-with-lease`, which cannot verify a ref it never fetched.

## ⚠️ Documentation debt — check before trusting `claude/`

Seventeen decision documents, handoffs, plans and a runbook were written into the
Claude project during 4-7 Aug and **never committed**; restored 7 Aug. ⚠️ **It
happened again on 9 Aug** — all three of that day's decision records were left out
until `npm run docs:check` caught one as a broken path reference. **The check found
it; the process did not.** One carried a live secret in plain text, which is why the
committed copy names the secret and not its value: **this repo is public.**

**A document that is not in the repo does not exist.** Write the file in the same
breath as making the decision, and commit it in the same breath as writing it.

⚠️ **Several restored documents carry status lines that were true when written and
are not now** — they were committed as-is rather than silently edited, because a
decision record is a record of a moment. **Trust this file and the code for current
state; trust the decisions for reasoning.**

## Open, not blocking

### ⚠️ Opened by the 13 Aug 2026 audit — none of these is started

Ordered by what they cost to fix, not by how alarming they sound.

- ⛔ **THE RESTORE HAS NEVER BEEN DONE.** Backups exist as of 13 Aug; recovery is
  unproven. `claude/runbooks/backup-restore-drill.md`. **This is the only item
  here whose failure is unrecoverable**, and it is 30 minutes of clicking.
- **Leaked-password protection is still OFF**, measured 13 Aug, and the plan is no
  longer the reason. Supabase → Authentication → Policies. Two minutes.
- ✅ **DONE 13 Aug — `events` NOW HAS `(team_id, starts_at)`, `(club_id, starts_at)`
  AND `(league_team_id)`.** It had none of them, and the two indexes it did have are
  why that was easy to miss: both partial, both on columns almost nothing queries by,
  so the file showed indexes and a skim moved on. ⚠️ **This partly overturned the
  "an index on an empty table is pointless" ruling above** — which still stands for
  the ~24 `*_by` audit columns and never covered `starts_at`.
  ⚠️ **Nothing has been MEASURED to be faster and nothing was expected to be** — at
  9 events there is nothing to speed up. This is a cliff removed, not a gain
  banked, and the claim to make is "the plan shape changes", never "the app got
  faster". ⚠️ **Do not size it from `EXPLAIN ANALYZE` wall time on this schema —
  inflated ~4x.**
- ✅ **DONE 13 Aug — THE `social-ideas` STORAGE WRITE POLICY NOW CHECKS
  MEMBERSHIP.** It did not, from 12 to 13 Aug. The old WITH CHECK was
  `bucket_id = 'social-ideas' AND social_idea_owner(name) = auth.uid()` and nothing
  else, so any signed-in account — **including one with zero memberships** — could
  upload 5 MB objects into club storage without limit.
  ⚠️ **THE SHAPE OF THE MISTAKE IS THE PART TO CARRY: the ROW policy and the IMAGE
  policy are two halves of ONE feature, written in ONE migration, and only one half
  was gated.** `social idea create` required an active membership all along. So a
  stranger could not submit an idea and could upload images — the half that consumes
  storage, holds the content, and whose orphans appear on **no** screen.
  ⚠️ **PROVED BY EXECUTION, TWICE.** Before: a zero-membership account was ALLOWED,
  demonstrated by doing it rather than by reading the policy. After: REFUSED, while
  an active member is still allowed under their own prefix and still refused under
  somebody else's. Harness: `db/tests/rls-social-upload.sql`.
  ⚠️ **`player-photos` WAS NEVER AFFECTED AND MUST NOT BE "FIXED" TO MATCH** — its
  write policy goes through `can_edit_team`/`is_own_player`, both of which already
  require a membership. The harness carries a control that goes red if a future fix
  reaches into the wrong bucket.
  ⚠️ **STILL OPEN, AND NOT FIXED BY THIS: the client uploads the image BEFORE
  inserting the row** (`src/data/socialIdeas.js`), so a failed insert still orphans
  an object that appears on no screen and nothing sweeps. Narrower now — only a
  member can create one — but not gone.
- ✅ **DONE 13 Aug — `private.social_idea_owner` HAS A PINNED `search_path`.**
  ⚠️ **Its exemption note used to read exactly like `squad_expects_gender`'s, every
  fact in it was true, and the conclusion was still wrong.** Both are
  `SECURITY INVOKER`, `IMMUTABLE` and touch no table — but this one is called from
  three `storage.objects` RLS policies, so it decides who may write. **A helper in
  that position gets pinned whatever its volatility markers say.**
  ⚠️ **`squad_expects_gender`'s exemption is UNCHANGED and still correct.** This is
  not a precedent for pinning it; it is the reason the two are now decided
  differently.
- **18 RLS policies call `auth.uid()` bare**, so Postgres re-evaluates it per row
  instead of once per query. The fix is `(select auth.uid())` and changes no
  meaning. ⚠️ **One migration touching all 18, not eighteen migrations** — and
  prove it against an injected fault afterwards, or all you have shown is that the
  migration applied.
- **There is no React error boundary anywhere** (`grep ErrorBoundary src/` → 0).
  React 18 unmounts the whole tree on an uncaught render error, and ⚠️ **the
  service worker then serves the same broken bundle on reload, so "refresh the
  page" does not fix it** — which no parent will get past.
- **There is no monitoring, no alerting and no error tracking.** Detection today is
  somebody telling Jay. ⚠️ **Pro's 7-day logs help you INVESTIGATE and tell you
  nothing** — Log Drains are a Team-plan feature.
- **There is no audit log.** Nothing records who deleted a player, revoked a
  membership, edited a child's contact details or granted super-admin.
  `events.created_by`, `availability.updated_by` and `attendance.recorded_by` are
  single overwritten columns, not history.
- **The realtime `events` subscription has no filter** (`src/data/events.js`), so
  every connected client refetches its whole schedule on any event change anywhere
  in the club. ⚠️ `src/data/availability.js` already scopes its channel per event —
  copy that shape.
- **`saveParents` is delete-then-write**, so a failure between the two loses a
  child's parent records. ⚠️ **This is NOT the same as the deliberate two-call
  split for player contacts** recorded in `RESTORE.md` — there the reasoning is
  that a partial failure surfaces distinctly. Here the first call is a DELETE, and
  a partial failure surfaces as missing data.

- ~~**The dashboard stat band** — the loudest element on the screen carrying the
  weakest data. **The fortnight strip** renders empty cells above the fold when
  nothing falls in the next two weeks.~~ ✅ **Both done 10 Aug.** The band's third
  cell was "Age groups", a count of how the club is CONFIGURED, at 42px; it is now
  matches that have been played and have no score — which moves, and is somebody's
  job. ⚠️ **The band's STYLING is unchanged on purpose**: the complaint was that the
  loudest element carried the weakest data, and the honest fix for that is better
  data, not quietening the club website's strongest signature. The strip now says
  "Nothing on in the next two weeks" instead of drawing fourteen dead cells —
  ⚠️ **as a sentence, not `<Empty>`**, whose 42px icon and `py-11` would make the
  nothing-on case TALLER than the something-on case.
- ✅ **A SERIES can now be edited as well as cancelled** (10 Aug). `EventForm` offers
  "Apply to this and every later session" when the event has a `series_id`, defaulting
  OFF. ⚠️ **Two writes**: `updateSeriesFrom` for the date-independent fields, and the
  RPC `public.set_series_time_from` for the time — which cannot be one PostgREST
  update because each occurrence has its own DATE. ⚠️ **That RPC is the only SECURITY
  INVOKER function in the schema, deliberately**: RLS filters the UPDATE as the
  caller, so it grants nothing. ⚠️ **Field list is opt-in** — a new `events` column is
  not series-editable until named.
  ⚠️ **A GROUP (`group_id`, the multi-squad fan-out) still cannot be edited or
  cancelled as a unit** — deferred by Jay 8 Aug, and neither the delete nor the edit
  path touches it. Reaching across squads has a different blast radius, because there
  RLS would make the write genuinely partial rather than all-or-nothing.
- ✅ **A managed pitch list exists** (`public.pitches`, 11 Aug): **A1-A4, B1, C1-C5,
  D1-D5** — fifteen, the club's real pitches. Clash detection is built on it
  (`findPitchClashes` in `src/data/pitches.js`) and **reports rather than refuses** —
  a multi-squad fan-out sharing a `group_id` is NOT a clash, touching is not
  overlapping, and `Pitch TBD` never clashes.
  ⚠️ **`events.pitch` is still TEXT with no foreign key**, on purpose: `Pitch TBD` is
  a placeholder rather than a pitch and a key would force it to be a fake row or NULL.
  ⚠️ **The first version of the list was seeded from `events.pitch` and was almost
  entirely SEED DATA** — 16 of 22 allocations came from the seeded September. Caught
  only because Jay read the list. **A list seeded from data is only as real as the
  data.**
  ⚠️ **16 events still name a pitch outside the list; all 16 are from the seeded
  September** and go when it does. No real fixture is orphaned.
  ✅ **`pitch_requests` EXISTS — schema and RLS, 11 Aug.** A coach asks
  (`can_edit_team`), an admin answers (`is_admin`), and the requester can track it to
  the outcome. Referee is a tickbox on the same request. Harness:
  `db/tests/rls-pitch-requests.sql`.
  ~~⚠️ **NO SCREEN AND NO EMAIL YET.**~~ ✅ **All three shipped 11 Aug** — setup
  screen, allocation grid, request loop, and the email. See below.
  ✅ **The pitch SETUP screen is live** — `/admin/pitches`, blocks as columns, behind
  the `pitches` admin right (which gates the screen, not the data). Rename, retire,
  bring back, add. ⚠️ **The block is derived from the name, not stored**; `Other` is a
  real bucket and always sorts last.
  ✅ **The ALLOCATION GRID is live** — `/admin/allocation` (option C). Pitches down the
  side, the day across the top, clashes amber, **opens on today** (Jay's call), hour
  columns derived from the day's fixtures. ⚠️ **A retired or unlisted pitch gets a row
  if something is on it** — otherwise the booking would be invisible on the one screen
  meant to show it. ⚠️ **Fixtures with no pitch get their own list**, since they appear
  in no row.
  ✅ **THE REQUEST LOOP IS CLOSED** (11 Aug): a coach asks from the event sheet
  (`PitchRequest`), Pitch Management answers from a queue on `/admin/allocation`, and the coach
  sees the outcome in the same place they asked. Referee is a tickbox on the request.
  ⚠️ **A DECLINE NEVER SHOWS ON THE FIXTURE** — it keeps `Pitch TBD`. The request
  block is the ONLY place that fact exists, so it renders for decided requests too and
  a decline REQUIRES a reason.
  ⚠️ **Allocating writes the fixture FIRST, then closes the request** — not atomic,
  and the order is the mitigation: a failure leaves the request open and the fixture
  correct rather than telling a coach they have a pitch they do not have.
  ✅ **AND THE EMAIL IS LIVE** (11 Aug, `bfcb571`): Pitch Managers **and super
  admins** are mailed when a request is asked, the requesting coach when it is
  answered. Trigger `private.notify_pitch_request` → edge function
  `notify-pitch-request`.
  ⚠️ **IT HAS TO BE SERVER-SIDE, and that is not a style choice.** The submit mail
  goes to admins, and **a coach cannot read admin email addresses** — `profiles` is
  not bulk-readable by one and `profiles.email` is COLUMN-granted, not merely
  policy-gated. Sending from the app would need either the club's admin list in every
  coach's browser or a service-role key in it.
  ⚠️ **Super admins are recipients deliberately** — a super holds every right
  implicitly, so filtering on the `pitches` right alone would exclude the one person
  certain to be able to act.
  ⚠️ **RIGHT NOW THAT IS THE ONLY REASON ANYONE IS MAILED: nobody has been granted
  Pitch Management**, so both current recipients are Jay's own two accounts.
  Grant it on the Accounts screen and she joins automatically. **Measure this, do not
  trust it** — the query is in §Numbers.
  ⚠️ **THE FAILURE IS QUIET, and an earlier claim in this session that it would be
  "visible" was wrong.** Both triggers swallow everything into a `raise warning`
  nobody reads. That is survivable ONLY because **the queue is in-app**: the request
  is on the allocation screen whether or not the mail arrives. **The email is a prompt
  to go and look, never the record.**
  ⚠️ **No vitest coverage exists or can** — a Postgres trigger and a Deno function are
  not modules the suite can import. It was verified live instead, all three branches.
- Nothing in the UI distinguishes a Medic from a Coach, because there is no
  difference in access. Deliberate — the word is what distinguishes them.
- ✅ **THE SUPER-ADMIN TIER IS BUILT** (11 Aug), decided 10 Aug. Club Youth Manager,
  Pitch Management and Social Media Management are ordinary admins and keep full
  sight of children's data ("trusted
  volunteers"), but **granting access, and the per-admin rights below, are
  super-admin-only**. The tier restricts AUTHORITY, not SIGHT.
  ⚠️ **It is a FLAG (`memberships.is_super`), not a role value** — and that was the
  design decision, not an implementation detail. Twelve places in the schema test
  `m.role = 'admin'`; a new role value would have to be added to all twelve, and each
  is a chance to miss one, where a miss silently strips a super admin of an ordinary
  power. A boolean makes a super admin an admin, so all twelve keep working.
  ⚠️ **THE TRAP IT HAD TO BEAT: `memb manage` is FOR ALL and admin-only, so any admin
  can already write membership rows** — a naive column would let any admin set it on
  themselves and the tier would be decoration. Solved the same way as `profiles.email`
  and `approve_membership`: a **COLUMN grant** plus the `SECURITY DEFINER` RPC
  `public.set_admin_rights`. ⚠️ **Policies authorise the ROW; grants authorise the
  COLUMN.** Getting only the policy right leaves the hole wide open.
  ⚠️ **The first super admin was set by hand in SQL**, as it had to be — none can
  exist to grant it. Harness: `db/tests/rls-super-admin.sql`.
  ✅ **Per-admin RIGHTS ride on it** — `youth`, `media`, `pitches`
  (`ADMIN_RIGHTS` in `src/lib/scope.js`), granted by a super admin on the Accounts
  screen. ⚠️ **A SUPER ADMIN HOLDS EVERY RIGHT IMPLICITLY** — `hasAdminRight` returns
  true for a super without the right being listed, or Jay would have to grant himself
  each new right as he invents it. **Every consumer must honour that**, including the
  pitch email's recipient query; forgetting it excludes the one person certain to be
  able to act.
  ⚠️ **THE RIGHTS GATE SCREENS, NOT DATA — deliberately.** The RLS policy behind
  `pitches` is plain `is_admin`. A right decides which dashboard somebody is SHOWN;
  it is a "not your job" message, **not a security boundary**, and must never be
  described as one.
  ⚠️ **Still true and chosen knowingly: each of the three holds every child's name,
  photo and parent contact details, club-wide, with the power to edit or delete.**
  Reasoning: `claude/decisions/2026-08-10-role-dashboards.md`.
- ⚠️ **THE `attendance` TABLE IS EMPTY — measured 10 Aug 2026, zero rows.** The
  register shipped that day and nobody has taken one. **Anything computed from
  attendance — a percentage, consecutive absences, a trend, an "at risk" flag — has
  no data to stand on and no way to have its thresholds judged.** Same trap as the
  schedule restructure that was designed, agreed and dropped once real data showed it
  was unnecessary. Take some registers first.
- ✅ **ADMINS ARE NOW EMAILED WHEN AN ACCESS REQUEST ARRIVES** (12 Aug 2026,
  migration `access_request_notify`, edge function `notify-access-request` v2).
  This entry read "Nobody is emailed…" until then. ⚠️ **Not to be confused with the
  approval emails, which fire for a pending MEMBERSHIP** — somebody already attached
  to a squad. This fires for somebody with NO membership at all, asking to be let in.
  Two queues, two sections of the Accounts screen, and conflating them sends an admin
  to the wrong list.
  ⚠️ **The 11 Aug estimate was right: "a third is a copy with a different recipient
  query."** It is a near-copy of `notify-pitch-request`, reusing
  `approval_notify_secret`, with its own `access_request_notify_url` **derived from
  `approval_notify_url` in SQL** — so the host cannot drift and nobody ever reads,
  pastes or types the value.
  ⚠️ **RECIPIENTS ARE EVERY ACTIVE ADMIN, AND THAT IS MEASURED, NOT COPIED.** There
  is no `accounts` right — `ADMIN_RIGHTS` is youth/media/pitches and those gate
  PORTALS. Acting on a request means reading the waiting list (`access request
  admin` = `is_admin_anywhere()`) and granting a membership (`memb manage` =
  `is_admin(club_id)`), and **both are plain admin**. Copying the pitch function's
  `is_super or right` clause would have silently excluded the ordinary admins who
  can in fact do the job.
  ⚠️ **THE `when (new.status = 'pending')` GUARD IS LOAD-BEARING.**
  `dismissAccessRequest` UPSERTS, and an upsert that finds no row is an INSERT of a
  row already `dismissed` — so without it, turning away a stranger who never asked
  would email every admin "somebody is asking to join" about the person just turned
  away. Proved by removing it in a transaction: that insert's queue delta went 0 → 1.
  ⚠️ **A BARE `profiles(...)` EMBED DOES NOT WORK ON THIS TABLE, and the first
  deployed version got it wrong.** `access_requests` has TWO foreign keys to
  `profiles` (`profile_id` and `decided_by`), so PostgREST refuses the query as
  ambiguous. **The only symptom was a 500 and no email** — exactly the quiet failure
  this design accepts. Fixed with the explicit constraint name, which is why
  `notify-pitch-request` carries one too. Same probe before and after: 500 → 404.
  ⚠️ **THE RESEND CALL ITSELF IS THE ONE BRANCH NOT EXERCISED LIVE.** Everything
  else was — the auth gate (its own `unauthorised` body, which is what proves the
  request reached the function rather than a JWT gate), the vault derivation, the
  trigger guard on all four write paths, and the database read. Sending for real
  would put a test email in a third volunteer's inbox, so it was not done. The
  `sendMail` body is byte-identical to two functions already proven in production.
- **Deferred by Jay, still deferred:** test data cleanup, and the `group_id`
  multi-squad edit/cancel.
  ❌ **THIS ENTRY SAID "NEVER STARTED" ABOUT TWO THINGS THAT HAD ALREADY SHIPPED, and
  it said it for a day and a half.** The list was *the Club Youth Manager dashboard
  (match sheets → WhatsApp), the Social Media Management dashboard, training plans for
  the head of rugby performance*. **The first shipped on 11 Aug (`3c64990`), the second
  on 12 Aug (`ea3d500`)**, and the line was left standing through both. Corrected
  12 Aug. ⚠️ **The same failure as the league-teams status line two commits earlier**
  (`2290bf7`) — a claim about what does NOT exist is the one kind nothing can check,
  because there is no file to fail against. `docs:check` cannot catch it and neither
  can a test.
  **What is genuinely never started, of that list: training session plans.** A plan
  exists — `claude/plans/2026-08-12-training-session-plans.md` — and its headline
  finding is that ⚠️ **"scrape the web for the best sessions" cannot be built as asked,
  on copyright rather than capability.**
  ⛔ **TABLED BY JAY, 12 Aug 2026**, in the same breath as the AI plan: *"table 1 and 2
  for now until i bring them back up again"*. **Do not start it, do not offer to, do
  not ask again — he reopens it or it stays closed.**
- ✅ **THE AI RULING IS MADE — Jay, 12 Aug 2026: "yes it may."** Children's data may
  leave the club for a third-party API.
  ❌ **This file said "Nobody has asked him. Do not start any of them until he has
  answered" until 12 Aug, after he had answered** — and the answer was recorded the
  same day in `claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md`, which
  is the governing document. Smart Comms, NL queries, match reports and auto lineup are
  **unblocked**.
  ⚠️ **"May" is permission, not a design.** The ruling sets **minimisation** as the
  standing default and names the field list: player names, squad, fixture facts and
  league team go; **photos, contact details, medical notes and attendance history do
  not**, and widening that is a conversation with Jay, not a judgement call.
  ⚠️ **`match_sheets.medical_notes` is the trap this schema now contains** — a match
  report feature that selects `*` sends concussion notes about named children to a
  third party.
  ⛔ **THE BUILD IS TABLED — Jay, 12 Aug 2026: *"table 1 and 2 for now until i bring
  them back up again"*.** `claude/plans/2026-08-12-ai-integration.md` is written and
  **NOT SHIPPED**. **Do not start it, do not offer to, do not ask again.**
  ⚠️ **HE TABLED THE BUILD, NOT THE RULING.** The permission above stands and governs
  anything that ever sends club data to a third party, from this plan or otherwise.
  Collapsing the two would either re-ask a settled question or leave a future feature
  with no field list to answer to.
  ⚠️ **Nothing exists to undo: no Anthropic key, no vault entry, no `ai-assist`
  function, no spend limit.** If it is reopened, the plan's two preconditions are still
  the first two steps — **Jay creates the key himself, and a SPEND LIMIT is set before
  the first call.** An unbounded loop against a paid API is the one failure in this app
  that costs money per second. Model is `claude-haiku-4-5` (Jay's call).
- A parent has never signed out in a real browser. The RLS-refusal path is still
  mock-only for both events features.

## Machines

Machine rules — clone paths, `hostname`, `NODE_ENV` — live in `CLAUDE.md`. **Only
volatile clone STATE belongs here, and it rots on the next push. Measure it.**

✅ **THE CLONE CHECK IS NOW A GATE, NOT A RULE.** `scripts/session-guard.mjs`
runs on every session start (`.claude/settings.json`) and says so loudly when
the clone is SHALLOW or BEHIND `origin/main`. ⚠️ **It never blocks** — a
SessionStart hook that refuses to start is one flaky network call away from
making the repo unusable, and the thing being guarded against is a silent wrong
belief, not a malicious one. It exits 0 always and is silent when the clone is
fine. Run it by hand any time: `node scripts/session-guard.mjs`.

### ✅ cafnet — SYNCED AND MEASURED 11 Aug 2026

**Resolved. This section was a prediction until 11 Aug; it is now a measurement.**
cafnet was found on `build/v1-mvp` — a branch deleted from origin — **76 commits
behind `main`**, clean tree, empty stash. Synced to `main`, suite green.

⚠️ **The prediction was RIGHT, and this is the part worth keeping: a plain pull was
not enough.** `.gitattributes` (`77e1f9a`, 10 Aug) pins `*.mjs`, `*.sql` and `*.sh`
to LF, but git applies `eol` on CHECKOUT, so `reset --hard` rewrites only the files
whose blobs changed. **31 files that predated 10 Aug and had not been touched since
kept their CRLF.** Repaired by deleting them and re-checking them out, which is what
forces the attributes to apply — `git add --renormalize .` fixes the INDEX and leaves
those working-tree files exactly as they were.

⚠️ **The measurement that matters is a byte scan, not a command that ran.** Assert on
the absence of `\r` in the files pinned to LF, and prove the scan can still find a
CR that you plant — an "it worked" here is otherwise indistinguishable from a scan
that silently matched nothing.

**Why this matters beyond cafnet:** ⚠️ **CI cannot see this class of failure at all.**
Actions runs on Linux and checks out LF, so `test` and `docs-check` stay green while
the suite fails on the PC. **A green PR is no evidence.** The symptom is a
`SyntaxError: Invalid or unexpected token` naming the *import line of an unrelated
test*, on a line that is blank — because esbuild strips a `#!/usr/bin/env node`
shebang up to the newline and leaves the `\r`.

**The machine facts measured that day — `NODE_ENV`, npm from PowerShell,
`core.fileMode` — are in `CLAUDE.md`'s table, which is their single home.** Two of
the three had never been run on cafnet, and the third turned out to be wrong.

**The sync sequence, for the next clone that falls behind:**

```bash
hostname                       # confirm which machine
git status                     # ⚠️ STOP and tell Jay if anything is uncommitted
git stash list                 # and check here too — easy to forget
git fetch origin --prune       # ⚠️ a deleted branch leaves a STALE local ref
git checkout main
git reset --hard origin/main
# then repair line endings, then:
git rev-list --left-right --count origin/main...HEAD   # must be 0 0
npm install --include=dev      # see the CLAUDE.md machine table
npm run build                  # ⚠️ some tests read dist/ — see RESTORE.md
npm test                       # the real check — CI cannot catch the CRLF failure
node scripts/session-guard.mjs
```

⚠️ **`git fetch --prune` is load-bearing in that list, and the reason is worth
naming.** cafnet's `rev-list` against `origin/build/v1-mvp` returned a confident
`0 0` while it was 76 commits behind: the branch no longer existed on GitHub, so the
comparison was against a stale local ref for a dead branch. **`0 0` against a ref
that origin does not have is not evidence of anything.** `git ls-remote --heads
origin` answers what actually exists, and is the check that exposed it.

⚠️ **A SHEBANG IN AN IMPORTED `.mjs` BREAKS THE SUITE ON WINDOWS ONLY.** Git checks
out CRLF here; esbuild (what Vitest transforms with) strips `#!/usr/bin/env node`
up to the newline and leaves the `\r`, which is not a valid token. The file fails to
parse and the error is reported **against the import line in the TEST**, several
files from the cause, on a line that is blank. ✅ `.gitattributes` now pins `*.mjs`,
`*.sql` and `*.sh` to LF. ⚠️ **The reason it needed a file rather than a fix: CI
CANNOT SEE IT.** Actions runs on Linux and checks out LF, so `test` goes green while
the suite fails on both PCs — the mirror image of the usual trap, and it means a
green PR is no evidence. `session-guard.mjs` and `docs-check.mjs` keep their
shebangs and are safe only because nothing imports them.

⚠️ **jay-pc had `core.fileMode` drift**, set to `false` on 5 Aug. CRLF/LF content
drift on untouched files may remain.
