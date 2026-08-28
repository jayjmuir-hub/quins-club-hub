-- ══════════════════════════════════════════════════════════════════════════
--  Phase 4 — DM review moves to the explicit `welfare` grant (Surface S7b)
--  28 Aug 2026 · admin-rights redesign · the last, most safeguarding-sensitive
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT (spec §5.4, §5.2 note ²): reviewing a child's / reported DM moves from
-- EVERY admin (the 23 Aug "any admin may read a DM" ruling) to the EXPLICIT
-- `welfare` grant. Even a super must hold welfare to review — this is the
-- deliberate exception to "a super implicitly holds every right". A super
-- self-ticks welfare (an audited write to their own admin_rights via
-- set_admin_rights → membership_audit) to review, and can untick it.
--
-- ⚠️⚠️ THIS CHANGES CURRENT BEHAVIOUR — the FIRST phase that does. Today 0 admins
-- hold welfare and all 8 can review; after this, NOBODY can review a child's DM
-- until welfare is granted. That is the intended tightening (fewer eyes on
-- children's private messages), but it means welfare MUST be granted to the
-- club's safeguarding person as part of applying this — otherwise DM review is
-- dark. That grant is a deliberate, named, audited act (set_admin_rights).
--
-- HOW. One helper + one repoint. admin_may_review is called by ~15 RLS policies
-- and functions across the chat system (messages/conversations reads, the
-- welfare overview, message removal, delete-for-good, log_welfare_access); they
-- all key on it, so repointing the one function narrows every path at once.
--
-- ⚠️ THE AUDIT ALREADY EXISTS: public.welfare_access_log + log_welfare_access()
-- log every open of a reviewable DM (db/migrations/20260823_squad_chat_phase3.sql,
-- 20260823_adult_dms_private.sql). log_welfare_access gates on admin_may_review,
-- so after this only welfare-holders can open, and every open stays logged.
--
-- ⚠️ THE AUDIT-LOG READ NARROWS TOO — Jay's ruling 28 Aug 2026 (spec §8 was
-- super-only-vs-super+welfare): "welfare log read" moves from is_admin(club_id)
-- (any admin) to SUPER + WELFARE — a super, or an explicit welfare-holder of the
-- club. So the reviewer is reviewed by supers, and welfare-holders can see their
-- own opens; an ordinary admin no longer reads the who-opened-which-DM log.
--
-- Proven both directions in db/tests/dm-review-welfare.sql.

begin;

-- The DM-review permission: an active admin of the club holding `welfare`
-- EXPLICITLY. ⚠️ NO is_super SHORT-CIRCUIT — a super must tick welfare (§5.2
-- note ²). This is why it is NOT can_see_child_contacts-shaped.
create or replace function private.can_review_dm(_club uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid() and m.club_id = _club
       and m.role = 'admin' and m.status = 'active'
       and 'welfare' = any(m.admin_rights)
  );
$$;
revoke all on function private.can_review_dm(uuid) from public, anon;
grant execute on function private.can_review_dm(uuid) to authenticated;

-- Repoint admin_may_review's admin arm: was is_admin(c.club_id).
create or replace function private.admin_may_review(_conversation uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and private.can_review_dm(c.club_id)
       and private.conversation_reviewable(c.id)
  );
$$;
revoke all on function private.admin_may_review(uuid) from public, anon;
grant execute on function private.admin_may_review(uuid) to authenticated;

-- The audit log's read policy: super + welfare (Jay, 28 Aug). Was is_admin.
drop policy if exists "welfare log read" on public.welfare_access_log;
create policy "welfare log read" on public.welfare_access_log
  for select using (private.is_super_admin() or private.can_review_dm(club_id));

-- ── Guard ──────────────────────────────────────────────────────────────────
do $g$
declare src text; q text;
begin
  src := pg_get_functiondef('private.admin_may_review(uuid)'::regprocedure);
  if src not like '%can_review_dm%' then
    raise exception 'ABORTING: admin_may_review was not repointed to can_review_dm.';
  end if;
  if src like '%is_admin%' then
    raise exception 'ABORTING: admin_may_review still keys on is_admin — the review boundary is not narrowed.';
  end if;
  select pg_get_expr(polqual, polrelid) into q from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='welfare_access_log' and p.polname='welfare log read';
  if q is null or q not like '%can_review_dm%' then
    raise exception 'ABORTING: welfare log read not narrowed to super+welfare (qual=%).', q;
  end if;
  raise notice 'DM review narrowed to welfare; audit log read is super + welfare.';
end $g$;

commit;
