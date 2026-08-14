-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — register_my_player refuses a child who is already on the roster,
--  and refuses a parent registering THEMSELVES as a player.
--  Run via `npm run db:check`. SAFE ON PRODUCTION: one transaction, rolled
--  back. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT GUARDS, AND BOTH CAME FROM REAL ROWS ON THE LIVE ROSTER (14 Aug 2026).
-- ⚠️ THE NAMES BELOW ARE INVENTED — spellings chosen to reproduce the real
-- cases exactly, which is all a worked example needs.
--
--   42710 — U18B Contact held ONE child TWICE. `Sara Ahmed` was created by a
--           parent's account and `sara noor ahmed` by the player's own, a
--           middle name apart. Neither account could see the other's row, so
--           neither had any way to notice.
--
--   42809 — U14B Contact held a PARENT as a player. The account
--           `Pieter Vos-Meijer` registered `PIETER VOS` (themselves) beside
--           `Lars Vos-Meijer` (their child), because the name box took the
--           adult's name while "Who are you registering?" stayed on its
--           default, "My child".
--
-- ⚠️ THE CHECK CANNOT LIVE IN THE CLIENT AND THAT IS THE WHOLE REASON THIS
-- HARNESS EXISTS. A registering parent holds a PENDING membership, so
-- `player read` (private.can_see_team) returns nothing and a client-side
-- "is this already here?" answers no every time. The rule only works inside
-- the SECURITY DEFINER function — which means SQL is the only place it can be
-- tested, and vitest cannot reach it.
--
-- ⚠️ EVERY "must work" ROW BELOW IS AS IMPORTANT AS EVERY "must refuse" ONE.
-- A guard that refuses everything would satisfy half this file, and would stop
-- the club onboarding anybody.

begin;

create temporary table _r (seq int, stage text, detail text) on commit drop;
grant select, insert on _r to authenticated;

-- ⚠️ A MIXED squad, chosen deliberately. On a single-gender squad the gender
-- guard (22004) fires BEFORE these two and every row comes back "refused" for
-- the wrong reason — which is exactly what happened on the first run of this
-- test and read as a clean pass.
create temporary table _team on commit drop as
select t.id, t.name
from teams t
where private.squad_expects_gender(t.name) is null
  and coalesce(t.self_registration_allowed, false)
order by t.sort_order
limit 1;
grant select on _team to authenticated;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('eee00000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','harness.registrant@example.invalid', now(),
        '{}'::jsonb, now(), now());

-- ⚠️ THE PROFILE CARRIES A NAME BEFORE THE FIRST CALL, which is what makes the
-- self-name guard reachable on a FIRST registration. PlayerRegistrationForm
-- writes it first for exactly that reason (13 Aug 2026, closing the race where
-- an approval queue row existed before the person had a name).
insert into profiles (id, full_name, first_name, last_name, email)
values ('eee00000-0000-4000-8000-0000000000a1','Harness Registrant','Harness','Registrant',
        'harness.registrant@example.invalid')
on conflict (id) do update
  set full_name = excluded.full_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name;

set local role authenticated;
set local request.jwt.claims = '{"sub":"eee00000-0000-4000-8000-0000000000a1","role":"authenticated"}';

-- ── 1. A genuinely new child. MUST work — this is the common case. ────────
do $$ begin
  perform public.register_my_player('Wilberforce Ttestington', (select id from _team), null, false);
  insert into _r values (1, 'a genuinely new child', 'allowed');
exception when others then
  insert into _r values (1, 'a genuinely new child', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 2. The SAME child again. The U18 case. ────────────────────────────────
do $$ begin
  perform public.register_my_player('Wilberforce Ttestington', (select id from _team), null, false);
  insert into _r values (2, 'the same child a second time', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (2, 'the same child a second time', 'refused ('||sqlstate||')');
end $$;

-- ── 3. The same child with a MIDDLE NAME — the real spelling variant's shape. ─
-- 'Sara Ahmed' vs 'sara noor ahmed'. First and last token match; everything
-- between is ignored, and so is case.
do $$ begin
  perform public.register_my_player('wilberforce quentin ttestington', (select id from _team), null, false);
  insert into _r values (3, 'same child, middle name and different case', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (3, 'same child, middle name and different case', 'refused ('||sqlstate||')');
end $$;

-- ── 4. A DIFFERENT child. MUST work. ──────────────────────────────────────
-- ⚠️ THE CONTROL FOR GUARD 1. Without it, rows 2 and 3 are equally explained
-- by "nothing can be registered at all".
do $$ begin
  perform public.register_my_player('Perpetua Ttestington', (select id from _team), null, false);
  insert into _r values (4, 'a sibling — different first name', 'allowed');
exception when others then
  insert into _r values (4, 'a sibling — different first name', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 5. The registrant's OWN name, filed as a child. The U14 case. ─────────
do $$ begin
  perform public.register_my_player('Harness Registrant', (select id from _team), null, false);
  insert into _r values (5, 'own name, declared as a child', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (5, 'own name, declared as a child', 'refused ('||sqlstate||')');
end $$;

-- ── 6. The registrant's own name, declared as THEMSELVES. MUST work. ──────
-- ⚠️ THE CONTROL FOR GUARD 2, and the feature it must not break: a U13+ player
-- registering themselves is SUPPOSED to type their own name. The signal guard 2
-- keys on is the contradiction, never the name alone.
do $$ begin
  perform public.register_my_player('Harness Registrant', (select id from _team), null, true);
  insert into _r values (6, 'own name, declared as SELF', 'allowed');
exception when others then
  insert into _r values (6, 'own name, declared as SELF', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 7. A duplicate, explicitly confirmed. MUST work. ──────────────────────
-- Two boys with the same name in one squad is rare and real, and a hard stop
-- with no override would leave that family ringing the club.
do $$ begin
  perform public.register_my_player('Perpetua Ttestington', (select id from _team), null, false, true, false);
  insert into _r values (7, 'duplicate WITH the duplicate tick', 'allowed');
exception when others then
  insert into _r values (7, 'duplicate WITH the duplicate tick', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 8. ⚠️ THE TICKS DO NOT LEAK INTO EACH OTHER. ─────────────────────────
-- Confirming the DUPLICATE must NOT also forgive the self-name mistake. This
-- is the entire reason there are two booleans rather than one, and it is the
-- assertion that would catch somebody "simplifying" them back into one.
do $$ begin
  perform public.register_my_player('Harness Registrant', (select id from _team), null, false, true, false);
  insert into _r values (8, 'own name as a child, with only the DUPLICATE tick', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (8, 'own name as a child, with only the DUPLICATE tick', 'refused ('||sqlstate||')');
end $$;

reset role;
select seq, stage, detail from _r order by seq;

-- ══════════════════════════════════════════════════════════════════════════
--  THE ASSERTIONS. The SELECT above is for a human; this is what fails.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _d text;
  _bad text;
begin
  if (select count(*) from _r) <> 8 then
    raise exception 'FAIL: expected 8 recorded steps, got %.', (select count(*) from _r);
  end if;

  select string_agg(seq || ': ' || stage || ' -> ' || detail, ' | ') into _bad
    from _r where detail like '%<<< WRONG%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;

  select detail into _d from _r where seq = 2;
  if _d not like 'refused (42710)%' then
    raise exception 'FAIL: registering the same child twice was not refused with 42710 (got %). This is the U18 case that put one boy on the roster twice.', _d;
  end if;

  select detail into _d from _r where seq = 3;
  if _d not like 'refused (42710)%' then
    raise exception 'FAIL: a middle name defeated the duplicate check (got %). private.name_match_key should compare FIRST and LAST token only — this is the exact real spelling variant.', _d;
  end if;

  select detail into _d from _r where seq = 5;
  if _d not like 'refused (42809)%' then
    raise exception 'FAIL: the registrant registered their OWN name as a child and was not refused with 42809 (got %). This is the U14 case that put a parent on the roster.', _d;
  end if;

  select detail into _d from _r where seq = 8;
  if _d not like 'refused (42809)%' then
    raise exception 'FAIL: the DUPLICATE tick forgave the SELF-NAME mistake (got %). The two confirmations have been collapsed into one, and a parent confirming "a different child with the same name" now silently also confirms "I am registering myself as my own child".', _d;
  end if;

  raise notice 'SELF-TEST PASSED — 8 steps: 4 refusals with the right codes, 4 legitimate registrations still allowed, and the two ticks independent.';
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — measured live 14 Aug 2026
--    1  a genuinely new child                               allowed
--    2  the same child a second time                        refused (42710)
--    3  same child, middle name and different case          refused (42710)
--    4  a sibling — different first name                    allowed
--    5  own name, declared as a child                       refused (42809)
--    6  own name, declared as SELF                          allowed
--    7  duplicate WITH the duplicate tick                   allowed
--    8  own name as a child, with only the DUPLICATE tick   refused (42809)
-- ══════════════════════════════════════════════════════════════════════════
