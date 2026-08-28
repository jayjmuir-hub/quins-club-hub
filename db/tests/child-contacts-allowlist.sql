-- ══════════════════════════════════════════════════════════════════════════
--  CHILD CONTACTS ALLOWLIST HARNESS (Phase 1, Surface S2) — a narrowed admin
--  cannot read a child's DOB or their parents' contact, at the API/table.
--  Run with `npm run db:check -- child-contacts`.
--  SAFE ON PRODUCTION: one transaction that ROLLS BACK. The only writes are the
--  simulated narrow-grant (demote) and the injected fault, both discarded.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS
--
-- db/migrations/20260828_child_contacts_allowlist.sql narrows the read of the
-- three child-linked tables (player_contacts, player_parents, player_private)
-- to the S2 allowlist {clubadmin, youth, media, welfare}. This asserts the
-- DEPLOYED state, so it goes green only once that migration is applied.
--
-- ⚠️ WHY A DEMOTE, NOT A FRESH FIXTURE. After Phase 0a every real admin holds
-- clubadmin, so no currently-narrowed admin exists to test against. A fresh
-- pitches-only admin would need an auth.users + profiles + club + team + player
-- + contact fixture (FK-heavy, and the profiles trigger bites — see
-- signup-nudges.sql). Instead we take a REAL admin and, inside the rolled-back
-- transaction, strip them to pitches-only — exactly the future narrow grant the
-- boundary is built for — then impersonate them. Nothing persists.
--
-- ⚠️ IMPERSONATION. `set local role authenticated` so RLS is enforced (the
-- harness's own connection role bypasses it), and request.jwt.claims carries the
-- subject so auth.uid() resolves. reset role between subjects.

begin;

do $harness$
declare
  pitches_pid uuid;
  super_pid   uuid;
  cnt int;
  total_contacts int;
begin
  select count(*) into total_contacts from public.player_contacts;

  -- ── THE CONTROL. Without child-contact data the "sees 0" assertions are
  -- vacuous. (A club mid-registration could legitimately have none — then this
  -- harness cannot prove the boundary and says so rather than passing hollow.)
  if total_contacts = 0 then
    raise exception
      'CHILD CONTACTS: control failed — no player_contacts rows exist, so "a '
      'narrowed admin sees 0" proves nothing. Seed a contact or skip.';
  end if;

  select profile_id into super_pid from memberships
    where role='admin' and status='active' and is_super=true limit 1;
  if super_pid is null then
    raise exception 'CHILD CONTACTS: no active super admin to use as the positive control.';
  end if;

  -- Simulate a FUTURE narrow grant: demote one real admin to pitches-only.
  update memberships set admin_rights = array['pitches']
   where id = (select id from memberships
                where role='admin' and status='active' and is_super=false
                  and admin_rights && array['pitches'] limit 1)
  returning profile_id into pitches_pid;
  if pitches_pid is null then
    raise exception 'CHILD CONTACTS: no non-super admin holding pitches to demote for the test.';
  end if;

  -- ── DIRECTION 1 — the boundary holds: pitches-only admin is refused, at the
  -- table itself (an adversary hitting PostgREST directly, not just the menu).
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', pitches_pid)::text, true);

  select count(*) into cnt from public.player_contacts;
  if cnt <> 0 then raise exception 'CHILD CONTACTS: pitches-only admin reads % parent contacts (want 0).', cnt; end if;
  select count(*) into cnt from public.player_parents;
  if cnt <> 0 then raise exception 'CHILD CONTACTS: pitches-only admin reads % parent rows (want 0).', cnt; end if;
  select count(*) into cnt from public.player_private;
  if cnt <> 0 then raise exception 'CHILD CONTACTS: pitches-only admin reads % DOB rows (want 0).', cnt; end if;

  -- ── DIRECTION 2 — nobody legitimate loses access: a super still reads all.
  reset role;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', super_pid)::text, true);
  select count(*) into cnt from public.player_contacts;
  if cnt <> total_contacts then
    raise exception 'CHILD CONTACTS: super reads % of % contacts — a legitimate reader was broken.', cnt, total_contacts;
  end if;

  reset role;
  raise notice 'CHILD CONTACTS: both directions passed — pitches-only refused (0), super retains all %.', total_contacts;
end
$harness$;

-- ── ⚠️ THE SELF-TEST — put the allowlist back the way it was and prove the
-- check would catch it. Re-grant the demoted admin `clubadmin` (an allowlisted
-- right): they must now READ contacts, so the "sees 0" assertion must FAIL.
do $selftest$
declare
  pid uuid;
  cnt int;
begin
  update memberships set admin_rights = array['pitches','clubadmin']
   where id = (select id from memberships where role='admin' and status='active'
                 and admin_rights = array['pitches'] limit 1)
  returning profile_id into pid;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', pid)::text, true);
  select count(*) into cnt from public.player_contacts;
  reset role;

  if cnt = 0 then
    raise exception 'SELF-TEST FAILED: a clubadmin holder still reads 0 contacts — the assertion is vacuous (RLS off? wrong table?).';
  end if;
  raise notice 'SELF-TEST PASSED — the check is live: restoring clubadmin restored read (% rows).', cnt;
end
$selftest$;

rollback;
