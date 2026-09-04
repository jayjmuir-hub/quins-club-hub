# Handoff — the senior build: fixtures, league tables, the section, call-ups

**4 Sep 2026.** History, not instruction — it describes a moment. The durable
rules are in `CLAUDE.md`; current state is `claude/state-of-play.md`. Run
`git log --oneline -40` before believing any status line here.

## What Jay asked for, over 3–4 Sep, and what he has

1. *"how would you add this to the men and women's schedules"* (the RCM
   senior men's grid PDF and the women's dates poster) — ✅ #678. Squads,
   league sides, 47 fixtures, with his two rulings (JA away on Friday 23 Oct;
   the Doha pair reversed).
2. *"take attendance … names can't be read"* on Android — ✅ #679.
3. *"30 notifications on my app icon"* — ✅ #680. The tray, not the app.
4. *"there is no overall view of … men's senior teams"* — ✅ #685, #686, #687.
5. *"league standings … for seniors and the juniors who play league"* —
   ✅ #684 (tables, typed results, the season import), #688 (keepers, the
   Monday nudge).
6. Senior-squads Part 3, call-ups — ✅ #689, #690.

Every one of those is MERGED, its migration APPLIED, its edge function
DEPLOYED, and the served bundle checked. The changelog under `## 3 Sep 2026`
and `## 4 Sep 2026` has one entry per pull request.

## What is live that a new session must not re-do

- **Seed ran once.** `db/seeds/2026-09-03-senior-fixtures-2026-27.sql` now
  carries the run-once guard; the live run on 3 Sep had it. Never re-run it.
- **The RCM grid is imported.** Three competitions for 2026-27 (WAP, D1, D2),
  every side and fixture, all of our fixtures linked to the seeded events. Re-
  importing the same grid is a no-op by design.
- **Points rules are a default Jay has NOT confirmed** — 4/2/0 with a try
  bonus at 4 and a losing bonus within 7. Change on `/admin/competitions` if
  RCM differs; the tables recompute.
- **The four senior squads carry `teams.section`** (senior_men ×3,
  senior_women ×1), set by SQL on 3 Sep; the Club tab's select is the
  ordinary route from here.
- **Edge functions deployed:** `calendar` (division labels), `push-send`
  v18 (`results_nudge`, `profile_push`), `notify-callup` v1 (verify_jwt off).
- **pg_cron `results-nudge`** fires Monday 01:30 UTC. Nothing missing before
  the first round on 10 Oct, so nothing will fire until then.

## Rulings taken this session, in Jay's words where he gave them

| Question | Ruling |
|---|---|
| Round date when the grid gives a weekend | Saturday (his "instead of Saturday" on the JA game). |
| The women's W7s, a league in 7s | Tournament containers per round — `events_league_is_fifteen` refuses a 7s league row. |
| Missing W7s Round 4 on the poster | "don't worry about the women missing round." |
| Junior fixture lists | "the rcm will eventually publish the fixtures list and we will import it when it comes out for juniors." |
| Section visibility | Within a section, full read; across men and women, fixtures and results only; chat, notices and documents per squad. Cross-section rosters wait for a club setting nobody has asked for. |
| The under-18 line | Every child protection keys on the person; a called-up 17-year-old keeps them all. `db/tests/senior-section.sql` and `db/tests/callups.sql` prove it. |
| Keepers | A join table, not a scoped admin right (deviation from the spec, reasoned in the migration header). |

## Traps met, so the next session does not meet them again

- **`position` is a reserved word in a RETURNS TABLE column list** (the
  standings column is `pos`); `placing` was already known.
- **A Date object handed to `listEvents` reaches Postgres as
  "GMT+0400 (Gulf Standard Time)"** and errors. ISO strings.
- **Six tabs do not fit the phone dock.** Seniors takes Squad Hub's slot only
  when there is no Squad Hub.
- **`git checkout --ours` during a rebase silently dropped a changelog entry**
  when the helper script died on a Git Bash `/tmp` path. Re-added by hand.
- **`app.harness`** — a transaction-local setting that silences
  `private.push_to_profiles` and `private.notify_callup_email`. Any harness
  that can trigger a push MUST `select set_config('app.harness','on',true)`
  or it pushes the real super admins.
- **CI flaked twice on npm audit 503**; `gh run rerun <id> --failed`. One
  standings test reached its inputs before an effect had painted in CI; use
  `findBy` after a load.
- **A harness reading counts as `authenticated`** sees RLS-filtered rows —
  reset to `postgres` before counting another squad's memberships.

## What is NOT built, in the order I would take it

1. **Senior season stats** — per player per season from the match sheets
   (games, starts, bench, tries, conversions, penalties, drops, cards). A
   view over `match_sheets`; seniors only; on the player sheet, the squad
   page and `/seniors`. `claude/plans/2026-09-02-senior-squads.md` "Season
   stats for seniors".
2. **Standings route 2** (paste or share results → a reader → proposals)
   and **route 3** (daily fetch of `results_url`).
   `claude/plans/2026-09-02-standings-and-results.md`. `competition_results`
   already carries `source = 'read' | 'fetched'` and the insert policy
   already admits them.
3. **A club setting to open rosters across sections**, and the
   **all-seniors notice and chat channel**
   (`claude/plans/2026-09-03-senior-section.md` phase 2).
4. **Union registration numbers** on the senior sheet (senior-squads step 7).

## Things only Jay can do, still open

- Confirm RCM's points rules.
- Open Seniors on a phone as a senior player and say what looks wrong.
- Clear the Android notification shade once by hand (the app clears it from
  now on).
