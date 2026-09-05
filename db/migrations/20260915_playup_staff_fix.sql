-- ══════════════════════════════════════════════════════════════════════════
--  private.playup_staff: aggregate uuid, not record.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Idempotent CREATE OR REPLACE. Live already has this body (applied 5 Sep
-- 2026). The original in 20260914_junior_playup_consent.sql used
-- `select * from private.approval_audience` inside array_agg; that SETOF
-- uuid became record, and apply failed with:
--   COALESCE types record[] and uuid[] cannot be matched
-- Replaying 20260914 is now safe; this file is the catch-up for a database
-- that applied the broken body then the live patch, or that never applied
-- 20260914 at all.

create or replace function private.playup_staff(_club uuid, _home uuid, _guest uuid, _except uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct uid), '{}'::uuid[])
    from (
      select a as uid from private.approval_audience(_club, _home, _except) as a
      union
      select a as uid from private.approval_audience(_club, _guest, _except) as a
    ) s;
$$;
revoke execute on function private.playup_staff(uuid, uuid, uuid, uuid) from public;
