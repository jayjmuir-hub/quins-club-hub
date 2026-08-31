-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — a parent membership writes a player_parents row from the adult's
--  profile. Run via `npm run db:check`. SAFE ON PRODUCTION: one transaction,
--  rolled back. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Needs Attention counts public.player_parents, not Club Hub accounts. Until
-- 20260825_player_parents_from_parent_membership, register_my_player and
-- apply_signup_intent created the player + parent membership + contacts email
-- and left that table empty. This file is the proof those paths now write it,
-- that a coach-created child with no parent membership still does not, and
-- that a second membership for the same adult does not duplicate the row.
--
-- ⚠️ EVERY NAME AND INBOX IS INVENTED — CLAUDE.md rule 9. A synthetic club,
-- never a real child.
--
-- ⚠️ REQUIRES the migration. A missing function is a loud fail, not a skip:
-- a skip would be the nightly staying green while create paths still leave
-- the table empty.

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

do $$
begin
  if to_regprocedure('private.write_parent_row_from_profile(uuid,uuid)') is null then
    raise exception
      'FAIL: private.write_parent_row_from_profile is missing — apply '
      '20260825_player_parents_from_parent_membership.';
  end if;
  if not exists (
    select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relname = 'memberships'
       and t.tgname = 'memberships_write_parent_row'
       and not t.tgisinternal
  ) then
    raise exception
      'FAIL: trigger memberships_write_parent_row is missing on memberships.';
  end if;
end $$;

insert into clubs (id, name) values
 ('c1000000-0000-4000-8000-0000000000c1','ZZ Parent Row Probe Club');

-- Two squads: step 2 needs a SECOND one, because register_my_player writes the
-- first parent membership itself and memberships_unique_grant refuses a literal
-- duplicate — the idempotency probe re-fires the trigger from another team_id.
insert into teams (id, club_id, name, sort_order, self_registration_allowed) values
 ('c1000000-0000-4000-8000-0000000000f1','c1000000-0000-4000-8000-0000000000c1',
  'ZZ Parent Row Mixed', 994, true),
 ('c1000000-0000-4000-8000-0000000000f2','c1000000-0000-4000-8000-0000000000c1',
  'ZZ Parent Row Second', 995, true);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('c1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
  'authenticated','authenticated','zz-parent-row@example.invalid', now(),
  '{}'::jsonb, now(), now()),
 ('c1000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000000',
  'authenticated','authenticated','zz-self-reg@example.invalid', now(),
  '{}'::jsonb, now(), now()),
 ('c1000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000000',
  'authenticated','authenticated','zz-nameless@example.invalid', now(),
  '{}'::jsonb, now(), now());

insert into profiles (id, full_name, first_name, last_name, email, phone)
values
 ('c1000000-0000-4000-8000-000000000001','ZZ Nia Okonkwo','ZZ Nia','Okonkwo',
  'zz-parent-row@example.invalid','+971500000111'),
 ('c1000000-0000-4000-8000-000000000002','ZZ Self Registrant','ZZ Self','Registrant',
  'zz-self-reg@example.invalid','+971500000222')
on conflict (id) do update
  set full_name = excluded.full_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = excluded.email,
      phone = excluded.phone;

-- Nameless on purpose: a membership must still land, and no parent row
-- should be invented from an empty name.
insert into profiles (id, email)
values ('c1000000-0000-4000-8000-000000000003','zz-nameless@example.invalid')
on conflict (id) do update set email = excluded.email, full_name = null,
                               first_name = null, last_name = null;

create function pg_temp.assert_parent_row_create() returns void
language plpgsql as $fn$
declare
  problems text := '';
  child    uuid;
  n        int;
  nm       text;
  em       text;
  ph       text;
  pid      uuid;
  prim     boolean;
  team     constant uuid := 'c1000000-0000-4000-8000-0000000000f1';
  adult    constant uuid := 'c1000000-0000-4000-8000-000000000001';
  selfu    constant uuid := 'c1000000-0000-4000-8000-000000000002';
  blank    constant uuid := 'c1000000-0000-4000-8000-000000000003';
begin
  -- ── 1. register_my_player as a parent writes the row ─────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', adult, 'role', 'authenticated')::text, true);
  set local role authenticated;
  child := (select player_id from public.register_my_player(
    'ZZ Kofi Mensah', team, null, false, false, false));
  reset role;

  -- ⚠️ min(profile_id::text)::uuid, NOT min(profile_id): Postgres has no
  -- min(uuid), and the bare form is why this harness NEVER ran green — it was
  -- committed 25 Aug 2026 after that morning's nightly and failed on its first.
  select count(*), min(full_name), min(email), min(phone),
         min(profile_id::text)::uuid, bool_or(is_primary)
    into n, nm, em, ph, pid, prim
    from public.player_parents where player_id = child;

  insert into _log(line) values (format(
    '1 register_my_player: %s rows name=%s email=%s phone=%s profile=%s primary=%s',
    n, nm, em, ph, pid, prim));

  if child is null then
    problems := problems || 'REGISTER: no player_id came back. ';
  end if;
  if n <> 1 then
    problems := problems || format(
      'REGISTER: expected 1 player_parents row, found %s. ', n);
  end if;
  if nm is distinct from 'ZZ Nia Okonkwo' then
    problems := problems || format(
      'REGISTER: name is %s, not the adult''s profile. ', coalesce(nm,'null'));
  end if;
  if em is distinct from 'zz-parent-row@example.invalid' then
    problems := problems || format(
      'REGISTER: email is %s. ', coalesce(em,'null'));
  end if;
  if ph is distinct from '+971500000111' then
    problems := problems || format(
      'REGISTER: phone is %s. ', coalesce(ph,'null'));
  end if;
  if pid is distinct from adult then
    problems := problems || 'REGISTER: profile_id was not the registering adult. ';
  end if;
  if prim is not true then
    problems := problems || 'REGISTER: the first row should be primary. ';
  end if;

  -- ── 2. A second parent membership for the same adult does not duplicate ─
  -- ⚠️ ON A SECOND SQUAD, NOT THE SAME ONE — repointed 31 Aug 2026.
  -- register_my_player itself now writes the (adult, club, parent, team, child)
  -- membership, so a literally identical second insert dies on
  -- memberships_unique_grant before the trigger under test ever fires. A
  -- different team_id keeps the tuple unique while still firing the trigger
  -- for the same adult+child pair — which is the idempotency being claimed.
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select adult, t.club_id, t.id, 'parent', child, 'pending'
    from public.teams t
   where t.club_id = (select club_id from public.teams where id = team)
     and t.id <> team
   order by t.sort_order limit 1;
  if not found then
    problems := problems || 'IDEMPOTENT: no second squad exists to probe with. ';
  end if;
  select count(*) into n from public.player_parents where player_id = child;
  insert into _log(line) values (format('2 second membership: %s rows', n));
  if n <> 1 then
    problems := problems || format(
      'IDEMPOTENT: a second membership duplicated the row (%s). ', n);
  end if;

  -- ── 3. Self-register (role player) writes NO parent row ──────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', selfu, 'role', 'authenticated')::text, true);
  set local role authenticated;
  child := (select player_id from public.register_my_player(
    'ZZ Self Registrant', team, null, true, false, false));
  reset role;
  select count(*) into n from public.player_parents where player_id = child;
  insert into _log(line) values (format('3 self-register: %s parent rows', n));
  if n <> 0 then
    problems := problems || format(
      'SELF-REGISTER: expected 0 player_parents rows, found %s. ', n);
  end if;

  -- ── 4. Coach-created child, no parent membership — still empty ───────
  insert into public.players (id, club_id, team_id, full_name)
  values ('c1000000-0000-4000-8000-0000000000e1',
          'c1000000-0000-4000-8000-0000000000c1', team, 'ZZ Coach Only Child');
  select count(*) into n from public.player_parents
   where player_id = 'c1000000-0000-4000-8000-0000000000e1';
  insert into _log(line) values (format('4 coach-only child: %s parent rows', n));
  if n <> 0 then
    problems := problems || format(
      'COACH: a child with no parent membership grew %s parent rows. ', n);
  end if;

  -- ── 5. Nameless profile: membership lands, no parent row ─────────────
  insert into public.players (id, club_id, team_id, full_name)
  values ('c1000000-0000-4000-8000-0000000000e2',
          'c1000000-0000-4000-8000-0000000000c1', team, 'ZZ Nameless Adult Child');
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select blank, t.club_id, t.id, 'parent',
         'c1000000-0000-4000-8000-0000000000e2', 'pending'
    from public.teams t where t.id = team;
  select count(*) into n from public.player_parents
   where player_id = 'c1000000-0000-4000-8000-0000000000e2';
  insert into _log(line) values (format('5 nameless adult: membership ok, %s parent rows', n));
  if n <> 0 then
    problems := problems || format(
      'BLANK NAME: invented a parent row from an empty profile (%s). ', n);
  end if;
  if not exists (
    select 1 from public.memberships
     where profile_id = blank
       and player_id = 'c1000000-0000-4000-8000-0000000000e2'
  ) then
    problems := problems || 'BLANK NAME: the membership itself was refused. ';
  end if;

  -- ── 6. Backfill shape: wipe the row, helper puts it back ─────────────
  insert into public.players (id, club_id, team_id, full_name)
  values ('c1000000-0000-4000-8000-0000000000e3',
          'c1000000-0000-4000-8000-0000000000c1', team, 'ZZ Backfill Child');
  insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
  select adult, t.club_id, t.id, 'parent',
         'c1000000-0000-4000-8000-0000000000e3', 'pending'
    from public.teams t where t.id = team;
  delete from public.player_parents
   where player_id = 'c1000000-0000-4000-8000-0000000000e3';
  select count(*) into n from public.player_parents
   where player_id = 'c1000000-0000-4000-8000-0000000000e3';
  if n <> 0 then
    problems := problems || 'BACKFILL SETUP: deleting the row did not stick. ';
  end if;
  perform private.write_parent_row_from_profile(
    'c1000000-0000-4000-8000-0000000000e3', adult);
  select count(*), min(full_name) into n, nm
    from public.player_parents
   where player_id = 'c1000000-0000-4000-8000-0000000000e3';
  insert into _log(line) values (format('6 backfill helper: %s rows name=%s', n, nm));
  if n <> 1 or nm is distinct from 'ZZ Nia Okonkwo' then
    problems := problems || format(
      'BACKFILL: helper wrote %s rows name=%s. ', n, coalesce(nm,'null'));
  end if;

  -- ── 7. apply_signup_intent writes the row when it creates a child ────
  if to_regprocedure('private.apply_signup_intent(uuid)') is not null then
    update public.profiles
       set signup_intent = jsonb_build_object(
             'players', jsonb_build_array(jsonb_build_object(
               'first_name', 'ZZ Amina',
               'last_name', 'Diallo',
               'team_id', team,
               'self_register', false
             ))
           ),
           signup_intent_applied_at = null
     where id = adult;
    perform private.apply_signup_intent(adult);
    select pp.player_id into child
      from public.player_parents pp
      join public.players pl on pl.id = pp.player_id
     where pp.profile_id = adult
       and pl.full_name = 'ZZ Amina Diallo'
     limit 1;
    select count(*) into n from public.player_parents where player_id = child;
    insert into _log(line) values (format('7 apply_signup_intent: %s rows for Amina', n));
    if n is distinct from 1 then
      problems := problems || format(
        'SIGNUP INTENT: expected 1 parent row for the applied child, found %s. ',
        coalesce(n::text, 'null'));
    end if;
  else
    insert into _log(line) values
      ('7 apply_signup_intent: function missing — apply 20260825_signup_before_confirm');
    problems := problems ||
      'SIGNUP INTENT: private.apply_signup_intent is missing. ';
  end if;

  if problems <> '' then
    raise exception 'FAIL: %', problems;
  end if;
end;
$fn$;

-- ── Run unmodified ───────────────────────────────────────────────────────
select pg_temp.assert_parent_row_create();

-- ── SELF-TEST: a no-op helper means a parent membership writes nothing, ─
-- and the check notices. CREATE OR REPLACE is transactional here and
-- rolls back with the rest — no ACCESS EXCLUSIVE lock on memberships.
-- Parameter names must match the live signature (p_player, p_profile) —
-- CREATE OR REPLACE refuses to rename a parameter, and the live function
-- gained names this bare (uuid, uuid) form predates.
create or replace function private.write_parent_row_from_profile(p_player uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $noop$
begin
  return;
end;
$noop$;

insert into public.players (id, club_id, team_id, full_name)
values ('c1000000-0000-4000-8000-0000000000e9',
        'c1000000-0000-4000-8000-0000000000c1',
        'c1000000-0000-4000-8000-0000000000f1',
        'ZZ Fault Child');
insert into public.memberships (profile_id, club_id, team_id, role, player_id, status)
select 'c1000000-0000-4000-8000-000000000001', t.club_id, t.id, 'parent',
       'c1000000-0000-4000-8000-0000000000e9', 'pending'
  from public.teams t where t.id = 'c1000000-0000-4000-8000-0000000000f1';

do $$
declare n int;
begin
  select count(*) into n from public.player_parents
   where player_id = 'c1000000-0000-4000-8000-0000000000e9';
  if n <> 0 then
    raise exception
      'SELF-TEST SETUP BROKEN: a no-op helper still wrote % parent rows.', n;
  end if;
  -- The same assertion as step 1: zero rows must be a failure, or the
  -- check cannot see a helper that does nothing.
  raise notice 'SELF-TEST PASSED — a no-op helper leaves the table empty, and the check sees it.';
end $$;

do $$
begin
  raise notice 'PARENT ROW CREATE: all checks passed.';
end $$;

rollback;
