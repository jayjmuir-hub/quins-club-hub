-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — a Club Diary entry must not be pushed as a "fixture"
--  Paste into the Supabase SQL editor, or run `npm run db:check -- club-diary-push`.
--  SAFE ON PRODUCTION: the whole thing runs inside a transaction that ROLLS BACK.
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260901_fixture_push_diary_wording.sql.
-- Feature: claude/plans/2026-08-31-club-diary.md
--
-- ⚠️ THE BUG THIS EXISTS FOR SHIPPED ON 31 Aug 2026 AND WAS FOUND BEFORE IT
-- FIRED. Adding an event triggers a squad push whose headline was hard-coded
-- 'New fixture'. A Club Diary entry — a kit collection, a shop opening — is not
-- a fixture, so every parent in the squad would have been told one was added.
-- Neither the spec nor the implementation plan considered the push path at all.
--
-- ⚠️ WHY A PURE HELPER RATHER THAN TESTING send_fixture_push ITSELF. That
-- function ends in net.http_post: calling it from a harness would send a REAL
-- notification to REAL members, and a rollback does not un-send a push. The
-- wording decision is therefore split into private.fixture_push_headline(),
-- which is IMMUTABLE, touches nothing, and can be asserted freely.
--
-- ⚠️ STEP 4 IS THE ONE THAT MATTERS. A correct helper that no trigger calls is
-- the exact failure this refactor invites, and every assertion above it would
-- still pass.

begin;

-- ── STEP 0 — CONTROL: the probe can see a function that certainly exists ────
do $$
begin
  if to_regprocedure('private.send_fixture_push(uuid,uuid,uuid,text,public.events)') is null then
    raise exception
      'CONTROL FAILED: cannot see private.send_fixture_push. The probe is broken, not the helper — every result below is meaningless.';
  end if;
end $$;

-- ── STEP 1 — the helper exists ─────────────────────────────────────────────
do $$
begin
  if to_regprocedure('private.fixture_push_headline(text,boolean)') is null then
    raise exception 'private.fixture_push_headline(text, boolean) is MISSING';
  end if;
end $$;

-- ── STEP 2 — an ordinary fixture keeps EXACTLY its old wording ─────────────
--
-- ⚠️ THIS IS THE REGRESSION HALF AND IT IS NOT OPTIONAL. The whole point is to
-- change what a DIARY entry says while leaving matches, training and socials
-- byte-identical to what parents already recognise in their notification tray.
do $$
declare got text;
begin
  select private.fixture_push_headline('added', false) into got;
  if got <> 'New fixture' then
    raise exception 'ordinary added headline is %, expected "New fixture"', got;
  end if;

  select private.fixture_push_headline('changed', false) into got;
  if got <> 'Fixture changed' then
    raise exception 'ordinary changed headline is %, expected "Fixture changed"', got;
  end if;

  select private.fixture_push_headline('cancelled', false) into got;
  if got <> 'Fixture cancelled' then
    raise exception 'ordinary cancelled headline is %, expected "Fixture cancelled"', got;
  end if;
end $$;

-- ── STEP 3 — a Club Diary entry says diary, and never says "fixture" ───────
do $$
declare got text;
begin
  foreach got in array array['added', 'changed', 'cancelled'] loop
    if private.fixture_push_headline(got, true) ilike '%fixture%' then
      raise exception
        'diary headline for % is "%" — it must not contain the word fixture',
        got, private.fixture_push_headline(got, true);
    end if;
  end loop;

  select private.fixture_push_headline('added', true) into got;
  if got <> 'New in the club diary' then
    raise exception 'diary added headline is %, expected "New in the club diary"', got;
  end if;
end $$;

-- ── STEP 4 — the TRIGGERS actually call it ─────────────────────────────────
--
-- ⚠️ WITHOUT THIS, A PERFECT HELPER THAT NOTHING USES PASSES EVERY ASSERTION
-- ABOVE. That is the specific way this change can be half-applied: the function
-- replaced, the three triggers left calling the literal. Asserting the source
-- is weaker than asserting behaviour, and here it is the only thing standing
-- between a green harness and a silent no-op.
do $$
declare fn text;
begin
  foreach fn in array array['notify_fixture_added', 'notify_fixture_changed', 'notify_fixture_cancelled'] loop
    if pg_get_functiondef(('private.' || fn)::regproc) not like '%fixture_push_headline%' then
      raise exception 'private.% does not call fixture_push_headline — the helper is dead code', fn;
    end if;
    -- And the literal it replaced must be gone, or both paths exist and the
    -- trigger may still be passing the hard-coded string.
    if pg_get_functiondef(('private.' || fn)::regproc) like '%''New fixture''%' then
      raise exception 'private.% still passes the literal ''New fixture''', fn;
    end if;
  end loop;
end $$;

rollback;
