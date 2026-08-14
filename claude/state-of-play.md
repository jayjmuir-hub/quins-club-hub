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

❌ **"ONLY JAY USES THE APP. NO PARENT OR COACH HAS BEEN ONBOARDED. THAT MAKES
ALMOST ANY CHANGE CHEAP RIGHT NOW, AND IT WILL NOT STAY THAT WAY."**
**IT DID NOT STAY THAT WAY. THE CLUB WENT LIVE ON 13 Aug 2026.**

⚠️ **REAL FAMILIES ARE IN THE APP.** Measured live that afternoon — do not cite
these, re-run the queries in §Numbers:

| | |
|---|---|
| Auth users | 16 |
| People holding a membership | 12, across **3 squads** (U13 Mixed Contact, U16B Contact, U18B Contact) |
| Players | 9 |
| **Player photographs in storage** | **5** |
| Calendar links issued | 3 |
| Super admins | **3** |

Coaches, team managers, a medic, parents and players — and `dd80f48` records
Jay and the U18 team manager **both receiving an approval email**, so the
registration → email → approval path has now run for real.

⚠️ **THE SENTENCE THIS REPLACES WAS LOAD-BEARING FOR HOW CAUTIOUS EVERY SESSION
WAS**, and it went stale in an afternoon while five onboarding PRs
(`231b660`, `d7643b8`, `02e9a05`, `280f37b`, `dd80f48`) were merged by a
parallel session. **A change is no longer cheap. Assume a real parent is
looking at whatever you touch.**

⚠️ **WHAT THIS CHANGES ABOUT THE 13 Aug AUDIT BACKLOG BELOW — three items
stopped being theoretical the same afternoon:**

- **The photos have no backup** and there are now **five real children's
  photographs**. This is the one unrecoverable thing in the club.
- **The calendar token cannot be revoked** and **three links are out**.
- **The flaky test suite** now guards a site real families use.

Current phase is onboarding and the fixes it is throwing up — not new
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
  ✅ **AND THE RESTORE IS PROVEN — DRILLED 13 Aug 2026, SAME DAY.** This entry said
  *"Pro gave a backup mechanism and not a restore… nothing is yet known to be
  recoverable"*, which was true for about four hours. Restored the 12 Aug 18:05
  backup into a throwaway project, checked it, deleted it within the hour.
  ⚠️ **THE DISCRIMINATING CHECK, because "there were rows" proves nothing: the
  restore contained SIX `Test Player` rows and live contains ZERO** — they were
  deleted on 13 Aug, after the backup. That number cannot be produced by an empty
  restore, a partial one, or by accidentally querying production.
  `auth.users` 8 (live 9, one signup after the backup); policies/functions/RLS
  tables 53/39/21, identical to live; `accept_invite`'s fifth guard intact; all
  four vault secrets **decrypt**. Full numbers:
  `claude/runbooks/backup-restore-drill.md`.
  ❌ **THE PREDICTION WAS WRONG AND THAT IS THE POINT.** The audit and the runbook
  both named `auth.users` as the thing most likely to fail. It restored cleanly.
  **Sound reasoning, wrong answer — which is the entire argument for drilling
  rather than reasoning.**
  ⚠️ **"THE RESTORE WORKS" IS NARROWER THAN IT SOUNDS. NO PLAYER PHOTOGRAPH IS
  RECOVERABLE** — storage objects are not in the backup at all, only the database's
  metadata about them, so a restore yields every player record pointing at an image
  that does not exist. **Neither are the five edge functions**, so a recovered club
  has no calendar feed and no email until they are redeployed with
  `verify_jwt: false`. See the runbook's §What does NOT come back.
  ⚠️ **A BACKUP IS AS SENSITIVE AS THE LIVE DATABASE.** The vault secrets came back
  DECRYPTABLE in a brand-new project, so anywhere a backup is stored or downloaded
  holds the club's notification secret in readable form.
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
- ✅ **REALTIME IS ON, APPLIED AND OBSERVED WORKING — 13 Aug 2026.**
  `db/migrations/20260813_realtime_publication_events.sql` applied via the
  Supabase SQL Editor; `pg_publication_tables` now returns `public` / `events`
  where it returned nothing at all before. Captured in `db/schema/tables.sql`,
  in a publications section that did not previously exist.
  ⚠️ **IT HAD NEVER WORKED, AND THREE DOCUMENTS ASSERTED THE OPPOSITE.**
  `src/data/events.js` has subscribed since the app was built and had never
  received a message. `RESTORE.md` said "realtime triggers a full refetch on
  any change in scope"; the readiness audit repeated it as a PERFORMANCE worry
  about a mechanism that was inert. **The code was read; the configuration
  feeding it was not.**
  ✅ **DELIVERY IS PROVEN END-TO-END, TWICE.** Two browser tabs on Schedule; a
  fixture edited in one changed in the other with no refresh, and again in
  reverse when the edit was undone.
  ⚠️ **THE OBVIOUS CONFOUND WAS RULED OUT AND IT MATTERED**: looking at the
  second tab focuses it, so a focus-triggered refetch would have faked the
  result. There is no `visibilitychange`, no focus listener and no
  `refetchOnWindowFocus` anywhere in `src/` — **and that negative was checked
  against a control search that found real matches**, per rule 6.
  ✅ **THE RLS POLICY DISCRIMINATES — proved separately, at the policy layer.**
  As a genuine non-admin attached to two squads and not a third, with a probe
  fixture inserted into one of each inside a rolled-back transaction: the
  member's own squad came back, the other did not. **The visible row is the
  control** — without it, "cannot see the other" is indistinguishable from a
  broken query.
  ❌ **WHAT IS STILL NOT OBSERVED, AND IT IS THE SAFETY HALF.** Both test tabs
  were the same admin, so nobody has watched a non-admin *fail* to receive a
  change for a squad they are not in. Supabase documents that read policies
  apply to `postgres_changes`, and the policy underneath is now verified — so
  this is well-evidenced, not unknown. **It is not measured.** The outstanding
  test is one observation: a non-admin on Schedule while a squad they are NOT
  in has a fixture EDITED.
  ⚠️ **THAT TEST MUST BE AN EDIT, NEVER A DELETE, AND THE PLAN AS FIRST WRITTEN
  WOULD HAVE FAILED ITSELF.** Supabase's own docs: *"RLS policies are not
  applied to `DELETE` statements, because there is no way for Postgres to verify
  that a user has access to a delete"*. So a deleted fixture reaches EVERY
  subscriber regardless of squad, and under a rule that says "if her screen
  reacts, revert" that is a false alarm which would revert a working migration.
  **No data leaks** — `events` is replica identity DEFAULT, the payload is a
  bare id, and `subscribeEvents` discards it and re-reads under RLS.
  ⚠️ **AND THE THUNDERING-HERD CONCERN IS NOW REAL FOR THE FIRST TIME.** Every
  warning about "realtime triggers a full refetch for every subscriber in scope"
  was previously describing something that never fired. From today it fires.
  At the club's current size this is nothing; **at the 1500 members Jay expects
  it is the least-tested thing in the app**, and it cannot be measured in SQL.

- ✅ **EVERY SQUAD, AND WHO LOOKS AFTER IT — `/admin/staff` IS LIVE** (`22739ad`),
  with `memberships.title` so a coach can be a Head Coach.
  ⚠️ **THIS ENTRY WAS MISSING FROM THIS FILE FOR A DAY WHILE THE FEATURE WAS LIVE**,
  and only `claude/changelog.md` recorded it. This file is step 3 of the reading
  order: **a feature absent from it is a feature the next session proposes
  building.** The same failure is written up two sections above about league teams
  and match sheets; it happened again in the very next commit.
  ⚠️ **BUILT IN THE OPPOSITE ORDER TO THE REQUEST, ON A MEASUREMENT.** Jay asked
  for age groups to see their coaches on the HOME screen. Twelve of fifteen squads
  had nobody attached, so the member-facing card would have shipped empty to most
  of the club with no way to see why. **The admin directory is the only view that
  surfaces the missing data the rest of the feature depends on.**
  ~~⚠️ **The Home card is PHASE 3 and is NOT built**~~
  ✅ **SHIPPED THE SAME DAY — "Squad contacts" IS ON HOME.** The mechanism is the
  one that header predicted: a `SECURITY DEFINER` function,
  `public.my_squad_staff()`, **never an RLS policy on `profiles`**, because a
  `profiles` row carries `email` and `phone` and RLS authorises rows, not
  columns — and a column grant cannot fix it either, since grants apply to the
  whole `authenticated` role including the admins who need those columns on
  Accounts. **The boundary is the function's fixed seven-column result**, so
  `is_super` and `admin_rights` are unreachable rather than merely undrawn.
  ⚠️ **A TITLE IS NEVER PERMISSION** — `can_edit_team` keys off `role`, and it
  must stay that way.
  ⚠️ **CONTACT DETAILS ARE ON THE CARD, AND THE PLAN'S RECOMMENDATION WAS
  OVERRULED.** The plan recommended an opt-in toggle defaulting OFF. Jay,
  13 Aug 2026: *"stop worrying about the opt in, the staff automatically opts in
  when accepting the position"*. **Do not narrow it back to name-and-title on
  the strength of the plan document.**
  ⚠️ **THE GATE IS `can_see_team`, NOT `is_attached_to_team`,** and the one
  difference is `status = 'active'`. `event read` uses the status-blind one
  deliberately ("fixtures are not sensitive"); a volunteer's mobile is not a
  fixture, so **a PENDING member sees an empty card, not a refusal.**
  ⚠️ **THE BLOCK IS BUILT FROM THE PERSON'S OWN MEMBERSHIP ROWS, NOT FROM
  `visibleTeams()`** — which hands an admin all fifteen squads, and
  `can_see_team` is true for an admin on every one of them, so the RPC really
  does return the whole club to Jay. Filtering client-side is what keeps Home to
  "your squads" and is what makes **view-as** narrow correctly. It is cosmetic,
  never a boundary.
  ⚠️ **STILL SHOWING ITS EMPTY STATE TO MOST OF THE CLUB, BY DESIGN.**
  Re-measured live the same evening: **12 of 15 squads still have nobody
  attached, and 0 of 8 staff have a title set.** The card says the staff are not
  *listed* rather than that the squad has none — every one of those squads has
  real adults running it and what is missing is the data. **The prerequisite is
  an admin data task on `/admin/staff`, not code.**
  ✅ **PHASE 4 IS BUILT TOO — STAFF PHOTOS ARE LIVE.** `profiles.photo_path`, a
  private `staff-photos` bucket, two storage policies, `public.set_my_photo()`,
  and a "Your photo" card on `/more`. All four phases of that plan shipped in
  one day.
  ⚠️ **A SEPARATE BUCKET FROM `player-photos`, AND THAT IS A RULING.** That one
  holds photographs of CHILDREN behind policies written around squad
  membership. Nothing written for staff can widen it.
  ⚠️ **THE WRITE RULE IS NARROWER THAN THE PLAYER ONE, DELIBERATELY: OWN PREFIX
  ONLY.** A player photo may be uploaded by that child's coach, because a
  nine-year-old cannot. A coach is an adult with their own login, so nobody else
  picks the picture of your face that thirty families see.
  ⚠️ **`FOR ALL` WITH BOTH `using` AND `with check` — the trap the plan named.**
  An INSERT consults `with check` ALONE, so `using` on its own would let any
  signed-in account create an object under somebody else's prefix.
  ⚠️ **`private.can_see_staff_photo` MIRRORS `my_squad_staff()` AND MUST KEEP
  MIRRORING IT.** The card draws the NAME from the function and the FACE from
  the policy; if they drift a parent sees a photograph of somebody the app will
  not name. Harness: `db/tests/rls-staff-photos.sql`, proved against an injected
  fault and with a separate arm for the `status` rule.
  ⚠️ **`profiles.photo_path` IS DELIBERATELY NOT COLUMN-GRANTED** — the opposite
  of `memberships.title`. A column grant applies to the whole `authenticated`
  role; this is written by the person themselves, through the SECURITY DEFINER
  RPC, which also refuses a key that does not live under the caller's own id.
  ⚠️ **`getMyProfile` IS A COLUMN LIST AND NEEDED `photo_path` ADDING.** Leave
  it off and nothing breaks: `/more` renders the monogram forever and an upload
  appears to succeed and then vanish on reload. Silent, and it looks like a
  storage fault.
  ❌ **NOBODY HAS UPLOADED ONE IN THE REAL APP.** The upload path is covered by
  unit tests and the policies are proved live in SQL, but there is no `/more`
  scenario in `harness/` and no photograph has gone through the real control in
  a browser. **The first real upload is the test.**

- ✅ **FIXED THE SAME DAY — ONLY TWO FUNCTIONS ARE ANON-EXECUTABLE NOW, BOTH
  DELIBERATELY.** `db/migrations/20260813_revoke_anon_execute.sql`. **Ten of the
  fourteen functions in `public` were reachable by `anon`; two are.**
  ⚠️ **BOTH REVOKES ARE NEEDED AND NEITHER ALONE IS ENOUGH — the first attempt
  fixed five of eight and it looked done.** A function can carry a named `anon`
  grant (Supabase's default privileges) AND a `PUBLIC` grant (`=X/postgres`),
  independently; `anon` inherits through PUBLIC. So `revoke … from public` alone
  leaves the named grant, and `revoke … from anon` alone leaves PUBLIC. **The
  only honest check is `has_function_privilege('anon', oid, 'execute')`** —
  never a reading of the migration text, which is what produced the wrong belief
  for a fortnight.
  ⛔ **`calendar_events_for_token` AND `register_my_player` KEEP `anon` AND MUST
  NOT BE "TIDIED".** The first is the calendar feed, called by Google/Apple with
  no session; `netlify.toml` records that a subscribed URL cannot be changed
  remotely, so revoking it breaks every subscribed feed in the club with no way
  to warn anyone and no way to repair it. **`db/tests/grants.sql` §3b now fails
  in BOTH directions** — if anything gains anon, and if either of those two
  loses it.
  ✅ **The calendar feed was smoke-tested live after the change: 200,
  `content-type: text/calendar; charset=utf-8`, valid VCALENDAR.** The
  content-type is the assertion that matters; the SPA catch-all answers any
  unknown path with `index.html`, so a bare 200 proves nothing.

- ⚠️ **`revoke execute … from public` DOES NOT KEEP `anon` OUT, AND NINE
  MIGRATIONS ARE WRITTEN AS THOUGH IT DOES.** Measured live 13 Aug 2026:
  `approve_membership`, `register_my_player`, `reset_my_calendar_token`,
  `set_admin_rights`, `set_own_player_photo` and `set_series_time_from` are all
  **executable by `anon`**. Only `delete_my_account` and the new
  `my_squad_staff` are not.
  ⚠️ **THE CAUSE:** Supabase ships `alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role` — a grant to
  `anon` **by name**, which revoking the `PUBLIC` pseudo-role never touches.
  ⚠️ **EACH IS SAFE TODAY ONLY BY ITS BODY, NOT BY ITS GRANT** — they all derive
  everything from `auth.uid()`, which is null for `anon`. Two of them
  (`register_my_player`, `approve_membership`) grant `anon` **deliberately**, so
  this is not a blanket revoke.
  ⚠️ **AND THE FACT WAS ALREADY WRITTEN DOWN.** `db/schema/functions.sql` states
  it exactly, in the `photo_backup_list_objects` entry, and calls the revoke
  "the load-bearing half". **Nobody applied it to the other RPCs** — the same
  shape as the branching failure two entries up, where "the migration table is
  polluted" and "branching replays migrations" were both recorded and never put
  together.

- ✅ **THE PLAYER PHOTOGRAPHS ARE BACKED UP — LIVE AND RUNNING NIGHTLY, 13 Aug
  2026.** The entry below said "written and protects nothing yet" for about an
  hour. Bucket `quins-player-photos` on Cloudflare R2 (APAC, private), function
  deployed `verify_jwt: false`, `pg_cron` job at 22:17 UTC. **6 of 6 copied, zero
  failed, five seconds**; a second run copied nothing.
  ⚠️ **`pg_cron` IS NOW INSTALLED**, which this file previously recorded as absent
  and as the reason a scheduled edge function was impossible here. That sentence
  is retired.
  ✅ **THE SCHEDULE WAS PROVED TO FIRE, NOT ASSUMED** — a temporary probe job at
  `* * * * *` was watched reaching `succeeded` in `cron.job_run_details` with its
  summary in `net._http_response`, then unscheduled. **A schedule that has never
  fired is not a schedule**, the same rule this file states for uptime monitors.
  ✅ **BYTE-IDENTITY IS PROVEN BY MD5, NOT INFERRED FROM SIZE** —
  `etag_mismatches: 0` across all six. ⚠️ **And the zero is not vacuous**: all six
  source rows carry an ETag and both sides deliver it QUOTED, so the
  quote-stripping bug that a unit test caught pre-deploy would have produced six
  mismatches rather than zero.
  ✅ **APPEND-ONLY IS NOW ENFORCED BY R2 ITSELF** — bucket lock `retain-one-year`,
  365 days, set while the bucket was empty so it binds every object. **This closes
  the gap the plan recorded as unfixable in the credential**: R2 tokens are Object
  Read only or Object Read AND Write, and write includes delete.
  ⚠️ **THE COST IS REAL AND JAY CHOSE IT: a deletion request cannot be fully
  honoured in the backup for up to a year.**
  ❌ **NOBODY HAS EVER GOT A PHOTOGRAPH BACK. Copying is not restoring**, and the
  drill's fourth requirement — somebody who did not build it following the restore
  procedure — is outstanding. Precedent: the database drill, where the failure
  everyone predicted did not happen.
  ⚠️ **Two traps, both now in the runbook**: `R2_ACCOUNT_ID` set to the whole
  endpoint URL rather than the account id (the function built a hostname out of a
  hostname), and Supabase's **confirmation dialog** when replacing an existing
  secret — miss it and the value silently does not save, which looks exactly like
  the fix not working.

- ~~⚠️ **THE PLAYER-PHOTO BACKUP IS WRITTEN AND PROTECTS NOTHING YET — 13 Aug 2026.**~~
  Plan `claude/plans/2026-08-13-player-photo-backup.md`, runbook
  `claude/runbooks/player-photo-backup.md`, function
  `supabase/functions/backup-player-photos/index.ts`, migration
  `db/migrations/20260813_photo_backup.sql`.
  ⛔ **NOTHING HAS RUN. There is no Cloudflare account, the migration is not
  applied, the function is not deployed, `pg_cron` is not installed, and no
  photograph has ever been copied or got back.** Do not read the code landing as
  the gap closing — the ⛔ item in §Open is unchanged until the drill passes.
  ⚠️ **`pg_cron` IS NOT INSTALLED — measured 13 Aug, `installed_version` null.**
  `pg_net` and `supabase_vault` are. So "a scheduled edge function" is not
  something this project can currently do, and the migration deliberately does not
  install an extension on the production database.
  ✅ **IT IS THE FIRST EDGE-FUNCTION LOGIC IN THIS REPO WITH ANY VITEST COVERAGE**,
  and the split is the point: `plan.ts` and `sigv4.ts` import nothing, so both Deno
  and vitest load them. RESTORE.md's "a Deno function is not a module the suite
  imports" still holds for the four deployed functions — it was a statement about
  how they are written, not a law.
  ⚠️ **APPEND-ONLY IS ENFORCED BY THE MODULE HAVING NO WAY TO SAY "DELETE"**, and
  a test asserts that no export ever matches `/delete|prune|remove|sync/`. Proved
  by adding an `objectsToDelete` and watching it go red.
  ⚠️ **AND THE CREDENTIAL DOES NOT ENFORCE IT.** R2's token presets are Object Read
  only or Object Read **and Write**, and write includes `DeleteObject`. The real
  control is bucket versioning plus Object Lock, which is **not done**.
  ⚠️ **THE DISCRIMINATING CHECK IS `only_in_backup`** — objects R2 holds that
  `player-photos` no longer does. A mirror quietly syncing deletions cannot produce
  that number. **It is zero until the first head shot is replaced, and zero is "not
  yet demonstrated", not a pass.**

- ❌ **`db/tests/grants.sql` HAD BEEN FAILING AGAINST LIVE SINCE 10 Aug AND
  NOBODY SAW IT, BECAUSE NOBODY RAN IT.** Found 13 Aug while verifying an
  unrelated migration. Its check 1c said *"these five are the only column-level
  grants in the schema"* — false within hours of being written, when
  `super_admin_and_rights` added six on `memberships` the SAME DAY, then
  `social_ideas` added four on 12 Aug and `memberships.title` a seventh on 13 Aug.
  ⚠️ **THE DATABASE WAS RIGHT AND THE CHECK WAS WRONG.** All sixteen column
  grants live are deliberate and recorded in `db/schema/grants.sql`. Nothing was
  exposed; a guard was simply not guarding.
  ⚠️ **THE LESSON IS THE SIBLING OF RULE 6, AND THIS REPO DID NOT HAVE IT WRITTEN
  DOWN: a check nobody RUNS is not a check, in exactly the way a check that has
  never FAILED is not a check.** Its own header said "parts 1 and 2 were run
  against live and passed", which was true on the day and is precisely what stopped
  anyone looking again. ⚠️ **Neither `npm test` nor CI can catch this** — the repo
  is public, so CI has no credentials, and these harnesses only ever run when a
  human pastes them.
  ✅ **Fixed and re-run green**, and two assertions ADDED that nothing had:
  `memberships.title` must still BE granted (losing it reads exactly like an RLS
  refusal), and `is_super` / `admin_rights` must NOT be. **Non-vacuity proved
  read-only rather than by injecting a grant** — `role` and `title` come back
  true from the same probe that returns false for `is_super`, so the probe
  distinguishes granted from not. Injecting the real fault would have meant
  granting self-promotion on production, which the harness's own header warns
  against doing through the MCP.
  ❌ **AND `db:check` DID NOT FINISH THE JOB — NINE OF THE FIFTEEN HARNESSES
  COULD NOT FAIL. Found 13 Aug 2026, hours after it was written.** The runner
  threw on a SQL *error* and discarded every result set, so a harness whose
  assertions are SELECTs (`select count(*) as leaked_expect_0`) reported `ok`
  whatever number came back. The verdict was computed, printed, and compared to
  nothing — in nine files, every one guarding an RLS boundary.
  ⚠️ **THAT IS THE SAME BUG ONE LAYER UP.** The runner removed the friction that
  stopped anyone RUNNING the checks and left most of them unable to report a
  wrong answer. **A check that runs and cannot fail is not a check either.**
  ✅ **FIXED: the runner now REFUSES a harness with no `raise exception`** (the
  same shape as the existing begin/rollback gate, and proved by planting a file
  and watching it stop), **and it prints every result row** so a number that is
  technically within its assertion can still be spotted. All fifteen now carry
  assertions, each proved to fire against an injected fault.
  ❌ **AND `rls-can-edit-team-status.sql` WAS BROKEN THREE SEPARATE WAYS**, none
  ever hit because nothing had run it: it inserted `profiles.club_id` (a column
  that does not exist — instant 42703), it never granted its temp table to
  `authenticated` (42501, which reads exactly like the RLS refusal it tests),
  and it picked its subject squad with `order by sort_order limit 1` — **today
  that is U6 Tag, zero players, zero events**, so every "expect 0" was trivially
  true and its fault-injection arm could never flip. It now selects the squad
  with the most data and **raises if no squad has both players and fixtures**,
  rather than passing vacuously.
  ⚠️ **THE TRANSFERABLE RULE: a harness must pick its subject by the property it
  needs, never by an ordering that happens to have it today.** That file was not
  always vacuous — its footer records `events 34` on 10 Aug. The seeded September
  and the senior squads went, and the fixture moved out from under a hard-coded
  choice with nothing to say so.

  ✅ **AND THE UNDERLYING CAUSE IS NOW FIXED, NOT JUST THE CHECK: `npm run
  db:check` RUNS THEM ALL.** `scripts/db-check.mjs`, runbook
  `claude/runbooks/db-harnesses.md`. The reason nobody ran them was that running
  them meant pasting fourteen files into the SQL editor by hand — **the fix was
  friction, not discipline.** A nightly GitHub Actions job
  (`.github/workflows/db-check.yml`) runs them too, and is **inert until Jay
  adds the `SUPABASE_DB_URL` secret** rather than failing every night with a
  credential error everyone learns to ignore.
  ⚠️ **THE RUNNER ENFORCES THE ROLLBACK RATHER THAN TRUSTING IT.** It refuses to
  run any harness containing `commit;`, or lacking `begin;`/`rollback;`, and
  refuses **before it connects**. That matters because several harnesses inject a
  REAL fault on production to prove they are not vacuous, and one of those faults
  is "any club admin may rewrite any member's login email". **Both refusals were
  proved by planting a bad file and watching the runner stop.**
  ⚠️ **IT MUST NEVER BECOME A REQUIRED CHECK, AND THE WORKFLOW MUST NEVER GAIN A
  `pull_request` TRIGGER.** These assert against LIVE, so a red run means
  production drifted rather than that a branch is bad — as a gate it would block
  every unrelated merge. And this repo is PUBLIC: `schedule` and
  `workflow_dispatch` cannot be fired from a fork, which is the only thing making
  a database credential safe in Actions at all.
  ⚠️ **`pg` IS NOW A devDependency**, the first one added for tooling rather than
  the app. `psql` is not installed on jay-pc, and a runner Jay cannot run does
  not fix the friction that caused this.
  ✅ **`db/tests/photo-backup.sql` NOW EXISTS**, closing a gap in the same
  session that opened it: the photo-backup grants were verified when the
  migration was applied — as ad-hoc SQL in a chat, which is once, by one person,
  where nobody can re-run it. **Verified against live including its self-test,
  and the injected grant confirmed gone after the rollback.**

### As of 14 Aug 2026

- ✅ **THE NOTICEBOARD IS LIVE — 14 Aug 2026** (`cb0c5e0`, PR #105). Plan
  `claude/plans/2026-08-14-notices.md`, migration
  `db/migrations/20260814_announcements.sql`, harness
  `db/tests/announcements.sql`, screen `src/screens/Notices.jsx`.
  ✅ **THE MIGRATION IS APPLIED TO PRODUCTION — 14 Aug 2026** — and the harness
  then ran against live for the first time: **15 of 15 green**. All five
  `db/schema/` files re-captured from the catalogue in the same commit.
  ✅ **AND IT IS DEPLOYED, VERIFIED IN THE SERVED BUNDLE** rather than in a
  browser — `/index.html` → `/assets/index-B0FJg607.js` → six strings only this
  build has. ⚠️ **The search was proved non-vacuous in the same breath**: the
  harness fixture names and a nonsense control all came back ABSENT from that
  same bundle. ⚠️ **One control, `Zayed`, came back FOUND and was NOT a leak** —
  `EventForm.jsx` has always carried `DEFAULT_VENUE = 'Zayed Sports City'`. **A
  control has to be checked against the source before it is believed**, which is
  the same lesson as "confirm the search can find something you know is there",
  arriving from the opposite direction.
  ⛔ **STILL UNEXERCISED BY A REAL PERSON. No coach has posted a notice and no
  parent has read one**, so nothing is known about the feature beyond the
  database refusing the right things and the bundle being served. **Do not read
  "live" as "working"** — the same trap the match sheet and the scoring model
  entries above both carry.
  ⛔ **AND THE `/notices` SCREEN ITSELF HAS NEVER RENDERED AGAINST REAL DATA.**
  Only the pure `NoticeBoard` card is in `harness/`.
  ⚠️ **PHASE 1 SENDS NO EMAIL AND THAT IS THE DESIGN, NOT AN OMISSION.** Resend
  Pro removed the 100/day ceiling on 13 Aug — a brake nobody designed — so the
  outbox, the preferences table and unsubscribe are phase 2 and must exist
  BEFORE anything here can reach an inbox. **A notify trigger added to phase 1
  is the runaway that cap used to catch.**
  ⚠️ **THE READ GATE IS `can_see_team`, NOT `is_attached_to_team`**, so a
  PENDING member sees an empty board. Deliberately unlike `event read`, and the
  second reason is the one to carry: **the audience count is a feature and has
  to mean something.** "18 of 24" must not count accounts nobody approved.
  ⚠️ **AUDIENCE IS NOT READERSHIP** — an admin can read a squad notice and is
  not counted in it.
  ✅ **AND THE AUTHOR IS NOT IN IT EITHER — fixed 14 Aug 2026**,
  `db/migrations/20260814_announcement_author_not_audience.sql`, applied to
  production. A COACH holds a membership on the squad they coach, so a coach
  posting to their own squad was counted in the audience they were writing to,
  and the mark-on-render recorded their own read — **"1 of 25 seen" before
  anybody else opened the app.**
  ⚠️ **IT WAS INVISIBLE IN THE FIRST REAL TEST AND THAT IS THE TRANSFERABLE
  PART.** That notice was posted by a CLUB-WIDE admin to a squad they are not
  attached to, so it read a correct "1 of 8". **Whether the author was counted
  depended on the shape of their membership**, so the same screen meant
  different things for a coach and for an admin. A test by the one person whose
  membership shape hides a bug is not a test of the bug.
  ⚠️ **THE EXCLUSION IS IN BOTH FUNCTIONS AND IN BOTH HALVES OF THE COUNT.**
  The author's read row still exists; only the join back to the audience drops
  it. Numerator-only or denominator-only lets a notice report "1 of 0 seen".
  ⚠️ **`team_id` IS NOT UPDATABLE**, enforced by the COLUMN GRANTS and not by
  the policy. Restoring that grant "for consistency" silently reopens
  re-scoping a notice after it has been read, and every existing test stays
  green.
  ⚠️ **THE HOME CARD SITS ABOVE THE FIXTURE HERO** — a knowing departure from
  `claude/specs/design-system.md` §5.1, approved by Jay from a mockup, and
  survivable only because the card returns null rather than an empty box. If it
  ever renders a placeholder, that decision has to be re-made.
  ✅ **THE SCHEMA WAS EXERCISED AGAINST PRODUCTION IN A ROLLED-BACK
  TRANSACTION** — the pattern this file recommends in place of a branch. 13 of
  14 assertions green on the first complete run.
  ⚠️ **THE FOURTEENTH IS WORTH KNOWING AND IT WAS THE HARNESS'S BUG, NOT THE
  SCHEMA'S**: `auth.users` carries `on_auth_user_created` → `handle_new_user()`,
  which creates the `profiles` row with an EMPTY `full_name`, so a later
  `insert into profiles … on conflict (id) do nothing` does nothing and every
  fixture ends up nameless. It looked exactly like a broken `order by`.
  ⚠️ **AND `memberships_unique_grant` IS `(profile_id, club_id, role, team_id,
  player_id)`** — so a parent with two children in one squad really does hold
  two active membership rows, which is why the audience count must dedupe on
  `profile_id`. Found by the constraint refusing the fixture.
  ❌ **THE `/notices` SCREEN HAS NO REAL-BROWSER COVERAGE.** Only the pure
  `NoticeBoard` card is in `harness/` (scenario `notices`), measured at 320px
  and proved non-vacuous with a 900px probe.

- ⚠️ **A PRODUCTION READINESS AUDIT WAS RUN ON 13 Aug 2026** and its findings are
  NOT all recorded here — the report is a session artefact, not a repo document.
  The ones that became work are in §Open.
  ❌ **ITS HEADLINE MEASUREMENT — "`events` has no index on `team_id` or
  `starts_at`" — WAS FIXED THE SAME DAY AND THIS LINE WENT ON ASSERTING IT.**
  `db/migrations/20260813_events_indexes_and_social_upload_gate.sql` added
  `events_team_starts_idx`, `events_club_starts_idx` and
  `events_league_team_id_idx`; all three are live and captured in
  `db/schema/tables.sql`. **A later session read this file, believed it, and set
  out to re-do work that had already shipped.** That is the specific cost of a
  stale measurement sitting in a line labelled load-bearing.
  ⚠️ **THE ADVISOR HALF OF THE ORIGINAL CLAIM STILL STANDS** — `auth_rls_initplan`
  and `multiple_permissive_policies` were re-measured live on 13 Aug and were
  unchanged. **Do not cite the counts from here; run `get_advisors`.** No index
  addresses either: both are per-row policy costs.

- ⚠️ **`events_club_starts_idx` DOES NOT SERVE THE PATH IT WAS ADDED FOR, AND
  ONLY A PLAN READ SHOWS IT.** Measured 13 Aug 2026 against ~4,000 seeded events
  in a rolled-back transaction, as a real signed-in member with RLS live.
  **The club-wide read still comes back `Seq Scan`.** `listEvents` with no team
  filter sends no `club_id` predicate, and the `event read` policy filters on
  `team_id` (`is_attached_to_team` / `can_edit_team`), never on `club_id` — so
  the index's leading column is unconstrained and Postgres cannot use it.
  ⚠️ **THE MIGRATION STATES THAT EXACT RULE AS ITS REASON FOR ADDING A SECOND
  INDEX, AND THEN ADDS ONE WITH THE SAME FLAW.** A correct comment on an index
  that does not do what it says is harder to catch than no comment at all.
  ✅ **`(starts_at, id)` FIXES IT, AND IS NOW APPLIED AND CAPTURED** —
  `db/migrations/20260813_events_starts_index.sql`. The plan becomes an Index
  Scan and the Sort node disappears entirely, because the index supplies the
  order. Applied to production 13 Aug and re-captured into
  `db/schema/tables.sql` in the same commit.
  ⚠️ **THE TEAM-SCOPED PATH WAS ALREADY CORRECT** — `events_team_starts_idx` is
  used, with both the `team_id` filter and the `starts_at` range in the index
  condition. Whatever is done about the club-wide path, do not touch that one.
  ⚠️ **AND THE URGENCY IN THAT MIGRATION'S HEADER IS OVERSTATED.** It warns the
  far end is "a hard 8-second FAILURE on the Schedule screen". At ~4,000 events
  the worst plan measured is two orders of magnitude short of that, on wall times
  this schema inflates ~4x. The index is worth having; the deadline is not real.
  ⚠️ **DEEP PAGING BARELY IMPROVES, WHICH IS NOT WHAT WAS EXPECTED.** `.range()`
  is OFFSET/LIMIT and OFFSET walks every skipped row whatever the index does, so
  the win is concentrated on the first page. **Do not justify this index by page
  depth.**
  ⚠️ **SCOPE: `events` ONLY, AND SINGLE-QUERY COST ONLY.** Roster, availability
  and attendance were not measured, and nothing here says anything about 1500
  people querying at once — the realtime full-refetch-on-any-change behaviour is
  the untested risk and SQL cannot measure it.
  ⚠️ **AND ONE ABOUT THE SUITE, WHICH IS THE ONE NOTHING ELSE WOULD HAVE CAUGHT:
  `npm test` IS NOT DETERMINISTIC.** Two full runs, same tree, same command,
  minutes apart: **4 failed** in `tests/admin-dashboard.test.jsx`, then **1904
  passed**. That file alone passes 17/17. `test` is a REQUIRED check on a protected
  `main` that deploys live, so this cuts both ways — a red run that is fine trains
  people to re-run, and a green run proves less than it appears to. **Do not
  dismiss a single red CI run on this repo as "the flaky one" until this is fixed.**
  ⚠️ **REPRODUCED 13 Aug 2026 IN A DIFFERENT PAIR OF FILES, AND THAT NARROWS THE
  DIAGNOSIS.** Two consecutive full runs, same tree, same command, minutes
  apart: first **2 failed** — one in `tests/accounts.test.jsx`, one in
  `tests/player-form.test.jsx` — then **2126 passed**. Both files pass 124/124
  run on their own, and neither imports the module the session was changing.
  **So this is NOT "the admin-dashboard file is flaky": at least three test
  files have now produced a phantom failure, which points at cross-file state or
  scheduling rather than at anything inside one file.** Whatever gets chased
  first, it is not `tests/admin-dashboard.test.jsx`.
  ✅ **DIAGNOSED AND FIXED — 14 Aug 2026. IT WAS ONE CONFIG LINE, AND IT WAS
  NEITHER CROSS-FILE STATE NOR ANYTHING INSIDE ANY FILE.** `vite.config.js` now
  sets `testTimeout: 15000`; vitest's default is 5000.
  ⚠️ **THE MECHANISM, AND IT EXPLAINS WHY CHASING FILES COULD NEVER CONVERGE.**
  The heaviest tests here legitimately cost **1.4-2.6s** in jsdom — the worst is
  InviteForm's five-children case, which types five search terms into a picker
  over a 45-player roster and re-renders on every keystroke. Against a 5000ms
  ceiling that is a margin of about **2x**. Contention slows everything
  proportionally, so **whichever test sits nearest the ceiling tips over, and
  which FILE that is depends on machine load rather than on the file.**
  ✅ **REPRODUCED ON DEMAND rather than waited for** — oversubscribe the pool
  (16 logical CPUs, 40 forks): **8 loaded runs, 8 failures, every one of them
  "Test timed out in 5000ms"**, across `invite-form`, `event-form-competition`
  and `repeating-events` — **three files, none of them the four originally
  blamed.** The 2.27s test measured 5.02s under that load.
  ✅ **AND THE FIX WAS PROVED THE WAY THIS FILE INSISTS ON: 6 loaded runs green
  under the identical command, then the fault injected by putting 5000 back on
  the command line — red again, same test, immediately.**
  ⚠️ **A GUARD EXISTS BECAUSE A CONFIG LINE IS THE EASIEST THING HERE TO DELETE
  BY ACCIDENT** — `tests/test-timeout.test.js`, asserting a FLOOR rather than a
  value, proved against both faults (lowered, and removed entirely).
  ⚠️ **IT RUNS IN THE `node` ENVIRONMENT, NOT THE SUITE'S jsdom**, and it has to:
  importing `vite.config.js` pulls in esbuild, which refuses to load under jsdom
  and fails as a COLLECTION error naming esbuild with zero tests run. That looks
  like a broken dependency and is a wrong environment.
  ⚠️ **THIS DOES NOT MAKE A SLOW TEST CORRECT.** A test approaching 15s on an
  idle machine is doing too much, and the fix there is the test.
  ✅ **AND THE TESTS WERE THEN MADE FASTER AT SOURCE — 14 Aug 2026.**
  `userEvent` defaults to `delay: null` in `src/test/setup.js`, because
  user-event awaits a macrotask between EVERY KEYSTROKE. `invite-form` **11.8s →
  4.7s**; the suite at four workers **77.9s → ~59s**. So the heaviest test now
  runs at well under a second and the timeout margin is ~15x rather than 2x —
  **the ceiling and the floor were both moved, on purpose.**
  ⚠️ **`pool: 'threads'` IS ~9% FASTER AND BREAKS THIS SUITE. MEASURED, NOT
  FEARED.** **Eleven test files mutate `process.env.TZ`**; threads share one
  process, so it leaks and dates go off by one — `expected 25 to be 24` in
  `event-format`, `expected 21 to be 20` in `schedule`. **Forks isolate by
  process and that is the only reason the suite is currently correct.** Do not
  re-propose threads without removing the TZ mutation first.
  ✅ **AND THE DOM-FREE FILES NOW RUN IN `node` — DONE 14 Aug 2026.** Every test
  file that touches no DOM carries `// @vitest-environment node` as its first
  line; `vite.config.js` carries the reasoning. **Count them rather than citing
  a number here.**
  ⚠️ **THE DISCRIMINATING CHECK IS VITEST'S OWN `environment` FIGURE, NOT
  "THE TESTS STILL PASS".** A docblock that is malformed, or not on the first
  line, is **silently ignored** — the file keeps running in jsdom and keeps
  passing, so a green run says nothing at all. Across the qualifying files that
  figure went **43.91s → 10ms**, which is the measurement to repeat.
  ⚠️ **IT BARELY MOVES THE WALL CLOCK ON A BIG MACHINE AND THAT IS EXPECTED.**
  On 16 cores the run is bound by the slowest FILE, so it stays ~40s. At four
  workers — the shape of the CI runner — **~59s → ~50-53s**. The win is CPU, and
  CPU only becomes time when the workers are the bottleneck.
  ⛔ **A TEST FILE WHOSE CLOSURE REACHES `@supabase/supabase-js` MUST STAY IN
  jsdom, AND GETTING THIS WRONG ONLY FAILS IN CI.** supabase-js needs a global
  `WebSocket`: jsdom has one, **Node 20 — which `.github/workflows/test.yml`
  pins — does not** (it became a global in Node 22), and **both dev PCs run Node
  24**. So the first attempt was green locally and red in CI with
  `Node.js detected but native WebSocket not found`, an error naming nothing to
  do with the docblock that caused it. Eight files went back to jsdom.
  ⚠️ **TRACE THE CLOSURE, NOT THE VISIBLE IMPORTS** — four of the eight reach it
  only transitively, and `tests/session-guard.test.js` reaches it through a
  **dynamic** `import(MODULE_PATH)`, which is exactly the one a grep for
  `from '…'` misses.
  ✅ **REPRODUCIBLE ON A DEV MACHINE**: `delete globalThis.WebSocket` at the top
  of `src/test/setup.js` makes any Node 22+ machine behave like CI for this.
  Proved both directions — annotated files pass without it, a supabase-touching
  file put back on `node` fails with the exact CI error.
  ⚠️ **Bumping CI to Node 22+ would retire this whole trap.** Not done; it
  changes the runtime the production build runs on.

### As of 14 Aug 2026

- ⛔ **SELF-REGISTRATION WAS PUTTING THE WRONG PEOPLE ON THE ROSTER, AND HAD
  BEEN SINCE IT SHIPPED.** Reported by Jay from the real club. `register_my_player`
  INSERTed a new `players` row **unconditionally on every call** — there was no
  uniqueness of any kind, at any layer, on a roster of children.
  ⚠️ **TWO DIFFERENT FAILURES that look like one problem from the Accounts
  screen.** ⚠️ **The names below are INVENTED**; the spellings reproduce the
  real cases exactly, which is all the example is for.
  - **One child, two roster spots, two accounts** — U18B Contact.
    `Sara Ahmed` created by a parent's account and `sara noor ahmed` by the
    player's own. Neither account could see the other's row, so neither could
    possibly notice.
  - **A parent on the roster as a player** — U14B Contact. The account
    `Pieter Vos-Meijer` registered `PIETER VOS` (themselves) alongside
    `Lars Vos-Meijer` (their child). Both landed as role `parent`, so the "Who
    are you registering?" control was simply left on its default, *My child*.
  ✅ **FIXED — two server-side guards, `db/migrations/20260814_registration_duplicate_guards.sql`.**
  `42710` for a name already on that squad, `42809` for the registrant's own
  name filed as a child.
  ⚠️ **THE CHECK CANNOT LIVE IN THE CLIENT, AND THIS IS THE REASON THE BUG
  EXISTED.** A registering parent holds a PENDING membership, so `player read`
  (`can_see_team`) returns nothing — a client-side "is this already here?"
  answers **no** every single time. Only the `SECURITY DEFINER` function can see
  the squad on their behalf. The matching rule therefore lives in SQL and
  nowhere else (`private.name_match_key`).
  ⚠️ **FIRST token + LAST token, case- and punctuation-blind**, which is what
  makes `Sara Ahmed` match `sara noor ahmed` while correctly leaving
  `PIETER VOS` and `Lars Vos-Meijer` alone. `[^[:alnum:]]+` not
  `[^a-z0-9]+` — the club has accented and Arabic-script names and the
  unicode-aware class keeps them intact.
  ⚠️ **TWO SEPARATE CONFIRMATION FLAGS, NOT ONE**, and a harness asserts it: a
  single "yes I'm sure" would mean confirming *a different child with the same
  name* also waved through *I am registering myself as my own child*. Different
  mistakes, different sentences, and a tick may only forgive the one it was
  shown.
  ⚠️ **THE GUARDS PROTECTED THE LIVE APP BEFORE ANY DEPLOY.** Both new
  parameters default to `false` and PostgREST calls by NAME, so the bundle that
  was already serving resolved to the new function and was immediately guarded —
  verified against live before applying. The deploy only adds the ticks that let
  a genuine same-name case through.
  ⚠️ **AN ENUMERATION ORACLE WAS ACCEPTED KNOWINGLY**: "someone with that name
  is already registered in U18B" confirms a child's existence to any account
  with a confirmed email, and a refusal creates no row so the pending cap does
  not limit probing. Reasoning is in the migration; the message deliberately
  does not echo the stored spelling.
  ~~⛔ **THE TWO BAD ROWS ARE STILL THERE. Deleting a child's record is the
  club's call, not a migration's.**~~
  ✅ **BOTH WERE REMOVED ON 14 Aug 2026, on Jay's instruction** — the detail is
  in `claude/changelog.md`, and it was **re-measured live: neither row exists**.
  ⚠️ **THIS LINE WENT ON SAYING ⛔ FOR A DAY AFTER THE CLEANUP LANDED**, with
  only the changelog recording it — the same failure this file warns about three
  sections above, arriving inside a single day. **A ⛔ in the step-3 entry point
  is an instruction to the next session**, and this one would have sent somebody
  to delete two rows that are not there.
  ⚠️ **THE PARENT'S LOGIN SURVIVED THE CLEANUP AND SHOULD HAVE** — only the
  bogus PLAYER row went. Measured: the account is still on `profiles`.
  ❌ **AND THE FORM'S CONFIRM UI HAS NOT BEEN SEEN IN A BROWSER** — there is no
  sign-up scenario in `harness/`. Covered by five unit tests, proved
  non-vacuous by injection, and unexercised by a human.

- ⚠️ **THE FLAKY SUITE HIT A FOURTH FILE — `tests/notice-board.test.jsx`**,
  which failed in a full run and passes 9/9 alone. With `accounts`,
  `player-form` and `admin-dashboard`, that is four unrelated files. **It is not
  "the admin-dashboard one".**
  ✅ **THE FLAKE IS FIXED — see the timeout entry in the 13 Aug section above.**
  `accounts` and `player-form` both hold tests in the 1.9-2.6s band and fit the
  mechanism exactly.
  ❌ **BUT `notice-board` DOES NOT FIT IT, AND THAT IS RECORDED RATHER THAN
  TIDIED AWAY.** Every test in that file is synchronous and the whole file runs
  in ~160ms — reaching 5000ms would need a 31x slowdown, where the worst
  measured under deliberate oversubscription was 2.2x. **Its failure was never
  reproduced and its message was never recorded**, so what happened there is
  unknown. The likeliest remaining explanation is a worker dying under load, in
  which case vitest blames whichever file it was running — which would hit a
  fast file as readily as a slow one.
  ⚠️ **So the timeout fix is well-evidenced for three of the four files and is
  an ASSUMPTION for the fourth.** If a phantom failure appears again, the thing
  to capture is **the message**, not the file name.

- ✅ **NOTHING GRANTS SQUAD ACCESS WITHOUT AN ADMIN ANY MORE —
  `claim_roster_access` NOW INSERTS `pending`, NOT `active`.**
  `db/migrations/20260814_claim_roster_access_pending.sql`. Jay's ruling,
  14 Aug 2026, on being shown this was the one path that opened an age group
  with no human involved.
  ⚠️ **THIS OVERTURNS A DELIBERATE EARLIER RULING**, stated in
  `20260809_notify_pending_membership.sql`: *"claim_roster_access inserts ACTIVE
  rows (a roster email match IS the verification)"*. **That was sound while the
  club expected to IMPORT a roster** — an email already on a child's record had
  been put there by the club. Since the no-roster-import ruling (10 Aug) every
  `player_contacts.email` was put there by whoever registered that child, so a
  match proves two accounts share an address and nothing more.
  ⚠️ **AND IT WAS REACHABLE, NOT THEORETICAL.** Several children carry their OWN
  email on their contact record, so when that child signed up they were handed
  the entire squad — every other child's name, photo and parent contact details
  — with no coach or admin seeing it happen. **Measured before and after: 1
  player of 6 visible now, where it was all 6.**
  ⚠️ **THE MATCHING IS UNCHANGED — only the granting.** Identifying WHICH child
  an account belongs to is still automatic and still saves the detective work.
  **Identifying and granting are two different jobs and this function was doing
  both.** Keep them apart.
  ✅ **ADMINS NOW GET TOLD.** `notify_pending_membership` fires
  `when (new.status = 'pending')`, so these inserts used to slip past it
  silently and now email the squad's staff like any other registration.
  ⚠️ **NO EXISTING MEMBERSHIP WAS DOWNGRADED** — anyone already active stays
  active, and `memberships` records no provenance so there is no way to tell
  which active rows came from this path anyway.
  ⛔ **THE MATCHER WAS NOT WIDENED.** A `player_parents.email`/phone signal, and
  re-checking when a PLAYER is created rather than only when the person signs
  in, were both proposed on 14 Aug and are **NOT built** — Jay answered the
  granting half of the question only. **Identifying is safe to automate;
  granting is not.**

- ✅ **A `parent` OR `player` MEMBERSHIP MUST NOW POINT AT A PLAYER** —
  `memberships_family_role_needs_player`, `db/migrations/20260814_family_role_needs_player.sql`.
  Jay's ruling, 14 Aug 2026: *"nobody outside staff should be able to create an
  account without a player"*.
  ⛔ **IT DOES NOT STOP ANYBODY CREATING A LOGIN, AND NOTHING CAN.** Signing up
  is Supabase auth and the app REQUIRES it before registration — sign up,
  confirm the email, then add your player. **An account with no membership at
  all is a normal, temporary state**; three existed the day this shipped, all
  people whose child had already been registered by somebody else. They are
  listed under "waiting for access" on Accounts, and the 14 Aug duplicate guard
  now tells them what to do. ⚠️ **Do not read this constraint as "orphan logins
  are impossible".**
  ⚠️ **WHAT IT DOES STOP** is an account let INTO a squad pointing at no
  player — it can see every child in that squad and cannot touch its own,
  because `is_own_player` needs a real id.
  ⚠️ **THE SCREEN ALREADY REFUSED IT; THREE OTHER WAYS IN DID NOT.**
  `AccessBuilder` says "Choose a child" and will not submit — but
  `public.accept_invite` inserted the broken row from an invite with no player,
  `grantMemberships` writes `player_id: playerId ?? null` straight into an
  INSERT, and hand-written SQL answers to nothing. **The guard was in the
  component, one layer above every other caller.**
  ⚠️ **`accept_invite` IS FIXED IN THE SAME MIGRATION, AND ITS GUARD SITS BEFORE
  `accepted_at` IS STAMPED** — after it, a refused invite would be BURNED and
  the person left holding a link that reports "already used". Proved: still
  unaccepted afterwards.
  ⚠️ **THE CONSTRAINT NAMES THE TWO FAMILY ROLES RATHER THAN SAYING `player_id
  is not null`.** Eleven staff memberships live with a null player — a coach is
  not anybody's parent — so the blunt version would break every one of them.
  **Half of `db/tests/family-role-needs-player.sql` exists to prove the rule
  stays OFF for staff**, and it also proves an UPDATE clearing the player is
  caught, not just an INSERT.
  ✅ **THE ONE VIOLATING ROW WAS FIXED FIRST, ON EVIDENCE RATHER THAN A GUESS.**
  An active parent on U18B with no player. She was linked to her son because
  **his own `player_parents` row names her, with a matching email AND phone** —
  not because they share a surname.

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
  lost password away from needing SQL to recover.
  ❌ **"IT ALSO MEANS TWO ACCOUNTS CAN HAND OUT CLUB-WIDE AUTHORITY" — IT IS NO
  LONGER TWO.** Measured 13 Aug 2026: there is a **third super admin, held by
  somebody who is not Jay** — the volunteer who does **Social Media Management**.
  ⚠️ **Super admin is the tier that can grant super admin**, so this is the count
  a stale sentence understates most dangerously. **Do not write the number here —
  the query is in §Numbers.**
  ⚠️ **NAMED BY THE JOB, NOT THE PERSON, AND `docs:check` IS WHAT ENFORCED IT.**
  The first draft of this line wrote the volunteer's name and the build went red
  (`retired name … name the job, not the person`). The rule exists for the
  jobs-not-people ruling of 12 Aug — but the stronger reason is that **this repo
  is PUBLIC**, and a real volunteer's name in it is a disclosure the ruling
  happens to prevent as a side effect. Keep it that way.
  Recorded, not questioned: Jay has not been asked to confirm the third, and a
  legitimate second person holding it is exactly what the "one lost password"
  reasoning above argues for.
- ❌ **"A THIRD, LEGITIMATE ADMIN — ORDINARY ADMIN, NOT SUPER" IS STALE.** That
  line named an account confirmed by Jay on 10 Aug and asserted it was an
  ordinary admin. **Measured 13 Aug 2026: there is no active non-super admin
  membership at all.** Jay, same day: *"only 3 current admin and they are all
  super admin"*.
  ⚠️ **THE EMAIL ADDRESS IS DELIBERATELY NOT REPEATED HERE.** This repo is
  PUBLIC, and a volunteer's personal email in it is a disclosure — the same
  reasoning `docs:check` already enforces for their names. Identify an account
  from the database, not from this file.
  ⚠️ **CONSEQUENCE, AND IT IS THE REASON THIS CORRECTION IS WORTH THE LINES:
  EVERY ADMIN IS NOW A SUPER ADMIN, so the tier currently distinguishes
  nobody.** Super admin is the tier that can grant super admin. The
  "one lost password" argument for having more than one still holds; "all of
  them" is a different thing and nobody has ruled on it.
  ✅ **The protection itself is intact and was PROVEN, not assumed, on 13 Aug.**
  An ordinary admin attempting `is_super = true` on themselves is refused
  `42501 permission denied`, while the same account in the same transaction
  writes an allowed column successfully — so the refusal is the column grant and
  not something earlier. Detail in `db/schema/grants.sql`.
  ⚠️ **AND POSTGRES'S OWN ERROR HINT RECOMMENDS THE HOLE**: *"Grant the required
  privileges to the current role with: GRANT UPDATE ON public.memberships TO
  authenticated"*. Following that hint hands every admin self-promotion. It is
  the most authoritative-looking wrong answer in this schema.
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
  fixed: it is `SECURITY INVOKER`, `IMMUTABLE`, touches no table and **calls
  nothing** — there is genuinely nothing for a search_path to redirect.
  ⚠️ **THIS IS NOT A PRECEDENT, AND READING IT AS ONE COST TIME TWICE ON 13 Aug.**
  Two other functions carried a note that read word for word like this one, every
  fact in both was true, and both conclusions were wrong —
  `private.social_idea_owner` (called from three storage policies, so it decides
  who may write) and `private.events_result_from_components` (a trigger whose job
  is that a tampered request cannot fake a score). Both are now pinned.
  **The rule is a three-way test, written up in the header of
  `db/schema/functions.sql`: DEFINER → always pin; INVOKER but decides access or
  runs in a policy or trigger → pin anyway; INVOKER touching and calling nothing
  → recording it is enough.** `squad_expects_gender` is the only function in the
  schema that reaches the third branch.
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

-- ⚠️ HOW BUSY IS THE CLUB, AND HOW MUCH IS AT STAKE. Added 13 Aug 2026, the day
-- the club went live and every "only Jay uses this" sentence in this file went
-- stale at once. Run this before assuming a change is cheap.
select 'auth users' k, count(*)::text v from auth.users
union all select 'people with a membership', count(distinct profile_id)::text from memberships
union all select 'squads with members', count(distinct team_id)::text from memberships where team_id is not null
union all select 'pending, waiting on somebody', count(*)::text from memberships where status = 'pending'
union all select 'SUPER ADMINS', count(*)::text from memberships where is_super
-- ⛔ The unrecoverable one. Nothing backs this bucket up.
union all select 'CHILD PHOTOGRAPHS (no backup)', count(*)::text from storage.objects where bucket_id = 'player-photos'
-- Each of these is a permanent, unrevocable feed URL somebody holds.
union all select 'calendar links issued', count(*)::text from calendar_tokens;

-- ⚠️ IS REALTIME ACTUALLY CONNECTED? It was NOT, from some point before 13 Aug
-- 2026: the publication existed and held zero tables, so `postgres_changes`
-- delivered nothing and two features silently did not work. An empty result here
-- means the app's live-update subscriptions are decorative.
select tablename from pg_publication_tables where pubname = 'supabase_realtime';

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

### ⚠️ Opened by the 13 Aug 2026 audit

**THIS LIST IS THE AUDIT.** The report itself was a session artefact and was
deliberately never committed — it is a dated verdict and would rot like every
other one here. ⚠️ **So this section is the ONLY surviving record of what the
audit found, and an item deleted from here is a finding that ceases to exist.**
Tick things off by striking them through with the evidence, never by removing
the line.

⚠️ **FOUR ITEMS WERE MISSING FROM THIS LIST UNTIL LATE ON 13 Aug**, because the
first transplant from the report was done from memory rather than by walking
the report end to end: the calendar-token item, dependency scanning, CSP and
the repo-hygiene one. They were found by grepping this file for each finding in
turn and counting the hits — four came back **zero**. **Do the same before
claiming this list is complete.**

Ordered by what they cost to fix, not by how alarming they sound. Everything
below is **not started** unless it says otherwise.

- ✅ **DONE — THE RESTORE IS DRILLED AND WORKS** (13 Aug, see above). This read
  *"⛔ THE RESTORE HAS NEVER BEEN DONE… the only item here whose failure is
  unrecoverable"* for four hours.
- ⛔ **BUT THE PHOTOS ARE NOW THE UNRECOVERABLE ITEM, AND NOTHING COVERS THEM.**
  Storage is outside the backup entirely. ⚠️ **This is the one thing in the club
  that cannot be re-created** — a fixture can be re-entered and a child's
  photograph cannot be re-taken retrospectively. **No fix exists and none is
  scheduled.**
  ⛔ **AND IT STOPPED BEING HYPOTHETICAL ON 13 Aug: THERE ARE REAL CHILDREN'S
  PHOTOGRAPHS IN THAT BUCKET NOW.** When this item was written the same morning
  the bucket held one object and the club had one user, so "unrecoverable" was a
  statement about a future. It is a statement about today. **Re-run the count
  before quoting one — the query is in §Numbers — and treat this as the highest
  item on the list regardless of what it returns.** The cheap version is a periodic download of the `player-photos`
  bucket to somewhere Jay owns; there is no in-app mechanism and
  `delete from storage.objects` raises `42501`, so it cannot be scripted in SQL
  either.
  ✅ **AND AS OF 13 Aug 2026 THIS IS LARGELY CLOSED — the photographs ARE backed
  up.** An append-only mirror into Cloudflare R2, running nightly, with a
  one-year bucket lock that makes deletion impossible rather than merely
  un-programmed. 6 of 6 copied, byte-identity proven by MD5.
  `claude/runbooks/player-photo-backup.md`.
  ❌ **IT IS NOT ⛔-CLOSED, AND THE REMAINING GAP IS THE IMPORTANT HALF: NOBODY
  HAS EVER GOT A PHOTOGRAPH BACK.** Copying is not restoring. Tick this item off
  on the runbook's §4 drill and on nothing else — the precedent is the database
  drill, where the failure the audit AND the runbook both predicted did not
  happen, and the useful outcome came from doing it rather than reasoning about
  it.
- **A recovery is not just a restore, and the extra steps are undocumented
  anywhere else**: redeploy all five edge functions ⚠️ **with `verify_jwt: false`,
  which cannot be encoded in this repo**, rebuild the auth settings, and repoint
  `.env` and Netlify at the new project ref. Written up in the runbook.
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
- ⚠️ **`anon` HOLDS FULL TABLE PRIVILEGES ON EVERY TABLE IN `public`. MEASURED
  14 Aug 2026, not reasoned about.** Seven tables probed — `announcements`,
  `announcement_reads`, `social_ideas`, `events`, `players`, `memberships`,
  `match_sheets` — and **all seven came back identical**:
  `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`. Source is
  Supabase's `alter default privileges in schema public grant all on tables to
  anon, authenticated, service_role`.
  ⚠️ **THIS IS THE TABLE-LEVEL SIBLING OF THE FUNCTION-LEVEL FINDING FROM
  13 Aug**, where six RPCs turned out to be callable by `anon` for exactly the
  same reason. The conclusion is the same: every one of these is safe today **by
  its POLICIES**, which all test `auth.uid()` and get null for `anon` — i.e.
  safe by the body, not by the grant, which is the thing this repo's rules say
  not to rely on.
  ⚠️ **NOT EXPLOITABLE TODAY as far as anything measured shows**, and it is one
  migration across all of `public` or it is not worth doing — tightening only
  the newest two tables leaves the schema inconsistent while fixing nothing.
  Found while re-capturing `db/schema/grants.sql` for the noticeboard; recorded
  there in full.
- **18 RLS policies call `auth.uid()` bare**, so Postgres re-evaluates it per row
  instead of once per query. The fix is `(select auth.uid())` and changes no
  meaning. ⚠️ **One migration touching all 18, not eighteen migrations** — and
  prove it against an injected fault afterwards, or all you have shown is that the
  migration applied.
- ✅ **DONE 13 Aug — THERE ARE NOW TWO ERROR BOUNDARIES.** This read *"there is
  no React error boundary anywhere (`grep ErrorBoundary src/` → 0)"*.
  ⚠️ **TWO, AND THEY ARE NOT REDUNDANT.** `AppShell` wraps the routed **screen
  only**, so the masthead and nav survive and a parent whose Roster crashed can
  still reach Schedule. `App` wraps **everything**, because AppShell itself,
  `RequireAuth` and `MembershipProvider` can throw — and because `/privacy`,
  `/delete-account`, `/reset-password` and `/auth/confirm` render outside any
  AppShell. **The first two are linked from the Play Store listing and opened
  cold by a reviewer.**
  ⚠️ **THE AppShell ONE IS KEYED ON `location.pathname`, AND WITHOUT THAT THE
  FIX IS HALF A BUG.** A boundary holds its error state until something clears
  it, so a crashed Roster would stay on the fallback while the person taps
  Schedule — nav working, content permanently broken, which reads as deliberate
  and is worse than the blank page it replaced.
  ⚠️ **THE FALLBACK OFFERS "CLEAR SAVED DATA", NOT JUST "TRY AGAIN", AND THAT IS
  THE SERVICE-WORKER POINT.** A reload is served the same bundle, and the
  NetworkFirst cache over `GET /rest/v1/*` may hand back the same poisoned
  response that caused the crash — so the one thing every non-technical person
  tries first is the one thing that reliably fails. That button purges the cache
  (`clearCachedApiResponses`) and then reloads.
  ⚠️ **The raw exception is one tap away, never shown by default.** This club has
  no error tracking at all, so the only route from a crash to a diagnosis is
  somebody telling Jay what it said.
  ⚠️ **THE WIRING IS TESTED SEPARATELY FROM THE COMPONENT, AND THAT SPLIT IS THE
  POINT.** `tests/error-boundary.test.jsx` proves the component catches;
  `tests/error-boundary-wiring.test.jsx` proves something actually renders it.
  **Proved by injecting three faults: removing the AppShell boundary turns the
  wiring file red while the component file stays GREEN** — which is exactly the
  state `src/` was in before today. Removing only the `key`, and removing the
  outer boundary, each go red on their own assertion.
  ✅ **AND IT HAS NOW BEEN LOOKED AT IN A REAL BROWSER**, which this entry said
  it had not for about twenty minutes. Chromium, real Tailwind, dev server, a
  `throw` injected into `src/screens/Privacy.jsx` — **a PUBLIC route, so no
  login is needed to reach it, and it exercises the OUTER boundary**, the one
  `harness/` could never reach.
  ⚠️ **Measured at 360px, not just eyeballed:** `documentElement.scrollWidth`
  360 against a 360 viewport, so no overflow — the width this repo insists on
  because a check that straddles it agrees with you. The heading, both buttons
  side by side, and the revealed technical detail all fit and wrap.
  ⚠️ **The injected error was a REALISTIC one** — `Cannot read properties of
  null (reading 'full_name')` — not `throw new Error('test')`. A null player
  name is the exact shape of failure this catches.
  ⚠️ **`harness/check-overflow.mjs` STILL has no crashing scenario**, so this
  was a by-hand check and is not repeatable by a gate. If the fallback's markup
  changes, look again.
- **There is no monitoring, no alerting and no error tracking.** Detection today is
  somebody telling Jay. ⚠️ **Pro's 7-day logs help you INVESTIGATE and tell you
  nothing** — Log Drains are a Team-plan feature.
  **Two concrete first steps, both free and both needing Jay** (they are account
  creations, which Claude does not do): an uptime monitor on `/` **and** on
  `/calendar.ics`, and Sentry's free tier wired into `ErrorBoundary`'s
  `componentDidCatch`, which is the one place already built for it.
  ⚠️ **THE `/calendar.ics` CHECK MUST ASSERT `content-type: text/calendar`, NOT
  A 200.** The SPA catch-all answers any unknown path with `index.html`, so a
  200 there is worth nothing — the same trap `RESTORE.md` records for the feed.
  ⚠️ **And an uptime monitor that has never fired is not a monitor.** Pause the
  Netlify site deliberately once and confirm the email arrives.
- **The whole app is one JavaScript chunk, and every parent downloads all of
  it.** Measured 13 Aug on a production build: **835 KB JS (228 KB gzipped),
  464 KB CSS (95 KB gzipped), `dist/` 5.7 MB total**, with exactly ONE dynamic
  import in the codebase (`html2canvas` in `MatchSheet.jsx`, correctly lazy).
  ⚠️ **Do not re-cite those numbers — re-measure.** They are a dated
  measurement and this file's own rule applies.
  **Two fixes, biggest first:** (1) `flag-icons` is imported whole for a phone
  country picker and is most of the 464 KB CSS plus ~3 MB of SVGs — import only
  the countries `PhoneInput` offers, or drop to two-letter codes. (2) route-level
  `React.lazy` on `AdminDashboard`, `MatchSheet`, `PlayerImport` and `Allocation`
  — the admin half is used by three people and shipped to everyone.
  ⚠️ **`tests/pwa-build.test.js` and `tests/button-sweep.test.js` READ `dist/`**,
  so splitting the bundle changes the filenames they glob for. Run
  `npm run build && npm test`, never `npm test` alone, when touching this.
- **There is no audit log.** Nothing records who deleted a player, revoked a
  membership, edited a child's contact details or granted super-admin.
  `events.created_by`, `availability.updated_by` and `attendance.recorded_by` are
  single overwritten columns, not history.
- ❌ **THE REALTIME FINDING WAS WRONG, AND THE TRUTH IS WORSE: REALTIME DELIVERS
  NOTHING AT ALL.** This entry said the `events` subscription *"has no filter, so
  every connected client refetches its whole schedule on any event change anywhere
  in the club"*, and recommended copying `availability.js`'s per-event channel.
  ⚠️ **Measured 13 Aug 2026: the `supabase_realtime` publication contains ZERO
  tables.** The only tables in any publication are Realtime's own internal
  `messages_*` partitions, in a different one. Control: 21 tables in `public`, so
  the query works and the database is not empty.
  ⚠️ **Supabase's `postgres_changes` is fed by that publication. Neither `events`
  nor `availability` is in it, so no change is ever emitted.** The clients
  subscribe, the socket opens, and nothing arrives.
  **So two features silently do not work**: Schedule and Dashboard do not
  auto-refresh when a fixture changes, and the availability list does not update
  while you watch it. ⚠️ **Nobody noticed because until 13 Aug there was one user
  and never a second person changing anything.**
  ⚠️ **`RESTORE.md`'s "realtime triggers a full refetch on any change in scope" is
  false too**, and predates the audit.
  ⚠️ **AND FILTERING IT WOULD HAVE BEEN THEATRE** — the fix everyone reaches for
  first, applied to a subscription that receives nothing. **The lesson is the one
  this repo keeps relearning: the code was read and the configuration feeding it
  was not.**
  ⚠️ **DO NOT ADD A CLIENT-SIDE `team_id` FILTER WHEN TURNING IT ON.** `event read`
  is `is_attached_to_team(team_id)`, so **RLS is already the filter** and scopes
  delivery per subscriber. A channel filter would add nothing and would BREAK
  DELETES: `events` has `replica_identity = DEFAULT` (measured), so a delete
  payload carries the primary key only, a `team_id` filter matches nothing, and a
  cancelled fixture would stop disappearing from everyone else's screen.
  ⚠️ **AND DO NOT RAISE REPLICA IDENTITY TO FULL to "fix" that.** Supabase does not
  apply RLS to delete events, so a FULL identity would broadcast the whole row —
  another squad's opponent, venue and notes — to every subscriber. DEFAULT keeps a
  delete down to an id, which is all the callback needs: it ignores the payload
  entirely and just re-reads.
  **The fix is: add the tables to the publication, no client filter, and debounce
  the refetch.** ⚠️ **Verify with TWO accounts in two browsers** — the
  discriminating test is a change in a squad the second person is NOT in, which
  must NOT reach them. If it does, RLS is not being applied to realtime and that
  is a disclosure bug, not a missing feature.
- **`saveParents` is delete-then-write**, so a failure between the two loses a
  child's parent records. ⚠️ **This is NOT the same as the deliberate two-call
  split for player contacts** recorded in `RESTORE.md` — there the reasoning is
  that a partial failure surfaces distinctly. Here the first call is a DELETE, and
  a partial failure surfaces as missing data.

- ⚠️ **THE CALENDAR TOKEN IS AN UNREVOCABLE, NON-EXPIRING CREDENTIAL IN A URL,
  AND NOBODY CAN SEE IF ONE HAS LEAKED.** `reset_my_calendar_token()` is the only
  revocation, it is self-service only, and it silently breaks the legitimate
  subscription at the same time. There is no `last_used_at`, no hit count, and no
  admin-side reset. ⚠️ **`netlify.toml` already records that a subscribed URL
  cannot be changed remotely** — once it is in someone's Google account it is
  there for good.
  ⚠️ **The realistic leak is a parent pasting "here's the calendar link" into a
  squad WhatsApp group**, which the app's own wording invites. Anyone in that
  group then holds a permanent feed of where a named group of children will be,
  and when. Low data sensitivity — fixtures are not secret — but it is the
  safeguarding shape that makes it worth naming.
  ⚠️ **DO NOT ADD AN EXPIRY.** A feed that dies on a timer produces a club-wide
  "my calendar stopped working" with no way to warn anyone, which is the exact
  failure `netlify.toml` was written to prevent. The cheap fix is
  **visibility**: record `last_used_at` on `calendar_tokens`, show it on the
  subscribe screen, add an admin-side reset, and say plainly that the link works
  without a password.
- **Nothing scans the dependencies.** No Dependabot config, no `npm audit` step
  in either workflow. ⚠️ **Measured 13 Aug: `react-router-dom` carries two
  moderate advisories** — an open redirect via backslash, and constructor
  injection in SSR hydration. **Neither is exploitable here**: `safeNext()` in
  `AuthConfirm.jsx` independently blocks `//host` and `/\host`, and this app is
  not server-rendered. Recorded so the next session does not re-panic at the
  same `npm audit` output. Fix is 15 minutes: `dependabot.yml` plus
  `npm audit --audit-level=high` in `test.yml`.
- **CSP is `frame-ancestors 'none'` and nothing else.** No `connect-src`, no
  `script-src`, no `style-src`. ⚠️ **`netlify.toml` already explains why, and the
  reasoning is right** — a wrong `connect-src` breaks the app SILENTLY for anyone
  whose service worker has cached a page. It stays on this list because it is the
  **only thing that would contain a compromised npm dependency**, and this app
  has no dependency scanning either (above). Do `connect-src` first, and test it
  against a browser that already has a service worker registered.
- **No `LICENSE` and no `SECURITY.md`** on a public repo that runs children's-data
  infrastructure. Fifteen minutes, and the absence of a security contact is an
  odd signal on a repo anyone can read.

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
