-- ══════════════════════════════════════════════════════════════════════════
--  AVAILABILITY NUDGE HARNESS — that nobody is ever nudged twice about the
--  same match, and that training never nudges anybody at all.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  The only rows it writes are two disposable events it creates itself.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ══ ⚠️ THE TWO ASSERTIONS THAT MATTER, AND NEITHER IS ABOUT DELIVERY ══════
--
--     1. NOBODY IS NUDGED TWICE ABOUT THE SAME MATCH.
--     2. TRAINING NEVER NUDGES ANYBODY.
--
-- The first is the one that would lose the feature. There is no email behind
-- this category, so a family that mutes it hears nothing again — and the
-- fastest way to make somebody mute a notification is to send it twice.
--
-- The second is a scale rule with a measured number behind it. 19 Aug 2026,
-- against the live club: nudging every upcoming event would be **338**
-- notifications; matches only is **6**. There are 62 upcoming events and 2 of
-- them are matches. A regression that let training through would not read as a
-- bug in any log — it would read as the club abandoning notifications.
--
-- ══ ⚠️ WHY THIS FILE CREATES ITS OWN MATCH, AND WHY THE FIRST DRAFT DID NOT
--
-- **The first draft asserted against whatever fixtures the club happened to
-- have, and it was worthless.** Measured 19 Aug 2026: the two upcoming matches
-- were both further out than 48 hours, so the window was EMPTY — the run
-- claimed nobody, and every "expect 0" below passed while testing nothing at
-- all. It would have passed just as happily against a completely broken
-- feature, which is the one thing a fixture must never do.
--
-- So this creates a disposable match **inside** the window, and a disposable
-- training session **at the same moment on the same squad** as its control.
-- That pairing is what makes assertion 2 mean something: the two events differ
-- only by `type`, so a run that claims the training cannot be blamed on
-- timing, membership or luck.

begin;

create function pg_temp.check_availability_nudge() returns void language plpgsql as $fn$
declare
  v_team   uuid;
  v_club   uuid;
  v_match  uuid;
  v_train  uuid;
  v_person uuid;
  n        int;
  n1       int;
  n2       int;
begin
  -- ── 1a. CONTROL: a squad with families on it exists at all ──────────────

  select m.team_id, m.club_id into v_team, v_club
    from public.memberships m
   where m.status = 'active'
     and m.role in ('parent', 'player')
     and m.player_id is not null
     and m.team_id is not null
   group by m.team_id, m.club_id
   order by count(*) desc
   limit 1;

  if v_team is null then
    raise exception
      'AVAILABILITY: no squad has any active family membership, so there is '
      'nobody this feature could ever nudge and every check below is free.';
  end if;

  -- ── 1b. The pair: same squad, same moment, different type ───────────────

  insert into public.events (club_id, team_id, type, starts_at, title)
       values (v_club, v_team, 'match', now() + interval '24 hours',
               'db:check disposable — rolled back')
    returning id into v_match;

  insert into public.events (club_id, team_id, type, starts_at, title)
       values (v_club, v_team, 'training', now() + interval '24 hours',
               'db:check disposable — rolled back')
    returning id into v_train;

  -- ⚠️ THE CONTROL FOR EVERYTHING BELOW. If a real match inside the window
  -- produces no candidates, every "expect 0" that follows is free.
  select count(*) into n from private.availability_nudge_candidates(v_match);
  if n = 0 then
    raise exception
      'AVAILABILITY: a match 24 hours away on a squad with families produced '
      'NO candidates. The zeros below would then prove nothing.';
  end if;

  -- ── 1c. ⚠️ THE RUN CLAIMS THE MATCH AND NOT THE TRAINING ────────────────

  n1 := private.send_availability_nudges();
  if n1 = 0 then
    raise exception
      'AVAILABILITY: the scheduled run claimed nobody for a match 24 hours '
      'away. The nudge would never fire.';
  end if;

  select count(*) into n from public.availability_nudges where event_id = v_train;
  if n <> 0 then
    raise exception
      'AVAILABILITY: the run claimed % people for a TRAINING session held at '
      'the same moment, on the same squad, as a match it also claimed — so it '
      'is the TYPE rule that broke, not the window. Measured 19 Aug 2026 that '
      'rule is the difference between 6 notifications and 338. See '
      'db/migrations/20260819_availability_nudge.sql.', n;
  end if;

  -- ── 1d. ⚠️ NOBODY IS NUDGED TWICE ───────────────────────────────────────
  --
  -- The assertion this file exists for. Run it twice more; both must be no-ops.

  n2 := private.send_availability_nudges();
  if n2 <> 0 then
    raise exception
      'AVAILABILITY: running the job again claimed % MORE people. Somebody '
      'would be buzzed twice about the same match, and there is no email '
      'behind this category to soften it.', n2;
  end if;

  n2 := private.send_availability_nudges();
  if n2 <> 0 then
    raise exception
      'AVAILABILITY: the THIRD run claimed % people. The ledger stops the '
      'second run but not the third.', n2;
  end if;

  -- ── 1e. One batch per run, not one per person ───────────────────────────
  --
  -- The send is keyed on the batch, so a run that minted a batch per person
  -- would send one notification per person per person.
  select count(distinct batch_id) into n
    from public.availability_nudges where event_id = v_match;
  if n <> 1 then
    raise exception
      'AVAILABILITY: one run produced % batches for one match, expected 1.', n;
  end if;

  -- ── 1f. Answering silences you ──────────────────────────────────────────

  select profile_id into v_person
    from public.availability_nudges where event_id = v_match limit 1;
  delete from public.availability_nudges where event_id = v_match;

  insert into public.availability (event_id, player_id, status)
  -- ⚠️ 'in', NOT 'yes'. availability_status_check allows in/out/maybe only,
  -- and the first draft of this harness used 'yes' and died on the constraint.
  select v_match, m.player_id, 'in'
    from public.memberships m
   where m.profile_id = v_person and m.team_id = v_team
     and m.player_id is not null
   limit 1;

  select count(*) into n
    from private.availability_nudge_candidates(v_match) as c(profile_id)
   where c.profile_id = v_person;
  if n <> 0 then
    raise exception 'AVAILABILITY: somebody who HAS answered would still be nudged.';
  end if;

  -- ── 1g. An opt-out silences you, and clearing it brings you back ────────

  select c.profile_id into v_person
    from private.availability_nudge_candidates(v_match) as c(profile_id) limit 1;

  if v_person is not null then
    insert into public.notification_opt_outs (profile_id, category)
         values (v_person, 'availability') on conflict do nothing;

    select count(*) into n
      from private.availability_nudge_candidates(v_match) as c(profile_id)
     where c.profile_id = v_person;
    if n <> 0 then
      raise exception 'AVAILABILITY: an opt-out row did not stop the nudge.';
    end if;

    delete from public.notification_opt_outs
     where profile_id = v_person and category = 'availability';

    -- ⚠️ THE CONTROL FOR 1g. Without this, a candidate function that returned
    -- nothing would satisfy the assertion above.
    select count(*) into n
      from private.availability_nudge_candidates(v_match) as c(profile_id)
     where c.profile_id = v_person;
    if n <> 1 then
      raise exception
        'AVAILABILITY: clearing the opt-out did not bring the person back, so '
        'the opt-out assertion proves nothing.';
    end if;
  end if;

  raise notice 'AVAILABILITY: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  AVAILABILITY: all checks passed.

select pg_temp.check_availability_nudge();


-- ── 3. ⚠️ THE SELF-TEST — re-claim on conflict, and prove 1d catches it ──
--
-- ⚠️ THE FIRST VERSION OF THIS SELF-TEST AIMED AT THE WRONG THING AND
-- REPORTED THE HARNESS BROKEN. It removed the not-already-nudged clause from
-- `availability_nudge_candidates`, on the assumption that clause is what stops
-- a second send. **It is not, and finding that out is worth more than the test
-- was.** The claim is `on conflict (event_id, profile_id) do nothing`, so a
-- repeat claim inserts zero rows, `get diagnostics row_count` is 0, the loop
-- hits `continue`, and no push is queued. **The PRIMARY KEY is the guarantee.
-- The candidates clause is belt-and-braces that saves a pointless query.**
--
-- So the fault injected here is the one that genuinely breaks it, and it is a
-- plausible edit rather than a silly one: somebody "fixing" batch tracking so
-- the ledger always records the most recent batch. That single word turns the
-- claim into an UPDATE, `row_count` becomes non-zero on every run, and every
-- family with an unanswered match is buzzed again every morning.

do $$
declare
  original_send text;
  original_cand text;
begin
  original_send := pg_get_functiondef('private.send_availability_nudges()'::regprocedure);
  original_cand := pg_get_functiondef('private.availability_nudge_candidates(uuid)'::regprocedure);

  -- (a) the dangerous edit: re-claim instead of skipping
  create or replace function private.send_availability_nudges()
   returns integer language plpgsql security definer set search_path to 'public'
  as $bad$
  declare
    endpoint text; secret text; ev record; v_batch uuid;
    n_people int; n_sent int := 0;
  begin
    select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'push_notify_url';
    select decrypted_secret into secret   from vault.decrypted_secrets where name = 'approval_notify_secret';
    if endpoint is null or secret is null then return 0; end if;
    for ev in select e.*, t.name as team_name from events e join teams t on t.id = e.team_id
               where e.type = 'match' and e.starts_at > now()
                 and e.starts_at <= now() + interval '48 hours'
    loop
      v_batch := gen_random_uuid();
      insert into availability_nudges (event_id, profile_id, batch_id)
      select ev.id, c.profile_id, v_batch
        from private.availability_nudge_candidates(ev.id) as c(profile_id)
      on conflict (event_id, profile_id) do update set batch_id = excluded.batch_id;
      get diagnostics n_people = row_count;
      if n_people = 0 then continue; end if;
      n_sent := n_sent + n_people;
    end loop;
    return n_sent;
  end; $bad$;

  -- (b) and drop the belt-and-braces clause, so the candidates actually come
  --     back and the conflict path is the thing under test. Both halves are
  --     needed: with the clause in place there is nothing to conflict WITH.
  create or replace function private.availability_nudge_candidates(_event uuid)
   returns setof uuid language sql stable security definer set search_path to 'public'
  as $bad$
    select distinct m.profile_id
      from events e
      join memberships m on m.team_id = e.team_id and m.status = 'active'
       and m.role in ('parent', 'player') and m.player_id is not null
     where e.id = _event
       and not exists (select 1 from availability a
                        where a.event_id = e.id and a.player_id = m.player_id)
       and not exists (select 1 from notification_opt_outs o
                        where o.profile_id = m.profile_id and o.category = 'availability');
  $bad$;

  begin
    delete from public.availability_nudges;
    perform pg_temp.check_availability_nudge();
    raise exception
      'SELF-TEST FAILED — the claim was changed to re-claim on conflict and '
      'check_availability_nudge did not notice. Part 1d is not protecting '
      'anybody from being buzzed every single morning.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;

  execute original_send;
  execute original_cand;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 1 really did create two events on production, claim
-- ledger rows and record an availability answer; part 3 really did replace a
-- function. All of it is transactional and all of it goes back here —
-- including the pg_net requests the run queued, which a rollback removes. That
-- is why this file sends no notifications.

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run these on their own afterwards. Expected: 0, 0, and true.
--
--   select count(*) from public.events where title like 'db:check disposable%';
--   select count(*) from public.availability_nudges;
--   select pg_get_functiondef('private.availability_nudge_candidates(uuid)'::regprocedure)
--          like '%availability_nudges%' as ledger_clause_present;
