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

- **Leaked-password protection is OFF.** Supabase → Authentication → Policies.
- **No monitoring, alerting or error tracking.** Detection today is somebody
  telling Jay. Two free first steps: an uptime monitor on `/` **and**
  `/calendar.ics`, and Sentry's free tier wired into `ErrorBoundary`'s
  `componentDidCatch`, which already exists for it.
  ⚠️ **The `/calendar.ics` check must assert `content-type: text/calendar`, not a
  200** — the SPA catch-all answers any unknown path with `index.html`.
  ⚠️ **A monitor that has never fired is not a monitor.** Pause the Netlify site
  once and confirm the email arrives.

## Cheap (under an hour each)

- **No dependency scanning.** No Dependabot, no `npm audit` step. ⚠️ `react-router-dom`
  carries two moderate advisories, **neither exploitable here** — `safeNext()` blocks
  `//host` and `/\host`, and this app is not server-rendered. Recorded so nobody
  re-panics at the same output.
- **No `LICENSE`, no `SECURITY.md`** on a public repo running children's-data
  infrastructure.
- **CSP is `frame-ancestors 'none'` and nothing else.** `netlify.toml` explains why
  and the reasoning is sound — a wrong `connect-src` breaks the app silently for
  anyone holding a cached service worker. It stays here because it is the only thing
  that would contain a compromised npm dependency. Do `connect-src` first, and test
  against a browser that already has a service worker registered.
- **CI pins Node 20.** Bumping to 22+ would retire the jsdom/`WebSocket` trap in
  `vite.config.js` and let eight more test files run in the `node` environment.
  Both dev PCs are already on 24.

## One migration each

- **`anon` holds full table privileges on `public`.** ⚠️ **Re-measured 14 Aug 2026:
  it is 23 of the 24 tables, not the "seven" this line used to claim** — seven was a
  sample read as a total. The exception is `photo_backup_runs`, created 13 Aug with
  an explicit revoke. Source is Supabase's default privileges. **Safe today by its
  POLICIES, not by its grants** — which is the thing this repo's rules say not to
  rely on, and it was confirmed safe by measurement: `set local role anon` sees zero
  rows on ten tables where the same counts unprivileged return real ones.
  🔧 **Migration and harness WRITTEN, NOT YET APPLIED** —
  `db/migrations/20260814_revoke_anon_table_privileges.sql` and
  `db/tests/anon-table-grants.sql`. ⚠️ **It is a PARTIAL fix and says so:** the
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
  and changes no meaning. Not started.
  ✅ **THE HOUSE STYLE ALREADY EXISTS — SIX POLICIES USE THE WRAPPED FORM**, all
  on `announcements` and `announcement_reads`, shipped 14 Aug. So this is
  following a precedent in the schema, not inventing one; copy those.
  ⚠️ **An earlier draft of this line claimed no policy used the wrapped form.**
  That came from a query that listed only policies with BARE calls — the wrapped
  ones were filtered out before they could be counted, and the absence was read
  as evidence. The same mistake as reading an empty search as proof of absence,
  which `CLAUDE.md` rule 6 exists to stop.

## Real gaps, no cheap fix

- **No audit log.** Nothing records who deleted a player, revoked a membership, edited
  a child's contact details or granted super-admin. `events.created_by`,
  `availability.updated_by` and `attendance.recorded_by` are single overwritten
  columns, not history.
- **The whole app is one JavaScript chunk** and every parent downloads all of it.
  ⚠️ Re-measure rather than citing an old figure. Two fixes, biggest first:
  `flag-icons` is imported whole for a phone country picker and is most of the CSS
  plus megabytes of SVG; and route-level `React.lazy` on `AdminDashboard`,
  `MatchSheet`, `PlayerImport` and `Allocation` — the admin half is used by three
  people and shipped to everyone.
  ⚠️ `tests/pwa-build.test.js` and `tests/button-sweep.test.js` READ `dist/`, so run
  `npm run build && npm test`, never `npm test` alone, when touching this.
- **The calendar token is an unrevocable, non-expiring credential in a URL**, and
  nobody can see if one has leaked. ⛔ **Do not add an expiry** — a feed that dies on
  a timer produces a club-wide "my calendar stopped working" with no way to warn
  anyone. The cheap fix is visibility: `last_used_at`, shown on the subscribe screen,
  plus an admin-side reset.
- **`saveParents` is delete-then-write**, so a failure between the two loses a child's
  parent records. ⚠️ Not the same as the deliberate two-call split for player
  contacts, where a partial failure surfaces distinctly; here it surfaces as missing
  data.
- **`social_ideas` uploads the image BEFORE inserting the row**, so a failed insert
  orphans an object that appears on no screen and nothing sweeps.
- **`supabase_migrations.schema_migrations` is polluted** — many stale rows, a dozen
  of one name. ⚠️ **Supabase branching replays that history, so branching does not
  work on this project** (tried 13 Aug, `MIGRATIONS_FAILED`, zero tables). Cleaning it
  is a prerequisite for having any staging environment. **Use a rolled-back
  transaction on production instead** — the house style for `db/tests/*.sql`.

## Shipped but never exercised by a real person

- **The match sheet** — no coach has filled one in during a real match.
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
- ⚠️ **Two lint types are NEWER THAN THE 13 Aug AUDIT and have never been read
  through**: `SECURITY DEFINER` functions executable by `anon`, and by
  `authenticated`. Several are deliberate and documented —
  `calendar_events_for_token` and `register_my_player` keep `anon` on purpose,
  and `db/tests/grants.sql` §3b asserts it in BOTH directions. **The rest have
  not been assessed.** This is a read-through, not an alarm.

## Unexplained

- **One phantom test failure in `tests/notice-board.test.jsx`** does not fit the
  timeout mechanism fixed on 14 Aug — the file is synchronous and runs in ~160ms. It
  was never reproduced and its message was never recorded. **If a phantom failure
  appears again, capture the MESSAGE, not the file name.**
