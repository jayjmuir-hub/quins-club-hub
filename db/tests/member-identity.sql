-- Harness for db/migrations/20260826_member_identity.sql.
-- Run with `npm run db:check -- member-identity`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. the multi-hat case the feature exists for: a super-admin who is also
--     assistant coach on TWO squads returns THREE rows, titles intact —
--     the exact shape member_contact_card's best-role summary discards,
--     which is the injected fault this harness discriminates against
--  2. a parent's identity is visible to a fellow member (spec decision 2),
--     with squad names attached
--  3. a caller from ANOTHER club gets zero rows — same-club is the door
--  4. a login with no active membership gets zero rows
--  5. a PENDING membership row does not appear
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values
 ('f0000000-0000-4000-8000-0000000000f0','ZZ Identprobe Club'),
 ('f0000000-0000-4000-8000-0000000000f1','ZZ Otherprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-ident-multihat@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000f3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-ident-parent@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000f4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-ident-viewer@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000f5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-ident-elsewhere@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000f6','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-ident-nobody@example.invalid',   now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000f7','f0000000-0000-4000-8000-0000000000f0','U16 ZZ Identprobe', 1201),
 ('f0000000-0000-4000-8000-0000000000f8','f0000000-0000-4000-8000-0000000000f0','U18 ZZ Identprobe', 1202),
 ('f0000000-0000-4000-8000-0000000000f9','f0000000-0000-4000-8000-0000000000f1','U12 ZZ Otherprobe', 1203);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000fa','f0000000-0000-4000-8000-0000000000f0','f0000000-0000-4000-8000-0000000000f7','Zz Probe Identchild');

-- the multi-hat: super-admin (no squad) + assistant coach on BOTH squads,
-- plus a PENDING row that must never surface (assert 5)
insert into memberships (profile_id, club_id, team_id, player_id, role, title, status, is_super) values
 ('f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000f0', null, null, 'admin', null, 'active', true),
 ('f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000f0','f0000000-0000-4000-8000-0000000000f7', null, 'coach', 'Assistant Coach', 'active', false),
 ('f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000f0','f0000000-0000-4000-8000-0000000000f8', null, 'coach', 'Assistant Coach', 'active', false),
 ('f0000000-0000-4000-8000-0000000000f2','f0000000-0000-4000-8000-0000000000f0','f0000000-0000-4000-8000-0000000000f8', null, 'medic', null, 'pending', false),
 ('f0000000-0000-4000-8000-0000000000f3','f0000000-0000-4000-8000-0000000000f0','f0000000-0000-4000-8000-0000000000f7','f0000000-0000-4000-8000-0000000000fa','parent', null, 'active', false),
 ('f0000000-0000-4000-8000-0000000000f4','f0000000-0000-4000-8000-0000000000f0','f0000000-0000-4000-8000-0000000000f7', null, 'manager', null, 'active', false),
 ('f0000000-0000-4000-8000-0000000000f5','f0000000-0000-4000-8000-0000000000f1','f0000000-0000-4000-8000-0000000000f9', null, 'coach', null, 'active', false);

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260826_member_identity.sql,
--    verbatim (begin/commit stripped — the harness owns the transaction) ──

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
$$;

revoke all on function public.member_identity(uuid) from public, anon;
grant execute on function public.member_identity(uuid) to authenticated, service_role;

-- ── assertions ───────────────────────────────────────────────────────────

create function pg_temp.assert_member_identity() returns void language plpgsql as $fn$
declare
  multihat constant uuid := 'f0000000-0000-4000-8000-0000000000f2';
  parent1  constant uuid := 'f0000000-0000-4000-8000-0000000000f3';
  viewer   constant uuid := 'f0000000-0000-4000-8000-0000000000f4';
  elsewhere constant uuid := 'f0000000-0000-4000-8000-0000000000f5';
  nobody   constant uuid := 'f0000000-0000-4000-8000-0000000000f6';
  n integer;
  titles text;
begin
  -- 1: three rows for three hats, titles intact — the shape the best-role
  --    summary cannot produce (its answer here is ONE row), so this assert
  --    fails against member_contact_card-style aggregation by construction
  perform pg_temp.as_user(viewer::text);
  select count(*), string_agg(i.title, ',' order by i.squad_sort nulls first)
    into n, titles from member_identity(multihat) i;
  reset role;
  if n <> 3 then raise exception 'ASSERT 1 FAILED: multi-hat returned % row(s), wanted 3', n; end if;
  if titles is distinct from 'Assistant Coach,Assistant Coach' then
    raise exception 'ASSERT 1 FAILED: titles came back as %', titles;
  end if;
  insert into _log(line) values ('1 multi-hat: three rows, both Assistant Coach titles intact');

  -- 2: a parent's identity is visible to a fellow member, squad attached
  perform pg_temp.as_user(viewer::text);
  select count(*) into n from member_identity(parent1) i
   where i.role = 'parent' and i.squad = 'U16 ZZ Identprobe';
  reset role;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: parent identity rows = %, wanted 1', n; end if;
  insert into _log(line) values ('2 parent badge: visible to a fellow member, squad named');

  -- 3: another club''s member gets nothing — same-club is the door
  perform pg_temp.as_user(elsewhere::text);
  select count(*) into n from member_identity(multihat);
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: cross-club caller got % row(s)', n; end if;
  insert into _log(line) values ('3 cross-club: zero rows');

  -- 4: no active membership, no identity — for anybody
  perform pg_temp.as_user(nobody::text);
  select count(*) into n from member_identity(multihat);
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: membership-less login got % row(s)', n; end if;
  insert into _log(line) values ('4 no membership: zero rows');

  -- 5: the pending medic row never surfaces
  perform pg_temp.as_user(viewer::text);
  select count(*) into n from member_identity(multihat) i where i.role = 'medic';
  reset role;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: pending membership surfaced'; end if;
  insert into _log(line) values ('5 pending rows: absent');
end $fn$;

select pg_temp.assert_member_identity();
select line from _log order by seq;
rollback;
