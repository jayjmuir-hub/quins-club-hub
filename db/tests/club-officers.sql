-- Harness for db/migrations/20260826_club_officers.sql.
-- Run with `npm run db:check -- club-officers`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. a SUPER admin tags an officer; any member of the club reads it
--  2. ⚠️ the "no special rights" discriminator: an ORDINARY admin's insert
--     is REFUSED — a title is constitution, not admin housekeeping
--  3. member_identity now carries the officer row (role 'officer', the
--     title, no squad) alongside the person's membership rows
--  4. a member of ANOTHER club reads zero officer rows and zero identity
--  5. a ninth, invented title is refused by the CHECK — vocabulary closed
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values
 ('f0000000-0000-4000-8000-000000000100','ZZ Officerprobe Club'),
 ('f0000000-0000-4000-8000-000000000101','ZZ Elsewhere Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-off-super@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-off-admin@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000104','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-off-officer@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000105','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-off-member@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000106','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-off-elsewhere@example.invalid',now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-000000000107','f0000000-0000-4000-8000-000000000100','U14 ZZ Officerprobe', 1301),
 ('f0000000-0000-4000-8000-000000000108','f0000000-0000-4000-8000-000000000101','U8 ZZ Elsewhere', 1302);

insert into memberships (profile_id, club_id, team_id, player_id, role, title, status, is_super) values
 ('f0000000-0000-4000-8000-000000000102','f0000000-0000-4000-8000-000000000100', null, null, 'admin', null, 'active', true),
 ('f0000000-0000-4000-8000-000000000103','f0000000-0000-4000-8000-000000000100', null, null, 'admin', null, 'active', false),
 ('f0000000-0000-4000-8000-000000000104','f0000000-0000-4000-8000-000000000100','f0000000-0000-4000-8000-000000000107', null, 'coach', 'Head Coach', 'active', false),
 ('f0000000-0000-4000-8000-000000000105','f0000000-0000-4000-8000-000000000100','f0000000-0000-4000-8000-000000000107', null, 'manager', null, 'active', false),
 ('f0000000-0000-4000-8000-000000000106','f0000000-0000-4000-8000-000000000101','f0000000-0000-4000-8000-000000000108', null, 'coach', null, 'active', false);

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260826_club_officers.sql,
--    verbatim (begin/commit stripped — the harness owns the transaction) ──

create table public.club_officers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (title in (
    'Club President', 'Vice Chairman', 'Rugby Junior Manager',
    'Club Secretary', 'Treasurer', 'Membership Secretary',
    'Director of Rugby', 'Rugby Performance Director'
  )),
  created_at timestamptz not null default now(),
  unique (club_id, profile_id, title)
);

alter table public.club_officers enable row level security;

create policy "officers read member" on public.club_officers
  for select to authenticated
  using (exists (
    select 1 from memberships me
     where me.profile_id = auth.uid()
       and me.status = 'active'
       and me.club_id = club_officers.club_id
  ));

create policy "officers write super" on public.club_officers
  for insert to authenticated
  with check (private.is_super_admin());

create policy "officers delete super" on public.club_officers
  for delete to authenticated
  using (private.is_super_admin());

revoke all on table public.club_officers from public, anon;
grant select, insert, delete on table public.club_officers to authenticated;
grant all on table public.club_officers to service_role;

create or replace function public.member_identity(_profile uuid)
returns table(role text, title text, is_super boolean, squad text, squad_sort integer)
language sql stable security definer
set search_path to 'public'
as $$
  select m.role, m.title, coalesce(m.is_super, false), t.name, t.sort_order
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = _profile
     and m.status = 'active'
     and exists (
       select 1 from memberships me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.club_id = m.club_id
     )
  union all
  select 'officer', o.title, false, null::text, null::integer
    from club_officers o
   where o.profile_id = _profile
     and exists (
       select 1 from memberships me
        where me.profile_id = auth.uid()
          and me.status = 'active'
          and me.club_id = o.club_id
     )
$$;

-- ── assertions ───────────────────────────────────────────────────────────

create function pg_temp.assert_club_officers() returns void language plpgsql as $fn$
declare
  superad  constant uuid := 'f0000000-0000-4000-8000-000000000102';
  plainad  constant uuid := 'f0000000-0000-4000-8000-000000000103';
  officer  constant uuid := 'f0000000-0000-4000-8000-000000000104';
  member1  constant uuid := 'f0000000-0000-4000-8000-000000000105';
  elsewhere constant uuid := 'f0000000-0000-4000-8000-000000000106';
  clubid   constant uuid := 'f0000000-0000-4000-8000-000000000100';
  n integer;
  refused boolean := false;
begin
  -- 1: super tags Treasurer; a plain member reads it
  perform pg_temp.as_user(superad::text);
  insert into club_officers (club_id, profile_id, title) values (clubid, officer, 'Treasurer');
  reset role;
  perform pg_temp.as_user(member1::text);
  select count(*) into n from club_officers where profile_id = officer and title = 'Treasurer';
  reset role;
  if n <> 1 then raise exception 'ASSERT 1 FAILED: member read % officer row(s), wanted 1', n; end if;
  insert into _log(line) values ('1 super tags, member reads');

  -- 2: ⚠️ the discriminator — an ORDINARY admin''s insert is refused
  perform pg_temp.as_user(plainad::text);
  begin
    insert into club_officers (club_id, profile_id, title) values (clubid, plainad, 'Club President');
  exception when insufficient_privilege or check_violation then
    refused := true;
  end;
  reset role;
  if not refused then raise exception 'ASSERT 2 FAILED: a plain admin tagged an officer'; end if;
  insert into _log(line) values ('2 plain admin refused: titles are constitution, not housekeeping');

  -- 3: member_identity carries the officer row beside the membership rows
  perform pg_temp.as_user(member1::text);
  select count(*) into n from member_identity(officer) i
   where i.role = 'officer' and i.title = 'Treasurer' and i.squad is null;
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: identity officer rows = %, wanted 1', n; end if;
  perform pg_temp.as_user(member1::text);
  select count(*) into n from member_identity(officer) i where i.role = 'coach';
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: the coach membership row went missing'; end if;
  insert into _log(line) values ('3 identity: officer row rides beside the coach row');

  -- 4: another club''s member sees nothing — officers and identity both
  perform pg_temp.as_user(elsewhere::text);
  select count(*) into n from club_officers where profile_id = officer;
  if n <> 0 then reset role; raise exception 'ASSERT 4 FAILED: cross-club read % officer row(s)', n; end if;
  select count(*) into n from member_identity(officer);
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: cross-club identity % row(s)', n; end if;
  insert into _log(line) values ('4 cross-club: zero officers, zero identity');

  -- 5: the vocabulary is closed — an invented title is refused
  refused := false;
  perform pg_temp.as_user(superad::text);
  begin
    insert into club_officers (club_id, profile_id, title) values (clubid, officer, 'ZZ Grand Vizier');
  exception when check_violation then
    refused := true;
  end;
  reset role;
  if not refused then raise exception 'ASSERT 5 FAILED: an invented title was accepted'; end if;
  insert into _log(line) values ('5 vocabulary closed: invented title refused');
end $fn$;

select pg_temp.assert_club_officers();
select line from _log order by seq;
rollback;
