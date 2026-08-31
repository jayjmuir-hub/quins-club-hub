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

-- ══════════════════════════════════════════════════════════════════════════
--  PHASE 2 — the WHEN line must not invent a time for an all-day event
-- ══════════════════════════════════════════════════════════════════════════
--
-- Covers db/migrations/20260901_fixture_push_all_day_when.sql.
--
-- ⚠️ THE BUG THIS PREVENTS WAS FOUND BEFORE IT WAS WRITTEN, by asking what the
-- WRITE path does with a new column rather than only where it is displayed.
-- send_fixture_push built its when-line as 'Dy DD Mon' plus, unconditionally
-- unless time_tbd, ', HH24:MI'. An all-day event is stored at club-midnight, so
-- it would have announced "Thu 17 Sep, 00:00" — an invented time, which is
-- precisely what the time_tbd branch exists to avoid.

-- ── STEP 5 — the when-line helper exists ──────────────────────────────────
do $$
begin
  if to_regprocedure('private.fixture_push_when(public.events)') is null then
    raise exception 'private.fixture_push_when(public.events) is MISSING';
  end if;
end $$;

-- ── STEP 6 — the three time states each read correctly ────────────────────
do $$
declare e public.events; got text;
begin
  -- A timed event: unchanged wording. THE REGRESSION HALF.
  e := null::public.events;
  e.starts_at := timestamptz '2026-09-17 13:00:00+00';  -- 17:00 Asia/Dubai
  e.time_tbd  := false;
  e.all_day   := false;
  got := private.fixture_push_when(e);
  if got <> 'Thu 17 Sep, 17:00' then
    raise exception 'timed when-line is "%", expected "Thu 17 Sep, 17:00"', got;
  end if;

  -- Time TBD: says so, rather than printing a placeholder.
  e.time_tbd := true;
  got := private.fixture_push_when(e);
  if got <> 'Thu 17 Sep, time TBC' then
    raise exception 'time_tbd when-line is "%", expected "Thu 17 Sep, time TBC"', got;
  end if;

  -- All day, one day: a date and NOTHING else.
  e.time_tbd := false;
  e.all_day  := true;
  e.starts_at := timestamptz '2026-09-16 20:00:00+00';  -- 00:00 17 Sep Asia/Dubai
  got := private.fixture_push_when(e);
  if got <> 'Thu 17 Sep' then
    raise exception 'all-day when-line is "%", expected "Thu 17 Sep"', got;
  end if;
  -- ⚠️ THE ASSERTION THAT MATTERS, stated separately from the equality above so
  -- that a change of format cannot quietly reintroduce the bug.
  if got like '%00:00%' or got like '%:%' then
    raise exception 'the all-day when-line contains a clock time: "%"', got;
  end if;
end $$;

-- ── STEP 7 — a multi-day all-day event names BOTH days ────────────────────
--
-- ⚠️ A TWO-DAY COLLECTION ANNOUNCED AS ONE DAY IS ITS OWN SMALL LIE, and the
-- second day is exactly the one a parent would otherwise miss.
do $$
declare e public.events; got text;
begin
  e := null::public.events;
  e.all_day   := true;
  e.time_tbd  := false;
  e.starts_at := timestamptz '2026-09-16 20:00:00+00';  -- 00:00 17 Sep
  e.ends_at   := timestamptz '2026-09-17 20:00:00+00';  -- 00:00 18 Sep
  got := private.fixture_push_when(e);
  if got <> 'Thu 17 Sep – Fri 18 Sep' then
    raise exception 'multi-day when-line is "%", expected "Thu 17 Sep – Fri 18 Sep"', got;
  end if;
end $$;

-- ── STEP 8 — send_fixture_push actually CALLS it ──────────────────────────
--
-- ⚠️ SAME REASONING AS STEP 4. A correct helper that nothing calls passes every
-- assertion above while production still prints 00:00.
do $$
begin
  if pg_get_functiondef('private.send_fixture_push(uuid,uuid,uuid,text,public.events)'::regprocedure)
     not like '%fixture_push_when%' then
    raise exception 'send_fixture_push does not call fixture_push_when — the helper is dead code';
  end if;
  -- And the inline construction it replaced must be gone.
  if pg_get_functiondef('private.send_fixture_push(uuid,uuid,uuid,text,public.events)'::regprocedure)
     like '%time TBC%' then
    raise exception 'send_fixture_push still builds the when-line inline';
  end if;
end $$;

-- ── STEP 9 — the helper is PINNED ─────────────────────────────────────────
--
-- ⚠️ ASSERTED HERE RATHER THAN LEFT TO db/tests/search-path.sql, because the
-- last function this session added shipped unpinned and turned that harness RED
-- against production. Failing in the file that introduces the function points
-- at the cause; failing in search-path.sql points at a symptom.
do $$
declare cfg text[];
begin
  select proconfig into cfg from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'fixture_push_when';
  if cfg is null or not exists (select 1 from unnest(cfg) c where c like 'search_path=%') then
    raise exception 'private.fixture_push_when has a mutable search_path: %', cfg;
  end if;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
--  PHASE 2 — the AVAILABILITY NUDGE builds the same line, and must not diverge
-- ══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A SECOND SURFACE, FOUND BY READING THE SCHEMA CAPTURE RATHER THAN BY
-- LOOKING FOR IT. private.send_availability_nudges built the when-line with its
-- own inline copy of the same expression, so fixing send_fixture_push alone
-- would have left "Thu 17 Sep, 00:00" reachable from the nudge.
--
-- ⚠️ THE NUDGE IS MATCH-ONLY (`where e.type = 'match'`), so a Club Diary entry
-- can NEVER be nudged — measured, not assumed, and it means phase 1 did not
-- ship a bug here. But `all_day` is offered on every kind including matches, so
-- an all-day fixture is reachable and would have printed a midnight.

-- ── STEP 10 — the scalar overload exists and is pinned ────────────────────
do $$
declare cfg text[];
begin
  if to_regprocedure('private.fixture_push_when(timestamptz,timestamptz,boolean,boolean)') is null then
    raise exception 'the scalar private.fixture_push_when(timestamptz,timestamptz,boolean,boolean) is MISSING';
  end if;

  -- ⚠️ ADDRESSED BY IDENTITY, NOT BY A LIKE ON THE ARGUMENT STRING. The first
  -- version of this step filtered on
  --     pg_get_function_identity_arguments(oid) like 'timestamp with time zone%'
  -- which matches NOTHING, because that string begins with the PARAMETER NAME
  -- ("_starts_at timestamp with time zone, ..."). The select found no row, cfg
  -- stayed null, and the harness reported "mutable search_path" for a function
  -- that was correctly pinned — a FALSE RED from an over-specific pattern, the
  -- mirror image of a false green and just as wrong.
  --
  -- ⚠️ AND THE TWO OUTCOMES ARE NOW DISTINGUISHED. "I could not find the
  -- function" and "I found it and it is unpinned" are different failures with
  -- different fixes, and collapsing them into one message is what made the
  -- first version misleading rather than merely broken.
  select proconfig into cfg
    from pg_proc
   where oid = 'private.fixture_push_when(timestamptz,timestamptz,boolean,boolean)'::regprocedure;

  if not found then
    raise exception 'PROBE FAILED: could not resolve the scalar fixture_push_when to read its search_path';
  end if;
  if cfg is null or not exists (select 1 from unnest(cfg) c where c like 'search_path=%') then
    raise exception 'the scalar fixture_push_when has a mutable search_path: %', cfg;
  end if;
end $$;

-- ── STEP 11 — the two forms CANNOT DIVERGE ───────────────────────────────
--
-- ⚠️ THE WHOLE POINT OF THE OVERLOAD. Two copies of this expression is what
-- created the second surface in the first place. The row form must DELEGATE, so
-- there is one implementation; this asserts agreement rather than trusting it.
do $$
declare e public.events; scalar_got text; row_got text;
begin
  foreach scalar_got in array array['timed', 'tbd', 'allday', 'span'] loop
    e := null::public.events;
    e.starts_at := timestamptz '2026-09-17 13:00:00+00';
    e.all_day := false; e.time_tbd := false; e.ends_at := null;

    if scalar_got = 'tbd'    then e.time_tbd := true; end if;
    if scalar_got = 'allday' then
      e.all_day := true; e.starts_at := timestamptz '2026-09-16 20:00:00+00';
    end if;
    if scalar_got = 'span'   then
      e.all_day := true;
      e.starts_at := timestamptz '2026-09-16 20:00:00+00';
      e.ends_at   := timestamptz '2026-09-17 20:00:00+00';
    end if;

    row_got := private.fixture_push_when(e);
    scalar_got := private.fixture_push_when(e.starts_at, e.ends_at, e.all_day, e.time_tbd);
    if row_got is distinct from scalar_got then
      raise exception 'the two fixture_push_when forms disagree: row "%" vs scalar "%"', row_got, scalar_got;
    end if;
  end loop;
end $$;

-- ── STEP 12 — the scalar form is TOTAL for null flags ────────────────────
--
-- ⚠️ NOT PEDANTRY. The nudge passes columns straight from a record; a null flag
-- reaching an un-coalesced CASE returns NULL, and a null when-line concatenated
-- into the push body makes the WHOLE body null — a notification with no text at
-- all, which is worse than a wrong one.
do $$
declare got text;
begin
  got := private.fixture_push_when(timestamptz '2026-09-17 13:00:00+00', null, null, null);
  if got is null then
    raise exception 'the scalar when-line returned NULL for null flags';
  end if;
  if got <> 'Thu 17 Sep, 17:00' then
    raise exception 'null flags did not fall back to the timed form: "%"', got;
  end if;
end $$;

-- ── STEP 13 — the nudge uses the helper, and is STILL MATCH-ONLY ─────────
--
-- ⚠️ THE SECOND HALF IS THE REGRESSION GUARD. Replacing a function is the
-- moment its selection criteria can silently change; a nudge that stopped being
-- match-only would start chasing parents to RSVP to kit collections, which is
-- precisely what phase 1 was careful to avoid.
do $$
declare def text;
begin
  def := pg_get_functiondef('private.send_availability_nudges()'::regprocedure);

  if def not like '%fixture_push_when%' then
    raise exception 'send_availability_nudges does not call fixture_push_when — the second surface is still inline';
  end if;
  if def like '%HH24:MI%' then
    raise exception 'send_availability_nudges still builds the when-line inline';
  end if;
  if def not like '%e.type = ''match''%' then
    raise exception 'send_availability_nudges is no longer match-only — it could now nudge a Club Diary entry';
  end if;
end $$;

rollback;
