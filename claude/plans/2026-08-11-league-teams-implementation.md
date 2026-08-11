# League Teams and Fixtures — Implementation Plan

**STATUS: NOT SHIPPED IN FULL — tasks 1-7 have shipped, task 8 has not.**
Written 11 Aug 2026. Implements
`claude/plans/2026-08-11-league-teams-and-fixtures.md`.
⚠️ **Set this line to SHIPPED in the commit that ships it**, not as a promise
about that commit.

⚠️ **TASK 8 IS THE ONE LEFT, AND IT IS BIGGER THAN THIS PLAN SAYS.** The plan
describes it as editing `supabase/functions/calendar/index.ts`. That file cannot
do it alone: **the feed's columns come from `calendar_events_for_token()`'s
`RETURNS TABLE`**, so the league team has to be added there by MIGRATION first.
The same trap cost a day in Aug 2026 when the pitch was missing from the feed
and no amount of editing the function fixed it — see the comment on the `Event`
type in that file, and `db/migrations/20260805_calendar_feed_pitch.sql`. It is
also a separate DEPLOY from the bundle, which is why it was not bundled into the
tasks 6-7 change.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app say *which of the club's teams* played a fixture —
`ADHQ2 · Div B · Round 4` — instead of only the training squad it was drawn from.

**Architecture:** A new `league_teams` table sits between `teams` (the squad) and
`events` (the fixture). `events` gains `league_team_id` and `round`. One shared
formatter renders the label everywhere, so Schedule, EventDetail, the allocation
grid and the calendar feed cannot drift apart.

**Tech Stack:** Vite + React, Tailwind, Supabase (Postgres 17), vitest.

## Global Constraints

- **`main` is production.** It deploys to https://adhquins-clubhub.com. A deploy
  costs 15 Netlify credits. Show the diff and get an explicit yes.
- **Never `git add -A`.** Stage explicit paths.
- **`npm install --include=dev`** on either PC, unconditionally.
- **Migrations go through Supabase `apply_migration`**, then `db/schema/` is
  re-captured **from the live catalogue** and committed with the migration.
  ⚠️ Pasting the migration's DDL into `db/schema/` is not a capture — that
  happened with `pitches` and hid two constraint names for a day.
- **⚠️ A fixture is a league match when `league_team_id IS NOT NULL`.** Null
  renders no division and no round, never a default.
- **⚠️ The letter in a squad name is GENDER, not division.** `U14B Contact` is
  U14 Boys. Never parse a division out of `teams.name`.
- **`npm run docs:check` after any `claude/` edit, re-run AFTER `git add`** — it
  counts *tracked* files.
- Every new assertion must be proved against an injected fault, and the fault
  injected **after** committing.

---

### Task 1: `league_teams` table, RLS and grants

**Files:**
- Create: `db/migrations/20260812_league_teams.sql`
- Create: `db/tests/rls-league-teams.sql`
- Modify: `db/schema/tables.sql`, `db/schema/policies.sql`, `db/schema/grants.sql`

**Interfaces:**
- Produces: table `public.league_teams (id, club_id, team_id, rcm_name, division, is_active, sort_order, created_at)`; policies `league team read`, `league team manage`.

- [ ] **Step 1: Write the RLS harness first**

Create `db/tests/rls-league-teams.sql`, modelled on
`db/tests/rls-pitch-requests.sql`. It must assert, as `authenticated` with a
non-admin uid, that INSERT is refused; and as an admin uid, that INSERT succeeds.

```sql
-- Run inside a transaction and ROLL BACK. Never leave rows behind.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000999"}';
do $$
begin
  begin
    insert into public.league_teams (club_id, team_id, rcm_name)
    values ('00000000-0000-0000-0000-0000000000ad',
            (select id from public.teams limit 1), 'HARNESS-SHOULD-FAIL');
    raise exception 'ABORTING: a non-admin inserted a league team';
  exception when insufficient_privilege then
    raise notice 'ok: non-admin INSERT refused by RLS';
  end;
end $$;
rollback;
```

⚠️ **A negative check that fails for the wrong reason proves nothing.** Assert
the refusal is `insufficient_privilege` (RLS), not a null-violation or a missing
table — otherwise a typo in the table name passes this test.

- [ ] **Step 2: Run the harness against live and watch it fail**

Expected: it errors because `public.league_teams` does not exist. Record the
exact error. That is the fault injection for this task.

- [ ] **Step 3: Write the migration**

```sql
create table if not exists public.league_teams (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  rcm_name   text not null,
  division   text check (division in ('A','B','C')),
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint league_teams_club_id_rcm_name_key unique (club_id, rcm_name)
);

alter table public.league_teams enable row level security;

create index league_teams_team_idx on public.league_teams (team_id, sort_order, rcm_name);

comment on column public.league_teams.rcm_name is
  'What Rugby Club Management calls this team, e.g. ADHQ2. NOT the squad name: '
  'teams.name is the training group (U14B Contact) and its letter is GENDER, '
  'not division.';

comment on column public.league_teams.division is
  'League division A, B or C. NULLABLE on purpose - a club can enter a team '
  'that is not in a lettered division, and forcing a letter would invent data. '
  'Display only; never a gate.';

create policy "league team read" on public.league_teams
  for select using (auth.uid() is not null);

create policy "league team manage" on public.league_teams
  for all using (private.is_admin(club_id)) with check (private.is_admin(club_id));
```

⚠️ **`is_active` rather than DELETE**, the reasoning `pitches` records: deleting
would leave last season's fixtures pointing at nothing.

- [ ] **Step 4: Apply it, then re-run the harness**

Expected: the non-admin INSERT is now refused with `insufficient_privilege`, and
the notice prints. If it passes for any other reason, stop.

- [ ] **Step 5: Re-capture `db/schema/` from the LIVE catalogue**

Run the queries in `db/schema/README.md` §How to regenerate. Add the table to
`tables.sql` with its **constraint names as found**, the two policies to
`policies.sql`, and add `league_teams` to that file's RLS-enabled list. Add the
table's grants to `grants.sql`.

⚠️ Do not paste the migration above into `tables.sql`.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/20260812_league_teams.sql db/tests/rls-league-teams.sql db/schema/tables.sql db/schema/policies.sql db/schema/grants.sql
git commit -m "db: league_teams - the club's competing teams, distinct from its squads"
```

---

### Task 2: `events.league_team_id` and `events.round`

**Files:**
- Create: `db/migrations/20260812_events_league_team.sql`
- Modify: `db/schema/tables.sql`

**Interfaces:**
- Consumes: `public.league_teams` from Task 1.
- Produces: `events.league_team_id uuid`, `events.round smallint`.

- [ ] **Step 1: Write the migration**

```sql
alter table public.events
  add column if not exists league_team_id uuid references public.league_teams(id) on delete set null,
  add column if not exists round smallint;

comment on column public.events.league_team_id is
  'Which of the club''s teams played this fixture. NOT NULL means this IS a '
  'league match; null means it is not one, and division and round must render '
  'as nothing. Never read null as "assume league".';

comment on column public.events.round is 'League round number. Null unless league_team_id is set.';
```

⚠️ **`on delete set null`, never cascade.** Deleting a league team must lose the
label, never the fixture.

- [ ] **Step 2: Apply, then read the columns back**

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='events' and column_name in ('league_team_id','round');
```

Expected: two rows. ⚠️ **Read it back** — a Postgres self-assignment has already
reported success and changed nothing in this schema once.

- [ ] **Step 3: Re-capture `db/schema/tables.sql`** — add both columns to the
`events` block with the comments as stored.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/20260812_events_league_team.sql db/schema/tables.sql
git commit -m "db: a fixture can say which league team played it"
```

---

### Task 3: `src/data/leagueTeams.js`

**Files:**
- Create: `src/data/leagueTeams.js`
- Create: `tests/league-teams-data.test.js`

**Interfaces:**
- Produces: `listLeagueTeams({ teamId, includeRetired })`, `upsertLeagueTeam(row)`, `setLeagueTeamActive(id, isActive)`.

Model it on `src/data/pitches.js`, which has the same three shapes.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: vi.fn() } }))
const { supabase } = await import('../src/lib/supabase.js')
const { listLeagueTeams } = await import('../src/data/leagueTeams.js')

describe('listLeagueTeams', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks only for the squad it was given, and hides retired teams by default', async () => {
    const eq = vi.fn().mockReturnThis()
    const order = vi.fn().mockResolvedValue({ data: [], error: null })
    supabase.from.mockReturnValue({ select: vi.fn().mockReturnThis(), eq, order })

    await listLeagueTeams({ teamId: 'squad-1' })

    expect(supabase.from).toHaveBeenCalledWith('league_teams')
    expect(eq).toHaveBeenCalledWith('team_id', 'squad-1')
    expect(eq).toHaveBeenCalledWith('is_active', true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/league-teams-data.test.js`
Expected: FAIL — cannot resolve `../src/data/leagueTeams.js`.

- [ ] **Step 3: Implement**

```js
import { supabase } from '../lib/supabase.js'

/** League teams for one squad. Retired teams are hidden unless asked for. */
export async function listLeagueTeams({ teamId, includeRetired = false } = {}) {
  let query = supabase.from('league_teams').select('*').eq('team_id', teamId)
  if (!includeRetired) query = query.eq('is_active', true)
  const { data, error } = await query.order('sort_order').order('rcm_name')
  if (error) throw error
  return data ?? []
}

export async function upsertLeagueTeam(row) {
  const { data, error } = row.id
    ? await supabase.from('league_teams').update(row).eq('id', row.id).select().maybeSingle()
    : await supabase.from('league_teams').insert(row).select().maybeSingle()
  if (error) throw error
  return data
}

/** Retire or restore. Never DELETE - fixtures reference these rows. */
export async function setLeagueTeamActive(id, isActive) {
  const { error } = await supabase.from('league_teams').update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Run the test** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/leagueTeams.js tests/league-teams-data.test.js
git commit -m "feat(data): read and write the club's league teams"
```

---

### Task 4: The shared label formatter

**Files:**
- Create: `src/lib/fixtureLabel.js`
- Create: `tests/fixture-label.test.js`

**Interfaces:**
- Produces: `fixtureLabel(event, leagueTeam, squadName) -> string`.

⚠️ **This exists so four screens cannot drift.** Schedule, EventDetail, the
allocation grid and the calendar feed all call it.

- [ ] **Step 1: Write the failing test — the NULL case first**

```js
import { describe, it, expect } from 'vitest'
import { fixtureLabel } from '../src/lib/fixtureLabel.js'

describe('fixtureLabel', () => {
  it('⚠️ renders NOTHING extra when the fixture is not a league match', () => {
    // The whole rule: null league_team_id means not a league match. No
    // division, no round, no invented default. src/lib/ageGroup.js returning
    // null and being read as "a senior side: adults" offered a twelve-year-old
    // girls' squad the child's own contact fields. Same shape, same danger.
    expect(fixtureLabel({ round: 4 }, null, 'U14B Contact')).toBe('U14B Contact')
  })

  it('renders team, division and round for a league match', () => {
    expect(fixtureLabel({ round: 4 }, { rcm_name: 'ADHQ2', division: 'B' }, 'U14B Contact'))
      .toBe('ADHQ2 · Div B · Round 4')
  })

  it('omits the division when the team has none', () => {
    expect(fixtureLabel({ round: 4 }, { rcm_name: 'ADHQ2', division: null }, 'U14B Contact'))
      .toBe('ADHQ2 · Round 4')
  })

  it('omits the round when there is none', () => {
    expect(fixtureLabel({ round: null }, { rcm_name: 'ADHQ2', division: 'B' }, 'U14B Contact'))
      .toBe('ADHQ2 · Div B')
  })
})
```

- [ ] **Step 2: Run and watch all four fail** — module does not exist.

- [ ] **Step 3: Implement**

```js
// One formatter so Schedule, EventDetail, the allocation grid and the calendar
// feed cannot disagree about what a fixture is called.
//
// ⚠️ NO LEAGUE TEAM MEANS NO LEAGUE DECORATION. `round` is ignored entirely
// without one - a round number on a friendly is stale data, not a label.
export function fixtureLabel(event, leagueTeam, squadName) {
  if (!leagueTeam) return squadName
  const parts = [leagueTeam.rcm_name]
  if (leagueTeam.division) parts.push(`Div ${leagueTeam.division}`)
  if (event?.round != null) parts.push(`Round ${event.round}`)
  return parts.join(' · ')
}
```

- [ ] **Step 4: Run the tests** — Expected: 4 PASS.

- [ ] **Step 5: Prove the null test discriminates**

Temporarily change the guard to `if (!leagueTeam) return \`${squadName} · Round ${event.round}\``.
Run the tests. Expected: the first test FAILS. Restore, re-run, expect PASS.

⚠️ **Commit before injecting this fault** — `git checkout --` reverts to the
last commit and has wiped uncommitted work in this repo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fixtureLabel.js tests/fixture-label.test.js
git commit -m "feat: one formatter for a fixture's league identity"
```

---

### Task 5: Manage league teams on the Club screen

**Files:**
- Modify: `src/screens/AdminClub.jsx`
- Create: `tests/admin-club-league-teams.test.jsx`

**Interfaces:**
- Consumes: `listLeagueTeams`, `upsertLeagueTeam`, `setLeagueTeamActive` (Task 3).

Follow `src/screens/Pitches.jsx` — same add / rename / retire / restore shape.

- [ ] **Step 1: Write the failing test**

```jsx
it('lists a squad\'s league teams and offers to add one', async () => {
  render(<AdminClub />)
  expect(await screen.findByText('ADHQ2')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /add league team/i })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement** — a section per squad listing its league teams, each
with the RCM name, a division select (`—`, A, B, C) and Retire/Restore. An "Add
league team" control per squad.

⚠️ **Retired teams render greyed with a Restore button, never hidden**, matching
`Pitches.jsx`: a hidden retired team looks like a deleted one and gets re-added
under a name that collides with the unique constraint.

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AdminClub.jsx tests/admin-club-league-teams.test.jsx
git commit -m "feat(admin): manage the club's league teams per squad"
```

---

### Task 6: `EventForm` offers league team and round

**Files:**
- Modify: `src/screens/EventForm.jsx`
- Create: `tests/event-form-league-team.test.jsx`

- [ ] **Step 1: Write the failing tests**

```jsx
it('⚠️ offers ONLY the league teams belonging to the chosen squad', async () => {
  // A club-wide list would let a U14 fixture be filed as a U16 team, which the
  // governing body would receive as a wrong result.
  render(<EventForm teamId="squad-u14b" />)
  const select = await screen.findByLabelText(/league team/i)
  expect(within(select).getByText('ADHQ2')).toBeInTheDocument()
  expect(within(select).queryByText('ADHQ-U16')).not.toBeInTheDocument()
})

it('saves league_team_id and round on the event', async () => {
  /* choose a league team, type a round, submit; assert the payload */
})
```

- [ ] **Step 2: Run and watch both fail.**

- [ ] **Step 3: Implement** — a League team select and a Round number input,
shown only when the event type is `match`. Both write straight onto the event;
`src/data/events.js` uses `select('*')` and needs no change.

- [ ] **Step 4: Run the tests** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/screens/EventForm.jsx tests/event-form-league-team.test.jsx
git commit -m "feat(events): a match can record which league team played it"
```

---

### Task 7: Show it on Schedule, EventDetail and the allocation grid

**Files:**
- Modify: `src/screens/Schedule.jsx`, `src/screens/EventDetail.jsx`, `src/screens/Allocation.jsx`, `src/components/FixtureRow.jsx`
- Create: `tests/fixture-label-screens.test.jsx`

**Interfaces:**
- Consumes: `fixtureLabel` (Task 4), `listLeagueTeams` (Task 3).

- [ ] **Step 1: Write the failing test**

```jsx
it('shows the league identity on a fixture row, and the squad name without one', async () => {
  /* render two events - one with a league team, one without - and assert
     'ADHQ2 · Div B · Round 4' and 'U14B Contact' respectively */
})
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement** — replace the squad-name render in each with
`fixtureLabel(...)`. ⚠️ **The allocation grid labels rows by squad today**; label
by league team when there is one so Tracy can tell the A and B fixtures apart.

- [ ] **Step 4: Run the full suite** — `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Schedule.jsx src/screens/EventDetail.jsx src/screens/Allocation.jsx src/components/FixtureRow.jsx tests/fixture-label-screens.test.jsx
git commit -m "feat: fixtures show which league team is playing"
```

---

### Task 8: The calendar feed

**Files:**
- Modify: `supabase/functions/calendar/index.ts`

⚠️ **The feed is an EDGE FUNCTION, not part of the bundle** — it deploys
separately and can drift from the app. Change and deploy both together.
⚠️ A subscribed URL cannot be changed remotely once a parent holds one; the
*title content* is safe to change, the URL is not.

- [ ] **Step 1: Add the league team to the event title**, joining
`league_teams` on `events.league_team_id` and using the same `·` format.

- [ ] **Step 2: Deploy the function and fetch the feed**

⚠️ **Check `content-type`, not just the status.** The SPA catch-all answers any
unknown path with `index.html` and HTTP 200, so a 200 is not proof the feed
exists. And `navigateFallbackDenylist: [/^\/calendar\.ics$/]` is load-bearing —
without it the service worker answers the feed with `index.html`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/calendar/index.ts
git commit -m "feat(calendar): subscribed fixtures name the league team"
```

---

## Release

- [ ] `npm run build && npm test` — expect 79+ files green.
- [ ] `npm run docs:check` — **re-run after `git add`**; it counts tracked files.
- [ ] Set this plan's STATUS to SHIPPED **in the shipping commit**.
- [ ] Add the previous merge's SHA to `claude/changelog.md`.
- [ ] Open a PR. ⚠️ **This deploys** — `src/` and `supabase/` are both
  deploy-relevant. Run the gate rather than predicting:
  `CACHED_COMMIT_REF=<sha> COMMIT_REF=<sha> node scripts/netlify-ignore.mjs`
- [ ] After deploying, verify **live** — the painted result, not the build log.
  ⚠️ Include a control that must NOT change, or the reading only agrees with you.
