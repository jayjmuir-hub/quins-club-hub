-- ⚠️ APPLIES TO PRODUCTION as `availability_override`.
--
-- A per-event override of the self-edit lock: coach/manager/admin set
-- events.availability_override to 'auto' (the calendar rule), 'open' (always
-- editable by parents), or 'locked' (always frozen). Overrides win over the
-- calendar rule; staff are never locked. Design:
-- claude/plans/2026-08-27-availability-lock-override.md
--
-- No grant: events has table-level ALL for authenticated, so the new column is
-- covered (verified 27 Aug 2026). RLS (the events write policy, can_edit_team)
-- remains the gate on who may set it.

alter table public.events
  add column availability_override text not null default 'auto'
    check (availability_override in ('auto','open','locked'));

-- The lock helper now consults the override before the calendar rule.
create or replace function private.availability_self_editable(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when e.availability_override = 'open'   then true
    when e.availability_override = 'locked' then false
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
-- create or replace preserves the existing grant from 20260827_availability_self_lock;
-- re-assert it so this migration is self-contained and a fresh replay is correct.
revoke all on function private.availability_self_editable(uuid) from public;
grant execute on function private.availability_self_editable(uuid) to authenticated;

-- ── Verify (a migration that changed nothing must fail) ────────────────────
do $$
declare has_col boolean; auth_exec boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='events'
       and column_name='availability_override'
  ) into has_col;
  if not has_col then
    raise exception 'VERIFY: events.availability_override was not added';
  end if;

  if to_regprocedure('private.availability_self_editable(uuid)') is null then
    raise exception 'VERIFY: helper missing after replace';
  end if;

  select has_function_privilege('authenticated','private.availability_self_editable(uuid)','execute')
    into auth_exec;
  if not auth_exec then
    raise exception 'VERIFY: authenticated lost EXECUTE on the helper';
  end if;
end $$;
