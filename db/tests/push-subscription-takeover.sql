-- ══════════════════════════════════════════════════════════════════════════
--  PUSH SUBSCRIPTION TAKEOVER HARNESS — a phone that changes hands
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- db/migrations/20260823_push_subscription_takeover.sql. Found live on
-- 23 Aug 2026: the second person to sign in on one iPhone could not turn on
-- notifications, because the device's endpoint row belonged to the first
-- person and the client's upsert became an UPDATE that RLS refused.
--
-- WHAT THIS ASSERTS
--
--   1. the OLD path really fails — FIRST owns the endpoint, SECOND's upsert
--      on it raises the RLS error                                 <- the bug, reproduced
--   2. register_push_subscription as SECOND moves the endpoint:
--      exactly one row for it, owned by SECOND, with SECOND's keys <- the fix
--   3. FIRST's OTHER device (a different endpoint) is untouched    <- the control
--   4. anon cannot execute the function                            <- grant
--   5. a signed-out call is refused                                <- guard
--
-- ⚠️ 3 IS NOT PADDING. A function that did `delete … where profile_id = …`
-- instead of `where endpoint = …` would pass 1 and 2 and silently log the
-- previous owner out of push on every device they own.
--
-- ⚠️ A SYNTHETIC CLUB, NOT A REAL ONE, AND EVERY NAME IS INVENTED —
-- CLAUDE.md rule 9.

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

-- ── The cast ──────────────────────────────────────────────────────────────
--   FIRST   signed in on the shared phone first; also owns a laptop.
--   SECOND  signs in on the same phone afterwards.

insert into clubs (id, name) values
 ('f0000000-0000-4000-8000-0000000000c2','ZZ Takeover Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('f0000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-takeover-first@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-takeover-second@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000c2','ZZ Takeover Probe Squad', 995);

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000011','f0000000-0000-4000-8000-0000000000c2','f0000000-0000-4000-8000-0000000000f2', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000012','f0000000-0000-4000-8000-0000000000c2','f0000000-0000-4000-8000-0000000000f2', null, 'coach','active');

-- FIRST owns the phone AND a laptop. Endpoints are invented but must sit on a
-- real push host: 20260830_push_hardening.sql added an endpoint allowlist
-- (private.push_endpoint_allowed), and the old `push.example.invalid` fixture
-- endpoints were refused by it — repointed here 31 Aug 2026.
insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000011','https://web.push.apple.com/zz-harness-shared-phone','first-phone-p256dh','first-phone-auth'),
 ('f0000000-0000-4000-8000-000000000011','https://web.push.apple.com/zz-harness-first-laptop','first-laptop-p256dh','first-laptop-auth');

create function pg_temp.assert_takeover() returns void language plpgsql as $fn$
declare
  n int;
  owner uuid;
  keys text;
  caught text;
begin
  -- 1. The bug, reproduced: SECOND's upsert on the shared phone's endpoint.
  perform set_config('request.jwt.claims',
    '{"sub":"f0000000-0000-4000-8000-000000000012","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into push_subscriptions (profile_id, endpoint, p256dh, auth)
    values ('f0000000-0000-4000-8000-000000000012','https://web.push.apple.com/zz-harness-shared-phone','second-phone-p256dh','second-phone-auth')
    on conflict (endpoint) do update
      set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth;
    caught := null;
  exception when others then
    caught := sqlerrm;
  end;
  reset role;
  if caught is null or caught not like '%row-level security%' then
    raise exception 'ASSERT 1 FAILED: the old upsert did not raise the RLS error (got: %)', coalesce(caught, 'no error');
  end if;
  insert into _log(line) values ('1 old upsert path fails with the RLS error (reproduced)');

  -- 2. The fix: SECOND registers through the function.
  perform set_config('request.jwt.claims',
    '{"sub":"f0000000-0000-4000-8000-000000000012","role":"authenticated"}', true);
  set local role authenticated;
  perform public.register_push_subscription(
    'https://web.push.apple.com/zz-harness-shared-phone', 'second-phone-p256dh', 'second-phone-auth');
  reset role;

  select count(*) into n from push_subscriptions where endpoint = 'https://web.push.apple.com/zz-harness-shared-phone';
  select profile_id, p256dh || '/' || auth into owner, keys
    from push_subscriptions where endpoint = 'https://web.push.apple.com/zz-harness-shared-phone';
  if n <> 1 then
    raise exception 'ASSERT 2 FAILED: % row(s) for the shared endpoint (want 1)', n;
  end if;
  if owner <> 'f0000000-0000-4000-8000-000000000012' then
    raise exception 'ASSERT 2 FAILED: shared endpoint still owned by %', owner;
  end if;
  if keys <> 'second-phone-p256dh/second-phone-auth' then
    raise exception 'ASSERT 2 FAILED: keys not replaced (%)', keys;
  end if;
  insert into _log(line) values (format('2 takeover: shared endpoint now has %s row, owned by SECOND, SECOND''s keys', n));

  -- 3. The control: FIRST's laptop is untouched.
  select count(*) into n from push_subscriptions
   where endpoint = 'https://web.push.apple.com/zz-harness-first-laptop'
     and profile_id = 'f0000000-0000-4000-8000-000000000011'
     and p256dh = 'first-laptop-p256dh';
  if n <> 1 then
    raise exception 'ASSERT 3 FAILED: FIRST''s laptop row changed or vanished (% row(s))', n;
  end if;
  insert into _log(line) values ('3 control: FIRST''s other device untouched');

  -- 4. anon cannot execute.
  if has_function_privilege('anon', 'public.register_push_subscription(text,text,text)', 'execute') then
    raise exception 'ASSERT 4 FAILED: anon may execute register_push_subscription';
  end if;
  insert into _log(line) values ('4 grants: anon cannot execute');

  -- 5. Signed-out call refused.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.register_push_subscription('https://web.push.apple.com/zz-harness-nobody', 'x', 'y');
    caught := null;
  exception when others then
    caught := sqlerrm;
  end;
  reset role;
  if caught is null then
    raise exception 'ASSERT 5 FAILED: a call with no uid succeeded';
  end if;
  insert into _log(line) values ('5 guard: signed-out call refused (' || caught || ')');
end $fn$;

select pg_temp.assert_takeover();

-- ── Self-test: the control (3) must be able to fail ───────────────────────
-- Re-inject the fault this harness exists to catch — a takeover keyed on the
-- OWNER rather than the endpoint — and confirm assertion 3 notices.
do $$
declare caught text;
begin
  -- A deliberately wrong implementation: delete everything FIRST owns.
  create or replace function public.register_push_subscription(_endpoint text, _p256dh text, _auth text)
  returns void language plpgsql security definer set search_path = public as $w$
  begin
    delete from public.push_subscriptions
     where profile_id in (select profile_id from public.push_subscriptions where endpoint = _endpoint);
    insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (auth.uid(), _endpoint, _p256dh, _auth);
  end $w$;

  -- Reset the fixture so the wrong function has something to get wrong.
  delete from push_subscriptions where endpoint like 'https://web.push.apple.com/zz-harness-%';
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
   ('f0000000-0000-4000-8000-000000000011','https://web.push.apple.com/zz-harness-shared-phone','first-phone-p256dh','first-phone-auth'),
   ('f0000000-0000-4000-8000-000000000011','https://web.push.apple.com/zz-harness-first-laptop','first-laptop-p256dh','first-laptop-auth');

  begin
    perform pg_temp.assert_takeover();
    caught := 'SELF-TEST FAILED: the wrong implementation passed';
  exception when others then
    caught := sqlerrm;
  end;
  if caught like 'SELF-TEST FAILED%' or caught not like 'ASSERT 3 FAILED%' then
    raise exception 'SELF-TEST FAILED — expected assertion 3 to catch the owner-keyed delete, got: %', caught;
  end if;
  insert into _log(line) values ('SELF-TEST PASSED — assertion 3 caught the owner-keyed delete: ' || caught);
end $$;

select line from _log order by seq;

-- ── Undo everything ──────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. This file inserted a club, two people, two subscriptions,
-- and REPLACED a production function with a deliberately wrong one. The
-- rollback is what makes that acceptable.
rollback;
