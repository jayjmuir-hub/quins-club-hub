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
--
-- ══ ⚠️ THIS FILE HAD NEVER ONCE BEEN RUN UNTIL 20 Aug 2026 ════════════════
--
-- It was written, reviewed and committed on 20 August and added AFTER that
-- morning's nightly `db:check`, so no run had ever reached it.
-- ⚠️ NOT because the runner is off: `SUPABASE_DB_URL` has been set since
-- 19 Aug 2026 12:50 UTC and the 20 Aug 04:01 nightly ran 34 harnesses green.
-- Two handoffs said the secret was "still unset" long after it was set — check
-- `gh secret list`, do not carry the claim forward. Two things were wrong here
-- that one run would have caught in a second:
--
--   1. THE FIXTURE COULD NOT EXECUTE. It inserted `public.profiles` before
--      `auth.users`, violating `profiles_id_fkey` on the first statement of its
--      own setup — and the row was a duplicate anyway, because inserting into
--      `auth.users` fires `on_auth_user_created` and the profile appears by
--      itself.
--   2. PART 5 ASSERTED THE BUG. It demanded that nudge 2 be due the instant the
--      nudge-1 claim row was written, which is exactly the defect
--      `20260820_signup_nudge_spacing.sql` exists to fix.
--
-- ⚠️ SO A HARNESS THAT HAS NEVER RUN IS NOT EVIDENCE OF ANYTHING, AND READS
-- LIKE EVIDENCE OF EVERYTHING. Both parts of it now run green against
-- production, proved by running it before the migration (fails at part 5) and
-- after (passes all seven).

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

  -- ⚠️ auth.users FIRST, AND THE PROFILES ROW IS NOT INSERTED AT ALL.
  -- THIS FILE COULD NEVER RUN UNTIL 20 Aug 2026 and nobody had noticed,
  -- because `SUPABASE_DB_URL` is unset and `npm run db:check` has never
  -- executed it. It opened by inserting into public.profiles, which:
  --
  --   1. violates `profiles_id_fkey` — profiles.id REFERENCES auth.users(id),
  --      so it died on line one of its own fixture with a foreign-key error;
  --   2. would have been a duplicate anyway. Inserting into auth.users fires
  --      `on_auth_user_created`, which CREATES THE PROFILES ROW FOR YOU
  --      (measured 20 Aug 2026: 1 profile row appears per auth.users insert).
  --
  -- So the fixture inserts the users and UPDATES the profile the trigger made.
  -- ⚠️ auth.users is also what the candidate query actually reads; seeding only
  -- profiles would leave every case invisible and the harness would report a
  -- clean pass while asserting nothing.
  insert into auth.users (id, email, email_confirmed_at, created_at, instance_id, aud, role)
  values (finished,  'finished@adhq.example',  now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         (volunteer, 'helper@adhq.example',    now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         (refused,   'refused@adhq.example',   now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         (stuck,     'stuck@adhq.example',     now(), now() - interval '9 days', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  -- The candidate query reads p.first_name for the greeting, so give the one
  -- person who gets chased a name the email can open with.
  update public.profiles set first_name = 'Interrupted' where id = stuck;

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

  -- ── 5. ⚠️ NOT IN THE SAME RUN AS NUDGE 1 ───────────────────────────────
  -- ⚠️ THIS ASSERTION USED TO BE ITS OWN OPPOSITE, AND IT PASSED. Until
  -- 20260820_signup_nudge_spacing.sql it read `if hit <> 1 then raise ...
  -- 'nudge 2 did not follow nudge 1'` — it inserted the claim row and then
  -- DEMANDED that nudge 2 be due immediately. A green test pinning the defect
  -- in place, which is worse than no test at all.
  --
  -- `stuck` is 9 days old, so the seven-day floor is already satisfied and the
  -- ONLY thing that can hold the second email back is the age of the nudge-1
  -- row written on the line above. send_signup_nudges loops array[1, 2] in one
  -- call and one transaction, so this is exactly what step 2 sees after step 1
  -- has run.
  select count(*) into hit from private.unfinished_signup_candidates(2)
   where profile_id = stuck;
  if hit <> 0 then
    raise exception 'nudge 2 is due in the SAME RUN as nudge 1 — both emails would reach a '
      'family seconds apart, the second saying it is the last reminder we will send.';
  end if;

  -- ── 6. But it does still arrive, six days later ────────────────────────
  -- ⚠️ THE CONTROL FOR PART 5. Without this, part 5 would also pass if nudge 2
  -- had been broken outright, or dropped — "nobody is due" is the failure mode
  -- a spacing rule is most likely to cause, and it is silent.
  -- No trigger pins sent_at on this table (checked 20 Aug 2026) and its only
  -- default is now(), so backdating the claim row is a faithful stand-in for
  -- six days passing.
  update public.signup_nudges
     set sent_at = now() - interval '7 days'
   where profile_id = stuck and nudge_no = 1;

  select count(*) into hit from private.unfinished_signup_candidates(2)
   where profile_id = stuck;
  if hit <> 1 then
    raise exception 'nudge 2 never arrives at all (%). Somebody who signed up and stalled gets '
      'chased once and then forgotten — Jay, 20 Aug 2026: "they should get the email if info '
      'is missing".', hit;
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
