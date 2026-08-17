-- public.membership_audit — who gave whom access, and when.
--
-- Jay, 17 Aug 2026: "we need a change log for changes to rights".
--
-- ══ THE GAP THIS FILLS ═══════════════════════════════════════════════════
--
-- `memberships` holds the CURRENT state and no history at all. So "who made
-- this person an admin, and when" has been unanswerable since the app existed —
-- and for a club whose members are mostly children, the trail of who granted
-- access to which squad is the one worth keeping.
--
-- ══ ⚠️ WRITTEN BY A TRIGGER, NEVER BY THE APP ════════════════════════════
--
-- Access is granted from at least six places: approve_membership, accept_invite,
-- claim_roster_access, register_my_player, request_staff_role, and the Accounts
-- screen's direct writes. An audit the CLIENT writes is one a client can skip —
-- and worse, one that a NEW granting path forgets to call, silently, forever.
-- The trigger is on the row. The same argument notify_pending_membership makes.
--
-- ══ ⚠️ APPEND-ONLY, AND THAT IS ENFORCED BY ABSENCE ══════════════════════
--
-- There is a SELECT policy and there are NO OTHERS. No INSERT, no UPDATE, no
-- DELETE policy means no client can write or alter a row through the API at all,
-- whatever their role — RLS denies by default. The trigger writes because it is
-- SECURITY DEFINER and runs as the owner.
--
-- ⚠️ AN AUDIT LOG YOU CAN EDIT IS NOT AN AUDIT LOG. If a future migration adds
-- an UPDATE or DELETE policy here "for tidying", that is the moment this stops
-- being evidence.
--
-- ══ ⚠️ NO FOREIGN KEYS, AND THAT IS THE POINT ════════════════════════════
--
-- `membership_id` and `profile_id` are plain uuids. A foreign key to
-- `memberships` would make it impossible to record the most interesting event —
-- a REVOKE — because the row it points at is being deleted. A cascade to
-- `profiles` would erase somebody's history the moment their account went. The
-- audit outlives both on purpose.
--
-- ══ ⚠️ auth.uid() IS NULL FOR SYSTEM WRITES, AND NULL IS RECORDED AS SUCH ══
--
-- A cron job, a service-role write or a migration has no signed-in user. That is
-- not "nobody did it" — it is "the system did it", and the two must be
-- distinguishable. `actor_id` null + `actor_kind = 'system'` says so out loud
-- rather than leaving a blank column to be misread as missing data.

begin;

create table if not exists public.membership_audit (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),

  -- ⚠️ PLAIN uuids, NO FOREIGN KEYS. See the header.
  membership_id  uuid not null,
  profile_id     uuid not null,
  club_id        uuid not null,
  team_id        uuid,
  player_id      uuid,

  action         text not null check (action in ('granted', 'changed', 'revoked')),

  -- Who did it. NULL means no signed-in user, which is a real answer.
  actor_id       uuid,
  actor_kind     text not null check (actor_kind in ('member', 'system')),

  -- The four things worth having history for. Everything else on a membership
  -- row is either derived or immutable.
  old_role       text,
  new_role       text,
  old_status     text,
  new_status     text,
  old_is_super   boolean,
  new_is_super   boolean,
  old_rights     text[],
  new_rights     text[]
);

comment on table public.membership_audit is
  'Append-only history of who granted, changed or revoked access. Written by a '
  'trigger on public.memberships — never by the app, because a client-side '
  'audit is one a new granting path can silently forget. There is a SELECT '
  'policy and deliberately no others: an audit log you can edit is not one.';

-- The queries this exists to answer: "what happened to this person" and "what
-- happened lately".
create index if not exists membership_audit_profile_idx on public.membership_audit (profile_id, at desc);
create index if not exists membership_audit_at_idx      on public.membership_audit (at desc);

alter table public.membership_audit enable row level security;

-- ⚠️ THE ONLY POLICY, AND IT IS SUPER ADMINS ONLY — Jay's call, 17 Aug 2026.
-- The first version said `private.is_admin(club_id)`, which is wrong for the
-- obvious reason once stated: this log records what ADMINS do, so letting every
-- admin read it lets the audited read their own audit. `is_super_admin()` is the
-- same gate `set_admin_rights` uses, which is the other place the club's
-- most-privileged action lives.
create policy "membership audit read" on public.membership_audit
  as permissive for select to public
  using (private.is_super_admin());

-- ⚠️ A SECOND, INDEPENDENT REFUSAL BENEATH RLS. Table privileges are checked
-- separately, so even a policy added later by mistake cannot make this writable
-- without somebody also noticing this line.
--
-- ⚠️ TRUNCATE IS IN THE LIST, AND IT IS THE ONE THAT IS EASY TO MISS. Supabase
-- grants it to `authenticated` by default. PostgREST exposes no truncate verb,
-- so it is not reachable today — but "not reachable through the API we happen to
-- use" is not a property to rest an audit log on, and the first probe of this
-- table tested INSERT, UPDATE and DELETE while leaving it in place.
revoke insert, update, delete, truncate on public.membership_audit from anon, authenticated;

create or replace function private.audit_membership()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  actor uuid := auth.uid();
  row_now public.memberships;
begin
  row_now := coalesce(new, old);

  if tg_op = 'UPDATE' then
    -- ⚠️ ONLY WHEN SOMETHING THAT MATTERS CHANGED. Without this, any touch of a
    -- membership row writes an audit entry saying nothing changed, and the log
    -- people are meant to read becomes a log people scroll past.
    if new.role = old.role
       and new.status = old.status
       and new.is_super = old.is_super
       and new.admin_rights = old.admin_rights then
      return new;
    end if;
  end if;

  insert into public.membership_audit (
    membership_id, profile_id, club_id, team_id, player_id,
    action, actor_id, actor_kind,
    old_role, new_role, old_status, new_status,
    old_is_super, new_is_super, old_rights, new_rights
  )
  values (
    row_now.id, row_now.profile_id, row_now.club_id, row_now.team_id, row_now.player_id,
    case tg_op when 'INSERT' then 'granted' when 'DELETE' then 'revoked' else 'changed' end,
    actor,
    case when actor is null then 'system' else 'member' end,
    case when tg_op = 'INSERT' then null else old.role end,
    case when tg_op = 'DELETE' then null else new.role end,
    case when tg_op = 'INSERT' then null else old.status end,
    case when tg_op = 'DELETE' then null else new.status end,
    case when tg_op = 'INSERT' then null else old.is_super end,
    case when tg_op = 'DELETE' then null else new.is_super end,
    case when tg_op = 'INSERT' then null else old.admin_rights end,
    case when tg_op = 'DELETE' then null else new.admin_rights end
  );

  return coalesce(new, old);
exception when others then
  -- ⚠️ THE AUDIT MUST NEVER BREAK A GRANT. A failure here is logged and
  -- swallowed: an approval that fails because its audit row could not be written
  -- is an outage for the club, where a missing audit line is a gap in a record.
  -- ⚠️ IT IS A `warning`, WHICH LANDS IN postgres_logs — the only place a gap
  -- can be noticed at all, so do not quiet it.
  raise warning 'audit_membership: % (membership %)', sqlerrm, row_now.id;
  return coalesce(new, old);
end;
$function$;

-- ⚠️ AFTER, NOT BEFORE. A BEFORE trigger would record a change that a later
-- constraint or policy then refused, so the audit would carry events that never
-- happened.
drop trigger if exists audit_membership on public.memberships;
create trigger audit_membership
  after insert or update or delete on public.memberships
  for each row
  execute function private.audit_membership();

-- ── THE GUARD ──────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'memberships' and t.tgname = 'audit_membership' and not t.tgisinternal;
  if n <> 1 then
    raise exception 'ABORTING: expected exactly one audit trigger, found %.', n;
  end if;

  -- ⚠️ THE ONE THAT KEEPS IT AN AUDIT LOG. A write policy here would let the
  -- people being audited edit the record of what they did.
  select count(*) into n from pg_policy
   where polrelid = 'public.membership_audit'::regclass and polcmd <> 'r';
  if n <> 0 then
    raise exception 'ABORTING: membership_audit has % write polic(ies). It must be append-only.', n;
  end if;

  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.membership_audit'::regclass
       and pg_get_expr(polqual, polrelid) like '%is_super_admin%'
  ) then
    raise exception 'ABORTING: the read policy is not scoped to super admins.';
  end if;

  raise notice 'guard passed: trigger installed, and the table is read-only to clients';
end $$;

commit;

-- ── VERIFIED ON PRODUCTION, 17 Aug 2026, ROLLED BACK ───────────────────────
--
-- Four events on one membership: granted 1, changed 2, revoked 1 — and a
-- title-only edit wrote NOTHING, which is what keeps the log readable. The first
-- row carried the signed-in admin as `actor_id` with `actor_kind = 'member'`;
-- a write with no signed-in user recorded `system`.
--
-- Tamper, as a signed-in admin: UPDATE refused, DELETE refused, INSERT refused.
--
-- ⚠️ AND THE FIRST READ PROBE REPORTED A PASS THAT MEANT NOTHING. It checked
-- that "an ordinary club admin sees 0" — but THIS CLUB HAS NO ORDINARY ADMIN,
-- every admin is super, so the probe tested a NULL user and measured a stranger.
-- Re-run after creating a real non-super admin inside the transaction, and
-- asserting `private.is_admin()` returns TRUE for them first:
--
--   control (no RLS)                            1
--   a genuine non-super club admin              0   <- the assertion
--   a super admin                               1
--
-- The `is_admin = true` line is what makes the 0 evidence rather than an absence.
