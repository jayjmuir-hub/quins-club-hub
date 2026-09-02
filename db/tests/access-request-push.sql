-- ══════════════════════════════════════════════════════════════════════════
--  ACCESS-REQUEST PUSH HARNESS — who is told that somebody has asked to join
--  the club, and who must never be told.
--  Run with `npm run db:check -- access-request-push`.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  The only rows it writes are disposable access_requests rows and one
--  opt-out, all its own.
-- ══════════════════════════════════════════════════════════════════════════
--
-- The rule (db/migrations/20260902_access_request_push.sql): active SUPER
-- admins, never the requester, only while pending, minus anybody who has
-- switched the `approval` category off. Restated here independently and
-- asserted in BOTH directions, for the reasons db/tests/approval-push.sql
-- gives at length: somebody EXTRA is a disclosure about a person the club has
-- not admitted; somebody MISSING is a request nobody is buzzed about, and it
-- is also the control that stops the first check passing on an empty set.
--
-- ⚠️ access_requests HAS UNIQUE (profile_id). The disposable rows below are
-- created for profiles that have none, and the subscribed super admin's own
-- row, if one exists, is deleted first — inside the transaction, so it comes
-- back at rollback.

begin;

create function pg_temp.check_access_request_push() returns void language plpgsql as $fn$
declare
  v_sub    uuid;
  v_other  uuid;
  v_theirs uuid;
  v_mine   uuid;
  n        int;
  bad      int;
  n_supers int;
  n_all    int;
begin
  -- ── 1a. CONTROL: super admins exist at all ──────────────────────────────
  select count(*) into n_supers
    from public.memberships where is_super and status = 'active';
  if n_supers < 1 then
    raise exception
      'ACCESS-REQUEST PUSH: no active super admin exists. An audience '
      'function that returned nothing would satisfy 1b perfectly.';
  end if;

  -- ── 1b. Nobody EXTRA ────────────────────────────────────────────────────
  select count(*) into bad
    from private.access_request_audience(null) as aud(profile_id)
   where not exists (
     select 1 from public.memberships m
      where m.profile_id = aud.profile_id
        and m.status = 'active' and m.is_super);
  if bad > 0 then
    raise exception
      'ACCESS-REQUEST PUSH: % people who are not active super admins would be '
      'told that a named person asked to join. See '
      'db/migrations/20260902_access_request_push.sql.', bad;
  end if;

  -- ── 1c. Nobody MISSING ──────────────────────────────────────────────────
  select count(*) into bad
    from public.memberships m
   where m.status = 'active' and m.is_super
     and not exists (
       select 1 from private.access_request_audience(null) as aud(profile_id)
        where aud.profile_id = m.profile_id);
  if bad > 0 then
    raise exception
      'ACCESS-REQUEST PUSH: % active super admins would NOT be told. Every '
      '"expect 0" in 1b is then free.', bad;
  end if;

  -- ── 1d. A subscribed super admin, for the per-request checks ────────────
  select s.profile_id into v_sub
    from public.push_subscriptions s
    join public.memberships m
      on m.profile_id = s.profile_id and m.status = 'active' and m.is_super
   limit 1;
  if v_sub is null then
    raise notice 'ACCESS-REQUEST PUSH: no subscribed super admin, so 1e is skipped.';
    raise notice 'ACCESS-REQUEST PUSH: all checks passed.';
    return;
  end if;

  select p.id into v_other from public.profiles p
   where p.id <> v_sub
     and not exists (select 1 from public.access_requests r where r.profile_id = p.id)
   limit 1;
  if v_other is null then
    raise notice 'ACCESS-REQUEST PUSH: no profile without a request, so 1e is skipped.';
    raise notice 'ACCESS-REQUEST PUSH: all checks passed.';
    return;
  end if;

  -- ── 1e. Per request: reaches them, never themselves, honours opt-out and
  --        status. ⚠️ EVERY COUNT IS FILTERED TO v_sub — the function returns
  --        the whole audience with no profile_id, and an unfiltered count
  --        answers a different question (db/tests/approval-push.sql, 20 Aug).
  insert into public.access_requests (profile_id, status)
       values (v_other, 'pending')
    returning id into v_theirs;

  select count(*) into n from public.access_request_push_subscriptions(v_theirs) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n < 1 then
    raise exception
      'ACCESS-REQUEST PUSH: a request by somebody else did not reach the '
      'subscribed super admin (% rows). Every "expect 0" below is then free.', n;
  end if;

  delete from public.access_requests where profile_id = v_sub;
  insert into public.access_requests (profile_id, status)
       values (v_sub, 'pending')
    returning id into v_mine;
  select count(*) into n from public.access_request_push_subscriptions(v_mine) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n <> 0 then
    raise exception
      'ACCESS-REQUEST PUSH: the REQUESTER would be buzzed about their own request.';
  end if;
  -- Control for the line above: with more than one super admin the request
  -- still reaches SOMEBODY, so the zero is exclusion, not an empty audience.
  select count(*) into n_all from public.access_request_push_subscriptions(v_mine);
  if n_supers > 1 and n_all < 1 then
    raise exception
      'ACCESS-REQUEST PUSH: nobody at all is told about a pending request (%) '
      'although % super admins exist. The requester-exclusion check is then free.',
      n_all, n_supers;
  end if;

  insert into public.notification_opt_outs (profile_id, category) values (v_sub, 'approval');
  select count(*) into n from public.access_request_push_subscriptions(v_theirs) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n <> 0 then
    raise exception 'ACCESS-REQUEST PUSH: an opt-out row did not stop the notification.';
  end if;
  delete from public.notification_opt_outs where profile_id = v_sub and category = 'approval';

  update public.access_requests set status = 'dismissed' where id = v_theirs;
  select count(*) into n from public.access_request_push_subscriptions(v_theirs);
  if n <> 0 then
    raise exception
      'ACCESS-REQUEST PUSH: a request that is no longer pending would still notify.';
  end if;

  update public.access_requests set status = 'pending' where id = v_theirs;
  select count(*) into n from public.access_request_push_subscriptions(v_theirs) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n < 1 then
    raise exception
      'ACCESS-REQUEST PUSH: the target did not come back once the conditions '
      'were cleared (% rows). The zeros above therefore prove nothing.', n;
  end if;

  raise notice 'ACCESS-REQUEST PUSH: all checks passed.';
end
$fn$;

select pg_temp.check_access_request_push();

rollback;
