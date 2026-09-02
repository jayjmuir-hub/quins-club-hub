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
-- with a control before being written down (0 hits on all six surnames
-- against public.players.full_name and public.profiles.full_name; control
-- `ilike '%a%'` returned 134 and 133 respectively — 2 Sep 2026).
--
-- ⚠️ DEVIATIONS FROM THE PLAN'S DRAFT (claude/plans/2026-09-02-senior-squads-2a-implementation.md),
-- all forced by db/schema/tables.sql and db/schema/triggers.sql:
--  1. public.profiles.id has profiles_id_fkey -> auth.users(id) ON DELETE
--     CASCADE. The draft inserted profiles rows with a bare gen_random_uuid()
--     and no matching auth.users row, which would fail the FK on the very
--     first profiles insert. Fixed by inserting into auth.users first for
--     every invented account, copying the exact idiom already used by
--     db/tests/nicknames.sql and db/tests/squad-gender.sql.
--  2. public.profiles is populated by the on_auth_user_created trigger
--     (private.handle_new_user), which fires AFTER INSERT ON auth.users and
--     upserts a profiles row itself, reading full_name from
--     raw_user_meta_data->>'full_name'. A first attempt at fix #1 above still
--     inserted into public.profiles explicitly afterwards and hit
--     `duplicate key value violates unique constraint "profiles_pkey"` —
--     measured live, 3 Sep 2026, against senior-squads-2a.sql. Fixed by
--     putting the invented full_name into auth.users.raw_user_meta_data and
--     dropping the explicit profiles insert entirely, matching
--     db/tests/squad-gender.sql exactly (it never inserts into
--     public.profiles either).
--  3. memberships_family_role_needs_player requires player_id NOT NULL when
--     role IN ('parent','player'). STEP 6's first membership for "who" is
--     role='parent' with no player_id — the draft would fail that CHECK
--     before ever reaching the insufficient_privilege test. Fixed by
--     pointing it at the Aldenbrook player created in STEP 2 (irrelevant to
--     what STEP 6 is testing, but required for the row to exist at all).
--  4. private.sync_person_name (a BEFORE INSERT/UPDATE trigger on players,
--     db/schema/triggers.sql) OVERWRITES full_name from first_name+last_name
--     whenever both are supplied on the same statement — "first/last win
--     when both change in one statement", per its own comment in
--     tables.sql. STEP 2's insert supplies full_name='Harness Prop
--     Aldenbrook' AND first_name='Harness'/last_name='Aldenbrook' together,
--     so the row that actually lands has full_name = 'Harness Aldenbrook'
--     — "Prop" is silently dropped. A `where full_name = 'Harness Prop
--     Aldenbrook'` lookup in STEP 5/6 therefore finds nothing and `ply`/
--     `aldenbrook` come back NULL, which then fails
--     memberships_family_role_needs_player one insert later — a confusing
--     symptom for an unrelated cause, measured live 3 Sep 2026. Fixed by
--     looking the player up on first_name/last_name instead, which is what
--     the trigger itself treats as authoritative.
-- Everything else below is the plan's SQL unmodified.

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
  -- The valid boundary: 1 and 99 are the smallest/largest numbers the check
  -- allows and must be ACCEPTED, not just implied by 0/100 being refused.
  -- Names checked against live players/profiles.full_name with an ilike
  -- '%a%' control before being written down (0 hits on both surnames;
  -- control 139/137 — 2 Sep 2026).
  insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
  values (f.club_id, t.a, 'Harness Wing Garrowby', 'Harness', 'Garrowby', 1);
  insert into public.players (club_id, team_id, full_name, first_name, last_name, jersey_num)
  values (f.club_id, t.a, 'Harness Fullback Hollins', 'Harness', 'Hollins', 99);
  if not exists (select 1 from public.players where first_name='Harness' and last_name='Garrowby' and jersey_num=1) then
    raise exception 'STEP 4 FAILED: jersey 1 (lower boundary) was not stored';
  end if;
  if not exists (select 1 from public.players where first_name='Harness' and last_name='Hollins' and jersey_num=99) then
    raise exception 'STEP 4 FAILED: jersey 99 (upper boundary) was not stored';
  end if;
  raise notice 'STEP 4 ok: 0 and 100 refused, null accepted, 1 and 99 accepted';
end $$;

-- ── STEP 5 — can_see_player: a B coach sees an A player only via a B membership
-- Uses invented auth users: private helpers read auth.uid(), so set the JWT
-- claim. ⚠️ profiles.id -> auth.users(id) FK (profiles_id_fkey) means each
-- invented profile needs a real auth.users row first — the idiom already
-- used by db/tests/nicknames.sql and db/tests/squad-gender.sql. ⚠️ AND the
-- on_auth_user_created trigger already inserts the public.profiles row off
-- raw_user_meta_data->>'full_name' — do not also insert into profiles, or
-- it collides on profiles_pkey.
do $$
declare
  f record; t record;
  coach uuid := gen_random_uuid();
  prop_profile uuid := gen_random_uuid();
  ply uuid;
begin
  select * into f from _fx; select * into t from _t;
  select id into ply from public.players where first_name='Harness' and last_name='Aldenbrook';

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (coach, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'harness-coach-ellerby@example.invalid', now(), '{"full_name":"Harness Coach Ellerby"}'::jsonb, now(), now());
  insert into public.memberships (profile_id, club_id, team_id, role, status) values (coach, f.club_id, t.b, 'coach', 'active');
  perform set_config('request.jwt.claims', json_build_object('sub', coach, 'role', 'authenticated')::text, true);
  -- CONTROL: not visible yet — the player's home is A and the coach runs B.
  if private.can_see_player(ply) then
    raise exception 'STEP 5 CONTROL FAILED: B coach sees an A player with no B membership';
  end if;
  -- Give the player a B membership (their profile is another invented user).
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (prop_profile, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'harness-prop-aldenbrook@example.invalid', now(), '{"full_name":"Harness Prop Aldenbrook"}'::jsonb, now(), now());
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (prop_profile, f.club_id, t.b, 'player', ply, 'active');
  if not private.can_see_player(ply) then
    raise exception 'STEP 5 FAILED: B coach cannot see the A player after a B membership';
  end if;
  -- ⚠️ THE SUBJECT SIDE, NOT JUST THE CALLER SIDE. Everything above proves the
  -- CALLER'S membership (the B coach) grants the view; this proves the
  -- PLAYER'S guest membership has to be ACTIVE too — a leaver's guest row
  -- must grant nothing, matching private.can_see_player's own status='active'
  -- guard on the caller side. memberships_status_check admits 'left' (the
  -- 2 Sep 2026 leavers migration), so this is a real value, not a fault the
  -- constraint would refuse before it reaches can_see_player at all.
  update public.memberships set status = 'left' where player_id = ply and team_id = t.b;
  if private.can_see_player(ply) then
    raise exception 'STEP 5 FAILED: a leaver''s guest membership still grants visibility';
  end if;
  -- CONTROL: restoring the same row to active restores the view — proves the
  -- refusal above is really about status, not that the membership row itself
  -- was destroyed or the coach's own access broke.
  update public.memberships set status = 'active' where player_id = ply and team_id = t.b;
  if not private.can_see_player(ply) then
    raise exception 'STEP 5 CONTROL FAILED: restoring the B membership to active did not restore visibility';
  end if;
  raise notice 'STEP 5 ok: visible only through the membership, and only while it is active';
end $$;

-- ── STEP 6 — create_team refuses a non-admin, accepts an admin ────────────
do $$
declare
  f record; t record;
  who uuid := gen_random_uuid();
  aldenbrook uuid;
  made public.teams;
begin
  select * into f from _fx; select * into t from _t;
  select id into aldenbrook from public.players where first_name='Harness' and last_name='Aldenbrook';

  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
  values (who, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'harness-parent-fenwold@example.invalid', now(), '{"full_name":"Harness Parent Fenwold"}'::jsonb, now(), now());
  -- ⚠️ memberships_family_role_needs_player requires player_id when role is
  -- 'parent' or 'player'. This row's player_id is otherwise irrelevant to
  -- what STEP 6 tests (create_team authorisation), so it borrows the Aldenbrook
  -- player already in the fixture rather than inventing a third.
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  values (who, f.club_id, t.a, 'parent', aldenbrook, 'active');
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  begin
    perform public.create_team('Harness Senior C', true, true, true);
    raise exception 'STEP 6 FAILED: a parent created a squad';
  exception when insufficient_privilege then null; end;
  update public.memberships set role='admin', team_id=null where profile_id=who;
  select * into made from public.create_team('Harness Senior C', true, true, true);
  if made.is_senior is not true or made.uses_jersey_numbers is not true then
    raise exception 'STEP 6 FAILED: flags not stored (is_senior=%, uses_jersey_numbers=%)',
      made.is_senior, made.uses_jersey_numbers;
  end if;
  if made.name is distinct from 'Harness Senior C' then
    raise exception 'STEP 6 FAILED: name not stored (got %)', made.name;
  end if;
  if made.self_registration_allowed is not true then
    raise exception 'STEP 6 FAILED: self_registration_allowed not stored (got %)', made.self_registration_allowed;
  end if;
  -- CONTROL: a false self_registration_allowed must come back false, not be
  -- silently coerced to true. Without this, the true-only assertion above
  -- could pass even if create_team ignored the argument and always stored
  -- true.
  select * into made from public.create_team('Harness Senior D', true, true, false);
  if made.self_registration_allowed is not false then
    raise exception 'STEP 6 CONTROL FAILED: self_registration_allowed=false was not stored (got %)', made.self_registration_allowed;
  end if;
  raise notice 'STEP 6 ok: admin created a senior squad with numbers, all four flags asserted';
end $$;

rollback;
