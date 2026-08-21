-- ══════════════════════════════════════════════════════════════════════════
--  NOTICE PUSH HARNESS — who a posted notice notifies, and who it must never
--  notify.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  The only rows it writes are two disposable notices it creates itself.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ══ ⚠️ THE ASSERTION THAT MATTERS IS ABOUT DISCLOSURE, NOT DELIVERY ══════
--
--     NOBODY MAY BE NOTIFIED ABOUT A NOTICE THEY COULD NOT READ.
--
-- A notification puts the notice's TITLE on a locked screen. Failing to send
-- one is a product problem; sending one to the wrong person is a disclosure,
-- and it cannot be taken back. Part 1b is that check and it is the reason this
-- file exists.
--
-- ══ WHY A SUBSET AND NOT AN EQUALITY ═════════════════════════════════════
--
-- The audience is DELIBERATELY narrower than `announcement read`. That policy
-- lets any club admin see every squad's notices; 20260819_notice_push.sql
-- sends squad notices to the squad alone, because otherwise a handful of
-- admins are buzzed for every notice in the club (measured 19 Aug 2026: 126
-- (squad, member) pairs against 51, and 5 people spared).
--
-- ⚠️ SO THIS FILE ASSERTS `audience ⊆ can_see`, NOT `audience = can_see`.
-- An equality check would go red the moment somebody legitimately widens
-- `can_see_team`, and people who see a check fail for a correct change learn
-- to ignore the check. The subset is the property that must never break.

begin;

-- ── 1. The check, as a temp function so part 3 can run it twice ────────────

create function pg_temp.check_notice_push() returns void language plpgsql as $fn$
declare
  v_sub    uuid;
  v_club   uuid;
  v_poster uuid;
  v_theirs uuid;
  v_mine   uuid;
  n        int;
  bad      int;
  n_teams  int;
  -- ⚠️ HOW MANY DEVICES THAT ONE PERSON HAS, WHICH IS NOT ALWAYS ONE.
  -- push_subscriptions is per DEVICE, not per person, and notice_push_
  -- subscriptions returns one row per device. This harness asserted a literal
  -- 1 and went red on 19 Aug 2026 the moment a second phone subscribed —
  -- reporting "did not reach the one existing subscriber (2 rows)", which
  -- reads as a delivery failure and was the opposite: it reached them twice,
  -- correctly, on both devices.
  --
  -- ⚠️ AND IT WENT RED AGAIN ON 20 Aug 2026, THE SAME MISTAKE ONE LEVEL UP.
  -- Counting per DEVICE fixed the first version; this one still counted the
  -- WHOLE AUDIENCE and compared it against ONE PERSON'S devices. That is only
  -- equal while exactly one person in the club has ever subscribed, which was
  -- true on 19 Aug — "the only subscriber is Jay" — and was false eight people
  -- later. It reported "reached 9 rows for 3 device(s)", which reads as a
  -- fan-out bug and was nothing of the kind: 10 subscriptions, minus the
  -- poster's own 1, is exactly right.
  --
  -- ⚠️ SO THE COUNT IS NOW JOINED BACK TO push_subscriptions AND FILTERED TO
  -- v_sub. `notice_push_subscriptions` returns (id, endpoint, p256dh, auth)
  -- and carries NO profile_id, which is what made the loose count look
  -- reasonable. n_all is the control: it must not be smaller than one person's
  -- devices, which proves the join is filtering rather than emptying.
  --
  -- The rule this keeps relearning: **a harness that grows red as the club
  -- grows is testing the fixture, not the feature.**
  n_devices int;
  n_devices2 int;
  n_before  int;
  v_two     uuid;
  v_teams   uuid[];
  v_lead    uuid;
  v_group   uuid := gen_random_uuid();
  -- ⚠️ AND HOW MANY DEVICES THE WHOLE AUDIENCE HAS, which is the control for
  -- the join below: if it were filtering nothing, this and n would be equal.
  n_all     int;
begin
  -- ── 1a. CONTROL: the walk finds teams and members at all ────────────────

  select count(*) into n_teams from public.teams;
  if n_teams < 5 then
    raise exception
      'NOTICE PUSH: only % teams found. Part 1b compares audiences per team; '
      'with none, it is green and checking nothing.', n_teams;
  end if;

  -- ── 1b. ⚠️ NOBODY IS NOTIFIED WHO COULD NOT READ IT ─────────────────────
  --
  -- For every team, everybody the audience function would send to must be
  -- somebody `private.can_see_team` admits. Written out here rather than
  -- calling can_see_team, because that function keys on auth.uid() and answers
  -- only for the CALLER — there is no "who can see this" form of it. That
  -- restatement is the drift risk this check exists to catch: if the two ever
  -- disagree, it is this assertion that says so.

  select count(*) into bad
    from public.teams t
    cross join lateral private.notice_audience(t.club_id, t.id) as aud(profile_id)
   where not exists (
     select 1 from public.memberships m
      where m.profile_id = aud.profile_id
        and m.status = 'active'
        and ((m.role = 'admin' and m.club_id = t.club_id) or m.team_id = t.id));

  if bad > 0 then
    raise exception
      'NOTICE PUSH: % (squad, person) pairs would be notified about a notice '
      'they cannot READ. That is a disclosure, not a delivery bug — the title '
      'of a squad notice would appear on their lock screen. See '
      'db/migrations/20260819_notice_push.sql.', bad;
  end if;

  -- ── 1c. A club-wide notice reaches every active member ──────────────────
  --
  -- The opposite failure: an audience function that returns nothing passes 1b
  -- perfectly, because the empty set is a subset of everything.

  select id into v_club from public.clubs limit 1;
  select count(*) into n from private.notice_audience(v_club, null);
  if n <> (select count(distinct profile_id) from public.memberships
            where status = 'active' and club_id = v_club) then
    raise exception
      'NOTICE PUSH: the club-wide audience (%) is not every active member. '
      'An empty or truncated audience would satisfy the subset check above '
      'while notifying nobody.', n;
  end if;

  -- ── 1d. The behaviour, against two disposable notices ───────────────────
  --
  -- Only reachable when somebody has actually subscribed. Skipped rather than
  -- faked otherwise: a fabricated push_subscriptions row would test the
  -- fixture, not the rule.

  select profile_id into v_sub from public.push_subscriptions limit 1;
  if v_sub is null then
    raise notice 'NOTICE PUSH: no push subscriptions exist, so 1d is skipped.';
    raise notice 'NOTICE PUSH: all checks passed.';
    return;
  end if;

  select club_id into v_club from public.memberships
   where profile_id = v_sub and status = 'active' limit 1;
  select m.profile_id into v_poster from public.memberships m
   where m.status = 'active' and m.club_id = v_club and m.profile_id <> v_sub
     and (m.is_super or m.role = 'admin' or coalesce(array_length(m.admin_rights,1),0) > 0)
   limit 1;
  if v_poster is null then
    raise notice 'NOTICE PUSH: no second poster in that club, so 1d is skipped.';
    raise notice 'NOTICE PUSH: all checks passed.';
    return;
  end if;

  -- (a) posted by somebody else
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_poster, 'role', 'authenticated')::text, true);
  insert into public.announcements (title, body)
       values ('db:check disposable fixture — rolled back', 'body') returning id into v_theirs;
  reset role;

  -- (b) posted BY the subscriber
  --
  -- ⚠️ A SECOND INSERT, NOT AN UPDATE OF THE FIRST, AND THIS IS THE TRAP THAT
  -- MADE THE FIRST VERSION OF THIS TEST LIE. private.touch_announcement pins
  -- author_id (and club_id, team_id, created_at) back to their OLD values on
  -- every UPDATE — a deliberate immutability guard. Changing the author by
  -- UPDATE changes nothing at all, so the assertion below passed while
  -- testing the wrong row.
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);
  insert into public.announcements (title, body)
       values ('db:check disposable fixture 2 — rolled back', 'body') returning id into v_mine;
  reset role;

  select count(*) into n_devices
    from public.push_subscriptions where profile_id = v_sub;

  select count(*) into n
    from public.notice_push_subscriptions(v_theirs) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n <> n_devices then
    raise exception
      'NOTICE PUSH: a notice posted by somebody else reached % rows for a '
      'subscriber holding % device(s). Every "expect 0" below is then free.',
      n, n_devices;
  end if;

  -- ⚠️ THE CONTROL FOR THE JOIN. Other people are subscribed too, so the
  -- unfiltered count must be at least this one person's. If the join were
  -- returning nothing, every assertion above and below would be free.
  select count(*) into n_all from public.notice_push_subscriptions(v_theirs);
  if n_all < n_devices then
    raise exception
      'NOTICE PUSH: the whole-audience count (%) is below one person''s devices '
      '(%), so the join is emptying the result rather than filtering it.',
      n_all, n_devices;
  end if;

  select count(*) into n
    from public.notice_push_subscriptions(v_mine) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n <> 0 then
    raise exception 'NOTICE PUSH: the AUTHOR would be notified of their own notice.';
  end if;

  insert into public.notification_opt_outs (profile_id, category) values (v_sub, 'notice');
  select count(*) into n
    from public.notice_push_subscriptions(v_theirs) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n <> 0 then
    raise exception 'NOTICE PUSH: an opt-out row did not stop the notification.';
  end if;
  delete from public.notification_opt_outs where profile_id = v_sub and category = 'notice';

  update public.announcements set expires_at = now() - interval '1 hour' where id = v_theirs;
  select count(*) into n
    from public.notice_push_subscriptions(v_theirs) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n <> 0 then
    raise exception 'NOTICE PUSH: an already-expired notice would still notify.';
  end if;

  -- ⚠️ THE CONTROL FOR EVERY ZERO ABOVE. Put the conditions back and the
  -- target must return. Without this, a function that always returned nothing
  -- would satisfy all three "expect 0" assertions.
  update public.announcements set expires_at = null where id = v_theirs;
  select count(*) into n
    from public.notice_push_subscriptions(v_theirs) f
    join public.push_subscriptions ps on ps.id = f.id
   where ps.profile_id = v_sub;
  if n <> n_devices then
    raise exception
      'NOTICE PUSH: the target did not come back once the conditions were '
      'cleared (% rows, expected % device(s)). The zeros above therefore '
      'prove nothing.', n, n_devices;
  end if;

  -- ── 7. ⚠️ A MESSAGE SENT TO SEVERAL SQUADS IS PUSHED ONCE ──────────────
  --
  -- 20260821_notice_multi_squad.sql fans a multi-squad notice out into one row
  -- per squad sharing a `group_id`, because `team_id` is the security boundary
  -- and the squads cannot share a row. The danger that creates is the reason
  -- the trigger is STATEMENT-level: anybody attached to two of the chosen
  -- squads would otherwise get the same words on their phone twice.
  --
  -- ⚠️ MEASURED 21 Aug 2026 BEFORE THE FEATURE WAS BUILT: seven people hold
  -- active memberships in two squads, two of them subscribed. Not hypothetical.
  --
  -- Skipped rather than faked when nobody sits in two squads — a fabricated
  -- membership would test the fixture, not the rule.
  select m.profile_id into v_two
    from public.memberships m
    join public.push_subscriptions s on s.profile_id = m.profile_id
   where m.status = 'active' and m.team_id is not null
   group by m.profile_id having count(distinct m.team_id) > 1
   limit 1;

  if v_two is not null then
    select array_agg(distinct team_id) into v_teams
      from public.memberships
     where profile_id = v_two and status = 'active' and team_id is not null;

    select count(*) into n_before from net.http_request_queue;

    set local role authenticated;
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_poster, 'role', 'authenticated')::text, true);
    insert into public.announcements (title, body, team_id, group_id)
    select 'db:check group — rolled back', 'body', t, v_group
      from (values (v_teams[1]), (v_teams[2])) g(t);
    reset role;

    select count(*) - n_before into n from net.http_request_queue;
    if n <> 1 then
      raise exception
        'NOTICE PUSH: a notice sent to TWO squads queued % pushes, expected 1. '
        'Everyone in both squads is about to be buzzed twice with the same '
        'words. The trigger must be STATEMENT-level over the transition table.', n;
    end if;

    select (array_agg(id order by id))[1] into v_lead
      from public.announcements where group_id = v_group;

    select count(*) into n
      from public.notice_push_subscriptions(v_lead) f
      join public.push_subscriptions ps on ps.id = f.id
     where ps.profile_id = v_two;
    select count(*) into n_devices2 from public.push_subscriptions where profile_id = v_two;
    if n <> n_devices2 then
      raise exception
        'NOTICE PUSH: somebody in BOTH chosen squads resolved to % rows for % '
        'device(s). The `distinct` in notice_push_subscriptions is what makes '
        'this one, and it is easy to drop by accident.', n, n_devices2;
    end if;

    -- ⚠️ THE CONTROL. If the audience were empty the assertion above would pass
    -- for the wrong reason.
    select count(*) into n from public.notice_push_subscriptions(v_lead);
    if n < n_devices2 then
      raise exception
        'NOTICE PUSH: the whole group audience (%) is smaller than one person''s '
        'devices (%), so the count above proves nothing.', n, n_devices2;
    end if;
  end if;

  raise notice 'NOTICE PUSH: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  NOTICE PUSH: all checks passed.

select pg_temp.check_notice_push();


-- ── 3. ⚠️ THE SELF-TEST — widen the audience and prove 1b catches it ───────
--
-- The fault is the exact thing the migration decided against: send squad
-- notices to everybody who may READ them, admins of other squads included.
-- That is not a silly mistake — it is the other reasonable design, and the one
-- somebody would reach for while "simplifying" the audience to match the
-- policy. It must still be caught, because it changes who sees a title.
--
-- ⚠️ It is caught here as a SUBSET violation only because 1b restates
-- can_see_team's rule; the two are deliberately different and this proves the
-- check can tell.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: NOTICE PUSH: …

create or replace function private.notice_audience(_club uuid, _team uuid)
 returns setof uuid language sql stable security definer set search_path to 'public'
as $$
  select distinct m.profile_id from memberships m
   where m.status = 'active' and m.club_id = _club;
$$;

do $$
begin
  begin
    perform pg_temp.check_notice_push();
    raise exception 'SELF-TEST FAILED: check_notice_push() passed while the audience was widened to every member of the club. Part 1b is vacuous — check that it walks teams and that notice_audience is the function it calls.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did replace a function on production and
-- part 1 really did insert two notices. Both are transactional and both go
-- back here — but only if this runs. scripts/db-check.mjs refuses any file in
-- db/tests/ that could commit.

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run these on their own afterwards. Expected: 0, then the club-wide count.
--
--   select count(*) from public.announcements where title like 'db:check disposable%';
--   select count(*) from private.notice_audience(
--     (select id from public.clubs limit 1), (select id from public.teams limit 1));
