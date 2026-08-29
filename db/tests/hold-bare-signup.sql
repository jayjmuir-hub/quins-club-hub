-- ══════════════════════════════════════════════════════════════════════════
--  HOLD-BARE-SIGNUP HARNESS — a signup with no name AND no intent is auto-held
--  (pre-dismissed) out of the admin's active list, while a named/OAuth-like
--  signup is left alone for the admin to see.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK,
--  and every row it touches is one it created itself (db:check-* test emails).
-- ══════════════════════════════════════════════════════════════════════════
--
--  db/migrations/20260829_hold_bare_signup.sql. The harness APPLIES the trigger
--  itself (idempotently) so it proves the behaviour whether or not the migration
--  has been applied, and keeps passing once it has. The rollback un-applies it.
--
--  ⚠️ THE CONTROL IS THE POINT. Auto-holding is only correct if it targets JUNK
--  and nothing else: a named signup (Google, or anyone the wizard/OAuth gave a
--  name) must NOT be held — the admin needs to see them. The "named" case below
--  is that control; without it, a trigger that dismissed EVERYONE would satisfy
--  the "bare is held" assertion just as well.

begin;

-- The migration, idempotent.
create or replace function private.hold_bare_signup()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if coalesce(btrim(new.full_name), '') = '' and new.signup_intent is null then
    insert into public.access_requests (profile_id, status)
    values (new.id, 'dismissed')
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists hold_bare_signup on public.profiles;
create trigger hold_bare_signup after insert on public.profiles
  for each row execute function private.hold_bare_signup();


create function pg_temp.check_hold() returns void language plpgsql as $fn$
declare
  v_bare  uuid := gen_random_uuid();
  v_named uuid := gen_random_uuid();
  n_bare  int;
  n_named int;
begin
  -- Inserting into auth.users fires the real chain: handle_new_user seeds the
  -- profile, then hold_bare_signup runs. Emails carry the uuid so a second call
  -- (the self-test) cannot collide on the unique email.
  insert into auth.users (id, instance_id, aud, role, email,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
  values
    (v_bare, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'db:check-bare-' || v_bare || '@example.test',
     '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now(), now()),
    (v_named, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'db:check-named-' || v_named || '@example.test',
     '{"provider":"email"}'::jsonb, '{"full_name":"Db Check Named"}'::jsonb, now(), now(), now());

  -- 1. THE BARE SIGNUP IS HELD (pre-dismissed).
  select count(*) into n_bare from public.access_requests
   where profile_id = v_bare and status = 'dismissed';
  if n_bare <> 1 then
    raise exception 'HOLD: a bare signup (no name, no intent) was not auto-held (dismissed rows = %)', n_bare;
  end if;

  -- 2. ⚠️ THE CONTROL — A NAMED SIGNUP IS LEFT ALONE, so the admin still sees it.
  select count(*) into n_named from public.access_requests where profile_id = v_named;
  if n_named <> 0 then
    raise exception 'HOLD: a named (OAuth-like) signup was wrongly held (rows = %)', n_named;
  end if;

  raise notice 'HOLD: all checks passed.';
end
$fn$;


-- Run it against live, unmodified.
-- Expected: NOTICE  HOLD: all checks passed.
select pg_temp.check_hold();


-- ⚠️ THE SELF-TEST — neuter the hold and prove the bare check catches it.
-- The plausible regression is a trigger that quietly does nothing (a bad
-- condition, a dropped trigger). If check_hold() still "passes" with the hold
-- gone, its bare assertion is vacuous.
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: HOLD: …
create or replace function private.hold_bare_signup()
  returns trigger language plpgsql security definer set search_path to 'public'
as $$ begin return new; end; $$;

do $$
begin
  begin
    perform pg_temp.check_hold();
    raise exception 'SELF-TEST FAILED: check_hold() passed while the hold was neutered. Its bare-signup assertion is vacuous.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then raise; end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ⚠️ NOT OPTIONAL. This really did create the trigger and insert auth users on
-- production; both are transactional and go back here. scripts/db-check.mjs
-- refuses any file in db/tests/ that could commit.
rollback;
