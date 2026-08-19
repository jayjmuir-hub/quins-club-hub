-- ══════════════════════════════════════════════════════════════════════════
--  FEEDBACK DELETE HARNESS — an admin may delete a report; nobody else may,
--  INCLUDING the person who wrote it.
--  Run with `npm run db:check`, or paste into the Supabase SQL editor.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  The only report it deletes is a disposable one it created itself.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHY THIS FILE EXISTS
--
-- 20260819_feedback_delete.sql added the first DELETE policy this table has
-- ever had. Deleting a member's report is irreversible and leaves no audit row,
-- so the policy is the only thing standing between "tidy the list" and
-- "destroy somebody's complaint".
--
-- ══ ⚠️ THE TRAP THIS FILE IS BUILT AROUND ════════════════════════════════
--
-- **A DELETE THAT MATCHES NO ROWS AND A DELETE THAT IS REFUSED ARE THE SAME
-- OBSERVATION.** Both report 0 rows. Neither raises. So "the non-admin could
-- not delete it" is a claim that passes for free if the row was never visible
-- to them in the first place — and `feedback read` is deliberately narrow, so
-- invisibility is the NORMAL case, not an unlikely one.
--
-- Every "cannot delete" assertion below is therefore paired with a visibility
-- count, and the SAME row is then deleted successfully by an admin. Together
-- those say: the row was there, that caller could see it, and it still did not
-- go — which is the only form of this check that means anything.

begin;

-- ── 1. The check, as a temp function so part 3 can run it twice ────────────

create function pg_temp.check_feedback_delete() returns void language plpgsql as $fn$
declare
  v_club    uuid;
  v_admin   uuid;
  v_author  uuid;
  v_other   uuid;
  v_id      uuid;
  n         int;
  visible   int;
begin
  -- ── 1a. Actors, chosen from live data rather than named ─────────────────
  --
  -- ⚠️ NO REAL PERSON IS NAMED ANYWHERE IN THIS FILE. CLAUDE.md rule 9: this
  -- repo is public and its members are mostly children. The harness asks the
  -- database for "an admin" and "two ordinary members" and never selects a
  -- name, only ids.

  select m.club_id, m.profile_id into v_club, v_admin
    from public.memberships m
   where m.status = 'active'
     and (m.is_super or coalesce(array_length(m.admin_rights, 1), 0) > 0)
   limit 1;

  select m.profile_id into v_author
    from public.memberships m
   where m.status = 'active' and m.club_id = v_club
     and not m.is_super and coalesce(array_length(m.admin_rights, 1), 0) = 0
     and m.profile_id <> v_admin
   limit 1;

  select m.profile_id into v_other
    from public.memberships m
   where m.status = 'active' and m.club_id = v_club
     and not m.is_super and coalesce(array_length(m.admin_rights, 1), 0) = 0
     and m.profile_id not in (v_admin, v_author)
   limit 1;

  if v_club is null or v_admin is null or v_author is null then
    raise exception
      'FEEDBACK DELETE: could not find a club with an admin and an ordinary '
      'member. Every assertion below runs as one of these, so without them the '
      'file is green and testing nothing.';
  end if;

  -- ── 1b. A disposable report, created down the REAL member path ──────────
  --
  -- ⚠️ INSERTED AS THE MEMBER, NOT AS postgres. A BEFORE INSERT trigger stamps
  -- club_id, submitted_by and status from the submitter's own membership, so
  -- inserting as the superuser would produce a row shaped differently from
  -- every real one — and this file is about who may delete a REAL report.

  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  insert into public.feedback (kind, body)
       values ('bug', 'db:check disposable fixture — this transaction rolls back')
    returning id into v_id;
  reset role;

  if v_id is null then
    raise exception 'FEEDBACK DELETE: could not create the fixture report.';
  end if;

  -- ── 1c. THE AUTHOR MAY SEE IT AND MAY NOT DELETE IT ─────────────────────
  --
  -- The visibility count is the control. Without it, the 0 below would also be
  -- what you get from a row the caller cannot see, and the assertion would be
  -- free.

  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  select count(*) into visible from public.feedback where id = v_id;
  delete from public.feedback where id = v_id;
  get diagnostics n = row_count;
  reset role;

  if visible <> 1 then
    raise exception
      'FEEDBACK DELETE: the author cannot SEE their own report (% visible). '
      'The refusal below would then prove nothing — a delete matching no rows '
      'and a delete being refused are the same observation.', visible;
  end if;

  if n <> 0 then
    raise exception
      'FEEDBACK DELETE: the AUTHOR deleted their own report. '
      '20260819_feedback_delete.sql scopes the policy to private.is_admin on '
      'purpose — a member removing their report destroys the club''s record of '
      'a problem that may still be real.';
  end if;

  -- ── 1d. A THIRD MEMBER may do neither ───────────────────────────────────
  --
  -- Skipped rather than faked when the club has only one ordinary member: a
  -- fabricated membership would test the fixture, not the policy.

  if v_other is not null then
    set local role authenticated;
    perform set_config('request.jwt.claims',
                       json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    select count(*) into visible from public.feedback where id = v_id;
    delete from public.feedback where id = v_id;
    get diagnostics n = row_count;
    reset role;

    if visible <> 0 then
      raise exception
        'FEEDBACK DELETE: an unrelated member can READ somebody else''s report. '
        'That is a `feedback read` failure, not a delete one, and it is worse '
        'than the thing this file was written to check.';
    end if;
    if n <> 0 then
      raise exception 'FEEDBACK DELETE: an unrelated member deleted a report.';
    end if;
  end if;

  -- ── 1e. THE ADMIN DELETES THE SAME ROW ──────────────────────────────────
  --
  -- ⚠️ THIS IS WHAT MAKES EVERY ZERO ABOVE MEAN SOMETHING. The row was real
  -- and still there; the refusals were refusals.

  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  delete from public.feedback where id = v_id;
  get diagnostics n = row_count;
  reset role;

  if n <> 1 then
    raise exception
      'FEEDBACK DELETE: an ADMIN could not delete a report (% rows). Either the '
      '`feedback remove` policy is missing — see '
      'db/migrations/20260819_feedback_delete.sql — or the admin_rights check '
      'in private.is_admin has changed.', n;
  end if;

  raise notice 'FEEDBACK DELETE: all checks passed.';
end
$fn$;


-- ── 2. Run it against live, unmodified ────────────────────────────────────
-- Expected: NOTICE  FEEDBACK DELETE: all checks passed.

select pg_temp.check_feedback_delete();


-- ── 3. ⚠️ THE SELF-TEST — remove the policy and prove the check notices ────
--
-- The fault is the real thing produced the real way: the state this table was
-- in until 19 Aug 2026, when it had no DELETE policy at all. DROP POLICY is
-- transactional, so it is gone only until the rollback below.
--
-- Expected: NOTICE  SELF-TEST PASSED — the check caught it: FEEDBACK DELETE: …

drop policy "feedback remove" on public.feedback;

do $$
begin
  begin
    perform pg_temp.check_feedback_delete();
    raise exception 'SELF-TEST FAILED: check_feedback_delete() passed with the `feedback remove` policy DROPPED. The admin-can-delete assertion is vacuous.';
  exception when others then
    if sqlerrm like 'SELF-TEST FAILED%' then
      raise;
    end if;
    raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
  end;
end
$$;


-- ── 4. Undo everything ─────────────────────────────────────────────────────
-- ⚠️ NOT OPTIONAL. Part 3 really did drop a policy on production, and part 1
-- really did insert a report. Both are transactional and both go back here —
-- but only if this runs. scripts/db-check.mjs refuses any file in db/tests/
-- that could commit.

rollback;


-- ── After the rollback: confirm production is back as it was ───────────────
-- Run these on their own afterwards. Expected: 1, then 0.
--
--   select count(*) from pg_policies
--    where schemaname='public' and tablename='feedback' and cmd='DELETE';
--
--   select count(*) from public.feedback where body like 'db:check disposable%';
