-- Put `availability` and `feedback` on the wire.
--
-- ══ ⚠️ `availability` HAS BEEN SUBSCRIBING TO NOTHING THIS WHOLE TIME ══════
--
-- Jay, 18 Aug 2026, about the feedback list: "why isn't the second one popping
-- in without a refresh?". The answer for feedback was that nothing subscribed.
-- The answer for AVAILABILITY is worse: `subscribeAvailability` in
-- src/data/availability.js has opened a correct-looking channel since it was
-- written, its own comment says it "subscribes to realtime changes", and
-- `public.availability` was never in this publication. The socket opens, the
-- subscription succeeds, and Postgres emits nothing.
--
-- ⚠️ THIS IS THE THIRD TIME. `public.events` was dead the same way until
-- 13 Aug 2026 ("two features silently did not work"), `announcements` until
-- 16 Aug, and the announcements migration NAMED subscribeAvailability as the
-- remaining one — it was written down and then not acted on. The lesson is not
-- "remember to add the table": it is that **this failure mode is invisible from
-- the client**, so the only reliable check is the publication itself.
--
--     select tablename from pg_publication_tables
--      where pubname = 'supabase_realtime';
--
-- ⚠️ IF THIS PUBLICATION IS EVER EMPTIED, everything goes quiet with no error
-- anywhere. Copied deliberately from the events and announcements migrations,
-- because it is the failure mode of this whole mechanism and it has now bitten
-- three times.
--
-- ══ ⚠️ RLS STILL SCOPES DELIVERY ═════════════════════════════════════════
--
-- Adding a table here does not widen who may see its rows: `availability read`
-- and `feedback read` decide who receives a change, exactly as `event read`
-- does. `feedback read` is `submitted_by = auth.uid() or is_admin(club_id)`, so
-- a parent is told about their own report and nobody else's. The re-read the
-- client does in response is itself RLS-scoped.
--
-- ══ ⚠️ THE DELETE GAP IS REAL BUT UNREACHABLE, AND THAT IS A MEASUREMENT ══
--
-- `subscribeAvailability` filters server-side on `event_id`. Both these tables
-- are replica identity DEFAULT, so a DELETE payload carries the primary key and
-- nothing else — an `event_id` filter cannot match one, and a deleted row would
-- linger on other people's screens until they reloaded. The announcements
-- migration records exactly this trap.
--
-- ✅ **It cannot happen today: nothing deletes an availability row.**
-- `setAvailability` is an ON CONFLICT upsert (src/data/availability.js), and
-- there is no delete path in the app. Measured 18 Aug 2026, not assumed.
-- ⚠️ **So the filter stays, and this is the condition for keeping it.** The day
-- anything deletes from `availability` — a "clear my response" button, a squad
-- change cascade — the filter must go, or this table needs
-- `replica identity full`. Whoever adds that delete owns this line.
--
-- `feedback` has no delete policy at all, so the same question does not arise;
-- and FeedbackTriage subscribes WITHOUT a filter anyway.

begin;

-- ⚠️ `add table` THROWS IF THE TABLE IS ALREADY A MEMBER, which makes a re-run
-- fail rather than no-op. Guarded so this migration is safe to replay.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'availability'
  ) then
    alter publication supabase_realtime add table public.availability;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'feedback'
  ) then
    alter publication supabase_realtime add table public.feedback;
  end if;
end $$;

-- ── THE GUARD ──────────────────────────────────────────────────────────
-- ⚠️ A migration that silently published nothing is exactly the failure this
-- whole file is about. Assert rather than hope.
do $$
declare n int;
begin
  select count(*) into n
    from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename in ('availability', 'feedback');
  if n <> 2 then
    raise exception 'expected availability and feedback on supabase_realtime, found %', n;
  end if;
end $$;

commit;
