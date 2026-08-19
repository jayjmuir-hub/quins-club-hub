-- ══════════════════════════════════════════════════════════════════════════
--  APPROVAL PUSH HARNESS — who is told that somebody is waiting to be
--  approved, and who must never be told.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  The only rows it writes are two disposable memberships it creates itself.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ══ ⚠️ THE ASSERTION THAT MATTERS IS ABOUT DISCLOSURE, NOT DELIVERY ══════
--
--     NOBODY IS TOLD THAT A NAMED PERSON WANTS TO JOIN A NAMED SQUAD
--     UNLESS THEY RUN THAT SQUAD OR THE CLUB.
--
-- The notification body carries a real member's name and a real child's name
-- to a lock screen — `Alex Rivera has registered Sam Rivera in U13 Mixed.`
-- Failing to send one is a product problem: the email still goes out, because
-- it is unconditional. Sending one to the wrong person is a disclosure about
-- a child, and it cannot be taken back. Part 1b is that check and it is the
-- reason this file exists.
--
-- ══ WHY AN EQUALITY HERE, WHERE notice-push USES A SUBSET ════════════════
--
-- db/tests/notice-push.sql deliberately asserts `audience ⊆ can_see_team`,
-- because the notice audience is narrower than an INDEPENDENT policy that
-- somebody may legitimately widen later — an equality there would go red on a
-- correct change, and a check that cries wolf gets ignored.
--
-- ⚠️ THAT REASONING DOES NOT APPLY HERE, so this file asserts EQUALITY in
-- BOTH directions. The approval audience is not narrowing anything: the rule
-- is self-contained in 20260819_approval_push.sql, and this file restates it
-- independently. There is no third party that can legitimately move it. Both
-- directions are checked because they fail differently and only one of them
-- is dangerous:
--
--   * somebody EXTRA  -> a disclosure about a child. Part 1b.
--   * somebody MISSING -> a registration nobody is buzzed about. Part 1c,
--     and it is also the control that stops 1b passing on an empty set.
--
-- ⚠️ THE RULE IS WRITTEN A THIRD TIME IN THIS FILE, ON PURPOSE. It exists in
-- SQL (the migration), in TypeScript (notify-approval, for the email) and
-- here. Restating it is what gives this check the power to catch a drift in
-- the migration — a check that called the function it is checking would agree
-- with it by construction. The TypeScript copy is NOT covered; see the
-- migration header.

begin;

-- ── 1. The check, as a temp function so part 3 can run it twice ────────────

create function pg_temp.check_approval_push() returns void language plpgsql as $fn$
declare
  v_sub     uuid;
  v_club    uuid;
  v_team    uuid;
  v_other   uuid;
  v_theirs  uuid;
  v_mine    uuid;
  n         int;
  bad       int;
  n_teams   int;
  n_supers  int;
begin
  -- ── 1a. CONTROL: the walk finds teams and super admins at all ───────────
  --
  -- Without this, every assertion below is green against an empty database
  -- and reports confidence it has not earned.

  select count(*) into n_teams from public.teams;
  if n_teams < 5 then
    raise exception
      'APPROVAL PUSH: only % teams found. Parts 1b and 1c compare audiences '
      'per team; with none, they are green and checking nothing.', n_teams;
  end if;

  select count(*) into n_supers
    from public.memberships where is_super and status = 'active';
  if n_supers < 1 then
    raise exception
      'APPROVAL PUSH: no active super admin exists. The super admins are the '
      'FLOOR of this audience — with none, an audience function that returned '
      'nothing at all would satisfy part 1b perfectly.';
  end if;

  -- ── 1b. ⚠️ NOBODY EXTRA IS TOLD ─────────────────────────────────────────
  --
  -- The dangerous direction. Everybody the audience returns must be a super
  -- admin of that club, or the head coach or a team manager of THAT squad.
  -- `_requester` is null here so the exclusion cannot mask an over-wide rule
  -- by happening to remove the one person who would have failed it.

  select count(*) into bad
    from public.teams t
    cross join lateral private.approval_audience(t.club_id, t.id, null) as aud(profile_id)
   where not exists (
     select 1 from public.memberships m
      where m.profile_id = aud.profile_id
        and m.status = 'active'
        and ((m.club_id = t.club_id and m.is_super)
             or (m.team_id = t.id and (m.is_head_coach or m.role = 'manager'))));

  if bad > 0 then
    raise exception
      'APPROVAL PUSH: % (squad, person) pairs would be told about a '
      'registration for a squad they neither run nor administer. That is a '
      'disclosure about a CHILD, not a delivery bug — the name would appear '
      'on their lock screen. See db/migrations/20260819_approval_push.sql.', bad;
  end if;

  -- ── 1c. NOBODY IS MISSING, which is also 1b's control ───────────────────
  --
  -- The opposite failure, and the reason 1b cannot pass for free: an audience
  -- function that returned the empty set would satisfy 1b perfectly.

  select count(*) into bad
    from public.teams t
    join public.memberships m
      on m.status = 'active'
     and ((m.club_id = t.club_id and m.is_super)
          or (m.team_id = t.id and (m.is_head_coach or m.role = 'manager')))
   where not exists (
     select 1 from private.approval_audience(t.club_id, t.id, null) as aud(profile_id)
      where aud.profile_id = m.profile_id);

  if bad > 0 then
    raise exception
      'APPROVAL PUSH: % (squad, person) pairs who run that squad or the club '
      'would NOT be told about a registration for it. Every "expect 0" in '
      'part 1b is then free, because the audience is truncated.', bad;
  end if;

  -- ── 1d. A squad with no staff still reaches the super admins ────────────
  --
  -- The narrowing is only safe because the super admins are the floor.
  -- Measured 18 Aug 2026: at least one squad has nobody attached at all.

  select t.id into v_team
    from public.teams t
   where not exists (
     select 1 from public.memberships m
      where m.team_id = t.id and m.status = 'active'
        and (m.is_head_coach or m.role = 'manager'))
   limit 1;

  if v_team is not null then
    select club_id into v_club from public.teams where id = v_team;
    select count(*) into n from private.approval_audience(v_club, v_team, null);
    if n < n_supers then
      raise exception
        'APPROVAL PUSH: a squad with no head coach and no manager reaches only '
        '% people, fewer than the % active super admins. A registration for '
        'that squad would be lost.', n, n_supers;
    end if;
  end if;

  -- ── 1e. The behaviour, against two disposable pending memberships ───────
  --
  -- Only reachable when somebody has actually subscribed. Skipped rather than
  -- faked otherwise: a fabricated push_subscriptions row would test the
  -- fixture, not the rule.

  select s.profile_id into v_sub
    from public.push_subscriptions s
    join public.memberships m
      on m.profile_id = s.profile_id and m.status = 'active' and m.is_super
   limit 1;

  if v_sub is null then
    raise notice 'APPROVAL PUSH: no subscribed super admin, so 1e is skipped.';
    raise notice 'APPROVAL PUSH: all checks passed.';
    return;
  end if;

  select club_id into v_club from public.memberships
   where profile_id = v_sub and status = 'active' and is_super limit 1;
  select id into v_team from public.teams where club_id = v_club limit 1;

  -- Somebody who is NOT the subscriber, to play the person registering.
  select p.id into v_other from public.profiles p
   where p.id <> v_sub limit 1;
  if v_other is null then
    raise notice 'APPROVAL PUSH: only one profile exists, so 1e is skipped.';
    raise notice 'APPROVAL PUSH: all checks passed.';
    return;
  end if;

  -- (a) somebody else asking — the subscribed super admin must be told.
  insert into public.memberships (profile_id, club_id, team_id, role, status)
       values (v_other, v_club, v_team, 'coach', 'pending')
    returning id into v_theirs;

  select count(*) into n from public.approval_push_subscriptions(v_theirs);
  if n < 1 then
    raise exception
      'APPROVAL PUSH: a registration by somebody else did not reach the '
      'subscribed super admin (% rows). Every "expect 0" below is then free.', n;
  end if;

  -- (b) the SUBSCRIBER asking — they must not be told about their own request.
  --
  -- ⚠️ A SECOND INSERT, NOT AN UPDATE OF THE FIRST. The notice harness was
  -- made to lie by exactly that shortcut on 19 Aug: private.touch_announcement
  -- pins author_id on every UPDATE, so the test changed nothing and passed for
  -- the wrong reason. memberships has no such guard today, but the cheap
  -- habit is the one that survives somebody adding one.
  insert into public.memberships (profile_id, club_id, team_id, role, status)
       values (v_sub, v_club, v_team, 'coach', 'pending')
    returning id into v_mine;

  select count(*) into n from public.approval_push_subscriptions(v_mine);
  if n <> 0 then
    raise exception
      'APPROVAL PUSH: the REQUESTER would be buzzed about their own request.';
  end if;

  -- (c) an opt-out row silences it.
  insert into public.notification_opt_outs (profile_id, category) values (v_sub, 'approval');
  select count(*) into n from public.approval_push_subscriptions(v_theirs);
  if n <> 0 then
    raise exception 'APPROVAL PUSH: an opt-out row did not stop the notification.';
  end if;
  delete from public.notification_opt_outs where profile_id = v_sub and category = 'approval';

  -- (d) an already-actioned request tells nobody.
  update public.memberships set status = 'active' where id = v_theirs;
  select count(*) into n from public.approval_push_subscriptions(v_theirs);
  if n <> 0 then
    raise exception
      'APPROVAL PUSH: a request that is no longer pending would still notify.';
  end if;

  -- ⚠️ THE CONTROL FOR EVERY ZERO ABOVE. Put the conditions back and the
  -- target must return. Without this, a function that always returned nothing
  -- would satisfy (b), (c) and (d) alike.
  update public.memberships set status = 'pending' where id = v_theirs;
  select count(*) into n from public.approval_push_subscriptions(v_theirs);
  if n < 1 then
    raise exception
      'APPROVAL PUSH: the target did not come back once the conditions were '
      'cleared (% rows). The zeros above therefore prove nothing.', n;
  end if;

  raise notice 'APPROVAL PUSH: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  APPROVAL PUSH: all checks passed.

select pg_temp.check_approval_push();


-- ── 3. ⚠️ THE SELF-TEST — widen the audience and prove 1b catches it ───────
--
-- The fault is the OTHER reasonable design, not a silly mistake: tell
-- everybody who could actually approve — every club admin, plus everyone
-- attached to the squad. That is what this feature did before 18 Aug 2026,
-- it is what private.can_approve_team still admits, and it is exactly what
-- somebody would reach for while "simplifying" the audience to match the
-- authority. It must still be caught, because it puts a child's name in front
-- of people the club decided should not receive it.
--
-- ⚠️ A CHECK THAT HAS NEVER FAILED IS NOT A CHECK. This part really does
-- replace a function on production; the rollback at the end is what makes
-- that safe, and scripts/db-check.mjs refuses any file in db/tests/ that
-- could commit.

do $$
declare
  original text;
begin
  original := pg_get_functiondef('private.approval_audience(uuid,uuid,uuid)'::regprocedure);

  create or replace function private.approval_audience(_club uuid, _team uuid, _requester uuid)
   returns setof uuid
   language sql
   stable
   security definer
   set search_path to 'public'
  as $bad$
    select distinct m.profile_id
      from memberships m
     where m.status = 'active'
       and m.profile_id is distinct from _requester
       and ((m.club_id = _club and (m.is_super or m.role = 'admin'))
            or (_team is not null and m.team_id = _team));
  $bad$;

  begin
    perform pg_temp.check_approval_push();
    raise exception
      'SELF-TEST FAILED — the audience was widened to everybody who may '
      'approve, and check_approval_push did not notice. Part 1b is not '
      'protecting anything.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;

  execute original;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did replace a function on production and
-- part 1e really did insert two pending memberships — which, once this
-- migration is applied, also fire the push trigger. Both are transactional and
-- both go back here, INCLUDING the queued pg_net request: a rollback removes
-- it, which is why no notification is actually sent by this file.

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run these on their own afterwards. Expected: 0, then the super-admin count.
--
--   select count(*) from public.memberships
--    where status = 'pending' and role = 'coach'
--      and created_at > now() - interval '5 minutes';
--   select count(*) from private.approval_audience(
--     (select id from public.clubs limit 1), null, null);
