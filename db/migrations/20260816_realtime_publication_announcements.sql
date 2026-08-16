-- Put `announcements` on the wire, so a notice appears without a refresh.
--
-- Jay, 16 Aug 2026: "notices are not appearing instantly on home screen, they
-- only show up when i click refresh… if i don't hit refresh they never show up".
--
-- ⚠️ THE CODE IS ONLY HALF OF IT, AND THIS REPO HAS ALREADY PAID FOR LEARNING
-- THAT. `subscribeEvents` in src/data/events.js carries the note: it "DID
-- NOTHING AT ALL UNTIL 13 Aug 2026, and the code was never the reason" —
-- `public.events` was not in this publication, so Postgres emitted no changes
-- and a correct-looking socket sat open receiving nothing. Two features silently
-- did not work.
--
-- Measured here before writing a line of client code: `supabase_realtime`
-- contained exactly one table, `events`. So a `subscribeNotices` written on its
-- own would have reproduced that bug precisely — and it would have looked right
-- in review, in tests, and in the harness.
--
-- ⚠️ NO `filter` IS USED BY THE SUBSCRIBER, AND THAT IS WHY DELETES WORK.
-- `announcements` is replica identity DEFAULT, so a DELETE payload carries the
-- primary key and nothing else. A subscriber filtering on `team_id` would match
-- nothing on a delete, and a notice taken down would stay on other people's
-- screens until they reloaded — which is the same latent gap
-- subscribeAvailability still has, recorded in the events migration.
--
-- ⚠️ RLS STILL SCOPES DELIVERY. `announcement read` decides who receives a
-- change, exactly as `event read` does — adding a table to the publication does
-- not widen who can see its rows. The re-read the client does in response is
-- itself RLS-scoped, so a delete arriving as a bare id is enough.
--
-- ⚠️ IF THIS PUBLICATION IS EVER EMPTIED, everything goes quiet with no error
-- anywhere. That sentence is copied deliberately from the events migration,
-- because it is the failure mode of this whole mechanism and it has bitten once.

begin;

-- ⚠️ `add table` THROWS IF THE TABLE IS ALREADY A MEMBER, which makes a re-run
-- fail rather than no-op. Guarded so this migration is safe to replay.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;

commit;
