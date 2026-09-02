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
-- ⚠️ fx is owned by this connection's role. Any step that impersonates via
-- pg_temp.act_as(...) must resolve every fx lookup it needs into a plpgsql
-- variable BEFORE calling act_as — reading fx AFTER switching role fails
-- 42501 (permission denied for table fx), because the impersonated
-- 'authenticated' role has no grant on it. Do not grant fx to
-- authenticated to work around this: that would widen what the
-- impersonated role can see and make the probe less faithful.
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
do $$ declare v_team uuid; begin
  -- resolved BEFORE act_as: fx is unreadable once role='authenticated'
  select v into v_team from fx where k='team';
  perform pg_temp.act_as('stranger');
  begin
    -- p_gender is required: U16B is a single-gender squad, and the gender
    -- guard (errcode 22004) runs BEFORE the duplicate-name guard (42710) in
    -- register_my_player, so the call must clear it to reach what this step
    -- is actually testing.
    perform public.register_my_player(
      p_full_name => 'Rafiq Delacroix-Obi',
      p_team_id => v_team,
      p_gender => 'male',
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

-- ── STEP 12a — CONTROL A: while BOTH memberships are still active, the
--              parent DOES read the squad, its events, and their own
--              child's contact row. Covers db/migrations/
--              20260902_player_leavers_left_grants_nothing.sql, which tests
--              is_own_player and is_attached_to_team for status <> 'left' —
--              every zero asserted below is meaningful only because this
--              control is non-zero first. ─────────────────────────────────
do $$ declare v_team uuid; v_event uuid; n int; begin
  -- resolved BEFORE act_as: fx is unreadable once role='authenticated'
  select v into v_team from fx where k='team';

  insert into public.events (club_id, team_id, type, starts_at)
  select (select v from fx where k='club'), v_team, 'match', now() + interval '7 days'
  returning id into v_event;
  insert into fx values ('event', v_event);

  -- the fixture already gave both children a player_contacts row (the
  -- shared family address, for the claim_roster_access control) — no new
  -- insert needed, player_id is that table's PRIMARY KEY.

  perform pg_temp.act_as('parent');
  select count(*) into n from public.players where team_id=v_team;
  if n < 1 then raise exception 'CONTROL A FAILED: active parent reads 0 players rows for their squad — the probe proves nothing'; end if;
  select count(*) into n from public.events where team_id=v_team;
  if n < 1 then raise exception 'CONTROL A FAILED: active parent reads 0 events rows for their squad — the probe proves nothing'; end if;
  select count(*) into n from public.player_contacts where player_id='00000000-bbbb-0000-0000-000000000002';
  if n < 1 then raise exception 'CONTROL A FAILED: active parent reads 0 player_contacts rows for their own child — the probe proves nothing'; end if;
  perform pg_temp.act_as_owner();
end $$;

-- ── STEP 12b — a 'left' membership grants NOTHING ─────────────────────────
-- Mark the leaver again (restore in step 11 undid step 5's mark), then set
-- the SIBLING's membership to 'left' directly too, so BOTH of the parent's
-- links to the squad are 'left'. Assert every read CONTROL A proved is now
-- zero, and that an availability insert for the leaver is refused.
do $$ declare ok boolean; v_team uuid; v_event uuid; n int; begin
  perform pg_temp.act_as('coach');
  perform public.mark_player_left('00000000-bbbb-0000-0000-000000000001');
  perform pg_temp.act_as_owner();
  update public.memberships set status='left' where player_id='00000000-bbbb-0000-0000-000000000002'; -- both rows now 'left'
  -- resolved BEFORE act_as: fx is unreadable once role='authenticated'
  select v into v_team  from fx where k='team';
  select v into v_event from fx where k='event';

  perform pg_temp.act_as('parent');

  select count(*) = 0 into ok from public.players where team_id=v_team;
  if not ok then raise exception 'a parent whose memberships are all ''left'' can still read the squad'; end if;

  select count(*) = 0 into ok from public.events where team_id=v_team;
  if not ok then raise exception 'a parent whose memberships are all ''left'' can still read the squad''s events'; end if;

  select count(*) into n from public.player_contacts
   where player_id in ('00000000-bbbb-0000-0000-000000000001','00000000-bbbb-0000-0000-000000000002');
  if n <> 0 then raise exception 'a parent whose memberships are all ''left'' can still read % player_contacts row(s)', n; end if;

  begin
    insert into public.availability (event_id, player_id, status)
    values (v_event, '00000000-bbbb-0000-0000-000000000001', 'in');
    raise exception 'SELF-TEST FAILED: a ''left'' parent inserted an availability row for the leaver';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then raise; end if;
    raise notice '''left'' parent refused an availability insert: %', sqlerrm;
  end;

  perform pg_temp.act_as_owner();
end $$;

-- ── STEP 12c — CONTROL B: PENDING must keep working ───────────────────────
-- Flip the sibling's membership to 'pending' (not 'left'). The parent must
-- read exactly the sibling's players row, and NOT the leaver's — proving
-- `<> 'left'` was used, not `= 'active'`, which would have broken this.
do $$ declare v_team uuid; n_sibling int; n_leaver int; begin
  update public.memberships set status='pending' where player_id='00000000-bbbb-0000-0000-000000000002';
  -- resolved BEFORE act_as: fx is unreadable once role='authenticated'
  select v into v_team from fx where k='team';
  perform pg_temp.act_as('parent');
  select count(*) into n_sibling from public.players where id='00000000-bbbb-0000-0000-000000000002';
  select count(*) into n_leaver  from public.players where id='00000000-bbbb-0000-0000-000000000001';
  perform pg_temp.act_as_owner();
  if n_sibling <> 1 then raise exception 'CONTROL FAILED: a PENDING parent no longer reads their own child (got %) — is_own_player must accept pending, only exclude left', n_sibling; end if;
  if n_leaver <> 0 then raise exception 'a PENDING sibling membership also surfaced the unrelated LEFT child (% rows)', n_leaver; end if;
end $$;

do $$ begin raise notice 'player-leavers: all steps passed'; end $$;
rollback;
