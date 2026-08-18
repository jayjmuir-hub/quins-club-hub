-- ══════════════════════════════════════════════════════════════════════════
--  PUSH NOTIFICATIONS HARNESS — subscription privacy, and does a reply fire?
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  net.http_post is an ordinary transactional INSERT into
--  net.http_request_queue, so a queued row from this file never survives to
--  be picked up by the background worker — the rollback removes it before
--  anything is ever actually sent.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- claude/plans/2026-08-18-push-notifications.md. Two things need proving
-- before trusting either half of the feature:
--
--   1. `public.push_subscriptions` is owner-only — a person's device
--      identity (the push endpoint) must not be readable, writable or
--      deletable by anybody but them.
--   2. The `notify_feedback_reply_push` trigger fires on exactly the
--      condition the reporter's own screen would show something new for —
--      `status` or `admin_note` changing — and NOT on every UPDATE. The
--      client always sets `handled_by`/`handled_at` on any triage action, so
--      a trigger that fired on ANY column changing would look identical to
--      one scoped correctly right up until an admin note gets added twice in
--      a row with the same status, which must fire, or a housekeeping update
--      that touches neither field, which must not.
--
-- WHAT THIS ASSERTS
--
--   1. an owner may insert, read, update and delete their OWN row      <- baseline
--   2. a DIFFERENT signed-in person cannot see, edit or delete it      <- the point
--   3. `anon` holds no privilege on the table at all                  <- control
--   4. changing `admin_note` (status untouched) queues a push          <- the trigger, arm 1
--   5. changing `status` (note untouched) queues a push                <- the trigger, arm 2
--   6. changing ONLY handled_by/handled_at queues NOTHING              <- the trigger, the control
--
-- ⚠️ 6 IS NOT PADDING. Without it, a trigger with no WHEN clause at all —
-- firing on every UPDATE — would pass assertions 4 and 5 just as well, and
-- every future triage housekeeping change would fire a push nobody asked for.
--
-- ⚠️ A SYNTHETIC CLUB AND REPORT, NOT A REAL ONE, so a result here is about
-- the fixture and never about an actual member's device or a real report.
-- ⚠️ AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.

begin;

create temporary table _log(seq serial, line text) on commit drop;
-- ⚠️ GRANTED TO `authenticated` — several assertions below record their result
-- while that role is switched, and without this the grant itself fails
-- (permission denied for table _log) before the answer is ever recorded.
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

-- ── The cast ──────────────────────────────────────────────────────────────
--   OWNER   filed the report; owns one push subscription.
--   OTHER   an unrelated signed-in member — the RLS control.
--   ADMIN   active admin of the same club — triages the report.

insert into clubs (id, name) values
 ('f0000000-0000-4000-8000-0000000000c1','ZZ Push Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values
 ('f0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-push-owner@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-push-other@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-push-admin@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000f1','f0000000-0000-4000-8000-0000000000c1','ZZ Push Probe Squad', 994);

-- ⚠️ 'coach', not 'parent' — memberships_family_role_needs_player requires a
-- player_id for role parent/player, and the owner's family relationships are
-- irrelevant here. Any active membership in the club is enough to satisfy
-- `feedback create`'s policy; 'coach' with a team_id needs no player row.
insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-0000000000c1','f0000000-0000-4000-8000-0000000000f1', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-0000000000c1', null, null, 'admin', 'active');

-- ⚠️ `ref` IS `GENERATED ALWAYS AS IDENTITY` — left off the column list rather
-- than supplied, so it takes whatever the sequence gives it.
-- ⚠️ INSERTED AS THE OWNER, NOT AS `postgres` — `private.stamp_feedback()`
-- (a BEFORE INSERT trigger) reads auth.uid() and refuses with "no active
-- membership: cannot file feedback" when nobody is signed in, and the
-- `feedback create` policy separately requires `submitted_by = auth.uid()`.
set local request.jwt.claims = '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
insert into feedback (id, club_id, submitted_by, kind, body, status)
values
 ('f0000000-0000-4000-8000-0000000000b1', 'f0000000-0000-4000-8000-0000000000c1',
  'f0000000-0000-4000-8000-000000000001', 'bug', 'ZZ probe report body', 'new');
reset role;


create function pg_temp.assert_push_notifications() returns void language plpgsql as $fn$
declare
  problems text := '';
  n        int;
  before_q bigint;
  after_q  bigint;

  owner constant uuid := 'f0000000-0000-4000-8000-000000000001';
  other constant uuid := 'f0000000-0000-4000-8000-000000000002';
  admin constant uuid := 'f0000000-0000-4000-8000-000000000003';
  report constant uuid := 'f0000000-0000-4000-8000-0000000000b1';
  sub_id uuid;
begin
  -- ── 1. Owner manages their own row ──────────────────────────────────────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into push_subscriptions (profile_id, endpoint, p256dh, auth)
  values (owner, 'https://zz-push-probe.example.invalid/ep1', 'zz-p256dh', 'zz-auth')
  returning id into sub_id;

  select count(*) into n from push_subscriptions where id = sub_id;
  if n <> 1 then
    problems := problems || 'OWNER: could not read back the row it just inserted. ';
  end if;

  update push_subscriptions set p256dh = 'zz-p256dh-2' where id = sub_id;
  get diagnostics n = row_count;
  reset role;

  insert into _log(line) values (format('1 owner insert/select/update: sub_id=%s, own update affected %s row(s) (want 1)', sub_id, n));
  if n <> 1 then
    problems := problems || 'OWNER: updating its own row affected an unexpected number of rows. ';
  end if;

  -- ── 2. A DIFFERENT signed-in person cannot see, edit or delete it ──────
  perform set_config('request.jwt.claims',
                     json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from push_subscriptions where id = sub_id;
  insert into _log(line) values (format('2a other reads: %s row(s) (want 0)', n));
  if n <> 0 then
    problems := problems || format('RLS: a different signed-in person read %s row(s) of another member''s subscription. ', n);
  end if;

  update push_subscriptions set endpoint = 'https://hijacked.example.invalid/' where id = sub_id;
  get diagnostics n = row_count;
  insert into _log(line) values (format('2b other updates: %s row(s) affected (want 0)', n));
  if n <> 0 then
    problems := problems || 'RLS: a different signed-in person UPDATED another member''s subscription row. ';
  end if;

  delete from push_subscriptions where id = sub_id;
  get diagnostics n = row_count;
  insert into _log(line) values (format('2c other deletes: %s row(s) affected (want 0)', n));
  if n <> 0 then
    problems := problems || 'RLS: a different signed-in person DELETED another member''s subscription row. ';
  end if;

  reset role;
  select count(*) into n from push_subscriptions where id = sub_id;
  if n <> 1 then
    problems := problems || 'RLS: the owner''s row is gone after the OTHER arm ran — it should be untouched. ';
  end if;

  -- ── 3. anon holds no privilege on the table at all ─────────────────────
  if has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
     or has_table_privilege('anon', 'public.push_subscriptions', 'INSERT')
     or has_table_privilege('anon', 'public.push_subscriptions', 'UPDATE')
     or has_table_privilege('anon', 'public.push_subscriptions', 'DELETE') then
    problems := problems || 'GRANTS: anon holds a privilege on push_subscriptions and should hold none. ';
  end if;
  insert into _log(line) values ('3 anon privileges: none (confirmed)');

  -- ── 4. Changing admin_note (status untouched) queues a push ────────────
  select coalesce(max(id), 0) into before_q from net.http_request_queue;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update feedback set admin_note = 'ZZ first reply', handled_by = admin, handled_at = now()
   where id = report;
  reset role;
  select coalesce(max(id), 0) into after_q from net.http_request_queue;
  insert into _log(line) values (format('4 admin_note change queues a push: before=%s after=%s', before_q, after_q));
  if after_q <= before_q then
    problems := problems || 'TRIGGER: changing admin_note (status unchanged) did not queue a push. ';
  end if;

  -- ── 5. Changing status (note untouched) queues a push ──────────────────
  select coalesce(max(id), 0) into before_q from net.http_request_queue;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update feedback set status = 'in-progress', handled_by = admin, handled_at = now()
   where id = report;
  reset role;
  select coalesce(max(id), 0) into after_q from net.http_request_queue;
  insert into _log(line) values (format('5 status change queues a push: before=%s after=%s', before_q, after_q));
  if after_q <= before_q then
    problems := problems || 'TRIGGER: changing status (admin_note unchanged) did not queue a push. ';
  end if;

  -- ── 6. THE CONTROL: touching only handled_by/handled_at queues NOTHING ─
  select coalesce(max(id), 0) into before_q from net.http_request_queue;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update feedback set handled_by = admin, handled_at = now()
   where id = report; -- status and admin_note deliberately left exactly as they are
  reset role;
  select coalesce(max(id), 0) into after_q from net.http_request_queue;
  insert into _log(line) values (format('6 housekeeping-only change queues nothing: before=%s after=%s', before_q, after_q));
  if after_q > before_q then
    problems := problems ||
      'CONTROL FAILED: an UPDATE that changed neither status nor admin_note still queued a push. '
      'The WHEN clause is not scoping this trigger — it is firing on every UPDATE, which means '
      'every future triage housekeeping change will push a notification nobody asked for. ';
  end if;

  if problems <> '' then
    raise exception '%', problems;
  end if;
end
$fn$;


-- ── Run it. This must pass. ───────────────────────────────────────────────

do $$
begin
  perform pg_temp.assert_push_notifications();
  raise notice 'PUSH NOTIFICATIONS: all checks passed.';
  insert into _log(line) values ('PUSH NOTIFICATIONS: all checks passed.');
end $$;


-- ── SELF-TEST: put the RLS fault back and prove the check catches it ──────
--
-- ⚠️ NOT OPTIONAL. Assertion 2 is three "this write affected zero rows"
-- checks, and a typo'd uuid or a dropped policy makes all three vacuously
-- true. Drop the policy, prove the check catches it, put it back.

drop policy "push subscription own" on public.push_subscriptions;

do $$
declare caught text;
begin
  begin
    perform pg_temp.assert_push_notifications();
    raise exception
      'SELF-TEST FAILED — the owner-only policy was dropped and this harness still '
      'passed. It is not measuring subscription privacy at all. Do not trust a green '
      'run from this file until that is fixed.';
  exception when others then
    caught := sqlerrm;
    if caught like 'SELF-TEST FAILED%' then
      raise exception '%', caught;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', caught;
    insert into _log(line) values ('SELF-TEST PASSED — the check caught it: ' || caught);
  end;
end $$;

create policy "push subscription own"
  on public.push_subscriptions
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());


-- ── What was measured, for a runner that shows rows rather than notices ───

select line from _log order by seq;


-- ── Undo everything ──────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. This file really did insert a club, a squad-less parent and
-- admin, a report, and a push subscription into production, and really did
-- drop and recreate the table's only RLS policy. The rollback is what makes
-- that acceptable, and scripts/db-check.mjs refuses any file here that could
-- commit instead. It also means the net.http_request_queue rows this file
-- queued NEVER reach the background worker — they roll back before anything
-- is ever actually sent.

rollback;
