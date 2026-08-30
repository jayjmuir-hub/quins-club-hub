-- ══════════════════════════════════════════════════════════════════════════
--  PUSH ENDPOINT ALLOWLIST HARNESS (Grok item 12) — register_push_subscription
--  refuses anything that is not a real browser push service.
--  Run with `npm run db:check -- push-endpoint`.
--  SAFE ON PRODUCTION: one transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. db/migrations/20260830_push_hardening.sql §1: the endpoint
-- is a URL push-send will POST to from inside the edge runtime, so it must be
-- https and on the allowlist — otherwise a member could aim signed requests
-- at http://169.254.169.254/ or any internal host. Asserts the DEPLOYED
-- state — green only once applied.

begin;

-- Invented person — this repo is public.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pushprobe@example.invalid', now(), '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email) values
 ('c0000000-0000-4000-8000-0000000000b1','Harness Pusher','pushprobe@example.invalid')
on conflict (id) do nothing;
insert into memberships (profile_id, club_id, role, status, team_id)
select 'c0000000-0000-4000-8000-0000000000b1', id, 'admin', 'active', null from clubs limit 1;

do $harness$
declare
  ok boolean; bad text; caught boolean;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','c0000000-0000-4000-8000-0000000000b1')::text, true);

  -- 1 · POSITIVE controls: the three real services (all three exist in
  --     production today) register fine.
  perform public.register_push_subscription('https://fcm.googleapis.com/fcm/send/harness-1', 'k', 'a');
  perform public.register_push_subscription('https://web.push.apple.com/harness-2', 'k', 'a');
  perform public.register_push_subscription('https://updates.push.services.mozilla.com/wpush/v2/harness-3', 'k', 'a');
  perform public.register_push_subscription('https://jmt17.google.com/gcm/harness-4', 'k', 'a');

  -- 2 · NEGATIVE: every shape of hostile endpoint is refused with 22023.
  for bad in
    select unnest(array[
      'http://fcm.googleapis.com/fcm/send/downgraded',
      'http://169.254.169.254/latest/meta-data/',
      'https://169.254.169.254/latest/meta-data/',
      'https://internal.example.com/hook',
      'https://evilfcm.googleapis.com.attacker.net/x',
      'https://attacker.net/.google.com/',
      'ftp://fcm.googleapis.com/x'
    ])
  loop
    caught := false;
    begin
      perform public.register_push_subscription(bad, 'k', 'a');
    exception when sqlstate '22023' then caught := true;
    end;
    if not caught then
      reset role;
      raise exception 'PUSH ALLOWLIST: hostile endpoint was ACCEPTED: %', bad;
    end if;
  end loop;

  reset role;
  raise notice 'PUSH ALLOWLIST: four real services accepted, seven hostile shapes refused.';
end $harness$;

-- ── ⚠️ THE SELF-TEST — put the unvalidated definition back and prove the
-- metadata endpoint then registers, so the allowlist is what refuses it. ───
do $selftest$
declare caught boolean := false;
begin
  create or replace function public.register_push_subscription(_endpoint text, _p256dh text, _auth text)
  returns void language plpgsql security definer set search_path = public as $f$
  declare _me uuid := auth.uid();
  begin
    if _me is null then raise exception 'not signed in' using errcode = '42501'; end if;
    if _endpoint is null or btrim(_endpoint) = '' then raise exception 'endpoint required' using errcode = '22023'; end if;
    delete from public.push_subscriptions where endpoint = _endpoint;
    insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (_me, _endpoint, _p256dh, _auth);
  end; $f$;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub','c0000000-0000-4000-8000-0000000000b1')::text, true);
  begin
    perform public.register_push_subscription('http://169.254.169.254/latest/meta-data/', 'k', 'a');
  exception when others then caught := true;
  end;
  reset role;
  if caught then
    raise exception 'SELF-TEST FAILED: even the OLD definition refused the metadata endpoint — the harness is not exercising the allowlist.';
  end if;
  raise notice 'SELF-TEST PASSED — reverting the definition let the metadata endpoint register, so the allowlist is what refuses it.';
end $selftest$;

rollback;
