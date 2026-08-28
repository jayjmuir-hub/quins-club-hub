-- ══════════════════════════════════════════════════════════════════════════
--  CHILD WRITE ALLOWLIST HARNESS (Phase 3, Surface S1 edit) — a narrowed admin
--  cannot edit/insert/delete a child's record, but still READS names; squad
--  staff and supers still write.
--  Run with `npm run db:check -- child-write`.
--  SAFE ON PRODUCTION: one transaction that ROLLS BACK. The writes it makes are
--  no-op UPDATEs (set gender = gender) purely to read the affected row-count,
--  plus the simulated narrow-grant and the injected fault — all discarded.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. db/migrations/20260828_child_write_allowlist.sql narrows the
-- "player edit" policy to can_write_child ({clubadmin,youth,media}) OR
-- is_team_staff; "player read" is untouched (Pitch/Training keep reading names).
-- Asserts the DEPLOYED state — green only once that migration is applied.

begin;

do $harness$
declare
  pitches_pid uuid; super_pid uuid; coach_pid uuid; coach_team uuid;
  a_player uuid; coach_player uuid; nrows int; can_read int;
begin
  select id into a_player from public.players limit 1;
  if a_player is null then
    raise exception 'CHILD WRITE: control failed — no players exist, so the write assertions prove nothing.';
  end if;
  select profile_id into super_pid from memberships where role='admin' and status='active' and is_super=true limit 1;
  if super_pid is null then raise exception 'CHILD WRITE: no super admin for the positive control.'; end if;

  -- A future narrow grant: a pitches-only admin with no squad attachment.
  update memberships set admin_rights = array['pitches']
   where id = (select id from memberships
                where role='admin' and status='active' and is_super=false and admin_rights && array['pitches']
                  and not exists (select 1 from memberships x where x.profile_id=memberships.profile_id and x.status='active' and x.team_id is not null)
                limit 1)
  returning profile_id into pitches_pid;

  -- DIRECTION 1 — a narrowed admin cannot WRITE, but still READS names.
  if pitches_pid is not null then
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub', pitches_pid)::text, true);
    update public.players set gender = gender where id = a_player;
    get diagnostics nrows = row_count;
    if nrows <> 0 then raise exception 'CHILD WRITE: pitches-only admin edited % player row(s) (want 0).', nrows; end if;
    select count(*) into can_read from public.players where id = a_player;
    if can_read <> 1 then raise exception 'CHILD WRITE: pitches-only admin lost READ of the roster — S1 read must stay broad.'; end if;
    reset role;
  end if;

  -- DIRECTION 2 — a super still writes (nobody legitimate loses write).
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', super_pid)::text, true);
  update public.players set gender = gender where id = a_player;
  get diagnostics nrows = row_count;
  reset role;
  if nrows <> 1 then raise exception 'CHILD WRITE: a super could not edit a player (rows=%).', nrows; end if;

  -- DIRECTION 3 — a squad coach still writes their OWN squad's players.
  select m.profile_id, m.team_id into coach_pid, coach_team
    from memberships m where m.role='coach' and m.status='active' and m.team_id is not null
      and exists (select 1 from players p where p.team_id=m.team_id) limit 1;
  if coach_pid is not null then
    select id into coach_player from public.players where team_id = coach_team limit 1;
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub', coach_pid)::text, true);
    update public.players set gender = gender where id = coach_player;
    get diagnostics nrows = row_count;
    reset role;
    if nrows <> 1 then raise exception 'CHILD WRITE: a coach could no longer edit their own squad''s player — squad write was broken.'; end if;
  end if;

  raise notice 'CHILD WRITE: narrowed admin read-only; super writes; coach writes own squad.';
end $harness$;

-- ── ⚠️ THE SELF-TEST — restore clubadmin and prove the check catches it. ─────
do $selftest$
declare pid uuid; a_player uuid; nrows int;
begin
  update memberships set admin_rights = array['pitches','clubadmin']
   where id = (select id from memberships where role='admin' and status='active' and admin_rights = array['pitches'] limit 1)
  returning profile_id into pid;
  if pid is null then raise notice 'SELF-TEST skipped (no demoted admin this run).'; return; end if;

  select id into a_player from public.players limit 1;
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', pid)::text, true);
  update public.players set gender = gender where id = a_player;
  get diagnostics nrows = row_count;
  reset role;
  if nrows = 0 then
    raise exception 'SELF-TEST FAILED: a clubadmin holder still cannot write — the assertion is vacuous (RLS off? no UPDATE grant?).';
  end if;
  raise notice 'SELF-TEST PASSED — restoring clubadmin restored write (% row).', nrows;
end $selftest$;

rollback;
