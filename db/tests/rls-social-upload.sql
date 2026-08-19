-- ══════════════════════════════════════════════════════════════════════════
--  RLS HARNESS — social-ideas storage: who may put an image into club storage
--  Paste into the Supabase SQL editor. SAFE ON PRODUCTION: the whole thing
--  runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ THE ONE THAT MATTERS: A SIGNED-IN STRANGER WITH NO MEMBERSHIPS MUST NOT
-- BE ABLE TO UPLOAD. Before 13 Aug 2026 they could, and the reason is worth
-- carrying because it is the shape of the mistake rather than the mistake:
--
--     the ROW policy ("social idea create") checked membership.
--     the IMAGE policy ("social idea image write") did not.
--
-- Two halves of one feature, written in one migration, and only one of them
-- was gated. A stranger could not submit an IDEA and could fill the bucket
-- with IMAGES — which is the half that costs storage and holds the content.
-- ⚠️ **An orphaned object appears on NO screen**, including the Social Media
-- Management inbox that exists to review exactly this, because that screen
-- lists ROWS.
--
-- ⚠️ THE SECOND ASSERTION IS THE ONE A FUTURE "TIDY-UP" WILL BREAK: an ACTIVE
-- member must still be able to upload under their own prefix, and must still
-- be refused under somebody else's. It is easy to fix the hole by making the
-- policy stricter than intended and not notice, because nobody uses this
-- feature yet.
--
-- ⚠️ CLUB-BLIND ON PURPOSE. An object key carries no club id, so this checks
-- "actively a member of SOMETHING" rather than "a member of THIS club" — the
-- same documented single-club assumption as private.is_admin_anywhere(). If a
-- second club ever appears, this harness is one of the places that must change.
--
-- ⚠️ AS `postgres` RLS IS BYPASSED ENTIRELY. A run that forgets
-- `set local role authenticated` passes while proving nothing.
--
-- ⚠️ AND READ THE FAULT-INJECTION SECTION AT THE BOTTOM BEFORE TRUSTING A
-- GREEN RUN. CLAUDE.md rule 6: a check that has never failed is not a check.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated;

-- A: an ACTIVE member. B: a signed-in account with NO memberships at all —
-- the exact shape of somebody who registered and has been approved by nobody,
-- which today is a stranger with an email address.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                        raw_user_meta_data, created_at, updated_at)
values ('50c1a100-0000-4000-8000-00000000a001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','member@example.invalid', now(), '{}'::jsonb, now(), now()),
       ('50c1a100-0000-4000-8000-00000000b002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stranger@example.invalid', now(), '{}'::jsonb, now(), now());

insert into profiles (id, full_name, email) values
 ('50c1a100-0000-4000-8000-00000000a001','Active Member','member@example.invalid'),
 ('50c1a100-0000-4000-8000-00000000b002','No Memberships','stranger@example.invalid')
on conflict (id) do nothing;

-- ⚠️ A DISPOSABLE CHILD FIRST. `memberships_family_role_needs_player`
-- (20260817) forbids a 'parent' row with no player_id, and this fixture
-- predates it — so the INSERT below threw and the harness asserted nothing
-- from the day that constraint shipped. Nothing noticed, because the nightly
-- db-check was inert without a SUPABASE_DB_URL secret and passed while
-- reporting "did not run".
--
-- ⚠️ THE ROLE MATTERS AND MUST STAY 'parent'. What is under test is an
-- ordinary FAMILY member's access to the social-ideas bucket. Switching to
-- 'coach' to dodge the constraint would satisfy it and quietly test a
-- different, more privileged person.
insert into players (id, club_id, team_id, full_name)
select '50c1a100-0000-4000-8000-0000000000c1', club_id, id, 'ZZ Probe Child'
from teams order by sort_order limit 1;

-- Only A gets a membership. B deliberately gets none.
insert into memberships (profile_id, club_id, team_id, player_id, role, status)
select '50c1a100-0000-4000-8000-00000000a001', club_id, id,
       '50c1a100-0000-4000-8000-0000000000c1', 'parent','active'
from teams order by sort_order limit 1;

-- ── 1. The stranger must be REFUSED, even under their own prefix ──────────
--
-- ⚠️ THE KEY IS CORRECT FOR THEM. social_idea_owner(name) = auth.uid() passes.
-- The ONLY thing that may refuse this is the membership arm, which is what
-- makes this a discriminating test rather than a test of the prefix rule.
set local role authenticated;
set local request.jwt.claims = '{"sub":"50c1a100-0000-4000-8000-00000000b002","role":"authenticated"}';

do $$
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('social-ideas', '50c1a100-0000-4000-8000-00000000b002/probe.jpg',
          '50c1a100-0000-4000-8000-00000000b002');
  insert into _r values ('stranger uploads under own prefix', 'ALLOWED — ❌ FAIL');
exception when insufficient_privilege or others then
  insert into _r values ('stranger uploads under own prefix', 'REFUSED — ✅ pass');
end $$;

-- ── 2. An ACTIVE member must still be ALLOWED under their own prefix ──────
--
-- Without this the harness would pass against a policy that refuses everyone,
-- which is a fix that reads as green and deletes the feature.
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"50c1a100-0000-4000-8000-00000000a001","role":"authenticated"}';

do $$
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('social-ideas', '50c1a100-0000-4000-8000-00000000a001/photo.jpg',
          '50c1a100-0000-4000-8000-00000000a001');
  insert into _r values ('member uploads under own prefix', 'ALLOWED — ✅ pass');
exception when others then
  insert into _r values ('member uploads under own prefix', 'REFUSED — ❌ FAIL');
end $$;

-- ── 3. An ACTIVE member must be REFUSED under somebody else's prefix ──────
--
-- The prefix rule predates this migration and must survive it.
do $$
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('social-ideas', '50c1a100-0000-4000-8000-00000000b002/stolen.jpg',
          '50c1a100-0000-4000-8000-00000000a001');
  insert into _r values ('member uploads under ANOTHER prefix', 'ALLOWED — ❌ FAIL');
exception when others then
  insert into _r values ('member uploads under ANOTHER prefix', 'REFUSED — ✅ pass');
end $$;

-- ── 4. CONTROL — player-photos must be UNAFFECTED by this migration ───────
--
-- ⚠️ THIS IS NOT PADDING. The obvious wrong fix is to add the membership arm
-- to every storage policy "for consistency". player-photos already gates on
-- can_edit_team / is_own_player, both of which require a membership, and a
-- parent uploading their own child's photo must keep working. If this line
-- ever goes red, the fix reached into the wrong bucket.
do $$
begin
  perform 1 from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'objects' and p.polname = 'player photo write';
  if found then
    insert into _r values ('player photo write still present', 'YES — ✅ pass');
  else
    insert into _r values ('player photo write still present', 'MISSING — ❌ FAIL');
  end if;
end $$;

reset role;
select * from _r order by step;


-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ THE ASSERTION. The SELECT above is for a human to read; THIS is the
--  thing that fails.
--
--  Added 13 Aug 2026. `npm run db:check` throws on a SQL ERROR and on nothing
--  else, and it discarded every result set — so this harness reported `ok`
--  whatever the PASS/FAIL column said. The verdict was computed, written down,
--  and never compared to anything. NINE of the fifteen harnesses were in that
--  state, hours after the runner was written to fix "a check nobody RUNS is not
--  a check". A check that runs and cannot fail is not a check either.
--
--  The empty-table arm matters as much as the FAIL arm: a harness that recorded
--  no steps at all has proved nothing, and would otherwise pass silently.
-- ══════════════════════════════════════════════════════════════════════════
do $$
declare
  _bad text;
  _n int;
begin
  select count(*) into _n from _r;
  if _n = 0 then
    raise exception 'FAIL: this harness recorded NO steps — nothing it claims to test was actually exercised.';
  end if;

  select string_agg(step || ' -> ' || outcome, ' | ') into _bad
    from _r where outcome like '%FAIL%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;

  raise notice 'SELF-TEST PASSED — % step(s), none reported FAIL.', _n;
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  ⚠️ PROVE THE HARNESS CAN FAIL — do this once, and record that you did
-- ══════════════════════════════════════════════════════════════════════════
--
-- CLAUDE.md rule 6, and its corollary from the overflow gate: an injection
-- that fails to go red is data about the CHECK, not a clean bill of health.
--
-- INJECTION. Inside a transaction you will roll back, restore the OLD policy
-- and re-run steps 1-3:
--
--     begin;
--     drop policy "social idea image write" on storage.objects;
--     create policy "social idea image write" on storage.objects
--       for insert to authenticated
--       with check (bucket_id = 'social-ideas'
--                   and private.social_idea_owner(name) = auth.uid());
--     -- ... re-run steps 1-3 here ...
--     rollback;
--
-- EXPECTED: step 1 flips to "ALLOWED — ❌ FAIL" and steps 2 and 3 stay green.
--
-- ⚠️ IF STEP 1 STAYS GREEN, THE HARNESS IS NOT TESTING WHAT IT CLAIMS — most
-- likely `set local role authenticated` was lost by a `reset role` earlier in
-- your paste, so everything ran as `postgres` with RLS bypassed. Fix the
-- harness before believing the policy.
--
-- ⚠️ IF STEPS 2 OR 3 ALSO FLIP, something other than the membership arm is
-- doing the work and the finding was mis-diagnosed. Stop and re-read the live
-- policy with:
--
--     select polname, pg_get_expr(polwithcheck, polrelid)
--       from pg_policy p join pg_class c on c.oid = p.polrelid
--      where c.relname = 'objects' and polname like 'social%';
