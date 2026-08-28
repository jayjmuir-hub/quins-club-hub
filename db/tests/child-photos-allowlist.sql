-- ══════════════════════════════════════════════════════════════════════════
--  CHILD PHOTOS ALLOWLIST HARNESS (Phase 2, Surface S3) — a narrowed admin
--  cannot read a child's photograph from storage; squad members and supers can.
--  Run with `npm run db:check -- child-photos`.
--  SAFE ON PRODUCTION: one transaction that ROLLS BACK. The only writes are the
--  simulated narrow-grant (demote) and the injected fault, both discarded.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS. db/migrations/20260828_child_photos_allowlist.sql narrows the
-- `player-photos` storage read policy to the allowlist {clubadmin,youth,media,
-- welfare}; the squad-attached (is_on_team) and guardian arms stay. Asserts the
-- DEPLOYED state — green only once that migration is applied.
--
-- ⚠️ Like the contacts harness, it demotes a REAL admin to pitches-only inside
-- the rolled-back transaction (no currently-narrowed admin exists post-0a), then
-- impersonates. `set local role authenticated` so RLS is enforced.

begin;

do $harness$
declare
  pitches_pid uuid; super_pid uuid; coach_pid uuid; coach_team uuid;
  total int; nar int; sup int; coach_seen int;
begin
  select count(*) into total from storage.objects where bucket_id='player-photos';
  if total = 0 then
    raise exception 'CHILD PHOTOS: control failed — no player-photos objects, so "narrowed sees 0" proves nothing.';
  end if;

  select profile_id into super_pid from memberships where role='admin' and status='active' and is_super=true limit 1;
  if super_pid is null then raise exception 'CHILD PHOTOS: no super admin for the positive control.'; end if;

  -- Simulate a future narrow grant: a pitches-only admin with no squad attachment.
  update memberships set admin_rights = array['pitches']
   where id = (select id from memberships
                where role='admin' and status='active' and is_super=false
                  and admin_rights && array['pitches']
                  and not exists (select 1 from memberships x where x.profile_id=memberships.profile_id and x.status='active' and x.team_id is not null)
                limit 1)
  returning profile_id into pitches_pid;
  if pitches_pid is null then
    raise notice 'CHILD PHOTOS: no squad-unattached non-super admin to demote — narrowed-read case skipped (still checking super + coach).';
  end if;

  -- DIRECTION 1 — a narrowed admin with no squad attachment sees NO photos.
  if pitches_pid is not null then
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub', pitches_pid)::text, true);
    select count(*) into nar from storage.objects where bucket_id='player-photos';
    reset role;
    if nar <> 0 then raise exception 'CHILD PHOTOS: pitches-only admin (no squad) can read % photos (want 0).', nar; end if;
  end if;

  -- DIRECTION 2 — a super still reads every photo (nobody legitimate loses).
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', super_pid)::text, true);
  select count(*) into sup from storage.objects where bucket_id='player-photos';
  reset role;
  if sup <> total then raise exception 'CHILD PHOTOS: super reads % of % photos — a legitimate reader was broken.', sup, total; end if;

  -- DIRECTION 3 — a squad coach still reads their own team''s photos.
  select m.profile_id, m.team_id into coach_pid, coach_team
    from memberships m
   where m.role='coach' and m.status='active' and m.team_id is not null
     and exists (select 1 from storage.objects o where o.bucket_id='player-photos' and private.photo_team(o.name)=m.team_id)
   limit 1;
  if coach_pid is not null then
    perform set_config('role','authenticated',true);
    perform set_config('request.jwt.claims', json_build_object('sub', coach_pid)::text, true);
    select count(*) into coach_seen from storage.objects o where o.bucket_id='player-photos' and private.photo_team(o.name)=coach_team;
    reset role;
    if coach_seen = 0 then raise exception 'CHILD PHOTOS: a coach can no longer see their own squad''s photos — squad access was broken.'; end if;
  end if;

  raise notice 'CHILD PHOTOS: narrowed admin refused; super retains all %; coach keeps their squad.', total;
end $harness$;

-- ── ⚠️ THE SELF-TEST — restore clubadmin and prove the check catches it. ─────
do $selftest$
declare pid uuid; cnt int;
begin
  update memberships set admin_rights = array['pitches','clubadmin']
   where id = (select id from memberships where role='admin' and status='active' and admin_rights = array['pitches'] limit 1)
  returning profile_id into pid;
  if pid is null then raise notice 'SELF-TEST skipped (no demoted admin this run).'; return; end if;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', json_build_object('sub', pid)::text, true);
  select count(*) into cnt from storage.objects where bucket_id='player-photos';
  reset role;
  if cnt = 0 then
    raise exception 'SELF-TEST FAILED: a clubadmin holder still reads 0 photos — the assertion is vacuous (RLS off? wrong bucket?).';
  end if;
  raise notice 'SELF-TEST PASSED — restoring clubadmin restored photo read (% objects).', cnt;
end $selftest$;

rollback;
