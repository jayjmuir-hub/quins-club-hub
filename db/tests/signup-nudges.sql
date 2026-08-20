-- ══════════════════════════════════════════════════════════════════════════
--  SIGNUP-NUDGE HARNESS — who gets chased, and more importantly who does not.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- The follow-up email goes to real families who did nothing wrong, so the
-- expensive mistake here is not "somebody was missed" — it is "somebody was
-- chased who should have been left alone". Every assertion below is about the
-- second kind.
--
-- ⚠️ AND ONE OF THEM ENCODES A MISTAKE THIS PROJECT MADE THE SAME DAY.
-- "Has an access request" is NOT "has finished": RollCall's mount check read it
-- that way and turned the sign-up screen into a dead end within an hour of the
-- first screen starting to write a request for everybody. Part 3 pins the rule
-- that survived that — only a `volunteer` request means finished.

begin;

-- ── 1. The structure exists ──────────────────────────────────────────────
do $$
begin
  if to_regclass('public.signup_nudges') is null then
    raise exception 'public.signup_nudges is missing — apply '
      'db/migrations/20260820_signup_nudges.sql.';
  end if;
  if not exists (select 1 from cron.job where jobname = 'signup-nudge' and active) then
    raise exception 'the signup-nudge cron job is missing or inactive — nothing will ever be sent.';
  end if;
end $$;

-- ── 2. The table is invisible to members ─────────────────────────────────
-- ⚠️ WITH A CONTROL. "authenticated cannot read it" would also pass if the
-- table had been dropped, so the same call is made for a table it certainly
-- CAN read, and the pair is what proves the check is asking a real question.
do $$
declare
  can_read_nudges  boolean := has_table_privilege('authenticated','public.signup_nudges','SELECT');
  can_read_teams   boolean := has_table_privilege('authenticated','public.teams','SELECT');
  policy_count     int;
begin
  select count(*) into policy_count from pg_policy
   where polrelid = 'public.signup_nudges'::regclass;

  if can_read_nudges or policy_count > 0 then
    raise exception 'signup_nudges is readable by members (grant=%, policies=%). It lists who '
      'the club has chased and must stay private to the definer function.',
      can_read_nudges, policy_count;
  end if;
  if not can_read_teams then
    raise exception 'the control failed: authenticated cannot read public.teams either, so the '
      'result above proves nothing about signup_nudges.';
  end if;
end $$;

-- ── 3. Who is EXCLUDED, which is the part that matters ───────────────────
-- Each case is built, checked, and left to the rollback.
do $$
declare
  club   uuid;
  team   uuid;
  finished  uuid := gen_random_uuid();
  volunteer uuid := gen_random_uuid();
  refused   uuid := gen_random_uuid();
  stuck     uuid := gen_random_uuid();
  hit       int;
begin
  select id into club from public.clubs limit 1;
  select id into team from public.teams limit 1;
  if club is null or team is null then
    raise exception 'no club or team on this database, so this harness could not run. That is not a pass.';
  end if;

  -- Four profiles, all old enough and all confirmed. Only ONE is stuck.
  insert into public.profiles (id, full_name, first_name, email, email_confirmed_at, created_at)
  values (finished,  'A Finished Person',  'Finished',  'finished@adhq.example',  now(), now() - interval '9 days'),
         (volunteer, 'A Waiting Helper',   'Waiting',   'helper@adhq.example',    now(), now() - interval '9 days'),
         (refused,   'A Refused Stranger', 'Refused',   'refused@adhq.example',   now(), now() - interval '9 days'),
         (stuck,     'An Interrupted One', 'Interrupted','stuck@adhq.example',    now(), now() - interval '9 days');

  -- ⚠️ auth.users IS WHAT THE CANDIDATE QUERY READS, not profiles. Seeding only
  -- profiles would leave every case invisible and the harness would report a
  -- clean pass while asserting nothing.
  insert into auth.users (id, email, email_confirmed_at, created_at, instance_id, aud, role)
  values (finished,  'finished@adhq.example',  now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         (volunteer, 'helper@adhq.example',    now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         (refused,   'refused@adhq.example',   now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         (stuck,     'stuck@adhq.example',     now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  -- finished: ANY membership row disqualifies, pending included — claiming a
  -- squad and registering a child both write one.
  insert into public.memberships (profile_id, club_id, team_id, role, status)
  values (finished, club, team, 'coach', 'pending');

  -- volunteer: their request IS the whole ask. Waiting on an admin, not stuck.
  insert into public.access_requests (profile_id, status, requested_role, requested_team_id)
  values (volunteer, 'pending', 'volunteer', team);

  -- refused: the club already said no. Chasing them invites a re-application.
  insert into public.access_requests (profile_id, status, requested_role, requested_team_id)
  values (refused, 'dismissed', 'parent', team);

  -- stuck: asked as a parent and never finished. THE one that should be chased.
  insert into public.access_requests (profile_id, status, requested_role, requested_team_id)
  values (stuck, 'pending', 'parent', team);

  select count(*) into hit from private.unfinished_signup_candidates(1)
   where profile_id in (finished, volunteer, refused);
  if hit > 0 then
    raise exception 'the nudge would chase % people it must leave alone '
      '(finished / waiting-volunteer / already-refused).', hit;
  end if;

  select count(*) into hit from private.unfinished_signup_candidates(1)
   where profile_id = stuck;
  if hit <> 1 then
    raise exception 'the interrupted signup was NOT selected (%). With the three exclusions '
      'above passing, a check that selects nobody proves nothing.', hit;
  end if;

  -- ── 4. The second never arrives without the first ──────────────────────
  select count(*) into hit from private.unfinished_signup_candidates(2)
   where profile_id = stuck;
  if hit <> 0 then
    raise exception 'nudge 2 would reach somebody who has never had nudge 1 — they would open '
      'with "this is the last reminder we will send".';
  end if;

  insert into public.signup_nudges (profile_id, nudge_no) values (stuck, 1);

  select count(*) into hit from private.unfinished_signup_candidates(1)
   where profile_id = stuck;
  if hit <> 0 then
    raise exception 'nudge 1 would be sent twice — the claim row did not exclude them.';
  end if;

  select count(*) into hit from private.unfinished_signup_candidates(2)
   where profile_id = stuck;
  if hit <> 1 then
    raise exception 'nudge 2 did not follow nudge 1, so the second reminder never arrives.';
  end if;

  insert into public.signup_nudges (profile_id, nudge_no) values (stuck, 2);

  select count(*) into hit from private.unfinished_signup_candidates(1)
   where profile_id = stuck;
  hit := hit + (select count(*) from private.unfinished_signup_candidates(2)
                 where profile_id = stuck);
  if hit <> 0 then
    raise exception 'a third email would be sent. Two is the cap, and the PRIMARY KEY is what '
      'enforces it.';
  end if;
end $$;

-- ⚠️ NOT OPTIONAL. Everything above really did insert into auth.users,
-- profiles, memberships and access_requests on production.
rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Expected: 0.
--
--   select count(*) from auth.users where email like '%@adhq.example';
