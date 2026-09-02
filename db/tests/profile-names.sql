-- ══════════════════════════════════════════════════════════════════════════
--  PROFILE NAMES HARNESS — who may read whose name, and who must not.
--  Run with `npm run db:check -- profile-names`.
--  SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
--  Every row it touches is a fixture it creates itself under f0…/zz- ids.
-- ══════════════════════════════════════════════════════════════════════════
--
-- The rule (db/migrations/20260902_profile_read_named_author.sql): a member
-- may read the name of anyone whose message, notice, poll vote or officer row
-- they can already read — under their OWN policies. Two directions, because
-- they fail differently:
--
--   * a name MISSING — "Someone" beside a coach's post (the bug Jay saw);
--   * a name EXTRA   — a parent resolving an adult from another squad who
--     never wrote to them, which is the directory the Privacy screen promises
--     does not exist.
--
-- Fixture: one club, two squads. A coach and two parents in squad A, a parent
-- coach in squad B, an admin with no squad. The coach posts in squad A's chat.
-- The squad-B coach posts in squad B's chat (a parent may not post there, so
-- the other-squad poster has to be staff). The admin posts a club-wide notice.

begin;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000e5','ZZ Names Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000061','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-names-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000062','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-names-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000063','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-names-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000064','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-names-other@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000065','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-names-admin@example.invalid',   now(),'{}'::jsonb, now(), now());

-- The signup trigger created the profiles; give them names the assertions
-- can look for.
update profiles set full_name = 'Zz Coach Probe'   where id = 'f0000000-0000-4000-8000-000000000061';
update profiles set full_name = 'Zz Parent Probe'  where id = 'f0000000-0000-4000-8000-000000000062';
update profiles set full_name = 'Zz Parent2 Probe' where id = 'f0000000-0000-4000-8000-000000000063';
update profiles set full_name = 'Zz Other Probe'   where id = 'f0000000-0000-4000-8000-000000000064';
update profiles set full_name = 'Zz Admin Probe'   where id = 'f0000000-0000-4000-8000-000000000065';

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000ea','f0000000-0000-4000-8000-0000000000e5','U12 ZZ Names A', 1003),
 ('f0000000-0000-4000-8000-0000000000eb','f0000000-0000-4000-8000-0000000000e5','U14 ZZ Names B', 1004);

-- A family role must name a child (memberships_family_role_needs_player).
insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000ea','Zz Names Child One'),
 ('f0000000-0000-4000-8000-0000000000e2','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000ea','Zz Names Child Two');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000061','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000ea', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000062','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000ea','f0000000-0000-4000-8000-0000000000e1','parent','active'),
 ('f0000000-0000-4000-8000-000000000063','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000ea','f0000000-0000-4000-8000-0000000000e2','parent','active'),
 ('f0000000-0000-4000-8000-000000000064','f0000000-0000-4000-8000-0000000000e5','f0000000-0000-4000-8000-0000000000eb', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000065','f0000000-0000-4000-8000-0000000000e5', null, null, 'admin','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.assert_names() returns void language plpgsql as $fn$
declare
  coach   constant uuid := 'f0000000-0000-4000-8000-000000000061';
  parent  constant uuid := 'f0000000-0000-4000-8000-000000000062';
  parent2 constant uuid := 'f0000000-0000-4000-8000-000000000063';
  other   constant uuid := 'f0000000-0000-4000-8000-000000000064';
  admin   constant uuid := 'f0000000-0000-4000-8000-000000000065';
  squad_a constant uuid := 'f0000000-0000-4000-8000-0000000000ea';
  squad_b constant uuid := 'f0000000-0000-4000-8000-0000000000eb';
  n int;
begin
  -- ── 0. CONTROL: before anybody posts, a parent reads ONLY their own row ──
  -- This is the bug's shape and the directory promise in one number. If it
  -- is not 1 the fixture or the policies are not what this file assumes.
  perform pg_temp.as_user(parent::text);
  select count(*) into n from profiles;
  reset role;
  if n <> 1 then
    raise exception 'PROFILE NAMES 0 (control): a parent with nothing addressed to them reads % profile rows, expected 1 (their own).', n;
  end if;

  -- ── the posts ────────────────────────────────────────────────────────────
  perform pg_temp.as_user(coach::text);
  insert into messages (team_id, channel, body) values (squad_a, 'squad', 'Zz names: kit for Sunday');
  reset role;
  perform pg_temp.as_user(other::text);
  insert into messages (team_id, channel, body) values (squad_b, 'squad', 'Zz names: squad B only');
  reset role;
  perform pg_temp.as_user(admin::text);
  insert into announcements (team_id, title, body) values (null, 'Zz names club wide', 'Everyone.');
  reset role;

  -- ── 1. MISSING: the parent now reads the coach's name ───────────────────
  perform pg_temp.as_user(parent::text);
  select count(*) into n from profiles where id = coach and full_name = 'Zz Coach Probe';
  reset role;
  if n <> 1 then
    raise exception 'PROFILE NAMES 1: a parent cannot read the name of the coach who posted in their squad chat (% rows). That is "Someone" beside every post.', n;
  end if;

  -- ── 2. MISSING: the club-wide notice author ─────────────────────────────
  perform pg_temp.as_user(parent::text);
  select count(*) into n from profiles where id = admin;
  reset role;
  if n <> 1 then
    raise exception 'PROFILE NAMES 2: a parent cannot read the name of the admin whose club-wide notice they can read (% rows).', n;
  end if;

  -- ── 3. EXTRA: an adult in another squad who never wrote to them ─────────
  -- `other` (squad B's coach) posted — but in squad B's chat, which this
  -- parent cannot read.
  -- Invoker semantics are what keep this at zero; a definer function would
  -- make it 1 and turn the policy into a directory of everyone who ever posted.
  perform pg_temp.as_user(parent::text);
  select count(*) into n from profiles where id = other;
  reset role;
  if n <> 0 then
    raise exception 'PROFILE NAMES 3: a parent can read the name of an adult in ANOTHER squad whose posts they cannot read (% rows). The Privacy screen promises names are squad-scoped.', n;
  end if;

  -- ── 4. EXTRA: a squad-mate who has never posted stays unreadable ────────
  -- The rule is "wrote to you", not "is near you". Squad member lists come
  -- through their own RPCs, which this policy neither replaces nor widens.
  perform pg_temp.as_user(parent::text);
  select count(*) into n from profiles where id = parent2;
  reset role;
  if n <> 0 then
    raise exception 'PROFILE NAMES 4: a parent can read a squad-mate who has never posted (% rows); the policy is wider than "whose post you can read".', n;
  end if;

  -- ── 5. The count, whole: own + coach + admin, nothing else ──────────────
  perform pg_temp.as_user(parent::text);
  select count(*) into n from profiles where id in (coach, parent, parent2, other, admin);
  reset role;
  if n <> 3 then
    raise exception 'PROFILE NAMES 5: the parent reads % of the 5 fixture profiles, expected 3 (own, coach, admin).', n;
  end if;

  -- ── 6. The admin is unchanged: reads the whole club as before ───────────
  perform pg_temp.as_user(admin::text);
  select count(*) into n from profiles where id in (coach, parent, parent2, other, admin);
  reset role;
  if n <> 5 then
    raise exception 'PROFILE NAMES 6: the admin reads % of 5 fixture profiles, expected 5 — the club-admin policy has been disturbed.', n;
  end if;

  raise notice 'PROFILE NAMES: all checks passed.';
end
$fn$;

select pg_temp.assert_names();

rollback;
