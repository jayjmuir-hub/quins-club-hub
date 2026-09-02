-- memberships and access_requests join the supabase_realtime publication, so
-- the Admin badge (desktop sidebar count, phone dock dot) moves the moment a
-- join request arrives or is decided — src/lib/useAdminWaiting.js.
--
-- Jay, 2 Sep 2026, desktop: "when I have the desktop site open and new join
-- approvals come in the little number icon on admin doesn't increment unless
-- I open admin again or refresh". The client counted on mount and on leaving
-- Accounts, and nothing else; the fix is a realtime subscription on the two
-- tables whose rows ARE the count. Neither was in the publication — measured
-- 2 Sep 2026: announcements, availability, conversations, events, feedback,
-- messages. The events migration (20260813) records why that list started
-- empty and how it is checked.
--
-- ⚠️ A SUBSCRIPTION ON A TABLE OUTSIDE THE PUBLICATION IS SILENT, NOT AN
-- ERROR. It connects, reports SUBSCRIBED, and never fires. So the client-side
-- change is inert until this is applied, and nothing will say so. Verify
-- live: the query at the bottom, then a pending membership inserted while an
-- admin's tab watches the badge.
--
-- WHAT A SUBSCRIBER CAN SEE. Realtime postgres_changes are filtered through
-- the subscriber's OWN row-level policies, so an admin — the only role the
-- client subscribes for — receives change events for rows their SELECT
-- policy already lets them read, and nobody else receives anything. No grant
-- changes; this is a publication membership only, so db/schema/grants.sql is
-- untouched.
--
-- ⚠️ IF THIS PUBLICATION IS EVER EMPTIED, everything goes quiet with no error
-- anywhere. That sentence is copied deliberately from the events migration,
-- because it is the failure mode of this whole mechanism and it has bitten once.

begin;

-- ⚠️ `add table` THROWS IF THE TABLE IS ALREADY A MEMBER, which makes a re-run
-- fail rather than no-op. Guarded so this migration is safe to replay.
do $$
declare
  t text;
begin
  foreach t in array array['memberships', 'access_requests'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;

-- Verify:
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' order by 1;
-- must now list access_requests and memberships alongside the six above.
