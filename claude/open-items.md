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
- 🟡 **Monitoring — PARTLY DONE, 16 Aug 2026.** "Detection today is somebody
  telling Jay" was the 13 Aug audit's finding. Two **Better Stack** monitors are
  now live on the free tier, 3-minute checks, e-mail alerts:
  `https://adhquins-clubhub.com/` and the calendar feed at
  `/calendar.ics?token=<Jay's token>`. ✅ **E-mail delivery is PROVEN** — Jay ran
  *Send test alert* and it arrived.
  ⬜ **STILL OUTSTANDING, AND IT IS THE HALF THAT MATTERS: nobody has proved the
  monitors NOTICE AN OUTAGE.** The test alert exercised the e-mail path only.
  Pause the Netlify site once, confirm both go red, and record the delay here —
  that number is the real detection window. **A monitor that has never fired is
  not a monitor.**
  ⬜ **Sentry is built and switched off** (`src/lib/errorReporting.js`); it needs
  a project, `VITE_SENTRY_DSN` in Netlify and a redeploy. Both are Jay's.
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
  ⚠️ **NETLIFY'S BUILD NODE IS A SEPARATE SETTING AND IS STILL UNPINNED** — there
  is no `.nvmrc`, no `.node-version`, and no `NODE_VERSION` in `netlify.toml`, so
  the production build runs on whatever Netlify defaults to and CI's `npm run
  build` is therefore not proving Netlify's build. **Not changed here**: pinning
  it alters the runtime a live release is built on, which is Jay's call and not a
  side effect of a test speed-up.

## One migration each

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

- **`public.register_my_player` has `anon` EXECUTE and does not need it.** No
  hole — the body's first statement refuses a null `auth.uid()`, proven above —
  but the grant is unnecessary, and revoking it is the same reasoning as the
  14 Aug table-privilege revoke: protection should come from the GRANT, not only
  from the code behind it. The app calls this as `authenticated`, so nothing
  legitimate loses access.
  `revoke execute on function public.register_my_player(text, uuid, text, boolean, boolean, boolean) from anon;`
- **Ten `private.` functions carry an `anon` EXECUTE grant**, including
  `squad_expects_gender`, which is also the one function the advisor flags for a
  mutable `search_path`. ⚠️ **IT IS `SECURITY INVOKER`, SO THE search_path LINT
  IS MILD** — it runs with the caller's own privileges and gains nothing from a
  hijacked path — and the schema is unreachable through the API anyway (404
  above). Worth setting `search_path` for hygiene, since it is called from inside
  a `SECURITY DEFINER` function, and worth revoking grants that were never meant
  to exist. **Low priority and honestly labelled as such.**

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

## Shipped but never seen against real data

⚠️ **These are not known-broken. They are known-UNVERIFIED**, which is a
different claim and the one this repo has confused before. Each shipped with a
green suite and has never been exercised by a human on the live site.

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

- **Nothing compares a player's grade against a fixture's tier.** Both exist —
  `player_grades.tier` and `events.tier` — and an eligibility warning in the
  lineup picker ("graded C, this is an A-tier fixture") was offered and not
  taken up. Recorded so the next session knows the data is already there and the
  absence is a choice, not an oversight.

## Unexplained

- **One phantom test failure in `tests/notice-board.test.jsx`** does not fit the
  timeout mechanism fixed on 14 Aug — the file is synchronous and runs in ~160ms. It
  was never reproduced and its message was never recorded. **If a phantom failure
  appears again, capture the MESSAGE, not the file name.**
