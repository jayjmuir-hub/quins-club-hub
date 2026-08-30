-- ══════════════════════════════════════════════════════════════════════════
--  LAST-ADMIN GUARD HARNESS (Grok item 8) — the club's last ACTIVE admin can
--  be neither demoted nor deleted; everything else passes untouched.
--  Run with `npm run db:check -- last-admin`.
--  SAFE ON PRODUCTION: one transaction that ROLLS BACK. The demotions that
--  build the single-admin state, and the injected fault, are all discarded.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. db/migrations/20260830_last_admin_guard.sql: a BEFORE
-- UPDATE OR DELETE trigger on public.memberships raising P0001 when the row
-- is the club's last active admin and the operation would remove that
-- status. Asserts the DEPLOYED state — green only once applied.

begin;

do $harness$
declare
  club uuid; last_one uuid; second uuid; n int; caught boolean;
begin
  select id into club from clubs limit 1;
  if club is null then
    raise exception 'LAST ADMIN: no club — cannot exercise the guard.';
  end if;

  -- Build the single-active-admin state through the guarded path itself:
  -- demote all active admins but one, one at a time. Each demotion must PASS
  -- (another active admin still exists) — a positive control per row.
  select count(*) into n from memberships where club_id = club and role='admin' and status='active';
  if n = 0 then
    raise exception 'LAST ADMIN: club has no active admin — fixture broken.';
  end if;
  for second in
    select id from memberships where club_id = club and role='admin' and status='active'
    order by created_at desc offset 1
  loop
    update memberships set status = 'pending' where id = second;
  end loop;
  select id into last_one from memberships where club_id = club and role='admin' and status='active';
  select count(*) into n from memberships where club_id = club and role='admin' and status='active';
  if n <> 1 then
    raise exception 'LAST ADMIN: expected exactly 1 active admin after demotions, found %.', n;
  end if;

  -- 1 · demoting the last active admin raises P0001.
  caught := false;
  begin
    update memberships set status = 'pending' where id = last_one;
  exception when sqlstate 'P0001' then caught := true;
  end;
  if not caught then
    raise exception 'LAST ADMIN: the last active admin was DEMOTED without refusal.';
  end if;

  -- 2 · role-swapping the last active admin raises P0001 too.
  caught := false;
  begin
    update memberships set role = 'parent' where id = last_one;
  exception when sqlstate 'P0001' then caught := true;
  end;
  if not caught then
    raise exception 'LAST ADMIN: the last active admin was ROLE-SWAPPED without refusal.';
  end if;

  -- 3 · deleting the last active admin raises P0001.
  caught := false;
  begin
    delete from memberships where id = last_one;
  exception when sqlstate 'P0001' then caught := true;
  end;
  if not caught then
    raise exception 'LAST ADMIN: the last active admin was DELETED without refusal.';
  end if;

  -- 4 · a NON-transition edit on the same row passes (rights, not role/status).
  update memberships set admin_rights = admin_rights where id = last_one;

  -- 5 · with a second active admin restored, demoting the first passes, and
  --     the second survives as the club's admin.
  select id into second from memberships
   where club_id = club and role='admin' and status='pending' limit 1;
  if second is not null then
    update memberships set status = 'active' where id = second;
    update memberships set status = 'pending' where id = last_one;
    select count(*) into n from memberships where club_id = club and role='admin' and status='active';
    if n <> 1 then
      raise exception 'LAST ADMIN: after a legitimate demotion % active admins remain (expected 1).', n;
    end if;
    -- put it back so later blocks see the same state
    update memberships set status = 'active' where id = last_one;
  else
    raise notice 'LAST ADMIN: only one admin row exists in the club — two-admin case skipped.';
  end if;

  -- 6 · a non-admin row is untouched by the guard.
  update memberships set status = status where club_id = club and role <> 'admin'
    and id = (select id from memberships where club_id = club and role <> 'admin' limit 1);

  raise notice 'LAST ADMIN: demote/role-swap/delete refused on the last active admin; ordinary edits pass.';
end $harness$;

-- ── ⚠️ THE SELF-TEST — drop the trigger and prove the demotion then slips
-- through, so the checks above are what stands in its way. ─────────────────
do $selftest$
declare
  club uuid; last_one uuid; second uuid; n int;
begin
  select id into club from clubs limit 1;
  for second in
    select id from memberships where club_id = club and role='admin' and status='active'
    order by created_at desc offset 1
  loop
    update memberships set status = 'pending' where id = second;
  end loop;
  select id into last_one from memberships where club_id = club and role='admin' and status='active';
  if last_one is null then
    raise exception 'SELF-TEST: no active admin left to exercise — fixture broken.';
  end if;

  drop trigger last_admin_guard on public.memberships;

  update memberships set status = 'pending' where id = last_one;
  select count(*) into n from memberships where club_id = club and role='admin' and status='active';
  if n <> 0 then
    raise exception 'SELF-TEST FAILED: with the trigger dropped the demotion still did not land — the harness is not exercising the guard.';
  end if;
  raise notice 'SELF-TEST PASSED — dropping the trigger let the last admin be demoted, so the trigger is what refuses it.';
end $selftest$;

rollback;
