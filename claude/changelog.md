# Changelog

Newest first. One line per shipped change, with the commit. Detail belongs in the commit
message and in `RESTORE.md`; this is the index.

⚠️ **This file stopped at 4 Aug for three days while `CLAUDE.md` advertised it as "what
changed, when".** Backfilled from `git log` on 7 Aug 2026 — the 5 to 7 Aug entries below
are one-liners taken from commit subjects, so they are accurate but thinner than the
hand-written 4 Aug ones. **Add the entry in the same breath as the commit.**

## 11 Aug 2026

- **The `/admin` tabs are modelled on adhjrt.com's, and the spec was MEASURED rather
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
  that is EVERY recipient. Today that is not hypothetical: Tracy has not been granted
  the right, so both current recipients are Jay's own accounts.
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

- **11 Aug — the pitch request LOOP closes: a coach asks, Tracy answers, the coach
  sees the outcome.** `PitchRequest` on the event sheet, and a queue on the allocation
  screen. `pitch_requests` finally has something writing to it.
  ⚠️ **`events.pitch` REMAINS THE ONLY SOURCE OF TRUTH for which pitch** — Jay's
  ruling. The request table records the CONVERSATION and has no pitch column; a second
  copy would disagree with the fixture the moment anyone edited the fixture directly.
  The accepted cost: you cannot ask "what did Tracy allocate, and has it changed
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
  that placeholder already means); **Tracy allocates**; **the referee is a tickbox on
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
  was the right scope call for one person entering fixtures; Tracy's job IS pitch
  allocation, and the free text had already drifted — measured 11 Aug: **"Pitch 2"
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
  revert somebody walks away certain that Nick is a Pitch Manager while the database
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
