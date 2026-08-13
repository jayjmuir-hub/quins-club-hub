# Changelog

Newest first. One line per shipped change, with the commit. Detail belongs in the commit
message and in `RESTORE.md`; this is the index.

⚠️ **This file stopped at 4 Aug for three days while `CLAUDE.md` advertised it as "what
changed, when".** Backfilled from `git log` on 7 Aug 2026 — the 5 to 7 Aug entries below
are one-liners taken from commit subjects, so they are accurate but thinner than the
hand-written 4 Aug ones. **Add the entry in the same breath as the commit.**

## 13 Aug 2026

- **Supabase Pro and Resend Pro, and the fifteen lines that stopped being true.**
  ⚠️ **No SHA yet, deliberately** — `main` squash-merges, so a branch SHA stops
  existing at merge and CI (a fresh clone) cannot find it. The NEXT pull request
  cites the squash SHA. This is what the one-commit-behind allowance is for.
  Jay bought both plans on 13 Aug. **Measured, not reported:**
  `get_organization` → `plan: "pro"`.
  ⚠️ **THE UPGRADE FIXED A MECHANISM AND NOT A SINGLE LINE OF CODE.** Daily
  backups now exist, the project no longer pauses after 7 days idle, storage went
  1 GB → 100 GB, and Resend's 100/day cap is gone. **Nothing else on the 13 Aug
  audit list moved.**
  ⚠️ **AND A BACKUP NOBODY HAS RESTORED IS A BELIEF** —
  `claude/runbooks/backup-restore-drill.md` is new, and **NOT DONE**. It is the
  only open item whose failure is unrecoverable.
  ⚠️ **LOSING THE 100/DAY CAP REMOVED A BRAKE NOBODY DESIGNED.** Five senders
  share one Resend key and one sending domain; a runaway used to stop at 100 and
  now does not. The wanted throttle is unchanged and its REASON changed — from
  "we run out" to "Resend suspends `send.adhquins-clubhub.com`", which takes
  sign-in with it because auth mail rides the same domain.
  Corrected in `CLAUDE.md`, `claude/state-of-play.md`,
  `claude/runbooks/email-and-domain.md`, `db/schema/README.md`, four edge
  functions and two screens. ⚠️ **`claude/decisions/` was left alone on purpose**
  — a decision record is a record of a moment.
- **Two live-measured holes written up as a migration, NOT YET APPLIED**
  (`db/migrations/20260813_events_indexes_and_social_upload_gate.sql`).
  ⚠️ **`public.events` HAS NO INDEX ON `team_id` OR `starts_at`** — measured
  live, it carries exactly `events_pkey`, `events_series_id_idx`,
  `events_group_id_idx`. Every schedule, dashboard, calendar-feed and allocation
  read filters and sorts on those two. This partly overturns the "unindexed
  foreign keys are fine on an empty table" ruling, **and that ruling's own last
  line — "re-measure before citing this once real data lands" — is what asked
  for it.**
  ⚠️ **THE `social-ideas` STORAGE WRITE POLICY HAS NO MEMBERSHIP CHECK** while
  the row policy for the same feature does. Verified against live. A signed-in
  account with zero memberships can upload 5 MB objects without limit, and an
  orphaned object appears on no screen. ⚠️ **`player-photos` is unaffected and
  must not be "fixed" to match.** Harness: `db/tests/rls-social-upload.sql`,
  which injects the old policy to prove it can go red.

## 12 Aug 2026

- `7df6ea3` — **A full calendar for Pitch Management, an App button
  in the top bar, and a desktop pass.** Three things Jay asked for on 12 Aug.
  ⚠️ **Day | Week | Month on `/admin/allocation`, and it OPENS ON MONTH** — Jay's call
  when offered the choice, superseding the 11 Aug "opens on today, in Day view". The
  calendar first shipped with Day still the landing view and the question was PUT TO HIM
  rather than answered by whoever was typing.
  ⚠️ **The week starts MONDAY** because the UAE weekend is Sat–Sun and rugby is played on
  it; a Sunday-start week splits the two days Pitch Management cares about across two
  screens. ⚠️ **Clash and waiting-for-a-pitch are marked by SHAPE as well as colour** and
  spelled out in the aria-label.
  ⚠️ **`src/lib/calendarGrid.js` is tested in a NON-UTC zone**, because every bug it can
  have is a time-zone bug and under a UTC runner they all pass. Month paging **clamps
  rather than rolls over** (31 Jan +1 is 28 Feb, not 3 March), and events file by the
  CLUB'S calendar day (a 01:00 Abu Dhabi kick-off is 21:00 UTC the day before).
  ❌ **THE App BUTTON'S GREEN WAS SAMPLED OFF adhjrt.com AND FAILED THE BUILD.** `#3bd070`
  is the **RETIRED** brand green — that site still runs the pre-6-Aug palette — and
  `tests/press-feedback.test.js` exists to stop exactly that. It uses `accent` instead.
  ❌ **AND A MASTHEAD MEASUREMENT WAS WRONG IN A WAY WORTH KEEPING.** "Headroom" was
  computed as the wordmark's own width minus its natural text width — **a number that
  calculation can only ever return as ~0** — and the account first name was deleted on
  the strength of it. A probe that GREW until the wordmark visibly truncated disagreed:
  the real buffer is a `flex-1` spacer and it breaks at +190px. The name is restored.
  ⚠️ **Desktop: the content well goes 1120 → 1360px at `wide`**, so a 1440px monitor
  stops leaving 320px empty; the roster table gains 240px of real column width.
  ⚠️ **`shadow-card` is now a PAIR** — 1px contact + wide ambient — rather than one wide
  soft blur. `claude/specs/design-system.md` records the divergence from the prototype's
  single `--shadow` rather than being rewritten over it.
  ⚠️ **The portal cards LIFT on hover instead of flattening.** They carried
  `hover:shadow-[0_0_0_1px_…]`, which set the ONLY shadow and so removed every bit of
  elevation at the moment the card is meant to look reachable.

- `275bba8` — **The URL breaks before the row cap does, and the
  club lands on it.** `listPlayers` pages instead of capping, and four `.in()` readers
  are chunked.
  ⚠️ **THE LIMIT NOBODY HAD MEASURED.** PostgREST takes `.in()` as a query **STRING**,
  so a uuid costs ~37 bytes of URL. Measured with real uuids: **300 ids → 11,196-byte
  URL → 200; 400 → 14,896 → the fetch THREW; 900 → 33,396 → 400.** `MAX_ROWS` does
  nothing about it — the request never gets far enough to return a row.
  ⚠️ **The 400-id failure is a CONNECTION failure, not a status**, so it reads as a bad
  network rather than as a request built wrong.
  ⚠️ **Fifteen squads at ~25 players is ~375** — between the last size measured working
  and the first measured failing. Chunked at 200 (~7.5KB) via `fetchByIds`:
  `listContactsForPlayers`, `listParentsForPlayers`, `listAvailabilityForEvents`,
  `listMatchSheetsFor`.
  ⚠️ **`listPlayers` pages by `full_name, id`** — the tiebreak is load-bearing, because
  `full_name` is not unique and this club holds no squad numbers.
  ⚠️ **Two tests were REWRITTEN, not deleted**: they pinned the cap, they now pin paging
  and the tiebreak. Same precedent as the `listEvents` rewrite on 10 Aug.
  ❌ **AND TWO PROCESS TRAPS WERE WALKED INTO AND ARE RECORDED IN `state-of-play.md`:**
  an injection that silently matched nothing because the working tree is CRLF and the
  script searched for `
` — **a green run that was evidence about the script, not the
  code** — and `git checkout --` eating uncommitted work **twice**, exactly as
  `CLAUDE.md` rule 6 warns.

- `c910842` — **Admins are told when somebody asks for access.**
  Migration `access_request_notify`; edge function `notify-access-request` (v2,
  `verify_jwt: false`). `state-of-play.md` said "Nobody is emailed when an access
  REQUEST arrives" and predicted the cost exactly: *"a third is a copy with a
  different recipient query."*
  ⚠️ **NOT the approval email.** That fires for a pending MEMBERSHIP — somebody already
  attached to a squad. This fires for somebody with NO membership at all. Two queues,
  two sections of the Accounts screen.
  ⚠️ **Recipients are EVERY ACTIVE ADMIN, measured rather than copied.** There is no
  `accounts` right; acting on a request needs `is_admin_anywhere()` to read the list
  and `is_admin(club_id)` to grant, and both are plain admin. Copying the pitch
  function's `is_super or right` clause would have silently excluded the ordinary
  admins who can actually do the job.
  ⚠️ **The endpoint is DERIVED from `approval_notify_url` in SQL** — anchored on the
  final path segment — so the host cannot drift and **nobody ever reads, pastes or
  types the value.** This repo is public.
  ⚠️ **The `when (new.status = 'pending')` guard is load-bearing.**
  `dismissAccessRequest` UPSERTS, and an upsert with no existing row INSERTS a row
  that is already `dismissed` — so without it, turning away a stranger who never
  asked would email every admin about the person just turned away. **Injection
  confirmed red:** removing the guard took that insert's queue delta 0 → 1.
  ❌ **THE FIRST DEPLOYED VERSION WAS BROKEN AND ONLY A LIVE PROBE FOUND IT.**
  `access_requests` has TWO foreign keys to `profiles`, so a bare `profiles(...)`
  embed is ambiguous and PostgREST refuses the whole query. **The only symptom was a
  500 and no email** — precisely the quiet failure this design knowingly accepts.
  Fixed with the explicit constraint name; same probe before and after, **500 → 404**.
  ⚠️ **The Resend call is the one branch NOT exercised live** — a real send would put
  a test email in a third volunteer's inbox. Everything else was: the auth gate (its
  own `unauthorised` body, which is what proves the request reached the function
  rather than a JWT gate), the vault derivation, the trigger on all four write paths,
  and the database read.

- `97bf93d` — **The drop is back on, in the right order this
  time, and the docs stop describing a state that did not exist.**
  `drop_match_sheet_scores_after_deploy`, applied only once the new bundle was actually
  serving.
  ⚠️ **Verified the SERVED BUNDLE first**, the way `state-of-play.md` keeps insisting —
  fetch `/index.html`, read the `/assets/index-*.js` name out of it, fetch that and
  search it. **All three new strings present AND the old `Away final score` box absent**:
  a control on both sides, so it distinguishes "new build" from "any build".
  ⚠️ **Then the columns, also with controls.** All four answer `400 / 42703` through
  PostgREST while `manager_phone` and `id` answer 200 — otherwise a broken request looks
  exactly like a dropped column. The whole new write path (`events`' eight components,
  `teams.scoring_kinds`) resolves against live.
  ⚠️ **`db/schema/tables.sql` and `state-of-play.md` said DROPPED for the window in which
  it was not.** Both now agree with live. The temporary note was written down at the time
  rather than left to be discovered, which is the only reason this was a footnote instead
  of the next session's mystery.

- `c8a05c7` — **The match sheet had no real-browser scenario at
  all, and it is the widest screen in the app.** `harness/main.jsx` gains `match-sheet`,
  `harness/stubs/matchSheets.js` is its stub, and the overflow gate's `SCENARIOS` list
  gains the entry.
  ⚠️ **Unlike `availability`, `playerform` and `event-detail`, THIS ONE IS ACTUALLY
  MEASURED** — MatchSheet is a routed screen rather than a `Sheet`, so its contents are
  in the document's `scrollWidth`.
  ⚠️ **Verified in Chromium, NOT through `npm run check:overflow`.** Playwright is still
  deliberately not a dependency and is not installed on this PC. Measured by driving the
  harness in a real browser at 320 / 360 / 375 / 390 / 414: **zero overflow at every
  width.**
  ⚠️ **And the measurement was proved RED before the clean result was believed** — a
  900px `shrink-0` probe in the Score card produced **611px of overflow at 320px**, which
  is exactly what the same injection FAILED to do inside a `Sheet` on 12 Aug. The other
  28 scenarios were not re-run; nothing in the commit touches them.

- `c8a05c7` — **The sheet stops holding a score.** Applied live as
  `drop_match_sheet_scores`. Step 4 of the scoring plan, run LAST and only once nothing
  read the columns.
  ⚠️ **`tries_us` / `tries_them` went too, and the plan did not say so** — it named only
  `score_us` / `score_them`, because when it was written `events` had no home for a try
  at all. Step 2 gave them one, which turned these into exactly the duplicate the other
  two were.
  ⚠️ **Re-measured immediately before applying, not assumed from the plan**: one sheet
  exists and all four columns were NULL on it. **The plan said to re-measure for exactly
  this reason** — a human filed that sheet between the plan being written and this
  running.
  ❌ **AND IT WAS APPLIED TOO EARLY AND BROKE THE LIVE SITE FOR ABOUT TEN MINUTES.**
  "Run last" was read as *last in the branch*; `main` was still deployed and its bundle
  still sent all four columns on every save, so PostgREST answered **400 / PGRST204** and
  **Save draft and Submit failed on the live match sheet** while the PR waited to merge.
  Undone by re-adding them — all NULL, so it cost nothing — and re-applied once the new
  bundle was serving.
  ⚠️ **THE RULE, now in the migration header and in `state-of-play.md`: a DESTRUCTIVE
  schema change against a live SPA is DEPLOY-FIRST, DROP-SECOND.** An additive one is
  safe in either order, which is why `manager_phone` going in early was fine and this was
  not. **"Nothing reads it" has to mean nothing anyone is RUNNING.**

- `c8a05c7` — **The score is ENTERED AS COMPONENTS, and the form's
  total can no longer disagree with its own tries.** Steps 3 and 5 of the scoring plan,
  plus the picker the step-2 migration added a column for and nothing could set.
  Migration `match_sheet_manager_phone`, applied live.
  ⚠️ **The facsimile's FINAL SCORE and TRIES boxes were free text and are now DERIVED.**
  A Score card above the form offers exactly the boxes `scoringForTeam()` allows for that
  squad; the total is computed from them by the same `totalFor()` the database trigger
  mirrors. **A coach can no longer file a governing-body form whose total contradicts the
  tries printed beside it.**
  ⚠️ **The card sits OUTSIDE the facsimile deliberately.** RCM's form has two boxes per
  side; conversion, penalty and drop-goal boxes inside it would photograph as a form the
  governing body never issued.
  ⚠️ **Components go to `public.events`, never to the sheet** — Jay ruled one score, on
  the fixture. **The fixture is written FIRST and the sheet second**, so a failure leaves
  the score right and the sheet unsaved rather than the reverse.
  ⚠️ **`EventForm` goes READ-ONLY on a fixture that has components, and this was a real
  silent bug.** It does not send the components, so the trigger recomputed from the
  stored ones and overwrote whatever was typed — 30–0 in, 22–12 back, nothing anywhere
  saying why.
  ⚠️ **`getEvent()` now embeds `teams.scoring_kinds`.** Without it the club's override is
  silently ignored and a coach gets the age-band default instead — the standing cost of
  that embed being a column list rather than `*`.
  ⚠️ **`db/tests/scoring.sql` now exists — the step-2 migration already CLAIMED it did.**
  Run against production: all fifteen squads agree with `src/lib/scoring.js`, and all six
  trigger cases pass. **Fault injection confirmed red** — an unconditional recompute
  turns the hand-typed 22–12 into 0–0.
  ⚠️ **Four more injections, four reds, on the JS side**: a recorded 0 read as "not
  recorded", an unconditional recompute on screen, a one-sided component check in
  `EventForm`, and the squad picker storing tick order instead of `SCORE_KINDS` order.
  ⚠️ **Manager name and phone are a DEFAULT, NOT A LOCK** — they fill a blank box and
  never touch one that already holds something, because a manager fills the form and a
  coach signs it.

- `669cc6c` — **The scoring rules are the CLUB'S, not another
  project's — a provenance correction, no behaviour change.**
  Jay: *"this app and project should have absolutely nothing to do with adhjrt, that is a
  completely different project, i only told you to use the same type of scoring setup"*.
  ❌ **The first pass read that as a dependency.** It documented another club system as an
  upstream source of truth, called this app's table "the third copy", and warned it could go
  **"silently wrong"** if an organiser over there changed something. **All of that was a
  misreading of the brief, and none of it was true.** A try is five points because that is
  rugby.
  ⚠️ **Corrected rather than softened, across the module header, both database functions, the
  migration, the tests and the plan** — a wrong "why" sends the next reader into another
  codebase to understand this one, and the note it leaves behind outlives whoever wrote it.
  ⚠️ **The ONE duplication that is real survives, because it always was real: the three
  thresholds exist in `src/lib/scoring.js` AND in `private.scoring_kinds_for_team`.** That is
  deliberate — without it the form would show one total and the database would store another,
  and both would look plausible.
  ⚠️ **No values changed. No behaviour changed.** The suite is the proof.
  ⚠️ **Genuine adhjrt references elsewhere are untouched and correct** — the nav and tab
  styling measured off `adhjrt.com`, `ADHJRT` as a tournament NAME in the competition
  picker, and the retired `app.adhjrt.com` alias. **The project is a real thing this club
  plays in; it is simply not this app's authority for scoring.**

- `390a6e5` — **Scoring components on a fixture, and the club's
  per-squad scoring set.** Step 2 of the scoring plan, applied live as
  `scoring_components`.
  Eight component columns on `events`, `teams.scoring_kinds`, and a trigger deriving
  `result_us` / `result_them` from them.
  ⚠️ **The trigger is GUARDED PER SIDE and that is the whole point of it.** A side with no
  components keeps whatever result it already had — fixtures exist whose result was typed by
  hand before components existed, and an unconditional recompute turns a real 22–12 into
  0–0 with no error anywhere. **Verified against exactly that row before anything else.**
  ⚠️ **The band rules are replicated in SQL — a FOURTH copy, deliberately.** The alternative
  was worse: a trigger summing every component while `scoring.js` ignores the kinds a squad
  may not score would make the FORM show one total and the DATABASE store another. What is
  copied is three thresholds, not fifteen rows.
  ⚠️ **No grants.** `authenticated` already holds table-level UPDATE on `events` and `teams`
  — **measured, not assumed** — and a table-level privilege covers columns added later.
  Verified live: all fifteen squads resolve correctly **including `U12G QR`**, the name that
  once broke the JS regex; and restricting U16B to tries-only recomputed 27 → 20, ignoring a
  conversion and a penalty, matching `totalFor` exactly.
  ⚠️ **One test proved nothing and was nearly reported as passing** — a U10 write matched
  zero rows because no seeded U10 fixture exists. An empty result is not a pass.
  ⚠️ **And a real result was destroyed proving this.** See `state-of-play.md`: the completed
  U16B sheet hangs off a fixture INSIDE the seeded September group, so selecting a test row
  by `group_id` is not safe. Jay ruled the loss acceptable; the trap is recorded.

- `cf88ce6` — **The age-band scoring model, as a pure module.**
  Step 1 of `claude/plans/2026-08-12-scoring-model.md` — the table and the arithmetic only,
  no schema and no UI, so the rest can be built against something already pinned.
  ⚠️ **The fifteen upstream rows collapse onto three band rules, and the test asserts EVERY
  row rather than a sample** — three rules may replace fifteen entries only if all fifteen
  agree, and nothing else would say so.
  ⚠️ **Keyed on the band NUMBER, never the squad name's letter.** In `U14B` the trailing
  letter is GENDER, and `src/lib/ageGroup.js` already carries a note about `U12G` failing to
  parse for exactly that reason.
  ⚠️ **The unknown band fails OPEN, deliberately opposite to `allowsOwnContact`, which fails
  CLOSED.** The harm is asymmetric in opposite directions — a twelve-year-old's phone number
  versus a coach unable to record a drop goal that was kicked. Both the module and the test
  say so, because somebody will try to unify them.
  ⚠️ **`teams.scoring_kinds` is the club override — Jay, 12 Aug: scoring should be selectable
  "in the area where teams are created".** A COLUMN, never the squad's name, the same rule
  `is_senior` and `self_registration_allowed` already carry.
  ⚠️ **`hasNoComponents` exists to protect live data**: the U16B fixture holds 22–12 with
  every component null, and an unconditional recompute would make it 0–0 silently.
  Proved against an injected fault: shifting the 11→12 threshold and flipping the unknown
  default reddened 7 tests and no others.

- `3bad675` — **The league-team tab is named after the job, the tab
  row can wrap, and the scoring model is specced.**
  Jay: *"need a better identifier for the section that allows admins to create league team
  names, right now it just says Club"*. **"Club" named the container rather than the job** —
  and that tab is where ADHQ1 / ADHQ2 are created, which is what the match sheet's TEAM box
  is stamped from. So the one screen that fixes an empty TEAM box was the one screen nobody
  could find: the other half of the U16B defect, arriving from the opposite direction.
  ⚠️ **The rename came with a hazard that had to be fixed in the same commit.** The tab row
  was a bare `flex` with no `flex-wrap`. A flex row that overruns does not clip — **the
  DOCUMENT gets wider than the viewport**, and every element sized to the viewport then
  renders short or clipped on screens three away. Already recorded against Schedule's
  header, where it read as four separate bugs because the bottom nav is `fixed`.
  **Lengthening a label into an unwrapped row is exactly how that returns.**
  Also adds `claude/plans/2026-08-12-scoring-model.md` (**NOT SHIPPED**), which measured the
  scoring rules the club actually needs. ⚠️ **Its provenance framing was WRONG on the first
  pass and is corrected later the same day** — see the entry above.

- `4e8f646` — **The RCM match sheet stopped printing the club's own
  squad name in the governing body's TEAM box.**
  Jay filed a U16B sheet whose TEAM box read **"U16B Contact"**. Measured on the live row,
  not read off the screenshot: `league_team_id` was NULL, and `ourName` ended `?? squadName`.
  ⚠️ **The FALLBACK was the bug, not the missing data.** A blank box is an obviously
  unfinished form; a confidently wrong one is not, and it was photographed and sent. **Same
  shape as the incident already recorded against `src/lib/ageGroup.js`** — the absent value
  fell through to the least safe answer. The lesson was the null default, not the regex, and
  it had not been learned.
  ⚠️ **The screen also ignored `match_sheets.league_team_id`**, the column stamped at save
  precisely so a filed record is FROZEN — so correcting a fixture in March would have
  silently rewritten a form RCM already holds. The saved sheet now wins.
  ⚠️ **The complete-gate is ONE-WAY**: it stops a sheet reaching ready-to-send and never
  stops one being reopened, or the app defends its own rule against the person obeying it.
  ⚠️ **The score half is deliberately NOT in this change.** `events.result_us/result_them`
  and `match_sheets.score_us` are two stores of one fact; Jay ruled the fixture wins, but
  **tries have no home on `events` at all** and the scoring model decides where they go.
  ⚠️ Proved against **two** injected faults, because the first left two assertions unproven:
  restoring `?? squadName` turned 4 of 6 red, and making the gate two-way turned exactly the
  reopen test red. **An injection that fails to go red is data about the CHECK.**

- `41adbbf` — **`state-of-play.md` was missing four shipped features
  and calling one of them "never started".**
  League teams, the RCM match sheet, the Club Youth Manager portal, event duplication and
  the PWA install prompt had all shipped across PRs #51-#60, and **none of them appeared
  in the file every session reads as step 3 of the reading order.** §Open meanwhile listed
  *the Club Youth Manager dashboard* and *the Social Media Management dashboard* under
  **"Never started"** — one had been live since 11 Aug, the other since earlier the same
  day.
  ⚠️ **A claim about what does NOT exist is the one kind nothing can check.** `docs:check`
  verifies that referenced paths resolve and that plans carry a STATUS line; there is no
  file for "we never built X" to fail against, and no test either. This is the third
  instance in three days — `2290bf7` was the same failure about league teams, and the
  plan-status rot it named was the same shape.
  Also records the AI ruling of 12 Aug (*"yes it may"*) against the line that still said
  nobody had asked him.
  ⛔ **And both 12 Aug plans are marked TABLED — Jay, same day**: *"table 1 and 2 for now
  until i bring them back up again"*. `claude/plans/2026-08-12-ai-integration.md` and
  `claude/plans/2026-08-12-training-session-plans.md`. ⚠️ **A plan left at plain "NOT
  SHIPPED" reads as work waiting to be picked up** — which is the same failure as the
  "never started" line this commit removes, pointed the other way.
  ⚠️ **He tabled the BUILD, not the RULING.** The children's-data permission stands and
  still governs anything that sends club data to a third party.

- `ea3d500` — **Social Media Management is live: what's on, and an idea inbox.**
  The last grey card on the chooser opens. Two screens behind the `media` right — **What's on**
  (every event past and upcoming, split into *Coming up* and *Recently*, because a fixture that
  has happened wants a report and one that hasn't wants a preview) and **Ideas**, an inbox any
  member submits into from More.
  ⚠️ **It does NOT touch `player-photos`.** The obvious build — offer the roster photos every
  admin can already see — was ruled out by Jay before it was proposed: seeing a child's photo on
  the roster and putting it on Instagram are different acts needing different consent. Everything
  here is submitter-chosen, in a **second private bucket**.
  ⚠️ **`from_staff` is stamped by a BEFORE INSERT trigger, never sent by the client** — a
  browser-supplied "I am staff" would be a self-awarded triage priority.
  ⚠️ **Column grants on UPDATE**: an admin marking an idea can write `status`, `decision_note`,
  `decided_by`, `decided_at` **and nothing else**. Verified after applying — table-level UPDATE
  to `authenticated` is none. Policies authorise the row; grants authorise the column.
  ⚠️ **Removing an idea deletes the OBJECT first and the row second.** Storage cannot be cleared
  by SQL (`42501`), so a row-first failure would orphan the exact image being removed.
  ⚠️ **First nested tabs in the app**, which needed `end` on the tab `NavLink` — without it
  "What's on" stays marked current while you stand on "Ideas".
  `claude/decisions/2026-08-12-social-media-management.md`

- `2290bf7` — **League teams shipped days ago; the status line said otherwise.**
  ⚠️ **`docs-check` asserts a plan HAS a `**STATUS:` line, never that the line is TRUE**, so a
  stale one is invisible to it and reads as authoritative. It rotted because the work was split
  into a design file and an implementation file and only the second was marked. **A plan split in
  two has two status lines, and the one nobody is looking at is the one that rots.**

- `f4e1ce6` — **Recorded what shipped, and the cache trap that made a green deploy look failed.**
  ⚠️ **After Netlify said `main@78649aa` Published, the live site still served the OLD app** —
  the admin route still redirected to Accounts and still drew the old tab row. That is
  indistinguishable from a release that did not take. It was the **service worker** serving a
  cached shell. ⚠️ **Neither the browser nor the Netlify UI can settle this** — both report what
  some cache decided. What does: fetch `/index.html`, read the `/assets/index-*.js` name out of
  it, fetch that bundle, and search it for a string only the new build contains.
  Also records that `notify-pitch-request` was redeployed to version 3, and that ⚠️ **an edge
  function is not part of the Netlify build.**

- `78649aa` — **`/admin` is a chooser, and each job is its own portal.**
  Jay: *"i'd like more of a split off for the dashboards"*. The tab row that grew with every
  right somebody held is replaced by four cards — Club Admin, Pitch Management, Club Youth
  Manager, Social Media Management — each entering a space with its own tabs.
  ⚠️ **Every card renders for every admin**; not holding the job, or the job having no screen,
  greys it. ⚠️ **A grey card is not a link IN THE MARKUP** — this repo has already shipped a
  control that drew itself and swallowed the tap.
  ⚠️ **"No screen yet" and "this job hasn't been added to your account" stay DIFFERENT
  messages** — a super admin fixes one, only building fixes the other.
  ⚠️ **Navigation only. It narrows nothing** — a portal holder is still a full admin.
  ⚠️ **Only bare `/admin` changes**; every URL under it is untouched, so nothing bookmarked
  breaks. `src/lib/portals.js` is the single list both the chooser and the tab row read.
  `claude/decisions/2026-08-12-admin-portals.md`

- `78649aa` — **Jobs, not people: the three club jobs are named and the
  volunteers are not.** *(Same squash commit as the portal split — the two shipped together.)* `Youth Manager` → **Club Youth Manager**, `Social Media Manager` →
  **Social Media Management**, `Pitch Manager` → **Pitch Management**.
  ⚠️ **Two of the three stop being job titles, so five sentences moved rather than the words**
  — three not-authorised screens and both pitch emails, because "you're a Pitch Management"
  is not English. The mismatch was put to Jay before the change and he chose this wording.
  ⚠️ **The emails are a Supabase edge function and deploy separately from the app.**
  ~60 human names replaced with the job name across `src/`, `tests/`, `db/schema/` and the
  instructional docs; ⚠️ **`claude/handoffs/`, `claude/plans/` and `db/migrations/` keep
  theirs**, being dated records of a moment. Enforced by `RETIRED_NAMES` in
  `scripts/docs-check.mjs` — ⚠️ **regexes with word boundaries, or `Nick` would fail every <!-- stale-ok -->
  line containing "nickname"** — scanned in code as well as docs, because every occurrence
  outside the docs was a code comment.
  `claude/decisions/2026-08-12-jobs-not-people.md`

- `b8fd9a0` — **`app.adhjrt.com` is retired.**
  The app's original address, kept as a working alias since the 5 Aug domain move, no longer
  resolves. Removed in three places: the Supabase redirect allow-list, the Netlify domain alias,
  and the DNS record — ⚠️ **which went automatically, because `adhjrt.com` is on Netlify DNS and
  the alias and the record are the same object.** The plan said to delete a CNAME by hand and
  that was wrong.
  ⚠️ **A stale `feat-password-auth` deploy-preview entry was found in the same allow-list and
  removed** — that list decides where an auth token may be sent.
  ⚠️ **Verified by `Resolve-DnsName` against `8.8.8.8` with `adhjrt.com` itself as a control**,
  because the browser's own origin gate makes a failed navigation ambiguous. Console settings
  only — no deploy, no credits.
  `claude/decisions/2026-08-12-retire-app-alias.md`

- `88c5a04` — **Two rulings: jobs not people, and the admin portal split.** No code, four
  documents. **Jobs not people** — the club's three jobs are named (Club Youth Manager, Pitch
  Management, Social Media Management) and the volunteers holding them are not, in the app, in
  code comments, in the decision records or in conversation. **The portal split** — `/admin`
  stops redirecting to Accounts and becomes a chooser, each job getting its own space; every
  card renders for every admin, greyed and inert where the right is not held or no screen
  exists yet. ⚠️ **Navigation only — it narrows nothing.** A portal holder is still a full
  admin with every child's name, photo and parent contact details.
  ⚠️ **Combined into one commit deliberately.** The two rulings were written and committed
  locally by an earlier session and never pushed — one on a branch, one stranded on local
  `main`, which is protected and could never accept it. Two commits would have put a branch
  SHA in this file that ceases to exist on squash-merge.
  `claude/decisions/2026-08-12-jobs-not-people.md`,
  `claude/decisions/2026-08-12-admin-portals.md`

- `a309092` — **"Add Quins to your home screen" — the app was always installable and nothing said so.**
  Jay asked *"do we have a PWA for this?"* on 12 Aug 2026, which is the entire justification:
  if the person who commissioned it does not know it installs, no parent will work it out.
  ⚠️ **Measured live before writing a line of it** — `manifest.webmanifest` serves with
  `display:standalone`, all four icons (192/512 and both maskable) return 200 `image/png`,
  and `sw.js` is served and registered. Every installability criterion has been met since
  the PWA plugin landed.
  ⚠️ **ONE BANNER, TWO PLATFORMS, AND THEY ARE GENUINELY DIFFERENT.** Android/Chrome fires
  `beforeinstallprompt`, which is captured and replayed against a real Install button. **iOS
  NEVER fires it** — Apple has no programmatic install — so iOS gets the Share → Add to Home
  Screen steps and **deliberately no button**, because a button there could not work. That is
  the dead-affordance defect `EventDetail` already shipped once.
  ⚠️ **It must be SAFARI, not merely iOS.** Add to Home Screen is absent from Chrome and
  Firefox share sheets on iPhone, so those render nothing rather than instructions that send
  someone hunting for a menu item that is not there.
  ⚠️ **iPadOS 13+ reports itself as a Mac** (`platform === 'MacIntel'`); the touch-point count
  is the only thing separating an iPad from a desktop Mac.
  ⚠️ **The event is captured at MODULE LOAD, not in a `useEffect`** — `beforeinstallprompt`
  fires once and early, often before React mounts, and is never re-fired. A listener in an
  effect misses it on exactly the load where it mattered.
  ⚠️ **`navigator.standalone` is checked as well as `display-mode: standalone`** — iOS never
  implemented the standard one for this, so checking only it shows the banner to every iPhone
  user who has already installed.
  Renders above the loading/error/ready split in `AppShell`, so a parent still waiting for
  approval sees it. Dismissal persists, and blocked `localStorage` cannot take the shell down.

- `ea0b8ac` — **Duplicate an event, and three type marks that mean something.** Two
  requests from Jay, shipped together only because they touch the same two files.
  **Duplicate:** `EventDetail`'s footer becomes Edit | Duplicate | Delete, and Duplicate
  opens the CREATE form prefilled from the fixture. Jay: *"the details take the effort,
  not the date."*
  ⚠️ **The date opens BLANK, Jay's choice over three smarter defaults** — a prefilled
  guess quietly becomes wrong, and here wrong means a session in fifteen parents'
  subscribed calendars on a day nobody chose. It needed **no new guard**: the form
  already refuses to save without a date.
  ⚠️ **Score, round and id are cleared; times, venue, pitch, notes, squad, competition
  and league team carry.** The round goes because "Round 4" twice is a wrong result filed
  with the governing body; the league TEAM stays because it belongs to the squad, which
  carries.
  ⚠️ **`series_id` cannot leak in, STRUCTURALLY** — neither it nor `group_id` is in
  `initialValues`, and the only writers are the repeating/multiSquad branches. A duplicate
  that inherited one would be swept up by "delete this and every later session" from an
  occurrence it has nothing to do with.
  ⚠️ **The whole implementation is `editing = Boolean(event?.id) && !duplicate`** — that
  one flag already gated the id, the series checkbox, Repeats, the extra-squads picker,
  the title and the submit label. **Repeats coming back is a bonus, not an accident:**
  duplicate + repeat is the only way to extend a finished series.
  **The marks:** whistle/shirt/trophy out, solid rugby ball / rounded-tip cone / two
  people in, moved OUT of `EventDetail.jsx` into `src/components/EventTypeIcon.jsx` with
  **`Chip` deciding the icon rather than each caller**. A whistle starts training as often
  as a match; a shirt says "kit"; a trophy means WINNING and was sitting on the BBQ.
  ⚠️ **Only the three event types get one** — win/loss/draw and the neutral squad pill
  never do. The ball is solid where the others are outlines because its chip is the only
  dark fill, and its seam is a **mask** with a `useId` id, since two match chips in one
  list would collide on a literal one.
  ❌ **A claim was written, tested and WITHDRAWN mid-build, and it is the most useful part:**
  "`flex-wrap` on the three-button footer stops the document overflowing" was wrong twice
  over. Measured — the buttons fit one line at 320px — and, more importantly,
  ⚠️ **`harness/check-overflow.mjs` IS BLIND TO ANYTHING INSIDE A SHEET**, because `Sheet`
  is `position:fixed` and sets `body{overflow:hidden}`. A 900px `shrink-0` button injected
  into an open sheet left the gate GREEN. That applies to the `availability` and
  `playerform` scenarios too. Caught only because a control fault was injected after the
  first injection came back clean. Recorded in `state-of-play.md`.

- `d551caf` — **The AI ruling, and two plans.** ✅ **CHILDREN'S DATA MAY LEAVE THE CLUB FOR A
  THIRD-PARTY API — Jay, 12 Aug 2026, asked directly and answered "yes it may".**
  `state-of-play.md` recorded that EVERY AI feature was gated on this one question and
  that nobody had asked him. Recorded in
  `claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md`.
  ⚠️ **"May" is permission, not a design** — the implementation default is MINIMISATION,
  with a written field list. Photos, contacts, medical notes and attendance are NOT sent
  without a separate conversation.
  ⚠️ **`match_sheets.medical_notes` is the trap this schema now carries**: a match-report
  feature doing `select('*')` would send concussion notes about named children to a third
  party. **No `select('*')` on the AI path** — deliberately the opposite of the convention
  everywhere else in `src/data/`.
  ⚠️ **The model is `claude-haiku-4-5`** (Jay's call) as ONE constant, and it does NOT take
  `effort` — copying a request body from an Opus example errors.
  ⚠️ **"Scrape the web for the best rugby training sessions" cannot be built as
  described**, and the reason is copyright rather than capability: World Rugby, the RFU and
  the rest own that material. The plan reaches the same outcome by linking out, using search
  to DISCOVER rather than copy, and generating original sessions from age-grade principles
  — which are facts, not expression. `drills` deliberately has **no full-text column**, and
  its absence is the design.

- `3c64990` — **RCM match sheets — Project 2, shipped.** `match_sheets`, `match_sheet_slots` (22 per
  sheet) and `match_sheet_cards`, the editor at `/match-sheet/:eventId`, and the Club Youth
  Manager's list at `/admin/youth` behind the `youth` right — which had existed since 10 Aug
  and granted access to nothing.
  ⚠️ **The layout is a FACSIMILE of the real form**, which Jay supplied mid-build. Three
  things came from the document and not from the field list: the 22 run in **two columns**
  (1-12 left, 13-22 right, each with its own FR); **FINAL SCORE/TRIES are HOME and AWAY, not
  us and them**, so an away fixture puts our score on the right; and **CLUB is the club while
  HOME TEAM is the LEAGUE TEAM** — an earlier guess had the club name in both.
  ⚠️ **Instruction 5 on the form — "WAP, DIV1, DIV2 Games are completed on sportslive app" —
  is independent support for the null deadline.** Those senior competitions do not use this
  sheet at all.
  ⚠️ **One editor for every age group** (Jay's ruling), but `matchSheetDeadline` still reports
  U18's real deadline of **one hour BEFORE kick-off**. Not offering a pre-match flow is a
  different thing from telling a coach something untrue, and the module says so.
  ⚠️ **`full_name` is stored as text even when a player is linked** — the form demands the
  name "as per registration", and a filed sheet must survive a player being renamed or
  removed. A third justification ("the club only has 7 players") was **retired**: Jay's ruling
  is to build for the loaded club, so the roster picker is first-class and free text is the
  fallback.
  ⚠️ **`complete` means READY TO SEND, never SENT.** Nothing in the app can know whether RCM
  received anything; submission is a human dropping a file into a WhatsApp group.
  ⚠️ **Share generates a real PNG** via a lazily-imported html2canvas (measured 198,689
  bytes), because **WhatsApp cannot be handed a file by a link** — `wa.me/?text=` is text
  only. This overturns the plan's "no new dependency"; Jay accepted the cost.
  ⚠️ **`EventDetail` gets a handler prop, not a `<Link>`** — a router-aware element in a
  component rendered inside a Sheet broke eighteen tests, and the file already had the
  pattern in `onOpenRegister`. It renders **only when a handler exists**, the lesson from the
  dead availability button.
  ⚠️ **RCM's red is a named token (`rcm`), not a raw hex** — `tests/theme.test.js` refused the
  arbitrary value, correctly. It is **their** brand colour on **their** document and must
  never be used as an app accent.

- `18e4e12` — **Competition is a CHOICE, not a free-text box** — League or Tournament, or neither.
  Jay, 12 Aug 2026. League offers **Round 1-8**; Tournament offers **ADHJRT, Dubai Youth
  Festival, Al Ain Tournament, Small Blacks Tournament** and a "Something else" box.
  ⚠️ **"Neither — a friendly" is the DEFAULT and a real answer.** Nothing may read the blank
  as "assume league" — the same rule `league_team_id` carries.
  ⚠️ **`competition_type` is a COLUMN, not derived from `round`.** Deriving it needed no
  migration and was wrong: a league fixture whose round nobody has entered yet would read as
  a friendly. The type is a fact somebody states; the round is a detail they may not know.
  ⚠️ **`round` now hangs off the COMPETITION, not off the league team.** A round is a
  property of the competition, and the old coupling silently discarded it on a league fixture
  whose team had not been picked. `fixtureLabel` still refuses to RENDER a round without a
  league team — a display rule, deliberately not the same rule as what gets stored.
  ⚠️ **`competition` now means "the tournament's name"** and is NULL for a league fixture.
  Switching type clears the other side's answer, in the form and in the save.
  ⚠️ **An old row with free text and no type is READ as a tournament**, keeping what somebody
  typed. **A read, not a backfill** — the migration wrote nothing, so nothing in the database
  can be mistaken for an answer somebody gave.
  ⚠️ **`competition_type` rides in `common`, unlike the league fields** — an ADHJRT weekend
  fanned out across every age group is genuinely one tournament for all of them, whereas
  which of our teams played it is a fact about the squad.
  ⚠️ **The tournament list is hard-coded, unlike pitches, deliberately**: the pitch list
  became a table the day clash detection had to reason about pitches; nothing reasons about a
  tournament, it is a label. Four regulars plus an escape hatch costs no schema.
  ⚠️ **`EventDetail` had to change or every league match would show no competition at all** —
  the row tested `event.competition`, which is now null for exactly those.

- `102fa48` — **A league team's name is unique per SQUAD, not per club** — and the save now says which
  of the two things went wrong. ⚠️ **Both defects were found by Jay using the app within
  hours of the feature shipping, and no test could have caught either.**
  ⚠️ **`unique (club_id, rcm_name)` was wrong.** Every age group has its own ADHQ1/ADHQ2/
  ADHQ3, one per division, so the name only identifies a team WITHIN an age group. The
  original constraint let the club hold exactly one ADHQ1 anywhere, and blocked the second
  age group outright. Now `unique (team_id, rcm_name)`.
  ⚠️ **The design note that got this wrong reasoned carefully about the thing it checked.**
  It proved a column on `teams` could not hold three league teams — true, and why this is a
  table — then assumed without asking that names were club-unique. Jay's sentence was
  "multiple teams at an age group"; nothing in it said the names do not repeat BETWEEN age
  groups.
  ⚠️ **One message naming two causes is not a message.** `upsertLeagueTeam` threw *"you may
  not have permission, or the name may already be in use"* for every failure, so the person
  hitting the constraint was told it might be either and reported it as a permission problem.
  Now `23505` names the duplicate and the squad, `42501` names permission, and anything else
  surfaces the database's own message. **The repo's rule is to read the RESPONSE rather than
  the coloured box; a hedged message denies the user the same thing.**
  ⚠️ **`db/tests/league-team-name-scope.sql` asserts BOTH directions** — a test that only
  proved the second squad is now allowed would pass equally against a table with no unique
  constraint at all.

## 11 Aug 2026

- `8be9668` — **The calendar feed names the league team** (task 8). `calendar_events_for_token()` gains
  `league_team_name`, `league_division` and `round`; the edge function puts the team's NAME
  in `SUMMARY` (in place of the squad) and the full `ADHQ2 · Div B · Round 4` first in
  `DESCRIPTION`.
  ⚠️ **The feed's columns come from the function's `RETURNS TABLE`, not from the edge
  function** — which is why this needed a migration at all, and why the plan's description of
  task 8 was wrong.
  ⚠️ **`RETURNS TABLE` cannot be changed in place**, so the migration DROPs and re-creates —
  **and a drop takes the grants with it.** This function is anon-executable deliberately (it
  IS the feed; the token is the gate), so the migration re-grants from the ACL measured on
  live immediately beforehand. Without that, every subscribed parent's calendar fails silently.
  ⚠️ **LEFT JOIN, never inner** — an inner join would drop every non-league fixture from the
  feed, which is most of them and all training, with a 200 and a valid `.ics` and no error
  anywhere.
  ⚠️ **SUMMARY carries only the team's NAME, deliberately unlike the app's chip.** A phone
  truncates `SUMMARY` hard and "ADHQ2 · Div B · Round 4 v Dubai Exiles" loses the opponent —
  the one thing a title exists to carry. Same facts, same order, different room.
  ⚠️ **No vitest can execute the feed** (Deno, `Deno.serve` at module scope), so
  `tests/calendar-league-team.test.js` is a **rot detector** over the source and the
  migration, not a behaviour test. It fails if the app's format changes and the feed's does
  not, which is the failure this duplication actually has.
  ⚠️ **THE DROP RE-GRANTED THREE ROLES AND SILENTLY ADDED A FOURTH.** `create function`
  grants EXECUTE to **PUBLIC** by default, which this function did not have; the ACL read
  back afterwards differed from the one read before. A follow-up `revoke … from public`
  restored it exactly. **Re-granting what you measured is not restoring what you measured** —
  compare the whole `proacl`, not just the role you were worried about.
  ✅ **Verified live**: the deployed feed returns **200 `text/calendar; charset=utf-8`** on
  both the function URL and `adhquins-clubhub.com/calendar.ics` — not `text/html`, so
  neither the SPA catch-all nor the service worker is intercepting — and the RPC returned
  every event in the window, **so the LEFT JOIN dropped nothing**.
  ⚠️ **BUT THE LEAGUE PATH ITSELF IS UNEXERCISED.** At verification the database held **zero**
  league teams and zero tagged fixtures, so what was proved is that nothing BROKE, not that
  the label works. Creating one league team on the Club tab and tagging one fixture is the
  outstanding check, and it exercises tasks 5-8 at once.

- `b48edde` — **A match records which league team played it, and every fixture screen says so**
  (tasks 6-7). `EventForm` gains a **League team** select and a **Round** box, both matches-only;
  `FixtureRow`, `EventDetail` and the allocation grid render `fixtureLabel`.
  ⚠️ **The picker offers only the chosen squad's teams**, and **changing the Age group clears
  the league team** — pick U14B, pick ADHQ2, then realise it was the U16 fixture, and without
  the clear the save writes a U14 team onto a U16 fixture.
  ⚠️ **The league fields are deliberately NOT in `common`** — `common` is stamped on every row
  by the multi-squad fan-out, so a league team there would be given to all three squads'
  copies at once. They ride on the primary squad's payload only, which also keeps them out of
  the series-edit write.
  ⚠️ **`round` is written NULL unless a league team is set**, whatever the input still holds —
  the same rule `fixtureLabel` enforces when rendering.
  ⚠️ **`listEvents` now EMBEDS the league team** (`*, league_team:league_teams(...)`) instead
  of each screen querying it. Four screens rendering the label off the row they already have
  is what stops one of them drifting. **`tests/data.test.js` pinned `select('*')` and caught
  the change**, which is the check working.
  ⚠️ **`EventDetail` keeps Age group AND adds League team** — different facts, and it is the
  one screen with room for both. Elsewhere they collapse into one chip.
  ⚠️ **Task 8, the calendar feed, is NOT in this change**: the feed's columns come from
  `calendar_events_for_token()`'s `RETURNS TABLE`, so it needs a migration plus a separate
  edge-function deploy. Editing `supabase/functions/calendar/index.ts` alone would change
  nothing — that exact trap cost a day in Aug 2026.

- `ee85430` — **The Club tab manages the club's league teams** (task 5). Each age group in the Age
  groups list now carries its own league teams as chips, plus a "+" to enter another.
  ⚠️ **A league team is entered against the squad whose "+" was tapped** — the panel
  carries that squad's `team_id` and `club_id`, because a U14 team filed under U16 reaches
  the governing body as a wrong result rather than an obvious slip.
  ⚠️ **`division` is sent as NULL, never `''`** — the column carries a check constraint of
  `('A','B','C')`, so an empty string is a violation rather than "no division", and the
  save would fail on a field somebody deliberately left blank.
  ⚠️ **Retired teams are shown, greyed, and ANNOUNCED as retired** — this is the only
  screen that can bring one back, and hiding it would make it look deleted and get it
  re-added under a name that collides with `league_teams_club_id_rcm_name_key`.
  ⚠️ **A new `listAllLeagueTeams` reads club-wide, and is NOT a picker source** — the
  squad-scoped `listLeagueTeams` still exists for exactly that reason; this one saves
  fifteen round trips on a screen that lists every squad, and the screen groups by
  `team_id` itself. ⚠️ **The screen offers no Delete, deliberately**: `ON DELETE SET NULL`
  would strip the league identity off every fixture the team ever played, leaving them
  indistinguishable from friendlies.

⚠️ **AND `f16c025` DID DIE THE MOMENT PR #52 MERGED — REPOINTED TO `ee85430` ABOVE. THIS
IS A TREADMILL, NOT A ONE-OFF, AND IT HAS NOW RUN TWICE IN TWO PRs.**

⚠️ **`npm run docs:check` CANNOT CATCH THE DEAD SHA ON THE MACHINE THAT WROTE IT, AND THAT
IS THE TRAP THAT BIT ON PR #53.** A squashed-away commit is still a loose object in the
clone that authored it, so `git cat-file` finds it and the check goes green locally while
CI — a fresh clone with only `main`'s history — fails on the same file. **A green local
`docs:check` is not evidence for a changelog SHA.** Verify with
`git cat-file -e <sha> 2>/dev/null` inside a clone that never had the branch, or simply
trust CI over the laptop. Same shape as the CRLF trap in `state-of-play.md`, in reverse:
there CI is blind and the PC sees it; here the PC is blind and CI sees it.

`docs:check` requires every commit to be cited by SHA, and
`main`'s only merge method is squash, so **every** branch SHA a changelog entry cites stops
existing at merge and `main` goes red until the next PR repoints it. That is the mechanism
that broke below, and it will repeat after this PR, and after the one after that.
**Decide the rule rather than paying it each time** — the options are citing the PR number
instead of the SHA, teaching `scripts/docs-check.mjs` to accept an unreachable SHA that a
squash subject matches, or writing the changelog entry only in a follow-up. Not fixed here
because it changes a check, and that is Jay's call.

⚠️ **`b640b4a` and `8cd5ff0` USED TO HEAD THE NEXT TWO ENTRIES AND ARE NOT COMMITS.** They
were branch commits, and `main`'s only merge method is SQUASH — so the moment PR #51
merged they ceased to exist and `docs:check` went red on `main` itself, not merely on a
branch. **Cite the SHA the squash produced, which nobody can know until after the merge:**
that is exactly the "changelog is allowed to be one commit behind" rule, and the reason it
must be the NEXT PR that fills it in. Repointed to `725d0e6` below rather than deleted —
`CLAUDE.md` rule 7, an anchor that has rotted gets repointed, never removed.

- `725d0e6` — **`league_teams`, the data layer, and one shared fixture label** (tasks 1-4,
  PR #51). Squashed from the two entries that follow, which are kept for their detail.

- (in `725d0e6`) — **The league-team data layer and one shared fixture label** (tasks 3-4).
  `listLeagueTeams` / `upsertLeagueTeam` / `setLeagueTeamActive`, plus the formatter every
  screen will render. ⚠️ **The null case is tested FIRST** — no league team means no
  division and no round, and a stale round left on a fixture later changed to a friendly
  must not leak out. ⚠️ **`upsertLeagueTeam` throws when RLS filters a write to zero
  rows**: that refusal arrives as `data === null` with `error === null`, so without the
  explicit check a non-admin's rename reports back as saved while nothing changed.
  ⚠️ **`listLeagueTeams` is always scoped to ONE squad** and returns `[]` rather than
  querying without one — a club-wide list on the event form would let a U14 fixture be
  filed under a U16 team, which the league receives as a wrong result rather than an
  obvious mistake. Nothing user-visible yet; the display work is tasks 5-7.

- (in `725d0e6`) — **`league_teams`: the club's COMPETING teams, distinct from its SQUADS**
  (tasks 1-2). `ADHQ2` is a league team; `U14B Contact` is a training squad; one squad can
  enter three. Plus `events.league_team_id` and `events.round`.
  ⚠️ **The RLS harness was run BEFORE the migration existed**, where it could not run at
  all — that is the fault injection — and again after. All five steps pass, including a
  coach's INSERT refused with **42501 specifically**, because a refusal caused by a
  mistyped table name would otherwise read as "RLS works".
  ⚠️ **The harness's first run died with "permission denied for table `_r`"**, which looks
  exactly like an RLS failure on `league_teams` and was nothing of the kind: its temp
  results table was granted to `authenticated` but not `anon`. **A harness that cannot
  record its own result reports a bug that does not exist.**
  ⚠️ **`events.league_team_id` is ON DELETE SET NULL, never cascade** — deleting a league
  team must cost a fixture its LABEL, which is recoverable, and never the FIXTURE.

- `4b5a152` — **An implementation plan for Project 1**, `claude/plans/2026-08-11-league-teams-implementation.md`
  — eight TDD tasks. ⚠️ **Task 4 is written null-case-first on purpose** and step 5 proves
  that test discriminates by injecting a default into the null branch. ⚠️ **One shared
  label formatter rather than four call sites**, because the calendar feed
  deploys separately from the bundle, so drift there stays invisible until a parent's
  subscribed calendar disagrees with the app. ⚠️ Task 1 writes the RLS harness BEFORE the
  migration and runs it expecting failure, so it is proved against the absence of the
  thing it tests — and asserts `insufficient_privilege` specifically, because a negative
  check that passes on a mistyped table name proves nothing.
  ⚠️ **`docs-check` only validates `claude/`, `src/` and `db/` paths**, so the plan's
  `supabase/functions/calendar/index.ts` reference was verified by hand — a green
  `docs-check` would not have covered it.

- `45d50d4` — **Two specs for the Club Youth Manager's match sheets, and the brainstorm found a modelling gap that
  would have wasted the build.** `claude/plans/2026-08-11-league-teams-and-fixtures.md`
  and `claude/plans/2026-08-11-match-sheets.md`, split because the work spans EventForm,
  Schedule, the calendar feed and the allocation grid before a sheet is even rendered.
  ⚠️ **"MATCH SHEET" IS NOT A CLUB REPORT — it is the RCM Official Match Result Sheet**,
  a governing-body form returned per team per game, submitted to a WhatsApp group as a
  file or photo. Jay supplied a filled example, which settled the format outright.
  ⚠️ **THE SAME FORM HAS TWO DEADLINES ON OPPOSITE SIDES OF THE MATCH**: U11–U16 within
  24 hours AFTER, U18 one hour BEFORE kick-off. Jay described it as an after-the-match
  report, which is true of the age groups he had in mind and not of U18.
  ⚠️ **THE GAP THAT MATTERED: two different things here are both called "team".** A
  SQUAD (`U14B Contact`) is a training group and is all the app models; a LEAGUE TEAM
  (`ADHQ2`) is a competing entity in one division, and each age group can field three.
  A first design storing one RCM name per squad was agreed and then withdrawn when Jay
  said so — one column cannot hold three teams. ⚠️ **And the letter in a squad name is
  GENDER, not division**: `U14B` is Boys. Anything parsing a division out of `teams.name`
  reads the gender instead.
  ⚠️ **Measured while designing, and it shapes the build: 7 players in the whole
  database, 0 with a position, 0 captains, and `attendance` still empty.** A 22-man sheet
  cannot be built from a 7-player roster and there is deliberately no import — so names
  are stored as TEXT alongside the optional `player_id`, which is the load-bearing
  decision in the project. Auto-filling from the register is deferred for the same
  reason the attendance flags are.

- `0ef43d4` — **Corrected what the Roster pill change actually was** — the gender filter,
  not the squad or age-group one.

- `d6a1f1b` — **The fortnight strip, the gender filter and the match pill all take the
  12px corner.**
  Jay: *"things like the next two week buttons can be like the age group buttons on the
  tournament website, things like match pills etc can be similar too"*. Three changes, all
  corner-only:
  `UpcomingStrip` day cells (`rounded-[11px]`→`rounded-tab`) — ⚠️ **already adhjrt's shape
  in every other respect**: white with a hairline idle, solid red for today, exactly as
  those buttons go white then red when selected. Only the corner disagreed, and 11px is
  the app's SURFACE radius, the wrong token for something you press.
  `Roster`'s **gender** filter (`rounded-pill`→`rounded-tab`) — a horizontal row of
  filters, white until chosen and filled red when it is. It was a 100px pill.
  ❌ **`d6a1f1b` and PR #47 both call this "the squad filters" and "the closest analogue
  to adhjrt.com's age-group buttons". It is neither.** The three controls are
  All / Male / Female; AGE GROUP on that screen is a `<select>`, so no age-group control
  was touched at all. Caught by verifying live after the deploy rather than by review —
  the selector written to confirm it found zero elements, and chasing that down is what
  exposed the mislabelling. Neither the commit message nor the PR body can be edited.
  `Chip` (`rounded-[20px]`→`rounded-tab`) — the match pill, and per `design-system.md`
  §4.7 its neutral variant is also the age-group label, so this is the single largest
  visual change in the sweep and what ties the fixture rows to the strip and the nav.
  ⚠️ **`Chip`'s COLOURS ARE UNTOUCHED.** Every pairing in it was chosen to clear AA at
  11.5px bold and several are deliberately not the brand tokens — the component header
  gives the ratio for each. This was the corner and nothing else.
  ⚠️ **The remaining `rounded-pill` uses are BADGES, not controls, and stay round on
  purpose**: the masthead role label and account chip, the Accounts flag, Allocation's two
  counts, PitchRequest's status and PlayerDetail's two. A pill is the right shape for a
  thing that reports state; 12px is for a thing you press. **Do not "finish the job".**

- `449641e` — **The top menu now carries adhjrt.com's type, sheen and underline — measured, including
  the hover state.** Jay: *"not all capital letters, seems like the font is smaller on the
  tournament site, tournament site tabs have nice animation and a shimmer when you scroll
  over them"*. `.hdr-nav a` there is **15px/600, `text-transform: none`, radius 8px,
  padding 7px 11px 9px**; on hover it lifts 1px, washes to `rgba(255,255,255,.07)`, runs a
  115° sheen across a `::before` at `mix-blend-mode: screen`, and wipes in a gradient
  underline from the left. ⚠️ **Three of its `:hover` rules could not be read from the
  stylesheet, so the hover state was captured by HOVERING THE REAL ELEMENT** and reading
  the computed styles back — the sheen's `opacity: .85` and `holoSweep` timing exist
  nowhere else.
  ⚠️ **8px, WHICH CORRECTS THE COMMIT BEFORE IT.** `005dbc0` put 12px on the top menu from
  adhjrt.com's AGE-GROUP tabs; its header nav is a different control at 8px — which is
  `rounded-btn`, the app's own button radius, so the top menu now agrees with the
  site-wide rule that started this.
  ⚠️ **Two things deliberately not copied, both Jay's calls:** the sheen is red→white, not
  red→white→**green**, because green means SUCCESS in this app and the chrome should not
  spend it; and the current page keeps its **solid red fill** rather than adhjrt's
  colour-only marker, because this is an app people navigate constantly and colour alone
  is the weakest signal of state. The underline may be red→green — it reuses `brand-rule`,
  the club's existing decorative hairline — and is suppressed on the active item, where a
  red-to-green rule inside a red box reads as a rendering fault.
  ⚠️ **Smaller type gives the masthead back ~50px.** 16px→15px and `px-4`→`px-[11px]`
  across five items frees width in a row where the wordmark is the only non-`shrink-0`
  item. **A side effect, not the fix** — the `sr-only` cutoff at `wide` is unchanged and
  the truncation Jay reported is still unexplained.
  Harness: `tests/nav-sheen.test.js`, asserting the BUILT stylesheet.

- `005dbc0` — **The TOP MENU is now 12px too — and this is the control Jay actually meant.**
  `src/components/Nav.jsx` carried `desktop:rounded-pill` (100px); it is now
  `desktop:rounded-tab`. ⚠️ **The previous entry fixed the wrong row.** "The rounded off
  buttons at the top" was read as the `/admin` dashboard tabs, and the ambiguity had
  already been spotted and put to Jay — *"just those four tabs, or every `rounded-pill`
  in the app?"* — then resolved by guessing rather than by waiting for the answer. It
  cost a deploy. **An ambiguity you have already noticed is not one to resolve on the
  balance of probability.**
  ⚠️ **ONLY THE CORNER IS COPIED FROM adhjrt.com, deliberately.** Its idle tab is
  black-on-white, which works on a white page. This row sits on the near-black masthead,
  so a white fill would put four bright boxes into the chrome — far more than was asked
  for, and against the palette's "identity lives on the chrome so the data surfaces stay
  calm" idea. Idle stays transparent, active stays brand red.
  ⚠️ **A stale contrast figure was corrected in passing.** `Nav.jsx` documented the
  active item as **4.79:1** white-on-red. Measured live it is **5.88:1** — 4.79 is the
  ratio for `#e11b22`, which is *adhjrt.com's* red, not this app's `#c8102e`. Wrong
  number, right conclusion, sitting in the file as fact.
  The `/admin` tabs from the previous entry stay at 12px — Jay's call, and they now
  agree with the top menu.

- `5d88d03` — **The `/admin` tabs are modelled on adhjrt.com's, and the spec was MEASURED rather
  than eyeballed.** Jay: *"i want them like the tabs on the adhjrt.com website"*, after
  noticing the pills disagreed with the site-wide 8px button rule. `getComputedStyle` on
  the live age-group tabs there gives **12px radius, 0.8px border, white fill idle, red
  fill active** — so a new `rounded-tab` token (12px), ⚠️ **deliberately neither `btn`
  (8px) nor `card` (16px)**: a tab is softer than a control you press and tighter than
  the surface it sits on, and reusing `btn` would keep the row reading as buttons, which
  is what prompted the change.
  ⚠️ **ONE THING WAS DELIBERATELY NOT COPIED: adhjrt.com puts BLACK text on the red
  active tab.** Measured there it is **4.38:1** — already failing WCAG AA, since 13px
  bold does not qualify as large text (that needs 18.66px+). Against this app's darker
  red (`brand` #c8102e) the same choice measures **3.57:1**. White on #c8102e is
  **5.88:1** and is what ships. **The look is copied; the contrast bug is not.**
  ⚠️ Also worth knowing: the tab row was NOT covered by the 10 Aug button sweep, which
  excluded tabs and pills on purpose — but that decision's own closing section said
  nobody had audited whether each raw control was still right, and called it a design
  question. This is that question being answered, not a ruling being overturned.
  ⚠️ **A TAILWIND CONFIG CHANGE NEEDS THE DEV SERVER RESTARTED; a class change does
  not.** The first render came back `borderRadius: 0px`, which looks exactly like a
  typo. Every pre-existing token applied correctly and only the NEW one was missing —
  that asymmetry is the tell. Verified in the built CSS too, with a fabricated token as
  the control emitting zero rules.

- `c06e51a` — **Claude Code's auto-scaffolded `.claude/launch.json` is gitignored**, and
  the deploy cost recorded. See the two entries below, which this commit shipped.

- **A deploy costs 15 Netlify credits, and that is now written down.** `rules.md` tells
  every session to look the figure up in `CLAUDE.md`; it had never been recorded, so
  deploys were described as vaguely expensive and no session could say what a build was
  worth. Jay's framing — *"it's not really expensive"* — is recorded with it, because
  the number without it invites the opposite error. ⚠️ **Skipping a pointless deploy is
  tidiness, not thrift**; what still needs an explicit yes is that `main` is LIVE.
  ⚠️ Recorded alongside it: **`scripts/netlify-ignore.mjs` treats a DOTFILE as
  deploy-relevant** — its root pattern is `/^[^/]+\.md$/`, so `.gitignore`,
  `.gitattributes` and `netlify.toml` all build. Correct for `netlify.toml`, whose
  redirects and headers only take effect by deploying. **Run the gate before promising
  a skip** — PR #43 claimed one in its own description while the preview was building.

- **Claude Code's auto-scaffolded `.claude/launch.json` is gitignored.** The app wrote
  it mid-session; it is a per-machine dev-server config and has no business travelling
  between the two PCs. ⚠️ **`.claude/settings.json` STAYS TRACKED** — it wires
  `scripts/session-guard.mjs`, so an ignore rule wide enough to catch it would silently
  untrack the clone-staleness guard and nothing would say so until a session ran on a
  stale clone. The rule names the one file, and the check that matters is the negative
  one: `git check-ignore .claude/settings.json` must stay empty.
  ⚠️ **`settings.local.json` was already covered by the GLOBAL gitignore**
  (`~/.config/git/ignore`), not by this file — asserted here as un-ignored first, and
  `git status` had already been showing otherwise. **`git check-ignore -v` names the
  file AND the rule; `git status` only tells you what it decided.**

- `0c27689` — **`db/schema/` had drifted for two days, and the re-capture found three
  claims that had INVERTED rather than merely gone stale.** Seven objects were live with no entry
  in the directory: `private.is_super_admin`, `public.set_admin_rights`, the
  `memb no self promotion` policy, `memberships.is_super` / `.admin_rights`,
  `private.notify_pitch_request`, its two triggers, and
  `teams.self_registration_allowed`. ⚠️ **`policies.sql` said "Every policy is
  PERMISSIVE"** — `memb no self promotion` is RESTRICTIVE, the only one in the schema,
  and it is what stops an admin INSERTing themselves an already-super membership row
  (the column grant only closes UPDATE). ⚠️ **Its RLS-enabled list named thirteen
  tables against sixteen live**; all sixteen do have RLS on, but that list is the only
  thing in the repo that would show a table created without it, and Supabase's
  defaults hand `anon` full rights on any new `public` table. ⚠️ **`functions.sql`
  described a `register_my_player` signature the 11 Aug migration DROPS**, so the live
  4-arg version and its self-registration guard appeared nowhere. ⚠️ **And the
  `pitches` / `pitch_requests` blocks were the migrations' DDL pasted in, not a
  capture** — inline unnamed constraints, so `pitches_club_id_name_key` and
  `pitch_requests_status_check` existed nowhere in the repo as strings and a rename
  would have diffed to nothing. Also recorded, not reconciled: the live
  `register_my_player` body carries SHORTER comments than the committed migration, so
  re-applying that file would rewrite the live function. Detail in
  `db/schema/README.md`.

- `5979c21` — **A U13+ player can register themselves.** "Add your player" asks *is this
  you, or your child?* for squads that permit it, and the membership role becomes
  `player` rather than `parent`. ⚠️ **The permission is a new `teams` column, never the
  squad name** — `20260806_claim_roster_access.sql` ruled that a rename must not hand an
  account a role it should not have. The database refuses a self-registration for a
  squad that disallows it (`0A000`, deliberately unmapped so the sentence naming the
  squad reaches the person). ⚠️ **The 3-arg `register_my_player` is dropped**, because
  Postgres prefers an exact arity match and every existing client would otherwise keep
  resolving to it. Design and the rejected alternatives:
  `claude/plans/2026-08-11-youth-self-registration.md`.

- `0e62899` — **The machine facts were measured on the machine, and two were wrong.**
  cafnet was synced from `build/v1-mvp` — a branch deleted from origin, 76 commits
  behind — and the claims about it checked by running the commands there. ⚠️ **`NODE_ENV`
  is not set on cafnet at any scope**, contradicting the "BOTH PCs" wording that had
  replaced an earlier "cafnet only" — wrong in both directions, and copied rather than
  run both times. npm is not blocked from PowerShell there; `core.fileMode` is `false`.
  `CLAUDE.md` now carries a per-machine table as the single home and the three files
  that restated a value point at it. ⚠️ **The `jay-pc` column is SECOND-HAND and says
  so** — the first draft asserted "measured ON THAT MACHINE" over a column assembled on
  cafnet from what other documents claimed, reproducing inside the fix the exact failure
  it was fixing.
  Also records three traps: the stale-`dist` one (`npm test` does not build, and three
  test files read `dist/`), the `0 0`-against-a-dead-ref one, and that **pushing and
  opening a PR are different credentials** — no git command opens a pull request, the
  account-level connector still returns `Bad credentials`, and feeding git's stored
  token to `gh` is blocked by the permission classifier and should be. `gh` is now
  installed and authenticated on cafnet. ⚠️ **`hosts.yml` existing is not proof of
  login.**

- `2008269` — **Tell the next cafnet session what a plain `git pull` will not fix.**
  That clone was last measured 7 Aug on a branch since deleted, and `.gitattributes`
  landed 10 Aug. ⚠️ **Git applies `eol` attributes on CHECKOUT, so a pull normalises
  only the files that pull changed** — every `.mjs` older than 10 Aug and untouched
  since keeps its CRLF, and the suite then fails with a `SyntaxError` naming a blank
  line in an unrelated test. **CI cannot see it**: Actions checks out LF and stays
  green. Recommends a fresh clone, gated on checking `git status` AND `git stash list`
  first.

- `cc49604` — **Bring the docs up to date, and record `bfcb571`.**

- **11 Aug — the docs caught up with the session.** `state-of-play.md` carried three
  claims the day had falsified (the pitch screens and email "NOT BUILT YET", the
  super-admin tier "NOT YET BUILT"), `RESTORE.md` had no record of the notification
  plumbing, and the session had no handoff. ⚠️ **All three stale claims were the same
  kind: a status line that was true when written and was carried past the change that
  falsified it** — the precise failure `state-of-play.md` exists to catch, and the
  third instance in a week.

- `bfcb571` — **Email Pitch Managers on a pitch request, and the coach on the answer.**

- **11 Aug — a pitch request now EMAILS: the Pitch Managers when it is asked, the
  coach when it is answered.** Trigger `notify_pitch_request` on `pitch_requests` plus
  the `notify-pitch-request` edge function. Closes Jay's "email multiple people,
  appear in two dashboards, trackable from submission to assignment".
  ⚠️ **THE DATABASE SENDS IT, NOT THE APP — and not for tidiness.** The submit mail
  goes to admins, and **the coach who triggers it cannot read admin email addresses**:
  `profiles` is not bulk-readable by a coach and `profiles.email` is column-granted,
  not merely policy-gated. A client-side send would need either the club's admin list
  in every coach's browser or a service-role key in it. The recipient list HAS to be
  built server-side.
  ⚠️ **SUPER ADMINS ARE RECIPIENTS TOO, deliberately.** A super holds every right
  implicitly, so filtering on the `pitches` right alone would exclude the one person
  certain to be able to act — and on a club where nobody has been given the job yet,
  that is EVERY recipient. Today that is not hypothetical: nobody has been granted
  Pitch Management, so both current recipients are Jay's own accounts.
  ⚠️ **THE FAILURE IS GENUINELY QUIET, and an earlier claim that it was "visible"
  was wrong.** Both triggers swallow everything into a `raise warning` nobody reads,
  so a dead endpoint costs an email silently. That is only acceptable because **the
  queue is in-app**: the request sits on the allocation screen whether or not the mail
  arrives. The email is a prompt to go and look, never the record.
  ⚠️ **`allocatePitch`'s write ORDER is what makes the allocated mail correct.** It
  writes `events.pitch` first and closes the request second — chosen so a refused
  fixture write leaves a job to do rather than a lie, but it also means the fixture
  already holds the real pitch when the trigger fires. Reversing those two writes
  would email "you are on Pitch TBD".
  ⚠️ **Verified live because nothing else could verify it** — a Postgres trigger and
  a Deno function are not modules vitest can import, so this ships with NO unit tests.
  All three branches exercised on production: `submitted` → 2, `declined` → 1,
  `allocated` → 1, test row deleted, `events` never written. Two checks that would
  otherwise have passed while lying: the 401 was confirmed by its **body**, since the
  gateway also returns 401 for a missing JWT and the status code alone cannot prove
  `verify_jwt: false` took effect; and the trigger was proved to fire by inserting
  inside a transaction and forcing a ROLLBACK — the pg_net queue row lives in that
  transaction too, so it went 0 → 1 and vanished with everything else, proving the
  wiring without sending anything.
  ⚠️ **The copy no longer names `Pitch TBD`.** It said the fixture was "showing Pitch
  TBD", but that string is an option a coach PICKS in the event form — `requestPitch`
  never writes to `events`, so a fixture awaiting a pitch just as often has an empty
  one. The claim was false about half the time.
  Reuses `approval_notify_secret` rather than minting a second secret to rotate and
  forget; new vault entry `pitch_notify_url` is DERIVED from `approval_notify_url` so
  the host cannot drift between the two.

- `852dbf2` — **The pitch request loop closes — ask, answer, and see the outcome.**

- **11 Aug — the pitch request LOOP closes: a coach asks, Pitch Management answers, the coach
  sees the outcome.** `PitchRequest` on the event sheet, and a queue on the allocation
  screen. `pitch_requests` finally has something writing to it.
  ⚠️ **`events.pitch` REMAINS THE ONLY SOURCE OF TRUTH for which pitch** — Jay's
  ruling. The request table records the CONVERSATION and has no pitch column; a second
  copy would disagree with the fixture the moment anyone edited the fixture directly.
  The accepted cost: you cannot ask "what did Pitch Management allocate, and has it changed
  since?", only "was this answered?".
  ⚠️ **A DECLINE IS INVISIBLE ON THE FIXTURE — also Jay's ruling.** It keeps
  `Pitch TBD`, which still reads "not allocated yet". So the request block is the ONLY
  route to that fact, which is why it renders for a DECIDED request too and why the
  decline reason is required rather than optional: "declined" with no reason leaves a
  coach nothing to act on.
  ⚠️ **ALLOCATING WRITES THE FIXTURE FIRST, THEN CLOSES THE REQUEST.** Closing first
  and then failing would tell the coach they have a pitch while the schedule still
  said `Pitch TBD`. This way a failure leaves the request OPEN and the fixture
  correct — a job still to do rather than a lie. **Not atomic** (no transaction over
  PostgREST); the order is the mitigation, not a fix. Proved by swapping it: three
  tests fail.
  ⚠️ **THE QUEUE IS NOT FILTERED BY THE DAY ON SCREEN.** A request is a job waiting,
  not an event on a date — filtering to the visible day would hide next Saturday's
  requests every weekday, so the queue would look empty exactly when there is work.
  ⚠️ **The request block takes NO handler**, unlike the availability and register
  blocks beside it — each of which shipped a dead button when a screen forgot to pass
  one. Nothing here can be wired up wrongly by the next caller.
  ⚠️ **AND CI CAUGHT THE SAME CLASS OF FAILURE A SECOND TIME.** Five allocation screen
  tests: green here, red on Linux, twice in one evening. The cause both times was an
  **unmocked data module** — the component reached for `placeholder.supabase.co` (CI
  sets placeholder env vars, so the client constructs happily), which fails fast
  locally and does not in CI, leaving `Promise.all` unsettled and the screen in
  `loading`. The symptom is several "unable to find an element" errors naming nothing.
  ⚠️ **A global `fetch` guard was written to catch this class permanently, and then
  REMOVED.** It did make local match CI, but it did not produce the explanatory
  message it existed to give — the throw is swallowed by the component's own `.catch`
  — and the mechanism could not be pinned down. **A guard whose comment promises a
  clear failure and delivers a silent one is worse than no guard**, so it was taken
  out rather than shipped on a claim that could not be substantiated. The rule is
  written into `src/test/setup.js` instead, with the worked example in the test.
  ⚠️ **The identity comes from the client library at write time, not a prop or a React
  context.** RLS checks `auth.uid()` against the token the request is sent with, so
  that is the only id that can be right — and requiring a context broke six unrelated
  event-sheet tests the moment the component was added, because those screens render
  without an AuthProvider.
- `9fa06c0` — **The allocation grid — pitches down the side, the day across the top.**

- **11 Aug — the ALLOCATION GRID (option C).** `/admin/allocation`: pitches down the
  side, the day across the top, clashes in amber. The screen the pitch work existed
  for — a Saturday morning fits on one view and a double booking reads without reading
  a word. Tab order puts Allocation before Pitches, because allocating is weekly and
  setting the list up is twice a season.
  ⚠️ **It opens on TODAY — Jay's call, asked directly.** Today is often a quiet
  Tuesday, so an empty day says **"Nothing on today. Use Next to look ahead."** rather
  than drawing fifteen empty rows, which reads as the app failing to load.
  ⚠️ **THE HOUR COLUMNS ARE DERIVED FROM THE DAY'S FIXTURES, NOT FIXED.** A fixed
  08:00–20:00 grid would silently drop a 07:00 kick-off — the fixture would exist, be
  allocated, and simply not appear.
  ⚠️ **A RETIRED OR UNLISTED PITCH GETS A ROW IF SOMETHING IS ON IT.** Showing only
  active pitches would make that booking vanish from the one screen whose job is to
  show what is booked — it would still exist and still clash, invisibly. Not
  hypothetical: `events.pitch` is free text and 16 seeded fixtures name pitches outside
  the list. Both cases are labelled on the row ("retired" / "not listed").
  ⚠️ **FIXTURES WITH NO PITCH GET THEIR OWN LIST**, because they appear in no row —
  without it, the emptier the grid looked the more work there actually was.
  ⚠️ Clashes reuse `findPitchClashes`, so the exemptions hold: a multi-squad fan-out
  is not a clash, touching is not overlapping, `Pitch TBD` never clashes. Counted once
  per pair rather than once per fixture.
  ⚠️ Both invisible-fixture guards proved by injected fault; removing the retired-row
  logic took four tests down.
  ⚠️ **AND THE TEST FILE PASSED HERE WHILE FAILING IN CI** — five screen tests green
  on Windows, all five red on Linux. The cause was the test, not the screen: it mocked
  `pitches.js` with `vi.doMock` AFTER importing the module, then re-imported. That
  happened to re-evaluate locally and did not in CI, so the real `listPitches` ran and
  reached for Supabase. Fixed by hoisting to `vi.mock` with `importActual` (keeping
  the real clash detector), plus an explicit assertion that the mock is in use —
  otherwise the failure arrives as five "unable to find an element" errors that name
  nothing. **The usual version of this trap is CI-green/local-red; this was the mirror
  image, and local green proved nothing.**
- `6421579` — **The pitch setup screen — blocks as columns.**

- **11 Aug — the pitch setup screen: blocks as columns.** `/admin/pitches`, picked by
  Jay from **six** options laid out at browser width. Four block cards, all fifteen
  pitches visible at once on a desktop, stacking on a phone; tap a chip to rename or
  retire, `+` to add one to that block.
  ⚠️ **The `pitches` admin right gates the TAB and the SCREEN, and neither is
  security.** Every admin can already write the table — the RLS policy is `is_admin`
  deliberately, because these rights decide which specialist dashboard somebody is
  SHOWN. So the screen says "you haven't been given the Pitch Manager job", not "you
  are not allowed". The screen repeats the tab's check because a route is linkable and
  somebody will paste the URL. A **super admin** gets in without the right being
  listed, since a super admin holds all of them implicitly.
  ⚠️ **THE BLOCK IS DERIVED FROM THE NAME, not stored.** The club already puts it in
  the name (A1, C5), and a `block` column would be a second place for it to be wrong.
  The cost is that a name like "Clubhouse lawn" has no block, so `Other` exists as a
  real bucket — and it always sorts LAST, because a stray bucket in the middle of
  A/B/C/D reads as a block the club does not have.
  ⚠️ **THE RENAME WARNING IS PART OF THE FEATURE.** `events.pitch` is TEXT with no
  foreign key, so renaming a pitch does NOT touch the fixtures already naming it —
  they keep the old string and silently stop matching for clash detection. The screen
  says so, every time, and points at retiring instead. Proved by deleting the warning:
  the test fails.
  ⚠️ **A retired pitch is ANNOUNCED as retired**, not just drawn with a dashed
  outline — the outline is invisible to a screen reader, and "what is out of action"
  is the main question this screen answers. Also proved by injected fault.
  ⚠️ **This is NOT the allocation screen.** Allocating is weekly and gets its own grid
  (option C, not built). They are separate so a rare destructive action does not live
  on the screen used every week.
- `0ae522b` — **`pitch_requests`: a coach asks, an admin allocates.**

- **11 Aug — `pitch_requests`: a coach asks, an admin allocates. SCHEMA AND RLS ONLY —
  no screen and no email yet.** Jay's four rulings: a request **attaches to an existing
  fixture** (so it appears in the schedule at once carrying `Pitch TBD`, which is what
  that placeholder already means); **Pitch Management allocates**; **the referee is a tickbox on
  the same request**, because both are asked for at the moment a match is arranged;
  and it must be **trackable from submission to assignment by the person who submitted
  it**, in two dashboards, with email.
  ⚠️ **CREATE is `can_edit_team`, DECIDE is `is_admin`, and that difference IS the
  feature.** A coach may ASK for their own squad; only an admin may ANSWER. Widening
  "decide" would let a coach allocate their own request — the exact thing a request
  exists to prevent. **Proved live: a coach's own UPDATE is filtered to zero rows.**
  ⚠️ **The read policy's `requested_by = auth.uid()` arm is a REQUIREMENT, not a
  convenience.** Without it the submitter cannot see their own request and the feature
  becomes a black hole with an email at the end. Proved live: after the admin
  allocates, the requester reads back `allocated`.
  ⚠️ **Withdrawing is a DELETE, not a status write** — the UPDATE policy is admin-only,
  and widening it to the requester would also let them write `allocated`. Deleting an
  UNDECIDED request is the narrow power that cannot be abused; once decided the policy
  stops applying. Proved live: refused after a decision.
  ⚠️ **One row per event, by constraint.** A second request is the same question asked
  twice — two rows would mean two queue entries, two emails and a race.
  ⚠️ **An early run of the harness showed the admin with NO access at all**, which
  looked exactly like a broken policy. It was the test: a **membership** id had been
  used as the JWT subject where a **profile** id was needed. The policy was correct
  throughout. Recorded because the failure mode is indistinguishable from a real one.
- `dc01d37` — **The pitch list is the club's real pitches, not the seed's.**

- **11 Aug — the pitch list is the club's REAL pitches: A1-A4, B1, C1-C5, D1-D5.**
  ⚠️ **The list seeded hours earlier was a list of nothing.** It was derived from
  whatever text sat in `events.pitch`, and that text was almost entirely SEED DATA:
  of the 22 allocations, **16 came from the seeded September** — "Pitch 1" through
  "Pitch 7" and "Clubhouse lawn", fixtures nobody at the club ever played. **A list
  seeded from data is only as real as the data**, and this one was caught solely
  because Jay read it and said what the pitches actually are.
  ⚠️ **The seeded rows were DELETED, not retired** — a deliberate exception to this
  table's own rule. `is_active` protects pitches that were once real; retiring these
  would leave eight fictional pitches in the management screen forever.
  ⚠️ **`Pitch D2` was remapped to `D2`, and it was the only one.** Six real events
  carried it, **none from the seed**, and it unambiguously means D2. The rest were
  left: they belong to the seeded September, which is due for deletion before a
  pilot, and rewriting fixtures about to be thrown away is work performed on rubbish.
  ⚠️ **Verified after: 16 events still name a pitch outside the list, and ALL 16 are
  from the seed — zero real fixtures orphaned.**
  ⚠️ Sort order leaves gaps between the letter blocks (1-3, 11, 21-24, 31-35) so a B2
  or C5 slots in without renumbering. Alphabetical would order correctly today and
  break the moment a pitch is named A10.
  ⚠️ **Applied in two steps**: Jay's first message said A1-A3 and C1-C4, corrected
  minutes later to A1-A4 and C1-C5. The migration FILE carries the end state so a
  replay produces all fifteen; Supabase's own list is the authority on what ran.
- `2ed48b1` — **A managed pitch list, and the clash detection it unblocks.**

- **11 Aug — a managed pitch list, and the clash detection it unblocks.**
  `db/migrations/20260811_pitches.sql`. ⚠️ **This OVERTURNS the 5 Aug decision**,
  which chose "free text beside Venue. No pitches table, no clash detection." That
  was the right scope call for one person entering fixtures; Pitch Management IS a
  job now, and the free text had already drifted — measured 11 Aug: **"Pitch 2"
  AND "Pitch D2"** both in use, plus "Clubhouse lawn". No clash detector can group
  by a string somebody retyped.
  ⚠️ **`events.pitch` STAYS TEXT WITH NO FOREIGN KEY**, and this is the part most
  likely to be "tidied" later. **`Pitch TBD` is a placeholder, not a pitch** — Jay's
  ruling, because without it nobody can tell "not allocated yet" from "the app didn't
  say" — and it is 26 of 48 rows. A foreign key would force it to become a fake pitch
  row or NULL, and NULL loses the distinction the ruling exists to preserve. The list
  is a picker source, not a constraint.
  ⚠️ **The free-text box survives beside the picker, deliberately.** Existing events
  name things that predate the list, and a picker that could not express "Clubhouse
  lawn" would force somebody to mis-file a fixture or invent a pitch row for a lawn.
  ⚠️ **If the pitch list cannot be read, the form falls back to free text** rather
  than refusing to save. Nobody should be unable to record a match because a lookup
  table was unreachable.
  ⚠️ **CLASH DETECTION REPORTS, IT NEVER REFUSES**, and the exemptions are the whole
  design: a **multi-squad fan-out is not a clash** (one event per squad sharing a
  `group_id`, on the same pitch at the same time BY CONSTRUCTION — reporting those
  would make every multi-squad fixture look double-booked and the feature would be off
  within a week); **touching is not overlapping** (18:00 finish, 18:00 start is how a
  Saturday runs); **`Pitch TBD` never clashes**; and with a null `ends_at` only an
  identical start counts, because assuming a duration invents a clash from data nobody
  entered. Both load-bearing rules proved by injected fault.
  ⚠️ **A green build did not mean a working screen**: the picker shipped referencing
  an undefined constant because the patch anchor matched a different file. `npm run
  build` passed; the unit suite caught it.
- `f85d90f` — **The screen a super admin uses to assign admin rights.**

## 10 Aug 2026

- **10 Aug — the screen that assigns admin rights.** `AdminRightsEditor`, rendered
  under each ADMIN membership in the Accounts editor, **for a super admin only**.
  Three tickboxes (Youth Manager, Social Media Manager, Pitch Manager) plus a Super
  admin toggle, saving on every tick rather than behind a Save button that can be
  forgotten. ⚠️ **Hiding it from an ordinary admin is NOT the enforcement** — the
  column grant and the `set_admin_rights` RPC are, and this repo's rule stands: a
  screen that hides a row is not security. The gate exists so an ordinary admin is
  not offered a control that could only fail.
  ⚠️ **A REFUSED SAVE PUTS THE TICK BACK.** The write is optimistic, so without the
  revert somebody walks away certain that an account holds Pitch Management while the database
  disagrees — the lying-UI failure. Proved by deleting the revert: the test fails.
  ⚠️ **A super admin's boxes show ticked AND disabled**, because a super admin holds
  every right implicitly and empty boxes would read as "no rights", the opposite of
  the truth.
  ⚠️ **Both of Jay's accounts are now super** — `jayjmuir@gmail.com` and the backup
  `jayjmuir@yahoo.com`. A single super account is one lost password away from needing
  SQL to recover; the cost is that two accounts can hand out club-wide authority.
  `reynekeett@gmail.com` is a **legitimate** third admin, confirmed by Jay, ordinary
  not super — recorded so it is not raised again as a stray.
  ⚠️ **A fault injection could not be reverted by `git checkout --`** because the
  file was UNTRACKED, so the restore silently did nothing and left the injected fault
  in the working tree. Caught by re-grepping for the line afterwards. **Check the
  restore, not just the injection** — the third variant of this trap today.
- `10283a9` — **The super-admin tier and per-admin rights (foundation).**

- **10 Aug — the super-admin tier and per-admin rights. FOUNDATION ONLY: no
  dashboard uses a right yet.** The model Jay asked for: base admin unchanged
  (full club data), **admin rights** as ADDITIVE specialist capabilities —
  Youth Manager, Social Media Manager, Pitch Manager — each intended to unlock
  a dashboard, and a **super admin** who assigns rights and assigns admin.
  ⚠️ **A FLAG, NOT A ROLE VALUE, and the reason is measured.** Twelve places in
  the schema test `m.role = 'admin'`. A new role value needed all twelve, and
  each is a chance to miss one — where a miss silently strips a super admin of
  an ordinary power. `memberships.is_super` makes a super admin an admin, so
  all twelve keep working untouched.
  ⚠️ **THE PART THAT MAKES IT REAL RATHER THAN THEATRE.** `memb manage` is
  FOR ALL and admin-only, so **any admin could already write membership rows,
  including their own** — a plain column would have let any admin set
  `is_super` on themselves. **RLS cannot close that**: a policy authorises the
  ROW, and "an admin may write membership rows in their club" is true before
  and after the row gains the flag. The protection is a COLUMN PRIVILEGE —
  `authenticated` lost table-level UPDATE on `memberships` and got back six
  named columns — plus `public.set_admin_rights`, SECURITY DEFINER, which
  checks the caller first and RAISES rather than returning quietly. Exactly the
  shape `profiles.email` and `approve_membership` already use.
  ⚠️ **Proved live in a rolled-back transaction, BOTH directions**: an ordinary
  admin is refused on the UPDATE path (42501, column privilege), the RPC path
  and the INSERT path, while still writing the columns it should; a real super
  admin does all of it and an unknown id is refused rather than reported as
  saved. Without that second half a build that refuses EVERYONE looks identical.
  ⚠️ **RIGHTS GATE SCREENS, NOT DATA** — every admin already sees every child's
  name, photo and contacts. A right decides which dashboard appears; it
  withholds nothing. **A future right that must genuinely withhold data needs
  RLS; hiding a menu item is not security.**
  ⚠️ **The first super admin was set by hand in SQL** (`jayjmuir@gmail.com`),
  because none can exist to grant it.
  ⚠️ **A fault injection silently changed no bytes and reported green** — a
  `
` against a CRLF file, the second time today. Caught only because the
  script printed the occurrence count before and after. **Print the count.**
- `5648530` — **A super-admin TIER, attendance has no data, and why it is a flag.**

- `b0e9602` — **A Player can be granted access before they are on the roster.**

- **10 Aug — a Player can be granted access when they are NOT on the roster yet.**
  Jay created a login for his son and found the only choices were six unrelated
  `Test Player` rows: no way to add a new player, so the account was ungrantable.
  ⚠️ **This is the NORMAL case, not an edge one** — the 10 Aug no-roster-import
  decision settled that parents self-onboard and the old roster most likely never goes
  in, so almost every player ever granted access will not be on the roster first.
  ⚠️ **IT CREATES THE PLAYER RATHER THAN REUSING THE PARENT'S FALLBACK, and the
  difference is not stylistic.** A parent with children off-roster gets age-group rows
  with `player_id` null. That cannot work for a player: `private.is_own_player` is
  `m.player_id = _player AND role in ('parent','player')`, so a player membership with
  a null `player_id` **matches nothing** — the account could never set its own
  availability, photo or gender. It would look granted and behave like a stranger.
  ⚠️ **THE PLAYER IS CREATED LAST, after every refusal has passed**, and that ordering
  is the point: creating first would leave a real child on the roster every time the
  grant was then refused, and in `players` a stray row is a stray CHILD. Proved by
  moving the duplicate check after the creation — the test then fails with "a refused
  grant must not leave a child on the roster".
  ⚠️ **The membership follows the row the DATABASE returned**, not the id posted to it,
  so a trigger or default placing the player elsewhere cannot leave the account scoped
  to a squad the child is not in.
  ⚠️ **A first draft of that orphan test proved nothing while passing** — its existing
  row carried a `player_id`, which does not collide with the row as built (`playerId`
  null), so the refusal never fired. A collision has to match what the duplicate check
  actually compares.
- `bfaeb16` — **Page the event reads.**

- **10 Aug — event reads are PAGED, so an admin on all squads is no longer an error
  screen.** `listEvents` sent one capped request that THREW above 900 rows. That
  refusal was right in principle — a short list that looks complete is worse than an
  error — and wrong in practice: fifteen squads over the 18-month window is ~1,690
  rows, so the cap turned Schedule into an error with no action that fixed it short of
  filtering to one squad. `fetchAllPages` (`src/data/limits.js`) walks `.range()` until
  a short page arrives. ⚠️ **The guarantee is unchanged: everything, or a throw. Never
  some of it.**
  ⚠️ **`MAX_TOTAL_ROWS` (5,000) is a PRODUCT limit, not a PostgREST one.** `MAX_ROWS`
  exists because one request cannot exceed `db-max-rows`; paging removes that wall, so
  something else has to decide when "a lot of fixtures" means "something is wrong".
  Nothing changes in the database at 5,000 — it is ~3× the club's realistic worst case.
  ⚠️ **THE SORT MUST END IN A UNIQUE COLUMN, AND THAT IS THE SUBTLE PART.** `.range()`
  is OFFSET/LIMIT. Two events can share a `starts_at` — a Saturday of age-group matches
  all kicking off at 09:00 is the normal case — and an under-specified sort lets
  Postgres order tied rows differently between requests, so one row comes back on two
  pages and another on none, **with no error anywhere**. `events` therefore pages by
  `starts_at, id`.
  ⚠️ **Both traps proven by injected fault**: `range(offset, offset + page)` instead of
  `- 1` returns 27 rows from 25 (duplicated boundaries), and removing the `id` tiebreak
  fails the sort assertion. ⚠️ The first attempt at that second injection silently did
  nothing — a `\n` in the patch script did not match CRLF — and reported green.
  **An injection that changes no bytes is not a passing test.**
  ⚠️ `listPlayers` still uses the flat cap; it is under 900 today, and `fetchAllPages`
  is written to be reused when it is not.
- `aec8264` — **Edit a whole repeating series, not just cancel it.**

- **10 Aug — a repeating series can be EDITED, not just cancelled.** Deleting a series
  shipped 8 Aug; editing one did not. `EventForm` now offers "Apply to this and every
  later session" when the event has a `series_id`, ⚠️ **defaulting to OFF** — the wider
  choice rewrites a term and there is no undo, so it must be reached for on purpose.
  ⚠️ **TWO WRITES, BECAUSE THE TIME CANNOT BE THE SAME STATEMENT.** `updateSeriesFrom`
  sets the date-independent fields (`type`, `title`, `opponent`, `home`, `venue`,
  `competition`, `pitch`, `notes`) in one PostgREST update. The time cannot work that
  way — **each occurrence has its own DATE**, so "move to 18:30 for the rest of term"
  is a different `starts_at` per row. That goes through a new RPC,
  `public.set_series_time_from`. Client-side it would be N round trips and non-atomic:
  half a term moved, half not, and nothing on screen saying which.
  ⚠️ **The RPC is SECURITY INVOKER — the only one in the schema that is, and that is
  the safety argument.** The UPDATE is evaluated as the caller, so `event edit`
  (`private.can_edit_team`) filters it exactly as it filters a PostgREST update. It
  grants nothing. A DEFINER version would have to re-implement that check by hand,
  including the status gate added hours earlier.
  ⚠️ **Duration is preserved, not recomputed** — `ends_at` moves with `starts_at`, so a
  90-minute session stays 90 minutes and a null stays null. Verified live in a
  rolled-back transaction: three sessions at 18:00, moved from the second onward — the
  first stayed put and all three stayed 90 minutes.
  ⚠️ **The field list is opt-in.** Adding a column to `events` does NOT make it
  series-editable; `starts_at`/`ends_at`, the scores and `team_id` are excluded by
  name, because the cost of getting it wrong is rewriting a term.
  ⚠️ **FUTURE ONLY and `>=` not `>`**, matching the delete's ruling: sessions already
  played keep their results and attendance, and the occurrence being edited moves too.
  ⚠️ **A fault injection exposed a weak test, and it was fixed rather than accepted.**
  Swapping `.gte` for `.gt` first failed with "gt is not a function" — red by CRASHING
  on a missing mock method, which proves the line was touched but not that the test
  knows what it should say. The mock now supports `gt`, so the same swap fails on the
  assertion instead. **A test that only crashes is not a test that checks.**
  ⚠️ `group_id` (multi-squad fan-out) is still deliberately NOT handled, exactly as
  `deleteSeriesFrom` does not handle it — Jay deferred it 8 Aug.
- `a72d07b` — **`can_edit_team` checks membership status.**

- **10 Aug — `private.can_edit_team` now checks membership status.**
  `db/migrations/20260810_can_edit_team_status.sql`. ⚠️ **This overturns a DELIBERATE
  decision, not an oversight** — `20260808_membership_pending_status.sql` states in as
  many words that it was "deliberately NOT status-gated", because staff roles are
  admin-granted and a pending coach cannot arise, so the check "implies a state that
  has no way of arising, and an unreachable branch is a lie about the model". **That
  premise is still true.** Jay ruled the other way: **thirteen** policies hang off
  this function — events, players, player_contacts, player_parents, all four
  attendance policies, three availability writes, one arm of `avail read`, and the
  player-photo storage policy — so the day any flow grants staff access through a
  pending state, all thirteen open at once and nothing in the causing diff looks like
  access control. The original author's own words were that the check is harmless.
  ⚠️ **Proved live, both directions**: a pending coach gets `can_edit_team` false,
  0 players, 0 contacts and a refused insert; flipped to active in the same rolled-back
  transaction, it becomes true with 4 players and 4 contacts. Without that second half
  the whole harness would pass while running as the owner with RLS bypassed.
  ⚠️ **AND A DRAFT OF THAT HARNESS ASSERTED THE WRONG THING.** It expected a pending
  coach to see 0 events. They see 34, and that is CORRECT: `event read` is gated on
  `private.is_attached_to_team`, which is status-blind **on purpose** — "fixtures are
  not sensitive, and a pending parent needs them to be worth signing in at all".
  Shipping that assertion would have taught a future session to "fix" a working
  design. **`is_attached_to_team` must stay status-blind.**
  ⚠️ Consequence, correcting an older note: the `avail read` policy's `can_edit_team`
  arm is now genuinely redundant rather than only looking it. Left in place.
- `c4c6491` — **Switch RSVP on.**

- **10 Aug — RSVP is switched on.** `FEATURES.availability` → `true`. Jay's call, after
  asking "where is the availability function?" twice in one day. It was false from
  29 Jul because the club was not ready to rely on digital RSVP — a readiness
  judgement, not a defect, and his to withdraw. ⚠️ **The flip needed no other change**,
  exactly as the flag's comment promised: it gates EventDetail's two entry points and
  nothing else. The screen, the `availability` table, its policies, the realtime
  subscription and `tests/availability.test.jsx` were live the whole time it was off.
  Full suite green on the flip, no test needed rewriting. ⚠️ **Availability is RSVP,
  the INTENT; attendance is the FACT** — a separate table, a separate screen, and
  deliberately not behind this flag. Do not compute one from the other.
  ⚠️ **Nobody has used it in anger** — switched on and unit-tested, not exercised by a
  real parent.
- `262d81b` — **A rolling date window, so the event screens stop asking for everything.**

- **10 Aug — the event screens stopped asking for every event ever.** `listEvents` has
  accepted `from`/`to` since it was written and **no caller ever passed one**;
  Schedule and Dashboard now both pass a rolling window from
  `src/lib/eventWindow.js`. ⚠️ **A READ FILTER, NOT A RETENTION POLICY — nothing is
  deleted, ever.** Events outside the window stay in the database, stay in the
  calendar feed, and stay reachable by paging the calendar, which refetches.
  ⚠️ **12 MONTHS BACK, AND THE NUMBER CAME FROM JAY'S QUESTION.** The first proposal
  was 3 months back / 9 forward; he asked "in 6 months will I still be able to see
  events from Sept?" **The answer was no.** Results is derived from the SAME single
  fetch as Upcoming, so a 3-month lookback would have emptied the season-in-review
  screen from February onwards — a lookback shorter than a season is wrong at every
  point after its first months. 12 back always spans the current season from any
  point inside it, and needs no season boundary stored anywhere and no annual edit.
  That question is now `tests/event-window.test.js`'s headline test, and it fails on
  the rejected proposal.
  ⚠️ **Paging the calendar past the edge WIDENS the window and refetches** — never
  renders an unloaded month as an empty one, which is the "short answer that looks
  complete" failure `limits.js` exists to prevent. Widening rather than moving means
  it settles instead of trading updates with the fetch effect forever.
  ⚠️ **The scoping tests were kept EXACT rather than loosened to `objectContaining`**:
  they existed to catch a query asking for more than it should, and waving the window
  through would have waved through a stray filter too.
  ⚠️ **Still open: admin viewing ALL squads.** At ~75 events per squad per season
  (measured: the two squads with realistic data run 2.0–2.3 per active week), 15
  squads over 18 months is ~1,690 rows — over `MAX_ROWS` at any boundary. **That is a
  pagination problem, not a window one.**
  ⚠️ **`git checkout --` wiped the Schedule half of this mid-session**, exactly as
  `CLAUDE.md` rule 6 warns: it reverts to the last COMMIT, and the work was
  uncommitted. Rule 6 says commit before injecting a fault. It was not.
- `ca79dbb` — **A real overflow gate, and the injection that nearly buried a good fix.**

- **10 Aug — a real overflow gate, and the fault injection that nearly discredited a
  correct fix.** `harness/check-overflow.mjs` drives all 28 harness scenarios through
  a real Chromium at five phone widths and fails on a document wider than its
  viewport, naming the outermost offending element rather than just a number. It also
  refuses to believe a clean result from a scenario that rendered blank.
  ⚠️ **IT PROVES `6cde750` WAS RIGHT, AFTER A BOTCHED INJECTION SAID OTHERWISE.** The
  first attempt reverted only `flex-wrap` from Schedule's header, came back green, and
  was reported to Jay as "the check disproves the fix". **It did not.** The fix is TWO
  classes and `min-w-0` is the load-bearing one — it lets the title shrink and absorb
  the row — so leaving it in place never restored the bug. The true pre-fix markup
  fails **8 of 140 pairs**. **An injected fault only proves a check when it restores
  the WHOLE original; reverting half a fix tests nothing and reads exactly like a
  pass.** Rule 6 says prove every new assertion against an injected fault; it now also
  means prove the injection.
  ⚠️ **The first width list — 320/375/414 — STRADDLED THE PHONE THAT REPORTED THE
  BUG.** Schedule overflows 53px at 320 and 13px at 360, and is clean by 375. 360 is
  the commonest Android width (1440 at DPR 4) and is what Jay was holding. A width
  list that skips the commonest phone reports green on a visibly broken screen.
  ⚠️ **Also measured: Roster's header does NOT overflow without its fix.** That half
  of `6cde750` is house-pattern consistency, not a fix, and must not be described as
  one. Only Schedule was broken.
  ⚠️ **Not wired into CI**, deliberately — Playwright is not a dependency of this repo
  and a ~300MB browser download on every build is not a trade that has been agreed.
  `npm run harness` then `npm run check:overflow`.
- `6cde750` — **The page header overflowed a phone, and took every screen with it.**

- **10 Aug — the page header overflowed a phone, and took every screen with it.**
  Jay, from a phone: "seems buggy, not scaling correctly." ⚠️ **One cause, four
  symptoms, three screens.** The page-header row is `justify-between` with a title
  on the left and a **`shrink-0`** action group on the right; `shrink-0` means the
  buttons never give way, so when the row does not fit it does not clip — **the whole
  DOCUMENT becomes wider than the viewport.** After that everything sized to the
  viewport renders short or clipped: the masthead stops reaching the right edge, and
  an open `Sheet` loses its close button and every field value. ⚠️ **The bottom nav
  looks fine throughout because it is `fixed`**, which is what makes one bug read as
  several unrelated ones. Measured in a real browser at 375px against the built
  stylesheet, because **jsdom reports every width as 0**: the row wanted 368px inside
  a 339px box, and "Add to calendar" alone is 150px. ⚠️ **PRE-EXISTING — the same
  probe with the pre-sweep classes is 25px over, against 29px after.** `973df0f`
  made it visible, not real. Fixed with `flex-wrap` + `min-w-0`, already the house
  pattern in `AdminDashboard.jsx` and `Register.jsx`; re-probed at 0px overflow.
  Roster got the same treatment — "Roster & members" is the longest title in the app.
  ⚠️ **The anchor is a SOURCE check and says so**: `tests/page-header-wrap.test.js`
  pins the class on every page header and proves its own selector is not blind, but
  it catches the guard being removed, not a new way of overflowing. A real check
  needs Playwright in `harness/` and does not exist yet.
  ⚠️ **This is what the missing browser pass costs**: the sweep shipped green, and
  the first person to open it on a phone found a layout bug within the hour.
- `8071428` — **The sweep's live verification proved the previous commit.**

- **10 Aug — ❌ CORRECTION: the routing sweep's "verified on production" claim was
  worthless.** The sign-in screen was measured on the deploy preview and on
  production, everything came back as designed, and it was reported as live
  verification of the sweep. ⚠️ **`src/screens/Login.jsx` was ALREADY routed before
  the sweep** — one of three files that already imported `Button` — so that screen is
  byte-identical before and after `973df0f`, and the measurement was evidence for
  `87c7566`, the commit before it. **Jay caught it in one look**: "I don't see
  different buttons or really anything different at all." He was right, and on the
  signed-out path he always would have been — it contains nothing the sweep touched.
  ⚠️ **Rule 6 says a measurement that merely confirms your own change was applied is
  not a verification; this did not even do that.** The generalisable lesson:
  **before citing a live measurement, check the thing measured is in the diff.**
  ⚠️ Also recorded while correcting this: **the sweep and bloom are `hover:` effects
  and never fire on a touch device**, so on a phone the whole Touchline change is the
  taller tap target, the 8px corner and the bottom edge — nothing moves.
- `973df0f` — **Route the app's buttons through `<Button>`, and what fell out.**

- **10 Aug — the routing sweep: the app's action buttons now go through `<Button>`.**
  The work the corrected audit below was meant to justify, done. Every action button
  in `src/` — anything carrying a fill or a hairline border — is routed; the rest stay
  raw ON PURPOSE and `src/components/Button.jsx` now lists each category and why
  (layout boxes, masthead chrome, toggles and tabs, text links, pills and icons).
  Three `<Link>`s carrying an identical hand-rolled button string went through
  `as={Link}`. ⚠️ **Two new variants, `danger` and `dangerQuiet`** — not invented,
  they are the destructive cluster already written by hand across five files, and
  they deliberately get no sweep and no bloom. Reasoning:
  `claude/decisions/2026-08-10-button-routing.md`.
  ⚠️ **Three defects fell out of it that no test could see:** Schedule's day-sheet
  "Add event" carried `hover:bg-brand-dark`, a token that does NOT exist in
  `tailwind.config.js` and the only use of that name anywhere in `src` — Tailwind
  emitted nothing, so that button alone had no hover state at all; Dashboard's
  `BUTTON_BASE`/`BUTTON_GHOST` were both dead, with `BUTTON_GHOST` referenced nowhere
  in `src` or `tests`; and `EventDetail`/`PlayerDetail`'s `FOOTER_BUTTON` would have
  left `rounded-[11px]` racing `rounded-btn` on equal specificity, because `className`
  is appended last and the winner would have been whichever Tailwind happened to emit
  second. ⚠️ **`tests/button-sweep.test.js`'s radius test was REPOINTED, NOT DELETED**
  (`CLAUDE.md` rule 7): its stated exit condition — "delete this when 11px has gone" —
  could never fire, because 11px is the SURFACE radius and stays. The anchor that
  actually guards this work now reads the source for a raw button carrying the action
  signature, with a companion test proving it is not vacuous. Both proven by injected
  fault, as were the two new variant assertions.
- `8a83ba6` — **Correct the button counts published in `87c7566`.**

- **10 Aug — ❌ CORRECTION: the button counts published hours earlier were wrong.**
  The 10 Aug button entry below, PR #16 and commit `87c7566` all say "105 raw
  buttons carrying the same padding + radius + weight signature" and lean on
  `rounded-[11px]` appearing 117 times as evidence of drifting button radii.
  ⚠️ **The grep behind those figures counted every element with that radius plus
  padding and called them all buttons.** Measured properly: **100 `<button>`
  elements, of which only 20 use `rounded-[11px]`**, while **98 of the 117
  occurrences are not buttons at all** — 38 are `<p>` alerts, the rest inputs,
  panels and cards. So `rounded-[11px]` is the app's general SURFACE radius, used
  correctly, and not the drift it was presented as. **The consolidation argument
  survives on its own numbers (100 vs 11 uses of `Button.jsx`); the radius half of
  the reasoning does not.** Caught while starting the routing work the wrong
  figures were meant to justify — the first file opened was full of `<p>` alerts
  carrying the radius, not buttons. Exactly the rotted-measurement failure this
  repo's own §How to read notes as the only kind of wrong claim it has ever made.
- `87c7566` — **The Touchline button, and the audit that explains the two radii.**

- **10 Aug — the buttons got a look, and an audit explaining why they had none.**
  Jay asked for an audit and a different look; the audit found the reason the look
  was hard to change. ⚠️ **`src/components/Button.jsx` exists and is used 12 times,
  against 105 raw buttons still carrying hand-written class strings.** Its own
  header says it was built to replace "76 hand-written class strings across 26
  files" — that consolidation was started and never finished, and there are now
  more hand-rolled buttons than when it was written. ⚠️ **The `rounded-btn` token
  is used TWICE while its identical literal `rounded-[11px]` appears 117 times**,
  across 16 distinct radii. So restyling meant editing 34 files, and the next
  person would add button 106 with its own string. The look chosen ("Touchline",
  from four directions, then "Sweep" from three motion studies) therefore lands in
  the COMPONENT and the token only: 8px radius, a weighted 3px bottom edge so a
  button reads as a key with a top and a bottom, a taller tap target (py-2.5 →
  py-3, for a wet thumb on a pitch), and on hover a band of light crossing the fill
  over a bloom of brand red. ⚠️ **Primary actions only** — applied to all 105 it
  reads cheap and stops meaning anything, and a glowing "Cancel" pulls the eye
  toward the destructive-adjacent choice; secondary gets a third-strength bloom and
  no sweep. ⚠️ **The two radii now sit side by side on purpose** — 8px on the twelve
  buttons that go through the component, 11px on the other 105 — as the visible
  receipt for work that is not finished. ⚠️ **Tested against the BUILT stylesheet**,
  like the press-feedback rule, and that caught two things the source would not:
  the minifier collapses `::after` to `:after` AND rewrites `translateX(…)` to
  `translate(…)`, so assertions on the authored spelling would have passed in dev
  and failed only in production. `isolation: isolate` is pinned too — the sweep
  sits at `z-index: -1` to pass under the label, and without its own stacking
  context it vanishes behind the button entirely, which debugs as a timing problem.
  ⚠️ The stale "THERE IS NO SHARED BUTTON COMPONENT" comment in `src/index.css` is
  repointed rather than deleted, per rule 7.
- `195bf6f` — **The register: a coach can record who turned up.**

- **10 Aug — the register: a coach can now record who turned up.**
  `src/screens/Register.jsx`, opened from the event detail sheet, ⚠️ **only for
  an event that has already STARTED** — a register for a session that has not
  happened is a guess, and offering it early is how a squad gets marked present
  on Tuesday for a Saturday match. ⚠️ **NOT the availability sheet with
  different words.** There is no per-row `editable`: attendance is coach-only,
  full stop, because a parent marking their own child present destroys the only
  thing the number is worth. ⚠️ **"Not recorded" is never a stored row** — it is
  derived by diffing the squad against the rows that exist, because defaulting
  to `absent` would manufacture an absence for every session a coach forgot to
  take, and those would feed the percentage. **"Mark remaining N present"** is
  the affordance that makes it usable on a touchline (the common case is that
  nearly everyone came) and it touches only players with NO record yet, so a
  coach who logs two absences first can sweep the rest without undoing their own
  work; sequential rather than `Promise.all`, so a failure halfway leaves the
  earlier writes saved and says so. ⚠️ **No realtime subscription**, unlike the
  RSVP sheet: a register is taken once by one person, and a list re-sorting
  under a coach's thumb mid-tap would be worse than stale. ⚠️ **Not behind
  `FEATURES.availability`** — the 10 Aug ruling was to ship attendance INSTEAD
  of switching RSVP on, and wiring it to that flag would switch both together.
  Proved by injecting `canEdit = true`: the two parent tests fail.
- `714d477` — **`attendance`: the table, the policies and the data layer.**
- **10 Aug — `attendance`: who actually turned up.** Nothing in the database
  recorded it. ⚠️ **`availability.status` is `in`/`out`/`maybe` — INTENT, not
  attendance** — and it was the only thing resembling the data the brainstormed
  AI features assume ("17% attendance", "consecutive absences", "lowest
  attendance"). Built on it, those would report WHO SAID THEY WOULD COME as WHO
  CAME: a confident number about a child's commitment, derived from a tickbox
  their parent ticked a week earlier. ⚠️ **And RSVP is switched off**
  (`FEATURES.availability`), so that table holds no real intent anyway — hence
  Jay's ruling to skip RSVP and go straight to attendance, because ticking who
  turned up is something coaches already do on paper. ⚠️ **A NEW TABLE, NOT A
  COLUMN ON `availability`**, despite the identical (event, player) grain: the
  two facts have different WRITE AUTHORITIES — availability is `is_own_player`,
  attendance is `can_edit_team` — and one row with two write authorities on
  different columns is a column-grant problem, which this same session spent an
  afternoon proving invisible. Kept at ROW level, where `policies.sql` can show
  you. ⚠️ **The read policy is deliberately narrower than the house style**:
  every other team-scoped table uses `can_see_team`, so a parent sees the squad;
  here staff see the squad and **a parent sees only their own child**, because
  "which children miss training, and how often" is safeguarding-adjacent and
  becomes touchline gossip. ⚠️ **`is_own_player` is in the read policy and in no
  write policy** — a parent must never mark their own child present, since the
  whole value of the number is that somebody else recorded it. `status` has
  three values and the third is load-bearing: the percentage is
  present/(present+absent) with `excused` excluded from both sides, so a player
  away injured is not ranked as uncommitted. Applied to live and verified
  (4 policies, RLS on, 4 indexes, 6 constraints); `db/schema/` re-captured in
  the same breath, including `grants.sql` — where **the new table proved §1**,
  arriving with all eight privileges for `anon` from no GRANT statement at all,
  with `enable row level security` the only thing between it and the internet.
  Harness in `db/tests/attendance.sql`; data layer carries the row cap.
- `631dcd9` — **The dashboard's availability button was drawn, tappable and dead.**
- **10 Aug — the dashboard's availability button was dead, and the feature is
  flag-off.** Jay asked where the availability function was. ⚠️ **Answer:
  `FEATURES.availability` is FALSE** (`src/lib/features.js`, set 29 Jul because the
  club was not ready to rely on digital RSVP) and **that was written down nowhere**
  outside the flag's own comment — so the screen, table, policies and tests are all
  intact and simply hidden. Now recorded in `claude/state-of-play.md`.
  ⚠️ **The flag was also concealing a real defect.** `EventDetail` rendered "Set my
  availability" from Schedule AND the Dashboard, but only Schedule passed
  `onOpenAvailability`, and the call site was `onOpenAvailability?.(event)` — so on
  the home screen the button drew itself, invited a tap, and the optional call
  swallowed it. A drawn, tappable, dead button, on the most common path in the app:
  parent opens the app, taps the next fixture, taps availability. **No test could
  have caught it** — every availability test drove Schedule. Fixed both ways: the
  Dashboard now passes the handler and renders the sheet, and the button renders
  ONLY when a handler exists, so a forgetful caller gets no button instead of a
  lying one. ⚠️ Also fixed a stale-state bug the wiring introduced —
  `availabilityOpen` is screen-level, not per-event, so without resetting it the
  NEXT fixture tapped would skip its detail sheet and open straight into that
  event's RSVP. `tests/dashboard-availability.test.jsx` mocks the flag ON and pins
  both; it is a separate file because `tests/dashboard.test.jsx` deliberately runs
  with the real flag, off.
- `e83fdbc` — **Jay's roster ruling, and two measurements from the dashboard.**

- **10 Aug — the roster-import blocker was closed by Jay, and it was never a
  blocker.** `state-of-play.md` carried "NOBODY HAS RECORDED WHERE THE REAL ROSTER
  LIVES … a rollout is blocked on that. Ask Jay" and duly had every session ask
  him. The question had a false premise: **parents will self-onboard, and the
  imported roster most likely never goes back in.** ⚠️ **The ruling matters less
  than what it promotes.** Several things were filed as harmless *because* a bulk
  import was assumed to be the real path, and are now on the critical path —
  chiefly that `register_my_player` reads `teams.is_senior` and, with no senior
  squad, makes every self-registration a PARENT ("dormant, not broken" until it
  became the primary onboarding route), and that Resend's free cap now sits
  directly on the rollout while hitting it does not look like a limit.
  `src/screens/PlayerImport.jsx` is explicitly NOT retired by this — "most likely"
  is not "never", and it must not be deleted as dead code.
  `claude/decisions/2026-08-10-no-roster-import.md`.
- **10 Aug — two things measured in the Supabase dashboard, one of them a trap.**
  (1) ✅ **`db-max-rows` is 1000**, so `MAX_ROWS` 900 sits under it and the
  truncation detector added earlier today can actually fire — the assumption the
  whole guard rested on, now measured rather than assumed. ⚠️ **The setting has
  moved**: not Settings → API but **Integrations → Data API → Settings**.
  (2) ⚠️ **THE DASHBOARD OFFERS TO UNDO THE `profiles` COLUMN GRANTS IN ONE CLICK,
  AND FRAMES IT AS FIXING AN INCONSISTENCY.** Under Exposed tables, twelve of the
  thirteen `public` tables show a green tick; `profiles` is amber, with the tooltip
  *"This table has custom grants. Select it to override with standard Data API
  grants…"*. The "problem" it offers to fix is the protection standing between a
  club admin and rewriting any member's login email. One click, no confirmation
  naming what is lost, no test failure, no visible change in the app — the app
  never attempts that write, so the extra privilege would stay invisible until
  somebody used it. Recorded in `db/schema/grants.sql` §4 and in
  `claude/state-of-play.md`: **the amber row is correct and must stay amber.**
- `4b86646` — **The unbounded list reads cap, and say so.** ⚠️ **This started as
  the scale item and found a correction first.** `state-of-play.md` said the
  unpaginated queries "will show as a slow screen long before anything errors".
  That is wrong, and wrong in the dangerous direction: what waits at the end of
  an unbounded `select('*')` is a SHORT ANSWER THAT LOOKS COMPLETE, because
  PostgREST applies a `db-max-rows` ceiling and returns the first N rows with
  HTTP 200 and no indication anything was left out — a roster missing a child,
  with no error anywhere. The same silence as the zero-row 200 that produced the
  session guard, and the empty search read as proof of absence, twice.
  `src/data/limits.js` gives `listEvents` and `listPlayers` a cap and makes them
  THROW rather than return a truncated list. ⚠️ **The +1 is the load-bearing
  part**: the request asks for one row MORE than the cap, because a plain
  `.limit(900)` cannot tell "exactly 900" from "more than 900". ⚠️ **And the cap
  must stay below `db-max-rows`** or PostgREST trims the sentinel first and the
  detector reads green precisely when it should fire — which is why `MAX_ROWS`
  is 900 against a documented default of 1000. ⚠️ **`db-max-rows` has NOT been
  measured on this project** — it is a PostgREST setting no query here can read;
  it is in the dashboard under Settings → API → Max rows. Measured instead:
  `authenticated` carries `statement_timeout=8s`. **Nothing got faster, and
  pagination and a date window on events are deliberately NOT done** — both
  change what a person sees, and "how far back should the schedule go" is Jay's
  ruling, not a data-layer detail. `listEvents` has accepted `from`/`to` since it
  was written and no caller passes one.
- `cb8d6da` — **A stat that moves, and a fortnight that admits it is empty.**
- **10 Aug — the stat band's weakest number, and the fortnight strip's empty
  cells.** Both were on the "open, not blocking" list. (1) ⚠️ **The stat band's
  third cell was "Age groups"** — `scopedTeams.length`, a count of how the club
  is CONFIGURED, which changes when somebody adds a squad and therefore
  approximately never — rendered at 42px inside the loudest element the
  dashboard has. It is now matches that have been played and carry no score:
  the same backlog Schedule's Upcoming tab already keeps visible under Task
  11's ruling, counted. It moves, it is somebody's job, and it appears nowhere
  else on the screen. ⚠️ **The band's styling is deliberately untouched** — the
  complaint was that the loudest element carried the weakest data, and the
  honest fix for that is better data, not quietening the club website's
  strongest signature. Zero is a real answer on it. (2) **The fortnight strip
  drew fourteen bordered, dotless cells** when nothing fell in the next two
  weeks — ~90px of furniture above the fold on a phone, which also read as
  though it were still loading, because "cells with no dots" and "cells whose
  dots have not arrived" look identical. It now says "Nothing on in the next
  two weeks". ⚠️ **A sentence, not `<Empty>`**: the shared empty state is a
  42px icon with `py-11`, which would have made the nothing-on case taller than
  the something-on case and given back none of the space. ⚠️ **Three of the
  strip's own tests were pinning the defect**, asserting fourteen cells for an
  empty event list — the third time this repo has hit that shape in two days,
  after "Fixtures to play" and `loadMyMemberships`. They were repointed to keep
  asking their original questions rather than deleted. Also removed a dead
  `teamNames` local on the dashboard, computed and never rendered.
- `a882500` — **Table and column GRANTS are captured and checked.**
- **10 Aug — table and column GRANTS are captured and checked.** `db/schema/`
  captured tables, policies, functions and triggers and **no table or column
  grants at all**; `state-of-play.md` called it "the one real gap and nothing
  currently checks it", and `db/schema/README.md` had spelled out why it
  mattered — the larger half of `20260808 profile_phone_and_column_grants` is a
  column-level revoke on `profiles`, and nothing in that directory would diff
  it. `db/schema/grants.sql` now captures table grants, column grants and the
  DEFAULT privileges. ⚠️ **Capturing them turned up three things nobody had
  written down.** (1) `profiles.email` is protected by a COLUMN GRANT, not a
  policy: RLS authorises the row and `profile update club admin` authorises an
  admin against every member row in the club, so the five-column ceiling is the
  only thing making that not "may rewrite anyone's login email" — and
  `policies.sql` cannot tell you so. (2) Supabase's default privileges give
  `anon` full table rights on every new table in `public`, so a table created
  without RLS is open to anyone with the project URL, and the `create table`
  does not say so. (3) The 8 Aug revoke was applied to `authenticated` only —
  `anon` still holds table-level UPDATE on `profiles` and is stopped by RLS
  alone; measured, no live hole, recorded rather than changed. Checked two ways:
  `scripts/docs-check.mjs` gained a seventh check that fails the build when a
  migration grants on a table the capture does not name, and `db/tests/grants.sql`
  asserts the invariant against live. ⚠️ **Neither sees live from CI** — the repo
  is public — so re-capturing with the migration is still the mechanism. The
  docs-check was proved by injecting an uncaptured table grant (caught) and a
  function grant (correctly ignored); the live assertions were proved
  non-vacuous read-only, by asking the same probe about a column that IS granted
  and watching it raise.
- `77e1f9a` — **The CI-skip token banned, and the deploy skip became a gate.**
  `CLAUDE.md` rule 3 asked for `[skip ci]` on docs-only commits so a
  documentation edit would not publish a release. Protecting `main` the same day
  turned that into a trap: ⚠️ **GitHub Actions honours `[skip ci]` too** — on
  `push` AND `pull_request`, matching the HEAD commit — so it suppressed the
  now-REQUIRED `test` and `docs-check` runs, the checks sat pending forever, and
  the pull request could not be merged. ⚠️ **The header comment in
  `.github/workflows/docs.yml` asserted the opposite in so many words** ("it
  suppresses the NETLIFY build, not this workflow"), and nothing in the run
  history could have caught it: every `[skip ci]` commit in this repo predates
  the workflows, which were created that morning. The commit message was
  answering two questions at once; they now have separate answers. The checks
  always run, and `scripts/netlify-ignore.mjs` — wired as `ignore` in
  `netlify.toml` — decides the deploy from the DIFF. Same move as the clone
  check: a rule that has to be remembered at exactly the right moment becomes a
  gate that cannot be forgotten. ⚠️ **Netlify inverts the exit code** (0 CANCELS
  the build) and a cancelled build reports as a SUCCESS, so being backwards here
  would stop deploying the app from behind a green deploy list. Hence: the
  allowlist is deliberately narrower than "everything that cannot reach `dist`",
  `netlify.toml` is explicitly excluded from it, every uncertain case builds, and
  the inversion is pinned end-to-end against a throwaway git repo rather than
  this one's history — which would also have broken under CI's depth-1 checkout.
  ⚠️ **AND IT TURNED UP A WINDOWS-ONLY TRAP WORTH MORE THAN THE CHANGE.** The new
  script carried a `#!/usr/bin/env node` shebang and is IMPORTED by its test.
  Git checks out CRLF on both PCs; esbuild strips the shebang up to the newline
  and leaves the `\r`, which is not a valid token — so the file failed to parse
  and the error was reported against the IMPORT LINE IN THE TEST, several files
  from the cause, on a line that is blank. ⚠️ **CI cannot see it**: Actions runs
  on Linux and checks out LF, so `test` stays green while the suite fails on
  both of Jay's PCs — the mirror image of the usual trap, which means a green
  pull request is no evidence here. `.gitattributes` now pins `*.mjs`, `*.sql`
  and `*.sh` to LF, removing the class rather than the instance.
- `87bafba` — **The clone check became a gate rather than a rule.**
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
