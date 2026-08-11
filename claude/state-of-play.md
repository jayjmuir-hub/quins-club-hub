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
2026). `app.adhjrt.com` is a working alias, deliberately kept. ⚠️ **The canonical
origin is hard-coded** as `CALENDAR_ORIGIN` in `src/data/calendar.js`, and a
subscribed calendar URL cannot be changed remotely once a parent holds one.

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

### ⚠️ Test data currently in the live database

Two sets, both to be removed before a pilot:

- **Six `Test Player` rows** — a fixture for the pending-state RLS work.
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
- Removing the Resend cap is **pay-as-you-go, ~$0.90 per 1,000**. A purchase, so
  **Jay does it, not the assistant.**
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
  ⚠️ **`listPlayers` still uses the old flat cap.** Fine at 6 players and fine at 700,
  since both are under 900; it will need the same treatment before the club passes
  that, and `fetchAllPages` is written to be reused.
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
- **Leaked-password protection is off** because it is a paid-plan feature and the
  org is on Free. Settled 6 Aug.
- **The unindexed foreign keys.** An index on an empty table is pointless.
  ⚠️ Re-measure before citing this once real data lands.

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

-- WHO IS ACTUALLY EMAILED when a coach asks for a pitch. Do not assume Tracy is
-- on this list — as of 11 Aug she holds no right and it returns Jay twice.
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
  (`PitchRequest`), Tracy answers from a queue on `/admin/allocation`, and the coach
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
  ⚠️ **RIGHT NOW THAT IS THE ONLY REASON ANYONE IS MAILED: Tracy has NOT been granted
  the Pitch Manager right**, so both current recipients are Jay's own two accounts.
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
- ✅ **THE SUPER-ADMIN TIER IS BUILT** (11 Aug), decided 10 Aug. Candice, Nick and
  Tracy are ordinary admins and keep full sight of children's data ("trusted
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
- **Nobody is emailed when an access REQUEST arrives.** ⚠️ Not to be confused with
  the approval emails, which fire for a pending REGISTRATION. ⚠️ **As of 11 Aug this
  is cheap** — `notify-pitch-request` is the second instance of the trigger → edge
  function → Resend pattern, so a third is a copy with a different recipient query.
  It reuses `approval_notify_secret`; a new one only needs its own `*_notify_url`
  vault entry, and that should be DERIVED from `approval_notify_url` in SQL so the
  host cannot drift and so nobody handles a value by hand.
- **Deferred by Jay, still deferred:** test data cleanup, and the `group_id`
  multi-squad edit/cancel. **Never started, in priority order Jay gave them:**
  Candice's youth dashboard (match sheets → WhatsApp), Nick's social-media dashboard,
  training plans for the head of rugby performance.
  ⚠️ **The AI features Jay brainstormed (Smart Comms, NL queries, match reports, auto
  lineup) ALL need one ruling first: whether children's data may leave the club for a
  third-party API.** Nobody has asked him. **Do not start any of them until he has
  answered** — the attendance-flag item below is the only one that dodges it, by being
  plain SQL.
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

⚠️ **cafnet has not been measured since 7 Aug** and was last seen checked out on
`build/v1-mvp`, **a branch that no longer exists**. It needs
`git fetch origin --prune && git checkout main` before anything else happens there.
Per `CLAUDE.md` rule 8 that is a to-do, not a state — nobody has measured it.

⚠️ **`npm install` needs `--include=dev` on both PCs.** On jay-pc PowerShell's
execution policy also blocks `npm.ps1` — run npm from `cmd`.

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
