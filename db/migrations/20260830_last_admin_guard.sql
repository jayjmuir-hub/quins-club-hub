-- ══════════════════════════════════════════════════════════════════════════
--  Grok-sweep item 8 — the last active admin cannot be demoted or deleted
--  30 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT. `updateMembershipRole` / `deleteMembership` (src/data/members.js) are
-- DIRECT table writes under the "memb manage" policy — there is no RPC
-- chokepoint — so an admin can demote or delete the club's last active admin
-- (including themselves, by editing their own row) and leave the club
-- permanently unadministerable: nobody can approve requests, grant rights, or
-- promote a replacement. `delete_my_account` already refuses this for the
-- self-serve account path (20260806_delete_my_account.sql); the memberships
-- table itself had no guard. The client's LAST_ADMIN_REFUSAL banner in
-- Accounts.jsx is the friendly first line; this trigger is the real one.
--
-- HOW. A BEFORE UPDATE OR DELETE row trigger that raises P0001 (the same
-- errcode delete_my_account uses) when the row is the club's LAST active
-- admin and the operation would remove that status:
--   UPDATE: fires only when OLD is an active admin AND NEW is not.
--   DELETE: fires when OLD is an active admin.
--   Passes iff another active admin of OLD.club_id exists with id <> OLD.id.
--
-- Ordinary edits (team moves, rights edits, approvals, non-last-admin
-- demotions) never enter the guard arm.
--
-- ⚠️ delete_my_account interplay: its own guard counts role='admin' rows of
-- ANY status, so with one active admin plus one PENDING admin it would allow
-- the delete — and the auth.users cascade then hits this trigger, which
-- refuses. That is the correct outcome (a pending admin cannot administer),
-- and refusing is recoverable.
--
-- ⚠️ Bulk migrations that touch memberships will be evaluated row by row. If
-- a future backfill legitimately needs to bypass, it can
-- `set session_replication_role = replica` inside its own transaction.
--
-- ROLLBACK. drop trigger last_admin_guard on public.memberships;
--           drop function private.guard_last_admin();

begin;

create or replace function private.guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active') then
    if not exists (
      select 1 from public.memberships m
       where m.club_id = old.club_id
         and m.id <> old.id
         and m.role = 'admin'
         and m.status = 'active'
    ) then
      raise exception 'This is the club''s only active admin. Make someone else an admin first.'
        using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function private.guard_last_admin() from public, anon, authenticated;

drop trigger if exists last_admin_guard on public.memberships;
create trigger last_admin_guard
  before update or delete on public.memberships
  for each row execute function private.guard_last_admin();

-- ── Guard ──────────────────────────────────────────────────────────────────
do $g$
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'memberships' and t.tgname = 'last_admin_guard' and not t.tgisinternal
  ) then
    raise exception 'ABORTING: last_admin_guard trigger is not attached.';
  end if;
  raise notice 'Last active admin is now undeletable and undemotable.';
end $g$;

commit;
