-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — a `parent` or `player` membership must point at a player, and
--  every STAFF role must still be allowed not to.
--  Run via `npm run db:check`. SAFE ON PRODUCTION: one transaction, rolled
--  back. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay's ruling, 14 Aug 2026: *"nobody outside staff should be able to create an
-- account without a player"*.
--
-- ⚠️ THE HALF THAT IS EASY TO GET WRONG IS THE PERMISSIVE HALF. A constraint
-- reading `player_id is not null` would satisfy every "must refuse" line in
-- this file and break all 11 staff memberships in the club, admins included.
-- Half of what is below exists to prove the rule stays OFF for them.
--
-- ⚠️ AND ONE ROW EXISTED IN PRODUCTION BEFORE THIS. An active `parent` on U18B
-- with no player: she could see all four boys in the squad and could not set her
-- own son's availability, because `private.is_own_player` needs a real
-- `player_id`. She was linked to her son first — evidenced by HIS OWN
-- `player_parents` row naming her, with a matching email and phone, not by a
-- shared surname — and only then was the constraint added.
--
-- ⚠️ WHAT THIS DOES NOT COVER, deliberately: an account with NO membership at
-- all. That is a normal, temporary state — you must sign up before you can
-- register anybody — and there were three of them the day this was written.
-- They are visible in "waiting for access" on the Accounts screen.

begin;

create temporary table _r (seq int, stage text, detail text) on commit drop;
grant select, insert on _r to authenticated;

create temporary table _t on commit drop as
select t.id as team_id, t.club_id
from teams t
where private.squad_expects_gender(t.name) is null
order by t.sort_order
limit 1;
create temporary table _p on commit drop as select id from players limit 1;
grant select on _t, _p to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('fff00000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','harness.cons@example.invalid', now(),
        '{}'::jsonb, now(), now());
insert into profiles (id, full_name, email)
values ('fff00000-0000-4000-8000-0000000000a1','Harness Cons','harness.cons@example.invalid')
on conflict (id) do nothing;

-- ── MUST REFUSE ───────────────────────────────────────────────────────────
do $$ begin
  insert into memberships (profile_id, club_id, team_id, role, status)
  select 'fff00000-0000-4000-8000-0000000000a1', club_id, team_id, 'parent', 'active' from _t;
  insert into _r values (1, 'parent with no player', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (1, 'parent with no player', 'refused ('||sqlstate||')');
end $$;

do $$ begin
  insert into memberships (profile_id, club_id, team_id, role, status)
  select 'fff00000-0000-4000-8000-0000000000a1', club_id, team_id, 'player', 'active' from _t;
  insert into _r values (2, 'player role with no player', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (2, 'player role with no player', 'refused ('||sqlstate||')');
end $$;

-- ⚠️ AN UPDATE MUST BE CAUGHT TOO, not just an insert. Clearing the player on an
-- existing parent row is the same broken state arrived at sideways, and a
-- constraint is the only thing that covers both.
do $$
declare mid uuid;
begin
  insert into memberships (profile_id, club_id, team_id, role, status, player_id)
  select 'fff00000-0000-4000-8000-0000000000a1', club_id, team_id, 'parent', 'active', (select id from _p)
  from _t returning id into mid;
  begin
    update memberships set player_id = null where id = mid;
    insert into _r values (3, 'clearing the player on an existing parent row', 'ALLOWED <<< WRONG');
  exception when others then
    insert into _r values (3, 'clearing the player on an existing parent row', 'refused ('||sqlstate||')');
  end;
  delete from memberships where id = mid;
end $$;

-- ── MUST STILL WORK — the permissive half ────────────────────────────────
do $$ begin
  insert into memberships (profile_id, club_id, team_id, role, status, player_id)
  select 'fff00000-0000-4000-8000-0000000000a1', club_id, team_id, 'parent', 'active', (select id from _p) from _t;
  insert into _r values (4, 'parent WITH a player', 'allowed');
exception when others then
  insert into _r values (4, 'parent WITH a player', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

do $$
declare r text;
begin
  foreach r in array array['coach','manager','medic'] loop
    begin
      insert into memberships (profile_id, club_id, team_id, role, status)
      select 'fff00000-0000-4000-8000-0000000000a1', club_id, team_id, r, 'active' from _t;
      insert into _r values (5, r || ' with no player', 'allowed');
    exception when others then
      insert into _r values (5, r || ' with no player', 'REFUSED <<< WRONG ('||sqlstate||')');
    end;
  end loop;
end $$;

do $$ begin
  insert into memberships (profile_id, club_id, role, status)
  select 'fff00000-0000-4000-8000-0000000000a1', club_id, 'admin', 'active' from _t;
  insert into _r values (6, 'admin with no player and no squad', 'allowed');
exception when others then
  insert into _r values (6, 'admin with no player and no squad', 'REFUSED <<< WRONG ('||sqlstate||')');
end $$;

-- ⚠️ AND THE REAL PATH, END TO END. register_my_player creates the player and
-- the membership in one transaction; if the constraint were written wrongly this
-- is what would break, and it is the one thing every new family uses.
set local role authenticated;
set local request.jwt.claims = '{"sub":"fff00000-0000-4000-8000-0000000000a1","role":"authenticated"}';
do $$ begin
  perform public.register_my_player('Harness Constraintchild', (select team_id from _t), null, false);
  insert into _r values (7, 'register_my_player end to end', 'allowed');
exception when others then
  insert into _r values (7, 'register_my_player end to end', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;
reset role;

select seq, stage, detail from _r order by seq, stage;

-- ══════════════════════════════════════════════════════════════════════════
--  THE ASSERTIONS.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _bad text;
  _d text;
  _staff int;
begin
  if (select count(*) from _r) <> 9 then
    raise exception 'FAIL: expected 9 recorded steps, got %.', (select count(*) from _r);
  end if;

  select string_agg(seq || ': ' || stage || ' -> ' || detail, ' | ') into _bad
    from _r where detail like '%<<< WRONG%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;

  select detail into _d from _r where seq = 1;
  if _d not like 'refused (23514)%' then
    raise exception 'FAIL: a parent with no player was not refused by a CHECK constraint (got %). memberships_family_role_needs_player is missing or has been widened.', _d;
  end if;

  select detail into _d from _r where seq = 3;
  if _d not like 'refused (23514)%' then
    raise exception 'FAIL: the player could be CLEARED on an existing parent row (got %). An insert-only guard leaves the same broken state reachable by UPDATE.', _d;
  end if;

  -- ⚠️ THE PERMISSIVE HALF, AND WITHOUT IT A CONSTRAINT READING SIMPLY
  -- `player_id is not null` PASSES EVERY REFUSAL CHECK ABOVE while breaking
  -- every staff membership in the club.
  select count(*) into _staff from _r where seq in (5, 6) and detail = 'allowed';
  if _staff <> 4 then
    raise exception 'FAIL: only % of the 4 staff roles (coach, manager, medic, admin) could be granted without a player. The rule has been widened past the two family roles.', _staff;
  end if;

  raise notice 'SELF-TEST PASSED — 9 steps: family roles need a player on INSERT and UPDATE, all four staff roles do not, and self-registration still works.';
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — measured live 14 Aug 2026
--    1  parent with no player                         refused (23514)
--    2  player role with no player                    refused (23514)
--    3  clearing the player on an existing parent row refused (23514)
--    4  parent WITH a player                          allowed
--    5  coach / manager / medic with no player         allowed  (three rows)
--    6  admin with no player and no squad             allowed
--    7  register_my_player end to end                 allowed
-- ══════════════════════════════════════════════════════════════════════════
