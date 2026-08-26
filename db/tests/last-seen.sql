-- Harness for db/migrations/20260826_last_seen.sql.
-- Run with `npm run db:check -- last-seen`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. touch stamps the CALLER's own row to ~now()
--  2. a second immediate touch does NOT move it — with the CONTROL that a
--     row back-dated 13 hours DOES move (the 12h throttle, both directions)
--  3. user one touching never moves user two's row (no-argument proof)
--  4. the backfill fills a NULL row from auth.last_sign_in_at and does NOT
--     overwrite a fresher non-NULL value
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000f0','ZZ Seenprobe Club');

-- user one signed in three days ago (the backfill source); user two never.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at, last_sign_in_at) values
 ('f0000000-0000-4000-8000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-seen-one@example.invalid', now(),'{}'::jsonb, now(), now(), now() - interval '3 days'),
 ('f0000000-0000-4000-8000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-seen-two@example.invalid', now(),'{}'::jsonb, now(), now(), null);

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-0000000000f1','f0000000-0000-4000-8000-0000000000f0', null, null, 'admin','active'),
 ('f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000f0', null, null, 'admin','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260826_last_seen.sql, verbatim
--    (begin/commit stripped — the harness owns the transaction) ──

alter table public.profiles add column if not exists last_seen_at timestamptz;

-- The column allow-list pattern (see photo_path): selectable, never
-- directly writable — the RPC below is the only write path.
grant select (last_seen_at) on public.profiles to authenticated;

-- No arguments ON PURPOSE: it structurally cannot stamp anyone else's row.
-- The 12-hour floor keeps this to roughly one write per person per day
-- whatever the client does.
create or replace function public.touch_last_seen()
returns void
language sql security definer
set search_path to 'public'
as $$
  update profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '12 hours');
$$;

revoke all on function public.touch_last_seen() from public;
revoke all on function public.touch_last_seen() from anon;
grant execute on function public.touch_last_seen() to authenticated;

-- Backfill from the auth event — a true "active at least then" floor
-- (measured 26 Aug 2026: 82 of 86 logins carry one), so the admin screen is
-- useful on day one. Idempotent: only fills NULLs.
update public.profiles p
   set last_seen_at = u.last_sign_in_at
  from auth.users u
 where u.id = p.id
   and p.last_seen_at is null
   and u.last_sign_in_at is not null;

-- ── end of inlined migration ────────────────────────────────────────────────

create function pg_temp.assert_last_seen() returns void language plpgsql as $fn$
declare
  one constant uuid := 'f0000000-0000-4000-8000-0000000000f1';
  two constant uuid := 'f0000000-0000-4000-8000-0000000000f2';
  seen_one timestamptz; seen_two timestamptz; before_touch timestamptz;
begin
  -- The backfill above has already run against the fixture (4a): user one's
  -- row carries the 3-day-old sign-in, user two's is still NULL.
  select last_seen_at into seen_one from profiles where id = one;
  if seen_one is distinct from (select last_sign_in_at from auth.users where id = one) then
    raise exception 'ASSERT 4 FAILED: backfill wrote % for user one', seen_one;
  end if;
  select last_seen_at into seen_two from profiles where id = two;
  if seen_two is not null then
    raise exception 'ASSERT 4 FAILED: backfill invented a value for the never-signed-in user';
  end if;
  insert into _log(line) values ('4a backfill: fills from last_sign_in_at, leaves never-signed-in NULL');

  -- 1: touch stamps the caller's own row (3 days old -> outside the 12h
  --    throttle, so it moves to now)
  perform pg_temp.as_user(one::text);
  perform touch_last_seen();
  reset role;
  select last_seen_at into seen_one from profiles where id = one;
  if seen_one is null or seen_one < now() - interval '1 minute' then
    raise exception 'ASSERT 1 FAILED: touch left last_seen_at at %', seen_one;
  end if;
  insert into _log(line) values ('1 touch stamps own row to now');

  -- 3: user one's touch never moved user two's row
  select last_seen_at into seen_two from profiles where id = two;
  if seen_two is not null then
    raise exception 'ASSERT 3 FAILED: user two''s row moved to %', seen_two;
  end if;
  insert into _log(line) values ('3 no-argument proof: the other row never moves');

  -- 2: a touch INSIDE the 12h window does not move the stamp.
  --    ⚠️ BACK-DATED ONE HOUR, NOT COMPARED AGAINST AN IMMEDIATE RE-TOUCH:
  --    now() is frozen per transaction, so an UN-throttled second touch
  --    rewrites the identical timestamp and an equality assert passes
  --    against the very bug. Found by injecting the fault (the throttle
  --    clause deleted) and watching the first version of this assert
  --    fail to fail, 26 Aug 2026.
  update profiles set last_seen_at = now() - interval '1 hour' where id = one;
  select last_seen_at into before_touch from profiles where id = one;
  perform pg_temp.as_user(one::text);
  perform touch_last_seen();
  reset role;
  select last_seen_at into seen_one from profiles where id = one;
  if seen_one is distinct from before_touch then
    raise exception 'ASSERT 2 FAILED: a 1h-old stamp moved — the 12h throttle is not holding';
  end if;
  -- …with the CONTROL: back-date 13 hours and the same call DOES move it,
  -- so the non-move above is the throttle refusing, not the touch breaking.
  update profiles set last_seen_at = now() - interval '13 hours' where id = one;
  perform pg_temp.as_user(one::text);
  perform touch_last_seen();
  reset role;
  select last_seen_at into seen_one from profiles where id = one;
  if seen_one < now() - interval '1 minute' then
    raise exception 'ASSERT 2 FAILED (control): a 13h-old stamp did not move';
  end if;
  insert into _log(line) values ('2 throttle: 12h floor holds, and the control moves');

  -- 4b: the backfill never overwrites a fresher non-NULL value — re-run it
  --     (idempotence is the migration's own claim) and user one keeps now()
  update public.profiles p
     set last_seen_at = u.last_sign_in_at
    from auth.users u
   where u.id = p.id
     and p.last_seen_at is null
     and u.last_sign_in_at is not null;
  select last_seen_at into seen_one from profiles where id = one;
  if seen_one < now() - interval '1 minute' then
    raise exception 'ASSERT 4 FAILED: re-running the backfill clobbered a fresh stamp';
  end if;
  insert into _log(line) values ('4b backfill re-run: fresher value survives');
end $fn$;

select pg_temp.assert_last_seen();
select line from _log order by seq;
rollback;
