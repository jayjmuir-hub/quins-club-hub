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
- Removing the Resend cap is **pay-as-you-go, ~$0.90 per 1,000**. A purchase, so
  **Jay does it, not the assistant.**
- **`jayjmuir@yahoo.com` is Jay's deliberate backup ADMIN.** Any "a coach cannot see
  X" test using it is invalid. Use a purpose-made account.
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
- ⚠️ **`private.can_edit_team` does not check `status`; `private.can_see_team`
  does.** So a PENDING coach, manager or medic would pass every policy built on
  `can_edit_team`. **Latent, not live** — no path creates a pending staff
  membership. ⚠️ It also means the merged `avail read` policy has THREE arms that
  look redundant and are not: dropping the `can_edit_team` one silently removes a
  pending coach's read. Belongs in its own change with its own harness.
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
  ⚠️ **Still open, and needing Jay:** pagination, and a date window on events. Both
  change what a person SEES — "how far back should the schedule go" is a ruling, not a
  data-layer detail. `listEvents` has accepted `from`/`to` since it was written and no
  caller passes one.
- **`saveParents` is delete-then-write, not atomic.**
- ⚠️ **AVAILABILITY / RSVP IS SWITCHED OFF BY A FLAG, AND NOTHING SAID SO.**
  `FEATURES.availability` in `src/lib/features.js` is **false**, set 29 Jul 2026
  because the club was not ready to rely on digital RSVP. It hides EventDetail's two
  entry points — the summary bar and the "set availability" button — and nothing
  else: the screen, the table, the policies, the realtime subscription and the tests
  are all intact, and flipping it needs no other change. **Jay asked "where is the
  availability function?" on 10 Aug**, which is what an undocumented flag costs.
- ⚠️ **AND IT WAS HIDING A DEAD BUTTON.** `EventDetail` rendered "Set my
  availability" from Schedule AND the Dashboard, but only Schedule ever passed
  `onOpenAvailability`, and the call was `onOpenAvailability?.(event)` — so on the
  home screen the button drew itself, invited a tap and swallowed it. Fixed 10 Aug:
  the Dashboard passes the handler, and the button now renders **only** when a
  handler exists, so a forgetful caller gets no button rather than a lying one.
  Covered by `tests/dashboard-availability.test.jsx`, which mocks the flag ON — the
  reason no existing test caught it is that they all drove Schedule.
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
- No way to edit or cancel a whole group or series. `group_id` and `series_id` are
  in place as the hook.
- A managed pitch list is the precondition for clash detection.
- Nothing in the UI distinguishes a Medic from a Coach, because there is no
  difference in access. Deliberate — the word is what distinguishes them.
- **Nobody is emailed when an access REQUEST arrives.** ⚠️ Not to be confused with
  the approval emails, which fire for a pending REGISTRATION.
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
