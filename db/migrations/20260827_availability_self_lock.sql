-- ⚠️ APPLIES TO PRODUCTION as `availability_self_lock`.
--
-- Parents/players may now DELETE (clear) their own child's availability — the
-- 9-Aug 2026 staff-only-delete rule (20260809_scale_indexes_and_availability_
-- policy_merge.sql) is REVERSED — but every self-write (insert, update, delete)
-- is now gated on a lock window: self-service closes a fixed number of CALENDAR
-- DAYS before the event, in Abu Dhabi time. Matches close 5 days out, training
-- 1 day out, socials never. Staff (can_edit_team) are never locked.
--
-- Design: claude/plans/2026-08-27-availability-clear-and-lock-window.md
-- Decision: claude/decisions/2026-08-27-availability-self-edit-lock.md
-- Anchor:   db/tests/rls-availability-equivalence.sql (repointed alongside).

-- ── The time rule, shared by all three write policies ──────────────────────
create or replace function private.availability_self_editable(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when e.starts_at is null then true
    when e.type not in ('match','training') then true
    else now() < (
      date_trunc('day', (e.starts_at at time zone 'Asia/Dubai'))
      - make_interval(days => case e.type
                                when 'match' then 5
                                when 'training' then 1
                              end)
    ) at time zone 'Asia/Dubai'
  end
  from public.events e
  where e.id = p_event_id
$$;

revoke all on function private.availability_self_editable(uuid) from public;

-- ⚠️ RE-GRANT to authenticated — mandatory. `revoke all from public` strips the
-- default PUBLIC execute grant, and a private helper used inside an RLS policy
-- must re-grant execute to authenticated or the policy raises "permission denied
-- for function" for a parent/coach. `anon` needs nothing (no USAGE on private).
grant execute on function private.availability_self_editable(uuid) to authenticated;

-- ── The three write policies. Staff arm unchanged; the self arm is now
--    lock-gated, and DELETE gains the self arm it never had. ────────────────
drop policy "avail write insert" on public.availability;
drop policy "avail write update" on public.availability;
drop policy "avail write delete" on public.availability;

create policy "avail write insert" on public.availability for insert with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);

create policy "avail write update" on public.availability for update using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
) with check (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);

create policy "avail write delete" on public.availability for delete using (
  private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
  or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
);

-- ── Verify (a migration that changed nothing must fail, not pass) ───────────
-- Structural only. The behaviour of the time rule is proven by the harness in
-- db/tests/rls-availability-equivalence.sql, which exercises it against real
-- callers and rolls back.
do $$
declare n_pol int;
begin
  select count(*) into n_pol from pg_policies
   where schemaname = 'public' and tablename = 'availability';
  if n_pol <> 4 then
    raise exception 'VERIFY: expected 4 policies on availability, found %', n_pol;
  end if;

  if to_regprocedure('private.availability_self_editable(uuid)') is null then
    raise exception 'VERIFY: helper private.availability_self_editable(uuid) is missing';
  end if;
end $$;
