# Marking a player as left — implementation plan

**STATUS: BUILT — pull request pending, 2 Sep 2026.** Both migrations applied
to live 2 Sep 2026 on Jay's explicit go-ahead; harness
`db/tests/player-leavers.sql` green against live. Deviations from the spec:

- **`register_my_player` / `apply_signup_intent` UNCHANGED on purpose**
  (decided in this task). Their duplicate check still sees leavers, so a
  returning child is refused with "ask the club to connect you" — the cue for
  Restore. Skipping leavers here would create a second row for the same child.
- **A second migration was needed.** `db/migrations/20260902_player_leavers_left_grants_nothing.sql`
  — the harness's step 12 found `private.is_own_player` and
  `private.is_attached_to_team` were the only two membership predicates
  testing neither `status` nor `left_at`, so a `'left'` row (now possible)
  passed both. Both gained `AND status <> 'left'` — not `= 'active'`, so a
  `'pending'` row is unaffected. This corrects the spec's §1 claim that
  "every predicate tests `status = 'active'`".
- **The `invite_parent` leaver guard sits AFTER the `may_edit` authorisation
  check**, not before — the first version checked it first, letting an
  unauthorised caller learn a player's leaver status from the error message
  before being told they cannot invite anyone. Fixed same-session, `9bd5276`.
- **The harness's own impersonation bug**: fixture ids must be resolved into
  plpgsql variables (the `fx` temp table) *before* `set role authenticated` —
  the impersonated role has no grant on a temp table owned by this
  connection's role, so reading `fx` after switching role fails 42501.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `claude/specs/2026-09-02-player-leavers-design.md`. Read it first;
this plan does not restate the reasoning.

**Goal:** Squad staff can mark a child who has quit as *left* — off the roster,
selection and pushes, parents' squad access ended, photo removed — with every
attendance and selection record kept and an admin or squad staff able to
restore them.

**Architecture:** Two nullable columns on `players` (`left_at`, `left_by`) and a
third membership status `'left'` that every existing `status = 'active'` check
already treats as no access. One `security definer` RPC does the marking and
its twin does the restoring. The shared `listPlayers` loader hides leavers by
default and history screens opt in. Screens only decide what to show; the
database decides who may act.

**Tech Stack:** Postgres 17 on Supabase (RLS, `security definer` SQL functions),
Vite + React 18, Vitest + Testing Library, the rolled-back SQL harness runner
`npm run db:check`.

## Global constraints

- ⚠️ **Every name in a fixture, test, comment or migration is INVENTED.** This
  repo is public and its members are mostly children (`CLAUDE.md` rule 9).
- **Never `git add -A`.** Stage the exact paths each commit step names.
- **Feedback loop:** `npm run test:related -- <file>` while editing; the full
  `npm test` only before the pull request. `npm run db:check -- player-leavers`
  proves *your* harness; the bare `npm run db:check` proves *what you broke*.
  Run the bare form before the PR.
- **Capture live function bodies before editing them** (Task 1). The migration
  that created a function is its OLDEST version; editing from it silently
  reverts later ones. Read the current body with `pg_get_functiondef` first.
- **The migration is applied to live only on Jay's explicit go-ahead**, via the
  Supabase MCP `apply_migration` or the SQL editor. `main` is production; a
  push to it needs his yes too. This plan stops at a pull request.
- **Copy is fixed by the spec §5.** Button labels: `Mark as left`,
  `Yes, mark as left`, `Keep them`, `Restore`, `Delete`. Roster group label:
  `Left the squad`. Admin list heading: `Left this season`. Tag on a historic
  name: `Left`.
- `deletePlayerPhoto` is best-effort and never surfaces to the user
  (`src/data/players.js` comments above `deletePlayer`). Same here.

## File structure

| File | Responsibility |
|---|---|
| `db/tests/player-leavers.sql` (new) | Rolled-back harness. Written FIRST, watched failing. |
| `db/migrations/20260902_player_leavers.sql` (new) | Columns, both CHECKs widened, `mark_player_left`, `restore_player`, leaver conditions in `claim_roster_access` and `invite_parent`. |
| `db/schema/tables.sql`, `functions.sql`, `grants.sql` | Re-captured from live after apply. Not hand-edited. |
| `src/data/players.js` | `listPlayers({ includeLeft })`, `markPlayerLeft(id)`, `restorePlayer(id)`. |
| `harness/stubs/players.js` | Stub mirrors of the two new exports (a stubs test enforces this). |
| `src/lib/leavers.js` (new) | `isLeaver(player)`, `leaverName(player)`, `isLeftOnly(memberships)`. Pure, tested alone. |
| `src/screens/PlayerDetail.jsx` | Footer: Mark as left / Delete / Restore; "Left on" line; read-only when a leaver. |
| `src/screens/Roster.jsx` | Loads leavers for staff, "Left the squad" group, leaver openable in detail. |
| `src/screens/MatchSheet.jsx`, `src/screens/GameTime.jsx` | `includeLeft: true`, names tagged. |
| `src/screens/AdminClub.jsx` | "Left this season" list with Restore. |
| `src/screens/Accounts.jsx` | A `'left'` membership is neither active nor pending. |
| `src/lib/memberships.jsx` (or wherever `isPendingOnly` gates the shell) | A profile whose only rows are `'left'` gets the no-access screen. |
| Tests | `tests/data.test.js`, `tests/leavers.test.js` (new), `tests/player-form.test.jsx`, `tests/roster-coach-view.test.jsx`, `tests/match-sheet-leavers.test.jsx` (new), `tests/admin-club-leavers.test.jsx` (new), `tests/accounts.test.jsx`, `tests/harness-stubs.test.js` (exists, will fail until stubs mirror). |

---

### Task 1: Database — harness first, then the migration

**Files:**
- Create: `db/tests/player-leavers.sql`
- Create: `db/migrations/20260902_player_leavers.sql`
- Re-capture after apply: `db/schema/tables.sql`, `db/schema/functions.sql`, `db/schema/grants.sql`

**Interfaces:**
- Produces: `public.mark_player_left(p_player_id uuid) returns table (id uuid, photo_path text)` — the OLD photo path, after the row's `photo_path`, `photo_focus_x`, `photo_focus_y` are nulled.
- Produces: `public.restore_player(p_player_id uuid) returns public.players`.
- Produces: `players.left_at timestamptz null`, `players.left_by uuid null`.
- Produces: membership status `'left'` accepted by `memberships_status_check` and `invites_grant_status_check`.

⚠️ **Deviation from spec §3, decided here and to be written back into the spec
in Task 8:** `register_my_player` and `apply_signup_intent` are **NOT** changed.
Their duplicate-name check deliberately still sees leavers, so a returning
child who re-registers is refused with the existing message *"ask the club to
connect you to them rather than adding them again"* — which is exactly the
prompt for staff to press **Restore**. Skipping leavers there would create a
second row for the same child. Step 9 of the harness proves the refusal.

- [ ] **Step 1: Write the harness, watch it fail**

```sql
-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — player leavers: players.left_at, membership status 'left',
--  mark_player_left / restore_player
--  Paste into the Supabase SQL editor, or run `npm run db:check -- player-leavers`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260902_player_leavers.sql. Written BEFORE the
-- migration is applied (it fails until it is — that is the point).
-- Spec: claude/specs/2026-09-02-player-leavers-design.md
--
-- ⚠️ EVERY NAME BELOW IS INVENTED. This repo is PUBLIC and its members are
-- mostly children.
--
-- Fixture, all created here and rolled back:
--   squad      U16B (must exist with a club_id; nothing else about it is read)
--   children   Rafiq Delacroix-Obi (will leave), Tomasz Delacroix-Obi (stays)
--   parent     one auth user, two ACTIVE parent memberships, one per child
--   staff      a coach of U16B (may mark), a coach of another squad (may not)
--   stranger   a fresh auth user sharing the family's contact email, for the
--              claim_roster_access control

begin;

-- ── STEP 0 — CONTROL: the probe can see a column that certainly exists ─────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='players' and column_name='full_name') then
    raise exception 'CONTROL FAILED: cannot see players.full_name. The probe is broken; every result below is meaningless.';
  end if;
end $$;

-- ── STEP 1 — columns exist, nullable ──────────────────────────────────────
do $$
declare col record;
begin
  select data_type, is_nullable into col from information_schema.columns
   where table_schema='public' and table_name='players' and column_name='left_at';
  if col is null then raise exception 'players.left_at is MISSING'; end if;
  if col.data_type <> 'timestamp with time zone' then raise exception 'players.left_at is %, expected timestamptz', col.data_type; end if;
  if col.is_nullable <> 'YES' then raise exception 'players.left_at must be NULLABLE (null = current player)'; end if;

  select data_type, is_nullable into col from information_schema.columns
   where table_schema='public' and table_name='players' and column_name='left_by';
  if col is null then raise exception 'players.left_by is MISSING'; end if;
  if col.data_type <> 'uuid' then raise exception 'players.left_by is %, expected uuid', col.data_type; end if;
end $$;

-- ── STEP 2 — both status CHECKs accept 'left' ─────────────────────────────
-- ⚠️ THE MIRROR: tables.sql says invites_grant_status_check MIRRORS
-- memberships_status_check on purpose, and an invite is BURNT if they disagree.
do $$
declare q text;
begin
  select pg_get_constraintdef(oid) into q from pg_constraint where conname='memberships_status_check';
  if q is null or q not like '%left%' then raise exception 'memberships_status_check does not accept ''left'': %', q; end if;
  select pg_get_constraintdef(oid) into q from pg_constraint where conname='invites_grant_status_check';
  if q is null or q not like '%left%' then raise exception 'invites_grant_status_check does not mirror ''left'': %', q; end if;
end $$;

-- ── FIXTURE ──────────────────────────────────────────────────────────────
create temp table fx (k text primary key, v uuid);
insert into fx select 'team', t.id from public.teams t where t.name='U16B';
insert into fx select 'club', t.club_id from public.teams t where t.name='U16B';
insert into fx select 'other_team', t.id from public.teams t
  where t.id <> (select v from fx where k='team') order by t.name limit 1;
do $$ begin
  if (select count(*) from fx) <> 3 then
    raise exception 'FIXTURE: need squad U16B and one other squad. Every zero below would be free.';
  end if;
end $$;

insert into fx select 'parent', '00000000-aaaa-0000-0000-000000000001'::uuid;
insert into fx select 'coach',  '00000000-aaaa-0000-0000-000000000002'::uuid;
insert into fx select 'other_coach', '00000000-aaaa-0000-0000-000000000003'::uuid;
insert into fx select 'stranger', '00000000-aaaa-0000-0000-000000000004'::uuid;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       k || '-leavers@example.invalid', now(), jsonb_build_object('full_name', k), now(), now()
  from fx where k in ('parent','coach','other_coach','stranger');

insert into public.players (id, club_id, team_id, full_name, first_name, last_name, photo_path)
values ('00000000-bbbb-0000-0000-000000000001', (select v from fx where k='club'), (select v from fx where k='team'),
        'Rafiq Delacroix-Obi', 'Rafiq', 'Delacroix-Obi', '00000000-bbbb-0000-0000-000000000001/1.jpg'),
       ('00000000-bbbb-0000-0000-000000000002', (select v from fx where k='club'), (select v from fx where k='team'),
        'Tomasz Delacroix-Obi', 'Tomasz', 'Delacroix-Obi', null);

-- Both children carry the family address; the stranger will sign in with it.
insert into public.player_contacts (player_id, email)
values ('00000000-bbbb-0000-0000-000000000001', 'stranger-leavers@example.invalid'),
       ('00000000-bbbb-0000-0000-000000000002', 'stranger-leavers@example.invalid');

insert into public.memberships (profile_id, club_id, team_id, role, player_id, status) values
  ((select v from fx where k='parent'), (select v from fx where k='club'), (select v from fx where k='team'), 'parent', '00000000-bbbb-0000-0000-000000000001', 'active'),
  ((select v from fx where k='parent'), (select v from fx where k='club'), (select v from fx where k='team'), 'parent', '00000000-bbbb-0000-0000-000000000002', 'active'),
  ((select v from fx where k='coach'),  (select v from fx where k='club'), (select v from fx where k='team'), 'coach', null, 'active'),
  ((select v from fx where k='other_coach'), (select v from fx where k='club'), (select v from fx where k='other_team'), 'coach', null, 'active');

create or replace function pg_temp.act_as(who text) returns void language plpgsql as $$
declare u uuid; begin
  select v into u from fx where k = who;
  perform set_config('request.jwt.claims',
    json_build_object('sub', u, 'role', 'authenticated', 'email', who || '-leavers@example.invalid')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.act_as_owner() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;

-- ── STEP 3 — a coach of ANOTHER squad is refused ──────────────────────────
do $$ begin
  perform pg_temp.act_as('other_coach');
  begin
    perform public.mark_player_left('00000000-bbbb-0000-0000-000000000001');
    raise exception 'SELF-TEST FAILED: a coach of another squad marked the player as left';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then raise; end if;
    raise notice 'other-squad coach refused: %', sqlerrm;
  end;
  perform pg_temp.act_as_owner();
end $$;

-- ── STEP 4 — a PARENT is refused ──────────────────────────────────────────
do $$ begin
  perform pg_temp.act_as('parent');
  begin
    perform public.mark_player_left('00000000-bbbb-0000-0000-000000000001');
    raise exception 'SELF-TEST FAILED: a parent marked their own child as left';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then raise; end if;
    raise notice 'parent refused: %', sqlerrm;
  end;
  perform pg_temp.act_as_owner();
end $$;

-- ── STEP 5 — the squad's coach CAN, and it returns the old photo path ─────
do $$ declare r record; begin
  perform pg_temp.act_as('coach');
  select * into r from public.mark_player_left('00000000-bbbb-0000-0000-000000000001');
  perform pg_temp.act_as_owner();
  if r.photo_path <> '00000000-bbbb-0000-0000-000000000001/1.jpg' then
    raise exception 'mark_player_left returned photo_path %, expected the old path', r.photo_path;
  end if;
  if (select left_at from public.players where id='00000000-bbbb-0000-0000-000000000001') is null then
    raise exception 'left_at not set'; end if;
  if (select left_by from public.players where id='00000000-bbbb-0000-0000-000000000001') <> (select v from fx where k='coach') then
    raise exception 'left_by is not the coach'; end if;
  if (select photo_path from public.players where id='00000000-bbbb-0000-0000-000000000001') is not null then
    raise exception 'photo_path not cleared on the row'; end if;
end $$;

-- ── STEP 6 — THE DISCRIMINATING FIXTURE: this child's membership is 'left',
--            the SIBLING's on the same squad is still 'active' ────────────
do $$ begin
  if (select status from public.memberships where player_id='00000000-bbbb-0000-0000-000000000001') <> 'left' then
    raise exception 'leaver''s parent membership is not ''left'''; end if;
  if (select status from public.memberships where player_id='00000000-bbbb-0000-0000-000000000002') <> 'active' then
    raise exception 'SIBLING''s membership was touched — the function is too broad'; end if;
end $$;

-- ── STEP 7 — marking twice is refused with a clear message ────────────────
do $$ begin
  perform pg_temp.act_as('coach');
  begin
    perform public.mark_player_left('00000000-bbbb-0000-0000-000000000001');
    raise exception 'SELF-TEST FAILED: marked twice';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then raise; end if;
    if sqlerrm not ilike '%already%' then raise exception 'wrong message on double mark: %', sqlerrm; end if;
  end;
  perform pg_temp.act_as_owner();
end $$;

-- ── STEP 8 — claim_roster_access SKIPS the leaver, WITH A CONTROL ─────────
-- The stranger shares the family address. The re-match must raise a pending
-- row for Tomasz (current) and NOTHING for Rafiq (left).
do $$ declare n_left int; n_current int; begin
  perform pg_temp.act_as('stranger');
  perform public.claim_roster_access();
  perform pg_temp.act_as_owner();
  select count(*) into n_left from public.memberships
   where profile_id=(select v from fx where k='stranger') and player_id='00000000-bbbb-0000-0000-000000000001';
  select count(*) into n_current from public.memberships
   where profile_id=(select v from fx where k='stranger') and player_id='00000000-bbbb-0000-0000-000000000002';
  if n_current <> 1 then raise exception 'CONTROL FAILED: the re-match did not create a pending row for the CURRENT child (got %) — the probe proves nothing', n_current; end if;
  if n_left <> 0 then raise exception 'claim_roster_access re-matched a LEAVER (% rows)', n_left; end if;
end $$;

-- ── STEP 9 — register_my_player still sees the leaver as a duplicate ──────
-- DELIBERATE (plan Task 1): a returning child is told to ask the club, which
-- is the cue for Restore. A second row for the same child is the bug.
do $$ begin
  perform pg_temp.act_as('stranger');
  begin
    perform public.register_my_player(
      p_team_id => (select v from fx where k='team'),
      p_first_name => 'Rafiq', p_last_name => 'Delacroix-Obi',
      p_confirm_duplicate => false);
    raise exception 'SELF-TEST FAILED: a leaver''s name re-registered as a NEW row';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then raise; end if;
    if sqlstate <> '42710' then raise exception 'expected duplicate refusal 42710, got % %', sqlstate, sqlerrm; end if;
  end;
  perform pg_temp.act_as_owner();
end $$;
-- ⚠️ If register_my_player's parameter names differ, read them with
--   select pg_get_function_arguments('public.register_my_player'::regproc);
-- and fix THIS call — do not skip the step.

-- ── STEP 10 — invite_parent refuses a leaver ──────────────────────────────
do $$ declare pr uuid; begin
  insert into public.player_parents (player_id, full_name, email)
  values ('00000000-bbbb-0000-0000-000000000001', 'Nadia Delacroix-Obi', 'nadia-leavers@example.invalid')
  returning id into pr;
  perform pg_temp.act_as('coach');
  begin
    perform public.invite_parent(pr);
    raise exception 'SELF-TEST FAILED: invited a parent to a leaver';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then raise; end if;
    if sqlerrm not ilike '%left%' then raise exception 'wrong message: %', sqlerrm; end if;
  end;
  perform pg_temp.act_as_owner();
end $$;
-- ⚠️ If player_parents has other NOT NULL columns, add them; read with
--   \d public.player_parents  (or information_schema.columns).

-- ── STEP 11 — restore: left_at cleared, memberships active again ──────────
do $$ begin
  perform pg_temp.act_as('coach');
  perform public.restore_player('00000000-bbbb-0000-0000-000000000001');
  perform pg_temp.act_as_owner();
  if (select left_at from public.players where id='00000000-bbbb-0000-0000-000000000001') is not null then
    raise exception 'restore did not clear left_at'; end if;
  if (select status from public.memberships where player_id='00000000-bbbb-0000-0000-000000000001'
        and profile_id=(select v from fx where k='parent')) <> 'active' then
    raise exception 'restore did not reactivate the parent membership'; end if;
end $$;

-- ── STEP 12 — a 'left' membership grants NOTHING (sanity on the mechanism) ─
-- Mark again, then read players as the parent: they must not see the squad
-- through the left row. Their SIBLING row is still active so they still see
-- U16B — so the assertion is on the DM predicate, which is per membership.
do $$ declare ok boolean; begin
  perform pg_temp.act_as('coach');
  perform public.mark_player_left('00000000-bbbb-0000-0000-000000000001');
  perform pg_temp.act_as_owner();
  update public.memberships set status='left' where player_id='00000000-bbbb-0000-0000-000000000002'; -- both rows now 'left'
  perform pg_temp.act_as('parent');
  select count(*) = 0 into ok from public.players where team_id=(select v from fx where k='team');
  perform pg_temp.act_as_owner();
  if not ok then raise exception 'a parent whose memberships are all ''left'' can still read the squad'; end if;
end $$;

raise notice 'player-leavers: all steps passed';
rollback;
```

Run: `npm run db:check -- player-leavers`
Expected: FAIL at STEP 1 with `players.left_at is MISSING`.

⚠️ If it fails at STEP 0, or with a syntax error, fix the harness — a harness
that fails for the wrong reason proves nothing.

- [ ] **Step 2: Capture the two live function bodies you will edit**

Through the Supabase MCP `execute_sql` (read-only), or the SQL editor:

```sql
select pg_get_functiondef('public.claim_roster_access()'::regprocedure);
select pg_get_functiondef('public.invite_parent(uuid)'::regprocedure);
```

Paste each result verbatim into the migration below where marked, then make
the one-line edits. ⚠️ Do NOT copy from `db/schema/functions.sql` or from an
older migration — they lag live (`is_team_staff` is not even in the capture).

- [ ] **Step 3: Write the migration**

```sql
-- ══════════════════════════════════════════════════════════════════════════
--  players.left_at / left_by, membership status 'left',
--  mark_player_left() and restore_player()
-- ══════════════════════════════════════════════════════════════════════════
--
-- Spec:    claude/specs/2026-09-02-player-leavers-design.md
-- Plan:    claude/plans/2026-09-02-player-leavers-implementation.md
-- Harness: db/tests/player-leavers.sql (written FIRST and watched failing)
--
-- WHAT IT IS FOR. A child quits. Until now the only tool was Delete, which
-- erases attendance and selection history, leaves the parent's membership
-- ACTIVE with a blank player link, strands the photo, and is refused outright
-- for any child with a linked parent (memberships_family_role_needs_player) or
-- a past invite (invites.player_id has no ON DELETE rule). Jay ruled: keep the
-- history. Leaving is never a delete.
--
-- ⚠️ 'left' IS A STATUS AND NOT A DELETE OF THE MEMBERSHIP ROW. Every predicate
-- in this schema tests status = 'active' (122 sites, measured 2 Sep 2026;
-- none test <> 'pending'), so a 'left' row grants exactly nothing. Keeping it
-- is what makes restore_player work without a sign-in or an approval — since
-- 14 Aug the re-match only makes people PENDING.
--
-- ⚠️ invites_grant_status_check MIRRORS memberships_status_check ON PURPOSE
-- (tables.sql). Widen both or an accepted invite is burnt half way through.
--
-- ⚠️ NOTHING IS BACKFILLED. Every existing player is current.

alter table public.players
  add column if not exists left_at timestamptz,
  add column if not exists left_by uuid references public.profiles(id) on delete set null;

comment on column public.players.left_at is 'When the player was marked as left. NULL = current player. Never a delete.';
comment on column public.players.left_by is 'Who marked the player as left.';

alter table public.memberships drop constraint if exists memberships_status_check;
alter table public.memberships add constraint memberships_status_check
  check (status = any (array['pending'::text, 'active'::text, 'left'::text]));

alter table public.invites drop constraint if exists invites_grant_status_check;
alter table public.invites add constraint invites_grant_status_check
  check (grant_status = any (array['active'::text, 'pending'::text, 'left'::text]));

-- ── mark_player_left ──────────────────────────────────────────────────────
-- Same predicate as the "player edit" policy: can_write_child() OR
-- is_team_staff(team). The screen never decides who may do this.
-- Returns the OLD photo path so the client can remove the storage object;
-- the row's photo columns are cleared here. Storage cannot be reached from
-- SQL (RESTORE.md), so the object is the client's job, best-effort.
create or replace function public.mark_player_left(p_player_id uuid)
returns table (id uuid, photo_path text)
language plpgsql security definer set search_path to 'public' as $$
declare
  ply public.players%rowtype;
begin
  select * into ply from public.players p where p.id = p_player_id;
  if ply.id is null then
    raise exception 'That player no longer exists.' using errcode = '22023';
  end if;
  if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
  end if;
  if ply.left_at is not null then
    raise exception 'This player has already been marked as left.' using errcode = '22023';
  end if;

  update public.players p
     set left_at = now(), left_by = auth.uid(),
         photo_path = null, photo_focus_x = null, photo_focus_y = null
   where p.id = p_player_id;

  -- Only THIS child's family rows. A parent with two children in the squad
  -- has two rows, one per player_id; the sibling's is untouched.
  update public.memberships m
     set status = 'left'
   where m.player_id = p_player_id
     and m.role in ('parent','player')
     and m.status in ('active','pending');

  return query select ply.id, ply.photo_path;
end $$;
revoke all on function public.mark_player_left(uuid) from public, anon;
grant execute on function public.mark_player_left(uuid) to authenticated;

-- ── restore_player ────────────────────────────────────────────────────────
create or replace function public.restore_player(p_player_id uuid)
returns public.players
language plpgsql security definer set search_path to 'public' as $$
declare
  ply public.players%rowtype;
begin
  select * into ply from public.players p where p.id = p_player_id;
  if ply.id is null then
    raise exception 'That player no longer exists.' using errcode = '22023';
  end if;
  if not (private.can_write_child() or private.is_team_staff(ply.team_id)) then
    raise exception 'You are not allowed to change this player.' using errcode = '42501';
  end if;
  if ply.left_at is null then
    raise exception 'This player has not been marked as left.' using errcode = '22023';
  end if;

  update public.players p set left_at = null, left_by = null where p.id = p_player_id;
  update public.memberships m set status = 'active'
   where m.player_id = p_player_id and m.role in ('parent','player') and m.status = 'left';

  select * into ply from public.players p where p.id = p_player_id;
  return ply;
end $$;
revoke all on function public.restore_player(uuid) from public, anon;
grant execute on function public.restore_player(uuid) to authenticated;

-- ── claim_roster_access: skip leavers ─────────────────────────────────────
-- ⚠️ PASTE THE LIVE BODY FROM pg_get_functiondef HERE (plan Task 1 step 2),
-- then add ONE condition to the where clause:
--
--   where lower(btrim(c.email)) = lower(btrim(caller_email))
--     and p.left_at is null            -- ← the only change
--
-- Without it a leaver's parent signing in raises an approval request for a
-- child who has left, and squad staff have to notice and decline it.

-- <live body of public.claim_roster_access(), edited as above>

-- ── invite_parent: refuse a leaver ────────────────────────────────────────
-- ⚠️ PASTE THE LIVE BODY HERE, then directly after the existing
--   if ply.id is null then raise exception 'That contact is not attached to a player.' ...
-- add:
--
--   if ply.left_at is not null then
--     raise exception 'That player has left the squad, so nobody can be invited to them.' using errcode = '22023';
--   end if;

-- <live body of public.invite_parent(uuid), edited as above>

-- register_my_player and private.apply_signup_intent are DELIBERATELY
-- UNCHANGED: their duplicate check must keep seeing leavers so a returning
-- child is told to ask the club (→ Restore) rather than getting a second row.
-- Harness step 9 fails if a future edit changes this.
```

- [ ] **Step 4: Apply and prove — requires Jay's go-ahead**

Tell Jay the migration is ready and stop until he says yes. Then apply through
the Supabase MCP `apply_migration` (name `20260902_player_leavers`), and:

Run: `npm run db:check -- player-leavers`
Expected: `player-leavers: all steps passed`, then rollback.

Run: `npm run db:check`
Expected: every harness green, or exactly the ones `claude/open-items.md`
already lists as red — anything else is what you broke.

- [ ] **Step 5: Re-capture the schema**

Follow `RESTORE.md` §"db/schema" to re-capture `tables.sql`, `functions.sql`
and `grants.sql` from live. Inspect the diff: it must contain only the two
columns, the two constraints, the two new functions and the two edited ones.

- [ ] **Step 6: Commit**

```bash
git add db/tests/player-leavers.sql db/migrations/20260902_player_leavers.sql db/schema/tables.sql db/schema/functions.sql db/schema/grants.sql
git commit -m "feat(db): players.left_at, membership status 'left', mark_player_left/restore_player

Harness db/tests/player-leavers.sql written first and watched failing.
register_my_player is deliberately unchanged: a returning leaver is refused
as a duplicate, which is the cue for Restore (plan Task 1).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Data layer and harness stubs

**Files:**
- Modify: `src/data/players.js:22-59` (listPlayers), append two functions after `deletePlayer` (~L250)
- Modify: `harness/stubs/players.js` (append after `deletePlayer`, ~L150)
- Test: `tests/data.test.js`

**Interfaces:**
- Produces: `listPlayers({ teamIds, includeLeft = false })` — default hides rows with `left_at`.
- Produces: `markPlayerLeft(id) → Promise<void>` — RPC, then best-effort photo object delete.
- Produces: `restorePlayer(id) → Promise<players row>`.

- [ ] **Step 1: Failing tests**

Add to `tests/data.test.js` inside the existing `describe` for players (the
file already mocks `supabase` with `from`, `rpc`, and `deletePlayerPhotoMock`):

```js
describe('listPlayers and leavers', () => {
  it('hides leavers by default', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)
    await listPlayers({ teamIds: ['t-1'] })
    expect(calls).toContainEqual(['is', 'left_at', null])
  })

  it('includes leavers when asked', async () => {
    const { builder, calls } = createQueryBuilder({ data: [] })
    supabase.from.mockReturnValue(builder)
    await listPlayers({ teamIds: ['t-1'], includeLeft: true })
    expect(calls.find(([method]) => method === 'is')).toBeUndefined()
  })
})

describe('markPlayerLeft', () => {
  beforeEach(() => deletePlayerPhotoMock.mockClear())

  it('calls the RPC and then removes the returned photo object', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'p-1', photo_path: 'p-1/1.jpg' }], error: null })
    await markPlayerLeft('p-1')
    expect(supabase.rpc).toHaveBeenCalledWith('mark_player_left', { p_player_id: 'p-1' })
    expect(deletePlayerPhotoMock).toHaveBeenCalledWith('p-1/1.jpg')
  })

  it('does not touch storage when there was no photo', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'p-1', photo_path: null }], error: null })
    await markPlayerLeft('p-1')
    expect(deletePlayerPhotoMock).not.toHaveBeenCalled()
  })

  it('throws the RPC error and never touches storage', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('You are not allowed to change this player.') })
    await expect(markPlayerLeft('p-1')).rejects.toThrow(/not allowed/)
    expect(deletePlayerPhotoMock).not.toHaveBeenCalled()
  })
})

describe('restorePlayer', () => {
  it('calls the RPC and returns the row', async () => {
    supabase.rpc.mockResolvedValue({ data: { id: 'p-1', left_at: null }, error: null })
    await expect(restorePlayer('p-1')).resolves.toEqual({ id: 'p-1', left_at: null })
    expect(supabase.rpc).toHaveBeenCalledWith('restore_player', { p_player_id: 'p-1' })
  })
})
```

Add `markPlayerLeft, restorePlayer` to the existing import from
`../src/data/players.js` at the top of the file. ⚠️ Check how
`createQueryBuilder` in this file records calls — if it exposes a different
shape than `calls`, adapt the two `listPlayers` assertions to it; the
assertion is "an `.is('left_at', null)` filter is applied by default and not
with `includeLeft`".

Run: `npm run test:related -- src/data/players.js`
Expected: FAIL — `markPlayerLeft is not a function`, and the default filter
assertion fails.

- [ ] **Step 2: Implement**

In `src/data/players.js`, change the signature and `buildQuery`:

```js
export async function listPlayers({ teamIds, includeLeft = false } = {}) {
  if (Array.isArray(teamIds) && teamIds.length === 0) return []
  // ... existing comments unchanged ...
  const buildQuery = () => {
    let query = supabase.from('players').select('*')
    if (Array.isArray(teamIds) && teamIds.length > 0) {
      query = query.in('team_id', teamIds)
    }
    // ⚠️ LEAVERS ARE HIDDEN BY DEFAULT, HERE, FOR EVERY CALLER. Twelve screens
    // load players through this function; hiding at the query means none of
    // them can forget. History screens (MatchSheet, GameTime) and the roster's
    // staff-only "Left the squad" group pass includeLeft: true and tag the
    // name. Spec: claude/specs/2026-09-02-player-leavers-design.md §4.
    if (!includeLeft) query = query.is('left_at', null)
    return query
  }
  // ... rest unchanged ...
}
```

Append after `deletePlayer`:

```js
/**
 * Marks a player as LEFT — the club's answer to "the child quit". Never a
 * delete: attendance, selection and grades keep pointing at a real name.
 * The database (mark_player_left) decides who may do this — squad staff or a
 * child-write admin — and also flips this child's parent/player memberships
 * to 'left', which every access check treats as no access.
 *
 * ⚠️ ROW FIRST, OBJECT SECOND, exactly as deletePlayer: the RPC clears the
 * row's photo columns and hands back the old path; the storage object is
 * then removed best-effort. A refused RPC touches nothing.
 */
export async function markPlayerLeft(id) {
  const { data, error } = await supabase.rpc('mark_player_left', { p_player_id: id })
  if (error) throw error
  const photoPath = Array.isArray(data) ? data[0]?.photo_path : data?.photo_path
  if (photoPath) await deletePlayerPhoto(photoPath)
}

/** Undoes markPlayerLeft: clears left_at and reactivates the family's memberships. */
export async function restorePlayer(id) {
  const { data, error } = await supabase.rpc('restore_player', { p_player_id: id })
  if (error) throw error
  return data
}
```

Append to `harness/stubs/players.js`:

```js
export async function markPlayerLeft(id) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'rpc', fn: 'mark_player_left', id })
}

export async function restorePlayer(id) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'rpc', fn: 'restore_player', id })
  return { id, left_at: null, left_by: null }
}
```

- [ ] **Step 3: Run**

Run: `npm run test:related -- src/data/players.js harness/stubs/players.js`
Expected: PASS, including `tests/harness-stubs.test.js` (it fails if a stub
does not mirror an export).

- [ ] **Step 4: Commit**

```bash
git add src/data/players.js harness/stubs/players.js tests/data.test.js
git commit -m "feat(data): listPlayers hides leavers by default; markPlayerLeft, restorePlayer

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Pure helpers — `src/lib/leavers.js`

**Files:**
- Create: `src/lib/leavers.js`
- Test: `tests/leavers.test.js` (new)

**Interfaces:**
- Produces: `isLeaver(player) → boolean`, `leaverName(player) → string`,
  `isLeftOnly(memberships) → boolean`, `LEFT_TAG = 'Left'`.

- [ ] **Step 1: Failing tests**

```js
import { describe, it, expect } from 'vitest'
import { isLeaver, leaverName, isLeftOnly, LEFT_TAG } from '../src/lib/leavers.js'

describe('leavers helpers', () => {
  it('isLeaver is true only for a non-null left_at', () => {
    expect(isLeaver({ left_at: '2026-09-02T08:00:00Z' })).toBe(true)
    expect(isLeaver({ left_at: null })).toBe(false)
    expect(isLeaver({})).toBe(false)
    expect(isLeaver(null)).toBe(false)
  })

  it('leaverName tags a leaver and leaves a current player alone', () => {
    expect(leaverName({ full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z' })).toBe(`Rafiq Delacroix-Obi · ${LEFT_TAG}`)
    expect(leaverName({ full_name: 'Tomasz Delacroix-Obi', left_at: null })).toBe('Tomasz Delacroix-Obi')
  })

  it('isLeftOnly: every row left → true; any active or pending → false; none → false', () => {
    expect(isLeftOnly([{ status: 'left' }, { status: 'left' }])).toBe(true)
    expect(isLeftOnly([{ status: 'left' }, { status: 'pending' }])).toBe(false)
    expect(isLeftOnly([{ status: 'left' }, { status: 'active' }])).toBe(false)
    expect(isLeftOnly([])).toBe(false)
    expect(isLeftOnly(null)).toBe(false)
  })
})
```

Run: `npx vitest run tests/leavers.test.js`
Expected: FAIL — module not found.

- [ ] **Step 2: Implement**

```js
// Pure helpers for "this player has left" — spec
// claude/specs/2026-09-02-player-leavers-design.md. A leaver is a players row
// with a non-null left_at. Nothing here reads the network.

export const LEFT_TAG = 'Left'

export function isLeaver(player) {
  return Boolean(player?.left_at)
}

/** A historic team sheet must still read correctly, so a leaver's name carries a tag. */
export function leaverName(player) {
  const name = player?.full_name ?? ''
  return isLeaver(player) ? `${name} · ${LEFT_TAG}` : name
}

/**
 * True when a profile's ONLY memberships are 'left'. Such a person has no
 * squad and is not waiting for approval either — the shell must show them the
 * same "tell the club who you are" screen as somebody with no memberships,
 * not a blank app. Mirrors isPendingOnly in scope.js in shape.
 */
export function isLeftOnly(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) return false
  return memberships.every((m) => m?.status === 'left')
}
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run tests/leavers.test.js` — Expected: PASS.

```bash
git add src/lib/leavers.js tests/leavers.test.js
git commit -m "feat(lib): leavers helpers — isLeaver, leaverName, isLeftOnly

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: PlayerDetail — Mark as left, Delete for admins, Restore for leavers

**Files:**
- Modify: `src/screens/PlayerDetail.jsx:409-500` (FooterActions), `:501-601` (props), header `~:535-545`
- Modify: `src/screens/Roster.jsx:679-690` (pass `canDelete`), `~:627` (selected lookup — see Task 5)
- Test: `tests/player-form.test.jsx` (existing Delete tests change meaning)

**Interfaces:**
- Consumes: `markPlayerLeft`, `restorePlayer` (Task 2); `isLeaver` (Task 3);
  `canWriteChild(memberships)` from `src/lib/scope.js:431`.
- Produces: `PlayerDetail` props `canDelete = false`, `onLeft`, `onRestored`
  (both `(player) => void`, optional). `onDeleted` unchanged.

Behaviour matrix for the footer:

| Caller | Player | Buttons |
|---|---|---|
| squad staff (`canEdit`) | current | `Edit`, `Mark as left` |
| admin with child-write (`canEdit && canDelete`) | current | `Edit`, `Mark as left`, `Delete` |
| staff or admin | leaver | `Restore` only; header shows "Left <date>" |
| parent of the player | current | `Update details` (unchanged) |
| anyone else | any | nothing |

- [ ] **Step 1: Update and add tests**

In `tests/player-form.test.jsx`, the existing three Delete tests run as
`COACH_U14`. A coach no longer sees Delete. Change them:

```js
it('asks for confirmation before marking as left, and does nothing if cancelled', async () => {
  const user = await openDetail(COACH_U14)
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Delete' })).toBeNull()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as left' }))
  expect(markPlayerLeftMock).not.toHaveBeenCalled()
  expect(screen.getByText(/mark dhruv as left\?/i)).toBeInTheDocument()
  expect(screen.getByText(/attendance and match history are kept/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /keep them/i }))
  expect(markPlayerLeftMock).not.toHaveBeenCalled()
})

it('marks as left on confirmation and closes back to the roster', async () => {
  const user = await openDetail(COACH_U14)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as left' }))
  await user.click(screen.getByRole('button', { name: /yes, mark as left/i }))
  await waitFor(() => expect(markPlayerLeftMock).toHaveBeenCalledWith('p-1'))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('surfaces a refusal and leaves the player on screen', async () => {
  markPlayerLeftMock.mockRejectedValue(new Error('You are not allowed to change this player.'))
  const user = await openDetail(COACH_U14)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark as left' }))
  await user.click(screen.getByRole('button', { name: /yes, mark as left/i }))
  expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/not allowed/)
  expect(deletePlayerMock).not.toHaveBeenCalled()
})

it('an admin with child-write rights still gets Delete, and it still deletes', async () => {
  const user = await openDetail(ADMIN_SUPER)   // use the file's existing super-admin fixture name
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByRole('button', { name: 'Mark as left' })).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
  await user.click(screen.getByRole('button', { name: /yes, delete/i }))
  await waitFor(() => expect(deletePlayerMock).toHaveBeenCalledWith('p-1'))
})

it('a leaver is read-only with a Left line and a Restore button', async () => {
  listPlayersMock.mockResolvedValue([{ ...PLAYER_P1, left_at: '2026-09-02T08:00:00Z', left_by: 'pr-coach' }])
  const user = await openDetail(COACH_U14)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/left 2 sep 2026/i)).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull()
  expect(within(dialog).queryByRole('button', { name: 'Mark as left' })).toBeNull()
  await user.click(within(dialog).getByRole('button', { name: 'Restore' }))
  await waitFor(() => expect(restorePlayerMock).toHaveBeenCalledWith('p-1'))
})
```

Add `markPlayerLeftMock`, `restorePlayerMock` next to `deletePlayerMock`
(~L24) and wire them into the `vi.mock('../src/data/players.js', …)` factory
(~L74) as `markPlayerLeft: (...a) => markPlayerLeftMock(...a)` and
`restorePlayer: (...a) => restorePlayerMock(...a)`; reset them in the
`beforeEach` (~L182). ⚠️ `PLAYER_P1` and `ADMIN_SUPER` stand for whatever this
file already names its `p-1` fixture row and its super-admin membership
fixture — read the top of the file and use those names. If the leaver test
needs `listPlayersMock` to return the leaver, `openDetail` must load with
`includeLeft` (Task 5 makes Roster do that for staff) — write this test in
Task 5's step 1 instead if `openDetail` cannot reach a leaver yet.

Run: `npm run test:related -- src/screens/PlayerDetail.jsx`
Expected: FAIL — no `Mark as left` button.

- [ ] **Step 2: Implement FooterActions**

Replace the whole `FooterActions` function in `PlayerDetail.jsx`:

```jsx
import { deletePlayer, getPlayerContact, getPlayerDob, markPlayerLeft, restorePlayer } from '../data/players.js'
import { isLeaver } from '../lib/leavers.js'
// ... existing imports ...

// Footer actions (design-system.md §5.7). Since 2 Sep 2026 the staff pair is
// Edit + MARK AS LEFT, and Delete is ADMIN-ONLY (canDelete = canWriteChild):
// "the child quit" is a leaving, never a deletion — attendance and selection
// history stay, the parents' access to this squad ends, the photo goes.
// Spec: claude/specs/2026-09-02-player-leavers-design.md §5. Delete is kept
// for a duplicate registration, which is an admin's job. A LEAVER gets one
// action, Restore, and no Edit — the row is history until somebody brings it
// back. RLS and the two RPCs enforce all of this; getting it wrong here can
// only hide a control, never authorise a write.
function FooterActions({ player, canEdit, canEditOwn, canDelete, onEdit, onEditOwn, onDeleted, onLeft, onRestored }) {
  const [confirming, setConfirming] = useState(null) // null | 'left' | 'delete'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!canEdit && canEditOwn && !isLeaver(player)) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        <Button full onClick={() => onEditOwn?.(player)} className={FOOTER_BUTTON}>
          Update details
        </Button>
      </div>
    )
  }
  if (!canEdit) return null

  function run(action, after) {
    setBusy(true)
    setError(null)
    action(player.id)
      .then(() => after?.(player))
      .catch((err) => {
        setError(err)
        setBusy(false)
        setConfirming(null)
      })
  }

  const alert = error && (
    <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink">
      {error.message || "We couldn't change that player. Try again."}
    </p>
  )

  if (isLeaver(player)) {
    return (
      <div className="mt-5 border-t border-line pt-4">
        {alert}
        <Button full disabled={busy} onClick={() => run(restorePlayer, onRestored)} className={FOOTER_BUTTON}>
          {busy ? 'Restoring…' : 'Restore'}
        </Button>
      </div>
    )
  }

  const firstName = player.first_name || player.full_name
  return (
    <div className="mt-5 border-t border-line pt-4">
      {alert}
      {confirming === 'left' && (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">
            Mark {firstName} as left? They come off the squad list and selection, their parents&apos;
            access to this squad ends, and their photo is removed. Attendance and match history
            are kept. You or an admin can undo this from the roster.
          </p>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy} className={FOOTER_BUTTON}>Keep them</Button>
            <Button variant="danger" onClick={() => run(markPlayerLeft, onLeft)} disabled={busy} className={FOOTER_BUTTON}>
              {busy ? 'Marking…' : 'Yes, mark as left'}
            </Button>
          </div>
        </div>
      )}
      {confirming === 'delete' && (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">
            Delete this player? Their contact details go too, and this can&apos;t be undone. If they
            have simply left the club, use Mark as left instead.
          </p>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy} className={FOOTER_BUTTON}>Keep them</Button>
            <Button variant="danger" onClick={() => run(deletePlayer, onDeleted)} disabled={busy} className={FOOTER_BUTTON}>
              {busy ? 'Deleting…' : 'Yes, delete'}
            </Button>
          </div>
        </div>
      )}
      {confirming === null && (
        <div className="flex gap-2.5">
          <Button onClick={() => onEdit?.(player)} className={FOOTER_BUTTON}>Edit</Button>
          <Button variant="dangerQuiet" onClick={() => setConfirming('left')} className={FOOTER_BUTTON}>Mark as left</Button>
          {canDelete && (
            <Button variant="dangerQuiet" onClick={() => setConfirming('delete')} className={FOOTER_BUTTON}>Delete</Button>
          )}
        </div>
      )}
    </div>
  )
}
```

In the `PlayerDetail` component: add props `canDelete = false, onLeft, onRestored`
and pass them to `<FooterActions … canDelete={canDelete} onLeft={onLeft} onRestored={onRestored} />`.
In the header, directly under `<p …>{teamName}</p>`, add:

```jsx
{isLeaver(player) && (
  <p className="mt-1 text-sm font-semibold text-white/[.85]">
    Left {new Date(player.left_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
  </p>
)}
```

In `Roster.jsx` where `<PlayerDetail …>` is rendered (search `canEdit={canEditSelected}`), add:

```jsx
canDelete={canWriteChild(memberships)}
onLeft={() => { setSelectedPlayerId(null); refresh() }}
onRestored={() => { setSelectedPlayerId(null); refresh() }}
```

and import `canWriteChild` from `'../lib/scope.js'` alongside the existing
scope imports. ⚠️ Every other place that renders `<PlayerDetail>` (grep
`<PlayerDetail` in `src/`) keeps working with the defaults — `canDelete`
false means staff there see Mark as left and no Delete, which is the intent.

- [ ] **Step 3: Run**

Run: `npm run test:related -- src/screens/PlayerDetail.jsx src/screens/Roster.jsx`
Expected: PASS. Other roster tests that clicked `Delete` as a coach will now
fail — update them to the same pattern (a coach sees `Mark as left`).

- [ ] **Step 4: Commit**

```bash
git add src/screens/PlayerDetail.jsx src/screens/Roster.jsx tests/player-form.test.jsx
git commit -m "feat(roster): Mark as left replaces Delete for squad staff; Delete is admin-only; Restore on a leaver

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Roster — the staff-only "Left the squad" group

**Files:**
- Modify: `src/screens/Roster.jsx:276-296` (load), `~:627` (selected lookup), `~:928-972` (render)
- Test: `tests/roster-coach-view.test.jsx`

**Interfaces:**
- Consumes: `listPlayers({ teamIds, includeLeft })` (Task 2), `isLeaver` (Task 3), `RosterGroup` (already in `Roster.jsx`).

- [ ] **Step 1: Failing tests**

Append to `tests/roster-coach-view.test.jsx` (it already has a coach fixture
and a parent fixture and mocks `listPlayers`):

```js
describe('Left the squad', () => {
  const LEAVER = { id: 'p-left', team_id: 'team-u14', full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z' }

  it('a coach loads leavers, sees a collapsed group at the bottom, and it is not counted', async () => {
    listPlayersMock.mockResolvedValue([...ROSTER, LEAVER])
    await renderAs(COACH)
    expect(listPlayersMock).toHaveBeenCalledWith(expect.objectContaining({ includeLeft: true }))
    const group = await screen.findByRole('group', { name: /left the squad/i })
    expect(within(group).getByText('Rafiq Delacroix-Obi')).toBeInTheDocument()
    // Not in the working roster, not in the count
    const labels = screen.getAllByTestId('group-label').map((el) => el.textContent)
    expect(labels[labels.length - 1]).toMatch(/left the squad/i)
    expect(screen.getByText(new RegExp(`${ROSTER.length} players`))).toBeInTheDocument()
  })

  it('a parent never loads leavers and never sees the group', async () => {
    listPlayersMock.mockResolvedValue(ROSTER)
    await renderAs(PARENT)
    expect(listPlayersMock).not.toHaveBeenCalledWith(expect.objectContaining({ includeLeft: true }))
    expect(screen.queryByRole('group', { name: /left the squad/i })).toBeNull()
  })

  it('a leaver is excluded from search results', async () => {
    listPlayersMock.mockResolvedValue([...ROSTER, LEAVER])
    const user = await renderAs(COACH)
    await user.type(screen.getByRole('searchbox'), 'Rafiq')
    expect(screen.getByText(/no players match/i)).toBeInTheDocument()
  })
})
```

⚠️ `ROSTER`, `COACH`, `PARENT`, `renderAs` stand for this file's existing
fixture and render helper names — read its top 120 lines and use them. If the
count text differs from `N players`, assert on whatever the screen renders as
the total, with the same intent: leavers are not in it.

Run: `npm run test:related -- src/screens/Roster.jsx`
Expected: FAIL — no `includeLeft`, no group.

- [ ] **Step 2: Implement**

In `Roster.jsx`:

1. Add state `const [leavers, setLeavers] = useState([])` next to `players`.
2. ⚠️ `canEditAnything` is declared at ~L314, AFTER the load effect at ~L276.
   Move the load effect to directly below the `canEditAnything` declaration
   (the file already has a comment about declaration order biting here). Then:

```js
useEffect(() => {
  let mounted = true
  setLoading(true)
  setError(null)

  // ⚠️ LEAVERS ARE REQUESTED ONLY FOR STAFF. A parent's query never asks for
  // them, so a departed child's name never crosses the wire to a family that
  // has no business seeing it. Spec §4/§5.
  listPlayers({ teamIds, includeLeft: canEditAnything })
    .then((rows) => {
      if (!mounted) return
      setPlayers(rows.filter((row) => !isLeaver(row)))
      setLeavers(canEditAnything ? rows.filter(isLeaver) : [])
    })
    .catch((err) => {
      if (!mounted) return
      setError(err)
      setPlayers([])
      setLeavers([])
    })
    .finally(() => {
      if (mounted) setLoading(false)
    })

  return () => { mounted = false }
}, [teamIds, reloadToken, canEditAnything])
```

3. Selected-player lookup (the `selectedPlayer` derivation, ~L627): search
   `[...players, ...leavers]` instead of `players`, so a leaver opens in the
   detail sheet.
4. Render, after the `groups.map(...)` block and before `{selectedPlayer && …}`:

```jsx
{canEditAnything && !isFirstLoad && !error && leavers.length > 0 && (
  <details className="mt-6" role="group" aria-label={`Left the squad (${leavers.length})`}>
    <summary className="cursor-pointer text-[12.5px] font-extrabold uppercase tracking-[.5px] text-ink-muted">
      Left the squad ({leavers.length})
    </summary>
    <div className="mt-2">
      <RosterGroup
        label="Left the squad"
        players={leavers}
        teamsById={teamsById}
        photoUrls={photoUrls}
        ageByPlayer={ageByPlayer}
        showPosition={false}
        onSelect={setSelectedPlayerId}
      />
    </div>
  </details>
)}
```

Import `isLeaver` from `'../lib/leavers.js'`. Leavers are never added to
`scopedPlayers`, `visible`, `tableGroups`, `missingGender`, `agePlayerIds` or
any count — they live only in `leavers`.

- [ ] **Step 3: Run and commit**

Run: `npm run test:related -- src/screens/Roster.jsx` — Expected: PASS.
Now also add the "leaver is read-only with Restore" test from Task 4 step 1
if it was deferred, and run it.

```bash
git add src/screens/Roster.jsx tests/roster-coach-view.test.jsx tests/player-form.test.jsx
git commit -m "feat(roster): staff-only 'Left the squad' group; leavers never loaded for a parent

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: History screens — MatchSheet and GameTime keep and tag leavers

**Files:**
- Modify: `src/screens/MatchSheet.jsx:351`, `src/screens/GameTime.jsx:59`, plus each place those two files render `full_name`
- Test: `tests/match-sheet-leavers.test.jsx` (new)

**Interfaces:**
- Consumes: `listPlayers({ …, includeLeft: true })`, `leaverName(player)`.

- [ ] **Step 1: Failing test**

Copy the mocking preamble of the existing match-sheet test (`grep -l MatchSheet tests/*.jsx`)
into `tests/match-sheet-leavers.test.jsx`, then:

```js
it('a leaver on a saved sheet is loaded and shown with the Left tag', async () => {
  listPlayersMock.mockResolvedValue([
    { id: 'p-1', team_id: 't-1', full_name: 'Tomasz Delacroix-Obi', left_at: null },
    { id: 'p-2', team_id: 't-1', full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z' },
  ])
  getMatchSheetMock.mockResolvedValue(SHEET_WITH_P1_AND_P2)   // the file's fixture shape, with both ids in slots
  await renderMatchSheet()
  expect(listPlayersMock).toHaveBeenCalledWith(expect.objectContaining({ includeLeft: true }))
  expect(await screen.findByText('Rafiq Delacroix-Obi · Left')).toBeInTheDocument()
  expect(screen.getByText('Tomasz Delacroix-Obi')).toBeInTheDocument()
})
```

Run: `npx vitest run tests/match-sheet-leavers.test.jsx`
Expected: FAIL — `includeLeft` not passed; no tag.

- [ ] **Step 2: Implement**

`MatchSheet.jsx:351`: `listPlayers({ teamIds: [row.team_id], includeLeft: true }).catch(() => [])`
`GameTime.jsx:59`: `listPlayers({ teamIds: [chosen], includeLeft: true })`

Add above each a one-line comment: `// includeLeft: a saved sheet / a past
appearance must still name the child who has since left. Spec §4.`

Then in both files, every render of a player's name (`grep -n "full_name" src/screens/MatchSheet.jsx src/screens/GameTime.jsx`)
that is a DISPLAY (not a sort key or a search) becomes `leaverName(player)`,
importing `leaverName` from `'../lib/leavers.js'`. ⚠️ Where the sheet offers
a picker of players to ADD to a slot, filter that list with
`.filter((p) => !isLeaver(p))` — a leaver may appear on a sheet already
saved, never be newly selected.

- [ ] **Step 3: Run and commit**

Run: `npm run test:related -- src/screens/MatchSheet.jsx src/screens/GameTime.jsx` — Expected: PASS.

```bash
git add src/screens/MatchSheet.jsx src/screens/GameTime.jsx tests/match-sheet-leavers.test.jsx
git commit -m "feat(history): match sheets and game time keep leavers, tagged Left, never newly selectable

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Admin — "Left this season" list with Restore

**Files:**
- Modify: `src/screens/AdminClub.jsx:211` (load), new section after the last `<Card>` block (~L606 region)
- Test: `tests/admin-club-leavers.test.jsx` (new)

**Interfaces:**
- Consumes: `listPlayers({ includeLeft: true })`, `restorePlayer`, `isLeaver`, `useMemberships().teams`.

- [ ] **Step 1: Failing test**

Copy the preamble of the existing AdminClub test (`grep -l AdminClub tests/*.jsx`) into
`tests/admin-club-leavers.test.jsx`:

```js
it('lists leavers with squad and date, and Restore calls the RPC and reloads', async () => {
  listPlayersMock.mockResolvedValue([
    { id: 'p-1', team_id: 't-u14', full_name: 'Tomasz Delacroix-Obi', left_at: null },
    { id: 'p-2', team_id: 't-u14', full_name: 'Rafiq Delacroix-Obi', left_at: '2026-09-02T08:00:00Z', left_by: 'pr-coach' },
  ])
  const user = await renderAdminClub()
  const section = await screen.findByRole('region', { name: /left this season/i })
  expect(within(section).getByText('Rafiq Delacroix-Obi')).toBeInTheDocument()
  expect(within(section).getByText(/U14/)).toBeInTheDocument()
  expect(within(section).getByText(/2 Sep 2026/)).toBeInTheDocument()
  expect(within(section).queryByText('Tomasz Delacroix-Obi')).toBeNull()
  await user.click(within(section).getByRole('button', { name: 'Restore' }))
  await waitFor(() => expect(restorePlayerMock).toHaveBeenCalledWith('p-2'))
  await waitFor(() => expect(listPlayersMock).toHaveBeenCalledTimes(2))
})

it('shows nothing when nobody has left', async () => {
  listPlayersMock.mockResolvedValue([{ id: 'p-1', team_id: 't-u14', full_name: 'Tomasz Delacroix-Obi', left_at: null }])
  await renderAdminClub()
  expect(screen.queryByRole('region', { name: /left this season/i })).toBeNull()
})
```

Run: `npx vitest run tests/admin-club-leavers.test.jsx` — Expected: FAIL.

- [ ] **Step 2: Implement**

`AdminClub.jsx:211`: `listPlayers({ includeLeft: true })`, and split in the
`.then`: keep `setPlayers(playerRows.filter((p) => !isLeaver(p)))` so every
existing count on this screen excludes leavers, and add
`setLeavers(playerRows.filter(isLeaver))` with new state
`const [leavers, setLeavers] = useState([])`. Add a reload token if the
screen has none (`const [reloadToken, setReloadToken] = useState(0)` in the
effect deps).

Add the section after the last squad card:

```jsx
{leavers.length > 0 && (
  <Card as="section" aria-label="Left this season" className="mt-3.5 p-3.5">
    <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
      Left this season
    </h3>
    <ul className="divide-y divide-line">
      {leavers.map((player) => (
        <li key={player.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{player.full_name}</p>
            <p className="text-[12.5px] text-ink-muted">
              {teams.find((team) => team.id === player.team_id)?.name ?? 'Unknown squad'} · left{' '}
              {new Date(player.left_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={restoring === player.id}
            onClick={() => {
              setRestoring(player.id)
              setRestoreError(null)
              restorePlayer(player.id)
                .then(() => setReloadToken((token) => token + 1))
                .catch((err) => setRestoreError(err))
                .finally(() => setRestoring(null))
            }}
          >
            {restoring === player.id ? 'Restoring…' : 'Restore'}
          </Button>
        </li>
      ))}
    </ul>
    {restoreError && (
      <p role="alert" className="mt-2 text-sm font-semibold text-danger-ink">
        {restoreError.message || "We couldn't restore that player. Try again."}
      </p>
    )}
  </Card>
)}
```

with `const [restoring, setRestoring] = useState(null)` and
`const [restoreError, setRestoreError] = useState(null)`. ⚠️ If `Card` does
not accept `as`, wrap the `Card` in `<section aria-label="Left this season">`
instead. Import `restorePlayer` from `'../data/players.js'` and `isLeaver`
from `'../lib/leavers.js'`. "Who marked it" is `left_by`, a profile id; show
it only if this screen already has a profiles lookup — otherwise leave it to
PlayerDetail's header and note that in the commit.

- [ ] **Step 3: Run and commit**

Run: `npm run test:related -- src/screens/AdminClub.jsx` — Expected: PASS.

```bash
git add src/screens/AdminClub.jsx tests/admin-club-leavers.test.jsx
git commit -m "feat(admin): 'Left this season' list with Restore on the club screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: A `'left'` membership is neither active nor pending

**Files:**
- Modify: `src/screens/Accounts.jsx:1074-1075`
- Modify: the shell gate that uses `isPendingOnly` (`grep -rn "isPendingOnly(" src/ --include=*.jsx`)
- Test: `tests/accounts.test.jsx`, plus the test file that covers that gate

**Interfaces:**
- Consumes: `isLeftOnly(memberships)` (Task 3).

- [ ] **Step 1: Failing tests**

In `tests/accounts.test.jsx`, using its existing members fixture and render helper:

```js
it("a 'left' membership appears in neither the active list nor the pending list", async () => {
  listClubMembersMock.mockResolvedValue([
    { ...ACTIVE_PARENT_ROW, id: 'm-active', status: 'active' },
    { ...ACTIVE_PARENT_ROW, id: 'm-left', status: 'left', profiles: { ...ACTIVE_PARENT_ROW.profiles, full_name: 'Nadia Delacroix-Obi' } },
  ])
  await renderAccounts(ADMIN)
  expect(screen.queryByText('Nadia Delacroix-Obi')).toBeNull()
})
```

In the shell gate's test file, add a case: memberships `[{ status: 'left', role: 'parent', team_id: 't-1', player_id: 'p-1' }]`
renders the same "tell the club who you are" screen a user with `[]` gets.

Run: `npm run test:related -- src/screens/Accounts.jsx` — Expected: FAIL (the left row is listed as active).

- [ ] **Step 2: Implement**

`Accounts.jsx:1074`:

```js
// ⚠️ 'left' IS A THIRD STATUS SINCE 2 Sep 2026 and it is neither. Testing
// `!== 'pending'` would list a family whose child has left as ACTIVE members
// of the squad. Leavers are found on AdminClub's "Left this season" list and
// the squad roster's "Left the squad" group, not here.
const activeMembers = members.filter((member) => member.status === 'active')
const pendingMembers = members.filter((member) => member.status === 'pending')
```

At the shell gate, wherever `memberships.length === 0` (or equivalent) chooses
the no-access screen, extend it: `memberships.length === 0 || isLeftOnly(memberships)`,
importing `isLeftOnly` from `'../lib/leavers.js'`.

- [ ] **Step 3: Run and commit**

Run the related tests — Expected: PASS.

```bash
git add src/screens/Accounts.jsx tests/accounts.test.jsx <gate file> <gate test file>
git commit -m "fix(access): a 'left' membership is neither active nor pending anywhere a status is read

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Docs, full verification, pull request

**Files:**
- Modify: `claude/specs/2026-09-02-player-leavers-design.md` (status + the Task 1 deviation), this plan's STATUS line, `claude/changelog.md`, `claude/open-items.md`, `RESTORE.md`

- [ ] **Step 1: Write the deviation back into the spec**

In the spec's §3 table, replace the `register_my_player` / `apply_signup_intent`
row with: *"UNCHANGED on purpose (plan Task 1). Their duplicate check still sees
leavers, so a returning child is refused with 'ask the club to connect you',
which is the cue for Restore. Skipping leavers would create a second row."*
Change the spec's opening status to **"specified and BUILT — <PR link>"**.
Change this plan's STATUS line to **SHIPPED — PR #<n>, <date>**, listing the
deviation.

- [ ] **Step 2: RESTORE.md, one paragraph under the players/roster section**

State: leaving is never a delete; `left_at` null means current; `'left'` is a
membership status that grants nothing; the twelve `listPlayers` callers hide
leavers by default and the two history screens opt in; Delete is admin-only
and still broken for most players (open-items).

- [ ] **Step 3: Changelog entry (no SHA — the squash SHA does not exist yet)**

Under `## <date>`: one bullet, `feat(roster): MARKING A PLAYER AS LEFT`, naming
the migration, the harness, the spec, and the deviation.

- [ ] **Step 4: Full verification**

```bash
npm run docs:check
npm run db:check
npm test
```

Expected: docs green (a "commit missing from changelog" line for your own
branch commits is the documented local false red — trust CI); `db:check` all
green or only the pre-existing reds; `npm test` all green.

- [ ] **Step 5: Live check, after Jay merges and Netlify deploys**

In the browser, on the live site, as a coach account on a squad with a test
child Jay agrees to use: open the child, Mark as left, confirm the roster drops
them and the group shows them; open them from the group, Restore, confirm they
return. ⚠️ **Do not do this on a real child without Jay choosing the row.**

- [ ] **Step 6: Commit docs and open the pull request**

```bash
git add claude/specs/2026-09-02-player-leavers-design.md claude/plans/2026-09-02-player-leavers-implementation.md claude/changelog.md claude/open-items.md RESTORE.md
git commit -m "docs: player leavers shipped — spec status, deviation, RESTORE, changelog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

Then push the BRANCH (not `main`) and open a PR with `gh pr create`; merging
is Jay's yes.
