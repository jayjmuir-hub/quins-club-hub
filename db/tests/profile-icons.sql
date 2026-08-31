-- Harness for db/migrations/20260831_profile_icons.sql — APPLIED live; this
-- asserts the LIVE table, policies and RPCs. Run: `npm run db:check -- profile-icons`.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. a PARENT's grant attempt is REFUSED (control: the SUPER's lands)
--  2. a squad grant decorates the CURRENT staff via club_icon_map, and
--     stops decorating a coach whose membership is deactivated
--  3. primary resolution: newest is_primary wins over an older grant
--  4. member_icons lists a person's grants with reason and team name
--  5. a row with BOTH targets set is refused by the check constraint
--  6. SELF-TEST: drop the "icons grant" policy and prove check 1 goes red —
--     the refusal is the policy's doing, not a vacuous probe
begin;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000002c0','ZZ Iconprobe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000281','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-icon-super@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000282','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-icon-coach@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000283','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-icon-manager@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000284','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-icon-parent@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000002e0','f0000000-0000-4000-8000-0000000002c0','U11 ZZ Iconprobe', 1031);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000002d1','f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-0000000002e0','Zz Probe Iconchild');

insert into memberships (id, profile_id, club_id, team_id, player_id, role, status, is_super) values
 ('f0000000-0000-4000-8000-0000000002a1','f0000000-0000-4000-8000-000000000281','f0000000-0000-4000-8000-0000000002c0', null, null, 'admin','active', true),
 ('f0000000-0000-4000-8000-0000000002a2','f0000000-0000-4000-8000-000000000282','f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-0000000002e0', null, 'coach','active', false),
 ('f0000000-0000-4000-8000-0000000002a3','f0000000-0000-4000-8000-000000000283','f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-0000000002e0', null, 'manager','active', false),
 ('f0000000-0000-4000-8000-0000000002a4','f0000000-0000-4000-8000-000000000284','f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-0000000002e0','f0000000-0000-4000-8000-0000000002d1','parent','active', false);

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.checks(_tag text, _expect_parent_refused boolean) returns void
language plpgsql as $$
declare
  refused boolean := false;
  n int;
  worn text;
begin
  -- 1: the parent may not grant.
  begin
    perform pg_temp.as_user('f0000000-0000-4000-8000-000000000284');
    insert into profile_icons (club_id, profile_id, icon)
      values ('f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-000000000284','crown');
    reset role;
  exception when others then
    refused := true;
    reset role;
  end;
  if _expect_parent_refused and not refused then
    raise exception 'PROFILE-ICONS(%): a PARENT granted themselves a crown — the super-only boundary is open', _tag;
  end if;
  if not _expect_parent_refused and refused then
    raise exception 'PROFILE-ICONS(%): self-test expected the parent write to LAND (policy dropped) and it was refused', _tag;
  end if;

  -- control for 1: the super's grants land — a squad crown and, later, a star.
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000281');
  insert into profile_icons (club_id, team_id, icon, reason)
    values ('f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-0000000002e0',
            'crown','Best age group users of Club Hub');

  -- 2: the squad grant decorates current staff, not the parent.
  select count(*) into n from public.club_icon_map() cm
   where cm.icon = 'crown' and cm.profile_id in
     ('f0000000-0000-4000-8000-000000000282','f0000000-0000-4000-8000-000000000283');
  if n <> 2 then
    raise exception 'PROFILE-ICONS(%): expected coach+manager crowned via the squad grant, got % of 2', _tag, n;
  end if;
  select count(*) into n from public.club_icon_map() cm
   where cm.profile_id = 'f0000000-0000-4000-8000-000000000284';
  if n <> 0 then
    raise exception 'PROFILE-ICONS(%): the PARENT wears a staff crown', _tag;
  end if;
  reset role;

  -- 2b: deactivate the coach; the crown must follow the job out the door.
  update memberships set status = 'pending'
   where id = 'f0000000-0000-4000-8000-0000000002a2';
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000281');
  select count(*) into n from public.club_icon_map() cm
   where cm.profile_id = 'f0000000-0000-4000-8000-000000000282';
  if n <> 0 then
    raise exception 'PROFILE-ICONS(%): an ex-coach still wears the squad crown', _tag;
  end if;
  reset role;
  update memberships set status = 'active'
   where id = 'f0000000-0000-4000-8000-0000000002a2';

  -- 3: an individual is_primary grant beats the older squad crown.
  perform pg_temp.as_user('f0000000-0000-4000-8000-000000000281');
  insert into profile_icons (club_id, profile_id, icon, is_primary, created_at)
    values ('f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-000000000283','star', true, now() + interval '1 second');
  select cm.icon into worn from public.club_icon_map() cm
   where cm.profile_id = 'f0000000-0000-4000-8000-000000000283';
  if worn <> 'star' then
    raise exception 'PROFILE-ICONS(%): primary resolution failed — manager wears %, expected star', _tag, worn;
  end if;

  -- 4: member_icons lists both of the manager's icons with the trimmings.
  select count(*) into n from public.member_icons('f0000000-0000-4000-8000-000000000283') mi
   where (mi.icon = 'star') or (mi.icon = 'crown' and mi.team_name = 'U11 ZZ Iconprobe'
          and mi.reason = 'Best age group users of Club Hub');
  if n <> 2 then
    raise exception 'PROFILE-ICONS(%): member_icons returned % of the 2 expected rows', _tag, n;
  end if;

  -- 5: both targets set is refused by the table itself.
  begin
    insert into profile_icons (club_id, profile_id, team_id, icon)
      values ('f0000000-0000-4000-8000-0000000002c0','f0000000-0000-4000-8000-000000000283',
              'f0000000-0000-4000-8000-0000000002e0','fire');
    raise exception 'PROFILE-ICONS(%): a BOTH-targets row was accepted', _tag;
  exception when check_violation then null;
  end;
  reset role;

  raise notice 'PROFILE-ICONS(%): all checks passed.', _tag;
end $$;

select pg_temp.checks('clean', true);

-- ── SELF-TEST: open the door and prove check 1 sees it ─────────────────────
drop policy "icons grant" on public.profile_icons;
create policy "icons grant" on public.profile_icons for insert with check (true);
do $$
begin
  perform pg_temp.checks('self-test-must-fail', true);
  raise exception 'PROFILE-ICONS: SELF-TEST DID NOT FIRE — the refusal check is vacuous';
exception when others then
  if sqlerrm like '%SELF-TEST DID NOT FIRE%' then raise; end if;
  raise notice 'SELF-TEST PASSED — the check caught it: %', sqlerrm;
end $$;

rollback;
