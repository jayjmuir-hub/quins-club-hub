-- Harness for db/migrations/20260826_member_contact_card.sql.
-- Run with `npm run db:check -- person-card`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (begin/commit stripped — the
-- harness owns the transaction; regenerate the inline copy if it changes).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. RULING C: an outsider with NO shared squad gets the coach's phone —
--     the discriminating case; under the old squad-scoped rule this exact
--     row came back null
--  2. a parent gets another parent's CARD but phone AND email are NULL —
--     with the seeing CONTROL that the same call as the squad's coach
--     returns the phone, so the null is the RPC's doing, not the fixture's
--  3. the manage arm: the squad's coach reads their squad parent's phone
--  4. a login with NO active membership gets ZERO rows for anybody
--  5. can_see_staff_photo: outsider→coach true (the new arm),
--     parent→parent false (a parent is not staff)
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000e0','ZZ Cardprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-0000000000e1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-card-coach@example.invalid',      now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000e2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-card-parent-one@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000e3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-card-parent-two@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000e4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-card-outsider@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-0000000000e5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-card-nobody@example.invalid',     now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000e8','f0000000-0000-4000-8000-0000000000e0','U10 ZZ Cardprobe', 1101),
 ('f0000000-0000-4000-8000-0000000000e9','f0000000-0000-4000-8000-0000000000e0','U16 ZZ Cardprobe', 1102);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000ea','f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000e8','Zz Probe Cardchild'),
 ('f0000000-0000-4000-8000-0000000000eb','f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000e8','Zz Probe Cardsibling'),
 ('f0000000-0000-4000-8000-0000000000ec','f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000e9','Zz Probe Cardteen');

-- coach on U10; two parents on U10; the outsider is a parent on U16 only —
-- no squad shared with the coach, which is what assertion 1 needs.
insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000e8', null, 'coach','active'),
 ('f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000e8','f0000000-0000-4000-8000-0000000000ea','parent','active'),
 ('f0000000-0000-4000-8000-0000000000e3','f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000e8','f0000000-0000-4000-8000-0000000000eb','parent','active'),
 ('f0000000-0000-4000-8000-0000000000e4','f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000e9','f0000000-0000-4000-8000-0000000000ec','parent','active');

-- the numbers the assertions look for (profiles rows exist via handle_new_user)
update profiles set phone = '+971500000100' where id = 'f0000000-0000-4000-8000-0000000000e1';
update profiles set phone = '+971500000101' where id = 'f0000000-0000-4000-8000-0000000000e2';

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260826_member_contact_card.sql,
--    verbatim (begin/commit stripped — the harness owns the transaction) ──

create or replace function public.member_contact_card(_profile uuid)
returns table(
  profile_id uuid, full_name text, role text, title text, is_super boolean,
  squads text[], phone text, email text,
  photo_path text, photo_focus_x smallint, photo_focus_y smallint
)
language sql stable security definer
set search_path to 'public'
as $$
  with viewer as (
    select exists (
      select 1 from memberships m
       where m.profile_id = auth.uid() and m.status = 'active'
    ) as is_member
  ),
  -- The target's "best" active membership carries the role line.
  best as (
    select m.role, m.title, m.is_super
      from memberships m
     where m.profile_id = _profile and m.status = 'active'
     order by case when m.is_super then 0
                   when m.role = 'admin' then 1
                   when m.role = 'coach' then 2
                   when m.role = 'manager' then 3
                   when m.role = 'medic' then 4
                   else 5 end
     limit 1
  ),
  entitled as (
    select
      -- Ruling C: any member sees a staff/admin's contacts…
      exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and (m.role in ('coach','manager','medic','admin') or m.is_super)
      )
      -- …and the existing manage scopes see a parent's.
      or private.is_admin_anywhere()
      or exists (
        select 1 from memberships m
         where m.profile_id = _profile and m.status = 'active'
           and m.role = 'parent' and m.team_id is not null
           and private.can_edit_team(m.team_id)
      ) as contacts
  )
  select p.id, p.full_name,
         best.role, best.title, coalesce(best.is_super, false),
         coalesce((select array_agg(t.name order by t.name)
                     from memberships m join teams t on t.id = m.team_id
                    where m.profile_id = _profile and m.status = 'active'
                      and m.team_id is not null), '{}') as squads,
         case when entitled.contacts then p.phone else null end,
         case when entitled.contacts then p.email else null end,
         case when private.can_see_staff_photo(p.id) then p.photo_path else null end,
         p.photo_focus_x, p.photo_focus_y
    from profiles p
   cross join viewer
   cross join entitled
    left join best on true
   where p.id = _profile
     and viewer.is_member;
$$;

revoke all on function public.member_contact_card(uuid) from public;
revoke all on function public.member_contact_card(uuid) from anon;
grant execute on function public.member_contact_card(uuid) to authenticated;

-- The FACE follows the same ruling. can_see_staff_photo mirrored
-- my_squad_staff (squad-scoped) since 13 Aug; without this arm the card
-- names a cross-squad coach but refuses their photograph. The old arms
-- stay: they also cover self and shares_admin_club.
create or replace function private.can_see_staff_photo(_profile uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    _profile = auth.uid()
    or private.shares_admin_club(_profile)
    or exists (
      select 1
      from memberships staff
      join memberships mine
        on mine.team_id = staff.team_id
       and mine.profile_id = auth.uid()
       and mine.status = 'active'
      where staff.profile_id = _profile
        and staff.status = 'active'
        and staff.role in ('coach', 'manager', 'medic')
        and staff.team_id is not null
    )
    -- 26 Aug 2026, ruling C: any active member may see any staff/admin's photo.
    or (
      exists (
        select 1 from memberships mine
         where mine.profile_id = auth.uid() and mine.status = 'active'
      )
      and exists (
        select 1 from memberships staff
         where staff.profile_id = _profile and staff.status = 'active'
           and (staff.role in ('coach','manager','medic','admin') or staff.is_super)
      )
    );
$$;

-- ── end of inlined migration ────────────────────────────────────────────────

create function pg_temp.assert_person_card() returns void language plpgsql as $fn$
declare
  coach     constant uuid := 'f0000000-0000-4000-8000-0000000000e1';
  parent1   constant uuid := 'f0000000-0000-4000-8000-0000000000e2';
  parent2   constant uuid := 'f0000000-0000-4000-8000-0000000000e3';
  outsider  constant uuid := 'f0000000-0000-4000-8000-0000000000e4';
  nobody    constant uuid := 'f0000000-0000-4000-8000-0000000000e5';
  got_phone text; got_email text; n int; ok boolean;
begin
  -- 1: ruling C — the outsider (U16 parent, no squad shared with the U10
  --    coach) reads the coach's phone. The discriminating case: the old
  --    squad-scoped rule returns null here.
  perform pg_temp.as_user(outsider::text);
  select c.phone into got_phone from member_contact_card(coach) c;
  reset role;
  if got_phone is distinct from '+971500000100' then
    raise exception 'ASSERT 1 FAILED: outsider→coach phone = %, wanted the number (ruling C)', got_phone;
  end if;
  insert into _log(line) values ('1 ruling C: cross-squad member reads staff phone');

  -- 2: parent→parent is a card, not a contact list — row present, contacts null
  perform pg_temp.as_user(parent2::text);
  select count(*), max(c.phone), max(c.email) into n, got_phone, got_email
    from member_contact_card(parent1) c;
  reset role;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: parent→parent rows = %, wanted 1', n; end if;
  if got_phone is not null or got_email is not null then
    raise exception 'ASSERT 2 FAILED: parent→parent leaked phone=% email=%', got_phone, got_email;
  end if;
  insert into _log(line) values ('2 parent→parent: card yes, phone and email null');

  -- 3: the CONTROL for 2, and the manage arm — the squad's coach reads the
  --    same parent's phone, so 2's null is the RPC refusing, not a bare fixture
  perform pg_temp.as_user(coach::text);
  select c.phone into got_phone from member_contact_card(parent1) c;
  reset role;
  if got_phone is distinct from '+971500000101' then
    raise exception 'ASSERT 3 FAILED: coach→own-squad-parent phone = %, wanted the number', got_phone;
  end if;
  insert into _log(line) values ('3 manage arm (control for 2): coach reads own-squad parent phone');

  -- 4: no active membership, no card — for anybody
  perform pg_temp.as_user(nobody::text);
  select count(*) into n from member_contact_card(coach);
  reset role;
  if n <> 0 then raise exception 'ASSERT 4 FAILED: membership-less login got % row(s)', n; end if;
  insert into _log(line) values ('4 no membership: zero rows');

  -- 5: the face follows the ruling — outsider may see the coach's photo
  --    (new arm), a parent may NOT see another parent's
  perform pg_temp.as_user(outsider::text);
  select private.can_see_staff_photo(coach) into ok;
  reset role;
  if not ok then raise exception 'ASSERT 5 FAILED: outsider→coach photo refused'; end if;
  perform pg_temp.as_user(parent2::text);
  select private.can_see_staff_photo(parent1) into ok;
  reset role;
  if ok then raise exception 'ASSERT 5 FAILED: parent→parent photo allowed'; end if;
  insert into _log(line) values ('5 photo: staff face club-wide, parent face still private');
end $fn$;

select pg_temp.assert_person_card();
select line from _log order by seq;
rollback;
