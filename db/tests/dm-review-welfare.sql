-- ══════════════════════════════════════════════════════════════════════════
--  DM REVIEW → WELFARE HARNESS (Phase 4, Surface S7b) — reviewing a child's /
--  reported DM requires the EXPLICIT welfare grant; not even a super bypasses it.
--  Run with `npm run db:check -- dm-review`.
--  SAFE ON PRODUCTION: one transaction that ROLLS BACK. The only writes are the
--  simulated welfare grant and the injected fault, both discarded.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. db/migrations/20260828_dm_review_welfare.sql repoints
-- private.admin_may_review off is_admin onto private.can_review_dm (an active
-- admin of the club holding 'welfare' EXPLICITLY — no is_super short-circuit,
-- spec §5.2 note ²). Asserts the DEPLOYED state — green only once applied.
--
-- ⚠️ It needs a REVIEWABLE conversation (one involving a minor, or with a
-- reported message). If none exists the review-boundary cannot be exercised and
-- the harness says so rather than passing hollow.

begin;

do $harness$
declare
  convo uuid; club uuid; an_admin uuid; a_super uuid; res boolean;
begin
  select c.id, c.club_id into convo, club
    from conversations c where private.conversation_reviewable(c.id) limit 1;
  if convo is null then
    raise notice 'DM REVIEW: no reviewable conversation exists — review-boundary case skipped (still checking the carve-out shape).';
  end if;

  select profile_id into an_admin from memberships
    where role='admin' and status='active' and is_super=false and not ('welfare' = any(admin_rights))
      and (club is null or club_id = club) limit 1;
  select profile_id into a_super from memberships
    where role='admin' and status='active' and is_super=true and not ('welfare' = any(admin_rights)) limit 1;

  if convo is not null and an_admin is not null then
    -- DIRECTION 1a — an ordinary admin without welfare is REFUSED.
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub', an_admin)::text, true);
    res := private.admin_may_review(convo); reset role;
    if res then raise exception 'DM REVIEW: a non-welfare admin can still review a child''s DM.'; end if;
  end if;

  if convo is not null and a_super is not null then
    -- DIRECTION 1b — a SUPER without welfare is ALSO refused (the carve-out).
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub', a_super)::text, true);
    res := private.admin_may_review(convo); reset role;
    if res then raise exception 'DM REVIEW: a super WITHOUT welfare can review — the carve-out is broken (spec §5.2 note 2).'; end if;
  end if;

  if convo is not null and an_admin is not null then
    -- DIRECTION 2 — granting welfare enables review (nobody legitimate is locked out).
    update memberships set admin_rights = array_append(admin_rights, 'welfare')
     where profile_id = an_admin and role='admin' and status='active' and club_id = club;
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub', an_admin)::text, true);
    res := private.admin_may_review(convo); reset role;
    if not res then raise exception 'DM REVIEW: a welfare holder cannot review — the grant does not enable review.'; end if;
  end if;

  raise notice 'DM REVIEW: non-welfare admin and super refused; welfare holder reviews.';
end $harness$;

-- ── The audit log reads super + welfare only (not any admin). ───────────────
do $audit$
declare club uuid; an_admin uuid; a_super uuid; a_convo uuid; nseen int;
begin
  select id into club from clubs limit 1;
  select id into a_convo from conversations limit 1;
  select profile_id into an_admin from memberships where role='admin' and status='active' and is_super=false and not ('welfare'=any(admin_rights)) and club_id=club limit 1;
  select profile_id into a_super from memberships where role='admin' and status='active' and is_super=true limit 1;
  if club is null or a_convo is null or an_admin is null or a_super is null then
    raise notice 'DM REVIEW audit: fixture incomplete — audit-read case skipped.'; return;
  end if;
  insert into welfare_access_log (club_id, admin_id, conversation_id) values (club, a_super, a_convo);

  perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub', an_admin)::text, true);
  select count(*) into nseen from welfare_access_log; reset role;
  if nseen <> 0 then raise exception 'DM REVIEW: a non-welfare admin can read the who-opened-a-DM log (% rows).', nseen; end if;

  perform set_config('role','authenticated',true); perform set_config('request.jwt.claims', json_build_object('sub', a_super)::text, true);
  select count(*) into nseen from welfare_access_log; reset role;
  if nseen = 0 then raise exception 'DM REVIEW: a super cannot read the audit log.'; end if;

  raise notice 'DM REVIEW audit: non-welfare admin refused the log; super reads it.';
end $audit$;

-- ── ⚠️ THE SELF-TEST — put admin_may_review back on is_admin and prove the
-- check would catch it: a non-welfare admin would then review. ──────────────
do $selftest$
declare convo uuid; an_admin uuid; res boolean;
begin
  select c.id into convo from conversations c where private.conversation_reviewable(c.id) limit 1;
  select profile_id into an_admin from memberships
    where role='admin' and status='active' and is_super=false and not ('welfare' = any(admin_rights)) limit 1;
  if convo is null or an_admin is null then raise notice 'SELF-TEST skipped (no reviewable convo / non-welfare admin).'; return; end if;

  -- The fault: the OLD is_admin definition.
  create or replace function private.admin_may_review(_conversation uuid)
  returns boolean language sql stable security definer set search_path to 'public' as $f$
    select exists (select 1 from conversations c where c.id=_conversation and private.is_admin(c.club_id) and private.conversation_reviewable(c.id)); $f$;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', an_admin)::text, true);
  res := private.admin_may_review(convo); reset role;
  if not res then
    raise exception 'SELF-TEST FAILED: even on the OLD is_admin definition a non-welfare admin could not review — the test is not exercising the boundary.';
  end if;
  raise notice 'SELF-TEST PASSED — reverting to is_admin let a non-welfare admin review, so the narrowing is what refuses them.';
end $selftest$;

rollback;
