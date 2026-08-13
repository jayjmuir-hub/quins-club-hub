-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — gender required on a single-gender squad
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: everything runs
--  inside a transaction that ROLLS BACK. No user, player or membership
--  survives it, and it can be re-run as often as you like.
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT IT PINS (Jay's ruling, 9 Aug 2026) — two rules pointing DIFFERENT ways:
--
--   BLANK gender on a single-gender squad -> REFUSED  (errcode 22004)
--   gender that CONTRADICTS the squad     -> ALLOWED, warned about in the UI
--
-- The second is the one someone will eventually "fix". It is not a bug: the
-- club has had four women recorded in "Senior Men 2nd XV", and refusing that
-- combination would make such a player unrecordable by anybody — including
-- whoever was trying to correct them.
--
-- ⚠️ AS `postgres` (the owner) RLS IS BYPASSED AND auth.uid() IS NULL. The
-- impersonation below is not decoration: without it register_my_player raises
-- 'You must be signed in.' and every case "passes" for the wrong reason.
--
-- ⚠️ THE NAME RULE IS WRITTEN TWICE — private.squad_expects_gender here and
-- squadExpects() in src/lib/gender.js. This file pins the SQL half against the
-- real squad list; tests/gender.test.js pins the JS half against the same
-- list. If the two ever disagree, a twelve-year-old's squad gets classified
-- one way by the form and another by the database.

begin;

-- ── Part 1: the name rule, against every live squad ────────────────────
-- Reads the real teams table rather than a literal list, so a squad renamed
-- in the database shows up here rather than being quietly missed.
select t.name,
       private.squad_expects_gender(t.name) as expects,
       case t.name
         when 'U6 Tag'            then private.squad_expects_gender(t.name) is null
         when 'U7 Tag'            then private.squad_expects_gender(t.name) is null
         when 'U8 Tag'            then private.squad_expects_gender(t.name) is null
         when 'U9 Mixed Contact'  then private.squad_expects_gender(t.name) is null
         when 'U10 Mixed Contact' then private.squad_expects_gender(t.name) is null
         when 'U11 Mixed Contact' then private.squad_expects_gender(t.name) is null
         when 'U12 Mixed Contact' then private.squad_expects_gender(t.name) is null
         when 'U12G QR'           then private.squad_expects_gender(t.name) = 'female'
         when 'U13 Mixed Contact' then private.squad_expects_gender(t.name) is null
         when 'U14B Contact'      then private.squad_expects_gender(t.name) = 'male'
         when 'U14G QR'           then private.squad_expects_gender(t.name) = 'female'
         when 'U16B Contact'      then private.squad_expects_gender(t.name) = 'male'
         when 'U16G Contact'      then private.squad_expects_gender(t.name) = 'female'
         when 'U18B Contact'      then private.squad_expects_gender(t.name) = 'male'
         when 'U18G Contact'      then private.squad_expects_gender(t.name) = 'female'
         when 'Senior Men 1st XV' then private.squad_expects_gender(t.name) = 'male'
         when 'Senior Men 2nd XV' then private.squad_expects_gender(t.name) = 'male'
         when 'Women''s XV'       then private.squad_expects_gender(t.name) = 'female'
         else null  -- a squad this file has never heard of: NULL, not false
       end as pass
from public.teams t order by t.sort_order;

-- ⚠️ "U6 Tag" ENDS IN A G. If the suffix pattern ever stops requiring the
-- letter to TOUCH the digits, every Tag squad in the club becomes girls-only
-- and this is the row that says so.

-- ── Part 2: the function, as a real signed-in caller ───────────────────
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('00000000-9999-8888-7777-666666666666',
        '00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','gender-probe@example.invalid', now(),
        '{"full_name":"Gender Probe"}'::jsonb, now(), now());

select set_config('request.jwt.claims',
       '{"sub":"00000000-9999-8888-7777-666666666666","role":"authenticated"}', true);
set local role authenticated;

create temp table probe (case_name text, expected text, result text);
grant insert on probe to authenticated;

do $$
declare
  tid uuid;
begin
  select id into tid from public.teams where name = 'U16G Contact';
  begin
    perform public.register_my_player('Probe A', tid);
    insert into probe values ('single-gender squad, blank gender', 'refused', 'ALLOWED  <<< WRONG');
  exception when others then
    insert into probe values ('single-gender squad, blank gender', 'refused',
                              'refused (' || SQLSTATE || '): ' || SQLERRM);
  end;

  begin
    perform public.register_my_player('Probe B', tid, 'female');
    insert into probe values ('single-gender squad, matching gender', 'allowed', 'allowed');
  exception when others then
    insert into probe values ('single-gender squad, matching gender', 'allowed',
                              'REFUSED <<< WRONG: ' || SQLERRM);
  end;

  -- ⚠️ MUST BE ALLOWED. See the header.
  begin
    perform public.register_my_player('Probe C', tid, 'male');
    insert into probe values ('single-gender squad, CONTRADICTORY gender', 'allowed', 'allowed');
  exception when others then
    insert into probe values ('single-gender squad, CONTRADICTORY gender', 'allowed',
                              'REFUSED <<< WRONG: ' || SQLERRM);
  end;

  select id into tid from public.teams where name = 'U13 Mixed Contact';
  begin
    perform public.register_my_player('Probe D', tid);
    insert into probe values ('mixed squad, blank gender', 'allowed', 'allowed');
  exception when others then
    insert into probe values ('mixed squad, blank gender', 'allowed',
                              'REFUSED <<< WRONG: ' || SQLERRM);
  end;

  select id into tid from public.teams where name = 'U6 Tag';
  begin
    perform public.register_my_player('Probe E', tid);
    insert into probe values ('Tag squad (name ends in G), blank gender', 'allowed', 'allowed');
  exception when others then
    insert into probe values ('Tag squad (name ends in G), blank gender', 'allowed',
                              'REFUSED <<< WRONG: ' || SQLERRM);
  end;

  begin
    perform public.register_my_player('Probe F', tid, 'banana');
    insert into probe values ('unrecognised gender value', 'refused', 'ALLOWED <<< WRONG');
  exception when others then
    insert into probe values ('unrecognised gender value', 'refused',
                              'refused (' || SQLSTATE || '): ' || SQLERRM);
  end;
end $$;

reset role;
select * from probe;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. `select * from probe` was the whole verdict, and
--  `npm run db:check` discards result sets — so this file reported `ok` with
--  "<<< WRONG" sitting in the output. Added 13 Aug 2026; nine harnesses were
--  in that state. See scripts/db-check.mjs.
--
--  ⚠️ THE `<<< WRONG` MARKER IS BIDIRECTIONAL, which is what makes the first
--  check sufficient on its own: a case that should be refused writes
--  "ALLOWED  <<< WRONG" and a case that should be allowed writes
--  "REFUSED <<< WRONG". So a build that refused EVERYTHING fails just as
--  loudly as one that allowed everything — the non-vacuity arm is already
--  built into the fixture.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _bad text;
  _n int;
begin
  select count(*) into _n from probe;
  if _n = 0 then
    raise exception 'FAIL: the probe is empty — nothing this harness claims to test was exercised.';
  end if;

  select string_agg(case_name || ' (expected ' || expected || ') -> ' || result, ' | ') into _bad
    from probe where result like '%<<< WRONG%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;

  -- ⚠️ THE SQLSTATE IS ASSERTED, NOT JUST THE REFUSAL, AND THIS FILE'S FOOTER
  -- SAYS WHY: "22004 vs 22023 is not cosmetic. src/data/members.js maps 22023
  -- to one generic sentence covering three other guards; 22004 has NO entry, so
  -- its server message — which names the squad — reaches the parent intact."
  -- A refusal with the wrong code is still a refusal, and the parent silently
  -- starts seeing the wrong sentence. Nothing else in the repo would catch it.
  select string_agg(case_name || ' -> ' || result, ' | ') into _bad
    from probe
   where (case_name = 'single-gender squad, blank gender' and result not like 'refused (22004)%')
      or (case_name = 'unrecognised gender value'         and result not like 'refused (22023)%');
  if _bad is not null then
    raise exception 'FAIL: refused with the wrong SQLSTATE, so the parent will see the wrong message: %', _bad;
  end if;

  raise notice 'SELF-TEST PASSED — % cases, none marked WRONG, both SQLSTATEs correct.', _n;
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — verified against production 9 Aug 2026
--
--   single-gender squad, blank gender          refused (22004)
--   single-gender squad, matching gender       allowed
--   single-gender squad, CONTRADICTORY gender  allowed   <- deliberate
--   mixed squad, blank gender                  allowed
--   Tag squad (name ends in G), blank gender    allowed
--   unrecognised gender value                  refused (22023)
--
--  ⚠️ 22004 vs 22023 is not cosmetic. src/data/members.js maps 22023 to one
--  generic sentence covering three other guards; 22004 has NO entry, so its
--  server message — which names the squad — reaches the parent intact. Change
--  the code here and the parent starts seeing the wrong sentence.
-- ══════════════════════════════════════════════════════════════════════════
--
--  FAULT INJECTION — run this too. A green test that cannot go red is
--  decoration. DDL is transactional, so the broken function lives only inside
--  the transaction and production is never exposed.
--
--    begin;
--    create or replace function private.squad_expects_gender(_name text)
--     returns text language sql immutable
--    as $f$ select null::text $f$;
--    -- ...then Part 2 above...
--    -- EXPECTED: "single-gender squad, blank gender" becomes ALLOWED. If it
--    -- still says refused, the harness is not testing what it claims.
--    rollback;
