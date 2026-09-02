# Senior Squads 2a Implementation Plan — squads, jersey numbers, players in several squads, adult sign-up

**Status: EXECUTED 2 Sep 2026 — pull request pending.** Dated 2026-09-02.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can create a senior squad; a senior squad's players carry a season jersey number on the roster; a player can belong to more than one squad and appears on every one of them; an adult signing up sees the senior squads first with no parent wording.

**Architecture:** One migration adds `teams.uses_jersey_numbers`, a per-squad unique index on `players.jersey_num`, and a new RLS helper `private.can_see_player` so that a player with a membership in a squad the caller runs is visible even when their home squad is somewhere else. The data layer's `listPlayers({ teamIds })` becomes "players whose home squad OR any active membership is in these squads", annotated with `guest_of` so screens can mark a guest. The roster's avatar tile shows the number where the squad uses numbers and initials everywhere else. The Club tab gains an "Add squad" form. The sign-up wizard orders senior squads first when the player is an adult registering themselves.

**Why this is 2a and not all of piece 2:** shirt numbers on the lineup and sheet, publish-to-chat, season record, stats, union registration numbers, call-ups and the Senior Section overview are 2b–2d. Each of those reads what this plan creates. `claude/plans/2026-09-02-senior-squads.md` "Order of work" steps 2, 3 and 4 are this plan.

**Tech Stack:** Vite + React, Tailwind, Supabase Postgres 17 (migrations in `db/migrations/`, harnesses in `db/tests/` via `npm run db:check -- <name>`, applied to live through the Supabase MCP after Jay's yes), vitest + @testing-library.

## Global Constraints

- **Never `git add -A`.** Stage explicit paths. Never touch `package.json`.
- **`main` is production.** Work on `claude/senior-squads-2a`; pull request; Jay merges.
- **No real person's name anywhere in the repo.** Invent fixture names, keep the shape. Check an invented name against live with a control before using it.
- **Every negative assertion carries a control; every new assertion is proven against an injected fault** before it is trusted.
- **`players.team_id` stays NOT NULL and stays the home squad.** A second squad is a second `memberships` row (`profile_id`, `team_id`, `player_id`, `role in ('parent','player')`, `status = 'active'`). No new table.
- **`uses_jersey_numbers` is a column on `teams`, never derived from the name or from `is_senior`.** Where it is false, every roster screen renders byte-for-byte as today; the harness `jerseyAnywhere` probes stay green because every harness fixture is a youth squad.
- **A jersey number is unique per squad, 1–99.** Two squads may both have a 9.
- **RLS decides what the database returns; screens only decide what to OFFER.** The new `can_see_player` widens READ only. Edit policies keyed on `players.team_id` (positions, private data) are deliberately unchanged in 2a: a guest's private data stays with their home squad's staff.
- **Migrations are applied to live only with Jay's explicit yes**, harness green first, whole `npm run db:check` after (one pre-existing red: `photo-orphans.sql`, a stray staff photo from 31 Aug, unrelated).
- **Changelog entry in the same commit, no SHA for this branch's commits;** the next pull request cites this one's squash. Run `npm run docs:check` after editing anything under `claude/` and again after the commit.
- **Keep `npm run test:watch` for iteration; run `npm test` once before pushing.**

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/20260903_senior_squads_2a.sql` (create) | `teams.uses_jersey_numbers`; `players_jersey_num_check` (1–99); partial unique index `players_team_jersey_unique`; `private.can_see_player(uuid)`; `"player read"` policy widened; `create_team` RPC for admins. |
| `db/tests/senior-squads-2a.sql` (create) | Harness: two squads share a 9, one squad cannot; 0 and 100 refused; a coach of squad B sees a player whose home is A once a B membership exists, and not before (control); `create_team` refused for a non-admin. Rolls back. |
| `db/schema/tables.sql`, `db/schema/functions.sql`, `db/schema/policies.sql`, `db/schema/grants.sql` (modify) | Capture the above from live, in the APPENDED-block style `tables.sql` now uses for `fixture_format`. `docs:check` rule 7 requires `grants.sql` to reflect any table grant — none here, but `create_team`'s EXECUTE grant is a function grant and goes in `functions.sql`. |
| `src/data/teams.js` (modify) | `setTeamUsesJerseyNumbers(teamId, value)`, `createTeam({ name, isSenior, usesJerseyNumbers, selfRegistrationAllowed })`. |
| `src/data/players.js` (modify) | `listPlayers({ teamIds })` reads home OR membership; each row gains `guest_of: null | teamId`. `setPlayerJerseyNumber(playerId, number)` with the clash message. `listPlayerSquads(playerIds)` for the "from U18B" mark. |
| `src/lib/jersey.js` (create) | Pure: `isJerseyNumber(value)`, `jerseyClashMessage(number, holderName)`, `sortByJersey(a, b)`. |
| `src/components/PlayerAvatar.jsx` (modify) | Shows the number instead of initials when `showJersey` and the player has one. |
| `src/screens/Roster.jsx`, `src/components/RosterTable.jsx` (modify) | Pass `showJersey` from the squad's flag; search matches the number; coach view sorts by number within group when the squad uses numbers; inline number edit for staff; "from U18B" mark on guest rows for staff. |
| `src/screens/AdminClub.jsx` (modify) | "Add squad" form; "Jersey numbers" switch in the per-squad sheet beside Contact rugby. |
| `src/components/SignupWizard.jsx`, `src/components/PlayerRegistrationForm.jsx` (modify) | Senior squads first for a self-registering adult; no "your child" copy on the self path. |
| `tests/jersey.test.js`, `tests/players-list-membership.test.js`, `tests/roster-jersey.test.jsx`, `tests/admin-club-add-squad.test.jsx`, `tests/signup-adult-path.test.jsx` (create); `tests/teams-default-format.test.js` pattern reused for the two new writers | Tests, each with controls. |
| `claude/changelog.md`, `RESTORE.md` (modify) | Entry; the "club does not use jersey numbers" paragraph narrowed to youth squads with a tombstone pointing at the senior-squads spec. |

---

### Task 1: Migration and harness

**Files:**
- Create: `db/migrations/20260903_senior_squads_2a.sql`
- Create: `db/tests/senior-squads-2a.sql`
- Modify: `db/schema/tables.sql`, `db/schema/functions.sql`, `db/schema/policies.sql`

**Interfaces:**
- Produces: `teams.uses_jersey_numbers boolean NOT NULL DEFAULT false`; `players_jersey_num_check`; unique index `players_team_jersey_unique`; `private.can_see_player(_player uuid) returns boolean`; `"player read"` = `can_see_player(id) OR is_own_player(id)`; `public.create_team(p_name text, p_is_senior boolean, p_uses_jersey_numbers boolean, p_self_registration_allowed boolean) returns teams` (admin only, errcode 42501 otherwise).

- [ ] **Step 1: Write the harness first**

```sql
-- db/tests/senior-squads-2a.sql
-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — senior squads 2a: uses_jersey_numbers, jersey uniqueness per
--  squad, can_see_player across squads, create_team.
--  Paste into the Supabase SQL editor, or run `npm run db:check -- senior-squads-2a`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260903_senior_squads_2a.sql. Written BEFORE the
-- migration is applied (it fails until it is — that is the point).
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC and its members are
-- mostly children. The names were checked against live players/profiles
-- with a control before being written down.

begin;

-- ── STEP 0 — CONTROL ──────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='teams' and column_name='is_senior') then
    raise exception 'CONTROL FAILED: cannot see teams.is_senior — the probe is broken.';
  end if;
end $$;

-- ── STEP 1 — the column, the check, the index, the helper all exist ───────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='teams' and column_name='uses_jersey_numbers') then
    raise exception 'teams.uses_jersey_numbers is missing';
  end if;
  if not exists (select 1 from pg_indexes where indexname='players_team_jersey_unique') then
    raise exception 'players_team_jersey_unique is missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                 where n.nspname='private' and p.proname='can_see_player') then
    raise exception 'private.can_see_player is missing';
  end if;
  raise notice 'STEP 1 ok';
end $$;

-- ── STEP 2 — fixtures: one club, two invented senior squads, two players ──
create temporary table _fx on commit drop as
  select c.id as club_id from public.clubs c order by c.created_at limit 1;
insert into public.teams (club_id, name, sort_order, is_senior, uses_jersey_numbers, self_registration_allowed)
select club_id, 'Harness Senior A', 990, true, true, true from _fx;
insert into public.teams (club_id, name, sort_order, is_senior, uses_jersey_numbers, self_registration_allowed)
select club_id, 'Harness Senior B', 991, true, true, true from _fx;
create temporary table _t on commit drop as
  select (select id from public.teams where name='Harness Senior A') as a,
         (select id from public.teams where name='Harness Senior B') as b;
insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
select f.club_id, t.a, 'Harness Prop Aldenbrook', 'Harness', 'Aldenbrook', 9 from _fx f, _t t;
insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
select f.club_id, t.b, 'Harness Hooker Brambleway', 'Harness', 'Brambleway', 9 from _fx f, _t t;
do $$ begin raise notice 'STEP 2 ok: two squads each hold a 9'; end $$;

-- ── STEP 3 — the same squad cannot hold two 9s ────────────────────────────
do $$
declare f record; t record;
begin
  select * into f from _fx; select * into t from _t;
  insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
  values (f.club_id, t.a, 'Harness Lock Cresswick', 'Harness', 'Cresswick', 9);
  raise exception 'STEP 3 FAILED: squad A accepted a second 9';
exception when unique_violation then raise notice 'STEP 3 ok: second 9 refused';
end $$;

-- ── STEP 4 — 0 and 100 refused, null allowed (control) ───────────────────
do $$
declare f record; t record;
begin
  select * into f from _fx; select * into t from _t;
  begin
    insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
    values (f.club_id, t.a, 'Harness Flank Dunmore', 'Harness', 'Dunmore', 0);
    raise exception 'STEP 4 FAILED: 0 accepted';
  exception when check_violation then null; end;
  begin
    insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
    values (f.club_id, t.a, 'Harness Flank Dunmore', 'Harness', 'Dunmore', 100);
    raise exception 'STEP 4 FAILED: 100 accepted';
  exception when check_violation then null; end;
  insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
  values (f.club_id, t.a, 'Harness Flank Dunmore', 'Harness', 'Dunmore', null);
  raise notice 'STEP 4 ok: 0 and 100 refused, null accepted';
end $$;

-- ── STEP 5 — can_see_player: a B coach sees an A player only via a B membership
-- Uses an invented auth user: private helpers read auth.uid(), so set the JWT claim.
do $$
declare f record; t record; coach uuid := gen_random_uuid(); ply uuid;
begin
  select * into f from _fx; select * into t from _t;
  select id into ply from public.players where full_name='Harness Prop Aldenbrook';
  insert into public.profiles (id, full_name, email) values (coach, 'Harness Coach Ellerby', 'harness-coach-ellerby@example.invalid');
  insert into public.memberships (profile_id, club_id, team_id, role, status) values (coach, f.club_id, t.b, 'coach', 'active');
  perform set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  -- CONTROL: not visible yet — the player's home is A and the coach runs B.
  if private.can_see_player(ply) then
    raise exception 'STEP 5 CONTROL FAILED: B coach sees an A player with no B membership';
  end if;
  -- Give the player a B membership (their profile is another invented user).
  insert into public.profiles (id, full_name, email) values (gen_random_uuid(), 'Harness Prop Aldenbrook', 'harness-prop-aldenbrook@example.invalid');
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select p.id, f.club_id, t.b, 'player', ply, 'active' from public.profiles p where p.email='harness-prop-aldenbrook@example.invalid';
  if not private.can_see_player(ply) then
    raise exception 'STEP 5 FAILED: B coach cannot see the A player after a B membership';
  end if;
  raise notice 'STEP 5 ok: visible only through the membership';
end $$;

-- ── STEP 6 — create_team refuses a non-admin, accepts an admin ────────────
do $$
declare f record; who uuid := gen_random_uuid(); made public.teams;
begin
  select * into f from _fx;
  insert into public.profiles (id, full_name, email) values (who, 'Harness Parent Fenwold', 'harness-parent-fenwold@example.invalid');
  insert into public.memberships (profile_id, club_id, team_id, role, status)
  select who, f.club_id, t.a, 'parent', 'active' from _t t;
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  begin
    perform public.create_team('Harness Senior C', true, true, true);
    raise exception 'STEP 6 FAILED: a parent created a squad';
  exception when insufficient_privilege then null; end;
  update public.memberships set role='admin', team_id=null where profile_id=who;
  select * into made from public.create_team('Harness Senior C', true, true, true);
  if made.is_senior is not true or made.uses_jersey_numbers is not true then
    raise exception 'STEP 6 FAILED: flags not stored';
  end if;
  raise notice 'STEP 6 ok: admin created a senior squad with numbers';
end $$;

rollback;
```

Before committing the harness, prove the invented surnames are absent from live with a control (rule 9): through the MCP `execute_sql`, `select count(*) from public.players where full_name ilike '%Aldenbrook%' or full_name ilike '%Brambleway%' or full_name ilike '%Cresswick%' or full_name ilike '%Dunmore%' or full_name ilike '%Ellerby%' or full_name ilike '%Fenwold%'` must be 0, and the control `select count(*) from public.players where full_name ilike '%a%'` must be large. Do the same against `public.profiles.full_name`. Record both numbers in the task report, never in the repo.

- [ ] **Step 2: Run the harness; expect FAIL at STEP 1** (`teams.uses_jersey_numbers is missing`). STEP 0 failing means the runner is broken — stop.

- [ ] **Step 3: Write the migration**

```sql
-- db/migrations/20260903_senior_squads_2a.sql
-- ══════════════════════════════════════════════════════════════════════════
--  Senior squads 2a — jersey numbers per squad, a player in several squads
-- ══════════════════════════════════════════════════════════════════════════
--
-- claude/plans/2026-09-02-senior-squads.md, Part 2. Jay, 2 Sep 2026:
-- "they have jersey numbers ... juniors do not", and option C — full
-- membership in every squad a player is in.
--
-- ⚠️ uses_jersey_numbers IS A COLUMN, NEVER DERIVED FROM is_senior OR THE
-- NAME. A social or touch side is senior without numbers. Same rule as
-- is_senior / self_registration_allowed / requires_contact: a rename must
-- not change behaviour.
--
-- ⚠️ THE AUGUST "NO JERSEY NUMBERS" RULING IS NARROWED, NOT REVERSED.
-- players.jersey_num has existed unused since Task 12; every youth squad
-- keeps uses_jersey_numbers = false and renders exactly as today. RESTORE.md
-- carries the tombstone.
--
-- ⚠️ UNIQUE PER SQUAD, 1–99. Two squads may both have a 9. The partial index
-- ignores nulls so a squad with no numbers at all is unaffected.
--
-- ⚠️ can_see_player WIDENS READ ONLY. "player read" was can_see_team(team_id)
-- OR is_own_player(id) — a coach of squad B could not see a player whose
-- HOME is squad A even with a B membership. The helper adds "or any active
-- membership in a squad the caller can see". Edit policies keyed on the
-- home squad (positions, player_private) are deliberately untouched in 2a.
--
-- ⚠️ create_team EXISTS BECAUSE THE APP HAS NEVER CREATED A SQUAD: every
-- squad to date was inserted by migration. "team manage" already lets an
-- admin INSERT, but a SECURITY DEFINER RPC keeps the four flags together and
-- refuses a non-admin with 42501 rather than a silent zero-row insert.

alter table public.teams
  add column if not exists uses_jersey_numbers boolean not null default false;
comment on column public.teams.uses_jersey_numbers is
  'Season jersey numbers on the roster (players.jersey_num). A column, never derived. '
  'False for every youth squad; set by an admin on the Club tab. '
  'claude/plans/2026-09-02-senior-squads.md.';

alter table public.players drop constraint if exists players_jersey_num_check;
alter table public.players add constraint players_jersey_num_check
  check (jersey_num is null or (jersey_num between 1 and 99));

create unique index if not exists players_team_jersey_unique
  on public.players (team_id, jersey_num) where jersey_num is not null;

create or replace function private.can_see_player(_player uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select exists (
    select 1 from public.players p
     where p.id = _player
       and private.can_see_team(p.team_id))
  or exists (
    select 1 from public.memberships m
     where m.player_id = _player
       and m.status = 'active'
       and private.can_see_team(m.team_id));
$$;
revoke all on function private.can_see_player(uuid) from public;
grant execute on function private.can_see_player(uuid) to authenticated;

drop policy if exists "player read" on public.players;
create policy "player read" on public.players
  for select using (private.can_see_player(id) or private.is_own_player(id));

create or replace function public.create_team(
  p_name text, p_is_senior boolean default false,
  p_uses_jersey_numbers boolean default false, p_self_registration_allowed boolean default false)
 returns public.teams
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare club uuid; made public.teams;
begin
  select m.club_id into club from public.memberships m
   where m.profile_id = auth.uid() and m.role = 'admin' and m.status = 'active' limit 1;
  if club is null then
    raise exception 'Only a club admin can add a squad.' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A squad needs a name.' using errcode = '22023';
  end if;
  insert into public.teams (club_id, name, sort_order, is_senior, uses_jersey_numbers, self_registration_allowed)
  values (club, trim(p_name),
          (select coalesce(max(sort_order), 0) + 1 from public.teams where club_id = club),
          coalesce(p_is_senior, false), coalesce(p_uses_jersey_numbers, false),
          coalesce(p_self_registration_allowed, false))
  returning * into made;
  return made;
end;
$$;
revoke all on function public.create_team(text, boolean, boolean, boolean) from public, anon;
grant execute on function public.create_team(text, boolean, boolean, boolean) to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'player read' and tablename = 'players'
                 and qual like '%can_see_player%') then
    raise exception 'ABORTING: "player read" does not use can_see_player.';
  end if;
  raise notice 'guard passed: senior squads 2a in place';
end $$;
```

⚠️ Check `public.players` NOT NULL columns before running the harness (`first_name`, `last_name` were added 16 Aug; `club_id` is required). If a required column is missing from the harness INSERTs, add it with an invented value and say so in the report.

- [ ] **Step 4: Apply to live — ONLY with Jay's yes.** State: one column with a default, one CHECK, one partial unique index (fails to create if live already has two equal numbers in a squad — it has none: measured 2 Sep, `players_with_jersey = 0`), one helper, one policy replaced with a strictly wider one, one admin-only RPC. Apply via MCP `apply_migration` named `senior_squads_2a`. Confirm with `list_migrations`.

- [ ] **Step 5: Harness green, then the WHOLE `npm run db:check`.** Expected: all ok except `photo-orphans.sql` (pre-existing). Anything else red is BLOCKED.

- [ ] **Step 6: Capture.** `tables.sql`: an appended `-- ── senior squads 2a, 3 Sep 2026` block after the `fixture format` block with the `alter table` statements and the index; `policies.sql`: replace the `"player read"` capture; `functions.sql`: add `private.can_see_player` beside `can_see_team` and `public.create_team` in alphabetical position, with their grants, using `pg_get_functiondef` text read from live via `execute_sql`.

- [ ] **Step 7: Commit**

```bash
git add db/migrations/20260903_senior_squads_2a.sql db/tests/senior-squads-2a.sql db/schema/tables.sql db/schema/functions.sql db/schema/policies.sql
git commit -m "feat(seniors): uses_jersey_numbers, jersey unique per squad, can_see_player across squads, create_team — applied to live"
```

---

### Task 2: The jersey lib

**Files:**
- Create: `src/lib/jersey.js`
- Test: `tests/jersey.test.js`

**Interfaces:**
- Produces: `isJerseyNumber(value) -> boolean` (integer 1–99); `parseJerseyInput(text) -> number|null|undefined` (`''` → null meaning clear, valid → number, anything else → undefined meaning refuse); `jerseyClashMessage(number, holderName) -> string`; `sortByJersey(a, b)` (numbered first ascending, then unnumbered by name).

- [ ] **Step 1: Write the failing test**

```js
// tests/jersey.test.js
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { isJerseyNumber, jerseyClashMessage, parseJerseyInput, sortByJersey } from '../src/lib/jersey.js'

describe('jersey', () => {
  it('accepts 1–99 integers only', () => {
    expect([1, 9, 99].every(isJerseyNumber)).toBe(true)
    // CONTROL: the edges and the wrong types are refused.
    expect([0, 100, 9.5, '9', null, undefined].some(isJerseyNumber)).toBe(false)
  })

  it('parses the inline editor: blank clears, digits parse, junk refuses', () => {
    expect(parseJerseyInput('')).toBeNull()
    expect(parseJerseyInput(' 12 ')).toBe(12)
    expect(parseJerseyInput('0')).toBeUndefined()
    expect(parseJerseyInput('abc')).toBeUndefined()
  })

  it('names the holder in the clash message', () => {
    expect(jerseyClashMessage(9, 'Harness Prop Aldenbrook')).toBe(
      'Number 9 is already worn by Harness Prop Aldenbrook in this squad. Clear theirs first, or pick another.',
    )
  })

  it('sorts numbered players first, ascending, then the rest by name', () => {
    const rows = [
      { full_name: 'Zed', jersey_num: null },
      { full_name: 'Amy', jersey_num: null },
      { full_name: 'Bob', jersey_num: 10 },
      { full_name: 'Cal', jersey_num: 2 },
    ]
    expect([...rows].sort(sortByJersey).map((r) => r.full_name)).toEqual(['Cal', 'Bob', 'Amy', 'Zed'])
  })
})
```

- [ ] **Step 2: Run; expect FAIL** (module not found).

- [ ] **Step 3: Write the lib**

```js
// src/lib/jersey.js
// Season jersey numbers — seniors only (claude/plans/2026-09-02-senior-squads.md).
// Pure, no React. The database enforces 1–99 and uniqueness per squad
// (players_jersey_num_check, players_team_jersey_unique); this file is what
// the screens ask BEFORE a write, so a refusal reads as a sentence and not
// as a constraint name.

export function isJerseyNumber(value) {
  return Number.isInteger(value) && value >= 1 && value <= 99
}

/** '' → null (clear), a valid number → the number, anything else → undefined (refuse). */
export function parseJerseyInput(text) {
  const trimmed = String(text ?? '').trim()
  if (trimmed === '') return null
  if (!/^\d{1,2}$/.test(trimmed)) return undefined
  const n = Number(trimmed)
  return isJerseyNumber(n) ? n : undefined
}

export function jerseyClashMessage(number, holderName) {
  return `Number ${number} is already worn by ${holderName} in this squad. Clear theirs first, or pick another.`
}

/** Numbered first, ascending; then the unnumbered by name. */
export function sortByJersey(a, b) {
  const an = isJerseyNumber(a.jersey_num) ? a.jersey_num : null
  const bn = isJerseyNumber(b.jersey_num) ? b.jersey_num : null
  if (an != null && bn != null) return an - bn
  if (an != null) return -1
  if (bn != null) return 1
  return a.full_name.localeCompare(b.full_name)
}
```

- [ ] **Step 4: Run; PASS. Step 5: inject a fault** (`value <= 100`), the first test must fail; restore. **Step 6: Commit** `feat(seniors): the jersey lib`.

---

### Task 3: Data layer — players by membership, jersey writer, squad flags, create squad

**Files:**
- Modify: `src/data/players.js` (`listPlayers`, add `setPlayerJerseyNumber`, `listPlayerSquads`)
- Modify: `src/data/teams.js` (add `setTeamUsesJerseyNumbers`, `createTeam`)
- Test: `tests/players-list-membership.test.js`, `tests/teams-senior-writers.test.js` (create; model both on `tests/teams-default-format.test.js`)

**Interfaces:**
- Produces: `listPlayers({ teamIds, includeLeft })` returns rows with an extra `guest_of: null | <teamId>` — null when `players.team_id` is in `teamIds`, otherwise the first requested team the player has an active membership in. Order unchanged (`full_name`, `id`). `listPlayerSquads(playerIds) -> Map<playerId, teamId[]>` of ACTIVE membership team ids excluding the home squad. `setPlayerJerseyNumber(playerId, number|null)` throws `Error(jerseyClashMessage(...))` on a unique violation after looking up the holder. `setTeamUsesJerseyNumbers(teamId, bool)`; `createTeam({ name, isSenior, usesJerseyNumbers, selfRegistrationAllowed })` calls the RPC and returns the row.

- [ ] **Step 1: Failing tests.** Mock `../src/lib/supabase` the way `tests/teams-default-format.test.js` does, but with a `from(table)` router so `players` and `memberships` return different fixtures. Cases: (a) `listPlayers({ teamIds: ['B'] })` returns a player whose `team_id` is `'A'` but who has an active `memberships` row with `team_id 'B'`, with `guest_of: 'B'`, and a home player with `guest_of: null`; CONTROL: a player with only a `'left'` membership in B is absent. (b) `setPlayerJerseyNumber('p1', 9)` on a `23505` error looks up the holder in the same squad and throws the clash sentence naming them; CONTROL: any other error rethrows its own message. (c) `createTeam` calls `rpc('create_team', { p_name, p_is_senior, p_uses_jersey_numbers, p_self_registration_allowed })` and returns the row; a `42501` error becomes `Error('Only a club admin can add a squad.')`.

- [ ] **Step 2: Run; FAIL. Step 3: Implement.**

`listPlayers`: keep the existing `buildQuery` for the home rows. When `teamIds` is a non-empty array, ALSO run `supabase.from('memberships').select('player_id, team_id').in('team_id', teamIds).eq('status', 'active').not('player_id', 'is', null)`; collect `player_id`s not already in the home result; fetch them with `supabase.from('players').select('*').in('id', ids)` (page with `fetchByIds` from `./limits.js`, which exists for exactly this); apply the same `left_at` rule; stamp `guest_of` with the first requested team from the membership rows; merge; sort by `full_name` then `id` in JS (the same comparator the DB used, so the order contract holds across the merge). Comment: ⚠️ TWO QUERIES, NOT A VIEW — RLS on both tables already decides what comes back (`can_see_player` is what makes the guest row readable at all); a view would need its own policy.

`setPlayerJerseyNumber`:

```js
export async function setPlayerJerseyNumber(playerId, number) {
  if (!playerId) throw new Error('We could not save that number.')
  if (number !== null && !isJerseyNumber(number)) {
    throw new Error('A jersey number is 1 to 99, or blank to clear it.')
  }
  const { data, error } = await supabase
    .from('players').update({ jersey_num: number }).eq('id', playerId).select('id, team_id').maybeSingle()
  if (error?.code === '23505') {
    // ⚠️ NAME THE HOLDER. A constraint name is not a sentence a coach can act on.
    const { data: me } = await supabase.from('players').select('team_id').eq('id', playerId).maybeSingle()
    const { data: holder } = await supabase
      .from('players').select('full_name').eq('team_id', me?.team_id).eq('jersey_num', number).maybeSingle()
    throw new Error(jerseyClashMessage(number, holder?.full_name ?? 'another player'))
  }
  if (error) throw new Error(error.message || 'We could not save that number.')
  if (!data) throw new Error("We couldn't save that. Only squad staff can change a jersey number.")
  return data
}
```

`teams.js`: `setTeamUsesJerseyNumbers` mirrors `setTeamRequiresContact` exactly (`value === true`); `createTeam` calls `supabase.rpc('create_team', {...})`, maps `42501` to the admin sentence, `22023` to its message, throws otherwise, returns `data`.

- [ ] **Step 4: Run the two new files plus `tests/roster.test.jsx tests/squad-hub*.test.jsx tests/lineup.test.jsx tests/availability*.test.jsx`** — every existing caller mocks `listPlayers`, so they must be untouched; if one calls the REAL module through a partial mock, its fixture needs `guest_of` absent-is-fine (undefined). **Step 5: fault: drop the `.eq('status','active')`; the CONTROL case must fail; restore. Step 6: commit** `feat(seniors): listPlayers reads home or membership; jersey and squad writers`.

---

### Task 4: Club tab — add a squad, jersey switch

**Files:**
- Modify: `src/screens/AdminClub.jsx`
- Test: `tests/admin-club-add-squad.test.jsx` (create, scaffold copied from `tests/admin-club-scoring.test.jsx`), `tests/admin-club-scoring.test.jsx` (one case for the switch)

**Interfaces:**
- Consumes: `createTeam`, `setTeamUsesJerseyNumbers` from `src/data/teams.js`.

- [ ] **Step 1: Failing tests.** (a) An "Add squad" button under the Age groups heading opens a sheet with Name, three switches (Senior squad, Jersey numbers, Players may register themselves), and Save; saving calls `createTeam({ name: 'Harness Senior A', isSenior: true, usesJerseyNumbers: true, selfRegistrationAllowed: true })` then `reload`; a blank name shows "A squad needs a name." and calls nothing (CONTROL). (b) In the existing per-squad scoring sheet a "Jersey numbers" switch beside Contact rugby calls `setTeamUsesJerseyNumbers('team-u16b', true)`; CONTROL: the Contact switch still calls its own writer.

- [ ] **Step 2: FAIL. Step 3: Implement** — the Add-squad sheet reuses the Sheet + Button pattern the invite form uses in this file (`inviteOpen`); the switch copies the Contact rugby `role="switch"` block with `aria-label="Jersey numbers"` reading `scoringTeam.uses_jersey_numbers === true`. Comment: ⚠️ THE FIRST TIME THE APP CREATES A SQUAD — until 3 Sep 2026 every squad was a migration. ⚠️ "Jersey numbers" is a column, never derived from Senior — a touch side is senior without numbers.

- [ ] **Step 4: PASS both files. Step 5: fault: make the switch call `setTeamRequiresContact`; the CONTROL fails; restore. Step 6: commit** `feat(seniors): Club tab adds a squad and switches jersey numbers on`.

---

### Task 5: Roster — the number on the tile, search, sort, inline edit, guest mark

**Files:**
- Modify: `src/components/PlayerAvatar.jsx` (prop `showJersey`), `src/screens/Roster.jsx`, `src/components/RosterTable.jsx`
- Test: `tests/roster-jersey.test.jsx` (create; scaffold from `tests/roster.test.jsx`)

**Interfaces:**
- Consumes: `guest_of` on rows from `listPlayers`; `listPlayerSquads`; `setPlayerJerseyNumber`; `sortByJersey`, `parseJerseyInput` from `src/lib/jersey.js`; `teams[].uses_jersey_numbers`.

- [ ] **Step 1: Failing tests.** With a squad `uses_jersey_numbers: true` and a player `jersey_num: 9`: the row's tile reads "9" and not the initials; a player with no number still shows initials (CONTROL); the search box with "9" keeps that row and drops the others; in the coach's grouped view the numbered players come first ascending. With `uses_jersey_numbers: false` the same fixtures render initials and "9" in the search matches nothing (CONTROL that the flag gates everything). A guest row (`guest_of: 'team-1xv'`, home `team-u18b`) shows "from U18B" to a coach and not to a parent (CONTROL). Inline edit: a coach types 10 into the number field and `setPlayerJerseyNumber` is called with `('p1', 10)`; typing 9 when the mock rejects with the clash sentence shows that sentence in the row.

- [ ] **Step 2: FAIL. Step 3: Implement.** `PlayerAvatar`: new prop `showJersey = false`; when `showJersey && isJerseyNumber(player?.jersey_num)` render `player.jersey_num` in the monogram branch (photo branch unchanged — a number over a photo is a different design decision, not made here). `Roster.jsx`: `showJersey = selectedTeam?.uses_jersey_numbers === true`; `matchesQuery` gains `showJersey && player.jersey_num != null ? String(player.jersey_num) : null` in the haystack; pass `sortPlayers: showJersey ? sortByJersey : undefined` to `buildRosterGroups`; guest mark: for staff, after loading players call `listPlayerSquads` is NOT needed — `guest_of` is on the row and `teamsById.get(player.team_id)?.name` is the home squad, so the mark is `from {homeSquadName}` rendered as a small muted span after the name when `player.guest_of` is set and `canEditAnything`. `RosterTable.jsx`: a "No." column (hidden via `hiddenColumns` when the squad does not use numbers), an inline `<input inputMode="numeric" aria-label={\`Jersey number for ${player.full_name}\`}>` for staff using the existing `save(player, field, value)` path with `field === 'jersey_num'` routed to `setPlayerJerseyNumber(player.id, parseJerseyInput(value))` and `undefined` refused with the 1–99 sentence before any request.

- [ ] **Step 4: PASS `tests/roster-jersey.test.jsx tests/roster.test.jsx tests/rosterTable.test.jsx tests/roster-coach-view.test.jsx tests/minis-roster.test.jsx`.** Step 5: fault: make `showJersey` always true; the two CONTROL cases fail; restore. Also run `node harness/check-overflow.mjs` if it exists and the `jerseyAnywhere` probes: `npm run shoot:roster` is NOT run (it needs Playwright); instead grep the harness stubs to confirm no stub team sets `uses_jersey_numbers`, and say so. **Step 6: commit** `feat(seniors): the roster shows, sorts, searches and edits jersey numbers where a squad uses them; guests marked for staff`.

---

### Task 6: Adult sign-up path

**Files:**
- Modify: `src/components/SignupWizard.jsx`, `src/components/PlayerRegistrationForm.jsx`
- Test: `tests/signup-adult-path.test.jsx` (create; scaffold from `tests/parent-self-registration.test.jsx`)

**Interfaces:**
- Consumes: `list_signup_squads` already returns `is_senior`; `ageGradeCheck` returns "no band" for a senior squad name; `row.selfRegister` in `PlayerRegistrationForm`.

- [ ] **Step 1: Failing tests.** In the wizard with "I play here myself" ticked alone: the squad list in the player row puts senior squads (`is_senior: true`) FIRST, then youth squads in `sort_order`; the row's heading and helper copy contain no "child" or "your child" (CONTROL: with "I have a child playing here" ticked, the copy does say "your child" and youth squads come first). Choosing a senior squad hides the "This player is me / my child" segmented control (a senior squad can only be self) and writes `self_register: true` into the collected row.

- [ ] **Step 2: FAIL. Step 3: Implement.** `PlayerRegistrationForm`: a `sortedTeams` that, when `row.selfRegister` (or `defaultSelfRegister`) is true, stable-partitions `is_senior` first; when the selected team `is_senior`, force `selfRegister: true` and hide the self/child control with a one-line note "Senior squads are for players registering themselves."; copy switches: where the form says "your child" use a `who` string = `row.selfRegister ? 'you' : 'your child'`. `SignupWizard`: pass `defaultSelfRegister={answers.self && !answers.child}` (check the existing prop name at the `<PlayerRegistrationForm` call, ~line 165). ⚠️ NOTHING SERVER-SIDE CHANGES: `apply_signup_intent` already writes a `player` membership when `self_register` is true and the squad allows it, and `register_my_player` already reads `is_senior` for the role. The age gate for U13+ self-registration is unchanged.

- [ ] **Step 4: PASS the new file plus `tests/parent-self-registration.test.jsx tests/signup-intent.test.js tests/roll-call.test.jsx`.** Step 5: fault: remove the partition; the "seniors first" assertion fails; restore. **Step 6: commit** `feat(seniors): an adult registering themselves sees senior squads first and no parent wording`.

---

### Task 7: Docs, gates, pull request

**Files:**
- Modify: `claude/changelog.md`, `RESTORE.md`, `claude/plans/2026-09-02-senior-squads.md` (a "2a BUILT" line under Order of work), this plan's status line.

- [ ] **Step 1: Changelog** — top of `## 3 Sep 2026` (create the heading if the day is new), no SHA; cite the previous merge's squash SHA on the entry that could not cite itself (read `git log origin/main -1`). Say: senior squads can be created from the Club tab; jersey numbers per squad, unique 1–99, shown/sorted/searched/edited on the roster where a squad uses them; a player with a membership in a second squad appears on that roster too (`can_see_player`); adult sign-up orders senior squads first; migration applied live with Jay's yes; harness green; youth squads unchanged and the `jerseyAnywhere` probes unaffected.
- [ ] **Step 2: RESTORE.md** — the "The club does not use jersey numbers" paragraph becomes: youth squads do not; a squad with `uses_jersey_numbers` does, since 3 Sep 2026; `players.jersey_num` is the season number in the home squad; the August ruling is narrowed, not reversed, and `claude/plans/2026-09-02-senior-squads.md` has the tombstone.
- [ ] **Step 3: Gates** — `npm run docs:check`, `npm run lint`, `npm test`, `npm run db:check` (one pre-existing red allowed: `photo-orphans.sql`).
- [ ] **Step 4: Commit, push, PR** (do not merge). PR body: what, proof, the migration note, the RLS widening stated in one plain sentence, and what is NOT in 2a (shirt numbers on the sheet, call-ups, overview, stats, registration numbers).

---

## Self-review

**Spec coverage (Part 2 of the senior-squads spec):** Data — `uses_jersey_numbers` (T1), `jersey_num` unique per squad (T1), second membership permitted (already true; read path fixed in T1/T3). Adult sign-up (T6). Roster: tile, sort, search, inline edit with clash naming the holder, guest mark for staff (T5). Availability/chat/notices/push: no code change needed (audience is membership-based); `listPlayers` change (T3) is what makes the guest appear in Squad Hub, Availability and Lineup, since all three call it. NOT in 2a and named as such: `lineup_players.shirt_number`, publish-to-chat, senior captain powers via `can_edit_team`, season record, Senior Section overview, stats, registration numbers, call-ups.

**Placeholders:** none. Every SQL, JS and test step carries its content or its exact command.

**Type consistency:** `jersey_num` is an integer in the DB (`players.jersey_num integer`, CHECK 1–99), a number in `setPlayerJerseyNumber` and `sortByJersey`, and a string only inside the inline input, converted by `parseJerseyInput`. `guest_of` is a team id string or null and is produced only by `listPlayers`. `createTeam` parameter names match the RPC's `p_*` names exactly.

**Risks named:** the partial unique index creation on live is safe today because no player carries a number (measured 2 Sep). `can_see_player` is strictly wider than the old predicate; the harness's STEP 5 control proves it does not leak an A player to a B coach without a B membership.
