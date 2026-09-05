-- ══════════════════════════════════════════════════════════════════════════
--  Three counts that used to be computed in the browser, now computed here
-- ══════════════════════════════════════════════════════════════════════════
--
-- 5 Sep 2026, from a performance review of the live app. Three badges
-- downloaded whole tables to show one number, and the first of them was on
-- course to go WRONG, not merely slow.
--
-- ⚠️ THE UNREAD DOT. `countUnreadMessages` fetched every `message_reads` row
-- the caller could see, with no filter and no limit, and subtracted it from
-- the last fortnight's messages in JavaScript. Two facts made that a bug in
-- waiting rather than a cost:
--
--   1. PostgREST silently caps any response at `db-max-rows` — 1000 on this
--      project (src/data/limits.js measured it on 10 Aug 2026).
--   2. Since 20260826_chat_delivery_receipts the `message reads for author`
--      policy ALSO returns other people's reads of the caller's own posts, so a
--      coach whose post 300 parents read gets 300 rows back for ONE message.
--
-- Measured on production the day this was written: 197 messages ever posted,
-- and one person already receiving 300 rows from that query. Past the cap the
-- rows dropped are the recent ones, so messages already read look unread, and
-- because the mark-read write is a duplicate-ignoring upsert nothing can ever
-- clear them. The dot would stay lit for good, and the "New" marker in a
-- thread would land in the wrong place.
--
-- The fix is to count where the rows are. `count_unread_messages()` is the
-- same rule the client applied — last 14 days, not deleted, not mine, not in
-- my reads — as one query under the caller's own RLS, returning one integer.
--
-- ⚠️ THE DELIVERED TICK RODE ON THAT FETCH, and was the second finding. Every
-- recount (every message posted anywhere, in every open tab) upserted a
-- `message_deliveries` row for EVERY unread message the person had, so a
-- parent with 200 unread generated 200 writes per message posted club-wide.
-- The database ignored the duplicates but still had to receive and check
-- them. `mark_unread_delivered()` does the same job in one statement that
-- inserts only the rows that are missing, and reports how many it added.
--
-- ⚠️ THE ADMIN BADGE downloaded every profile, every membership, every
-- dismissed access request and every feedback message to count the people
-- waiting, on every change to four tables and on every window focus, for
-- every admin. `count_admin_waiting()` is that arithmetic in SQL:
--   waiting  = profiles I can see, not me, with no membership row and no
--              dismissed access request
--   pending  = membership rows in status 'pending' (one per approval card)
--   reports  = feedback that is 'new', or 'in-progress' with the reporter's
--              message last on its thread (they answered, nobody answered back)
-- The report rule is the one 20260915_feedback_thread wrote down for the
-- client; it moves here unchanged.
--
-- ⚠️ ALL THREE ARE SECURITY INVOKER ON PURPOSE. They are the client's queries
-- moved server-side, and they must see exactly what the client saw: the
-- caller's rows under the caller's policies. Nothing here widens access, and a
-- DEFINER function would have had to re-derive every policy by hand.
--
-- ⚠️ `count_unread_messages` and `count_admin_waiting` are READ-ONLY and go in
-- src/lib/resilientFetch.js's READ_RPCS so a stalled Supabase times them out
-- and retries. `mark_unread_delivered` WRITES and must never be listed there.
--
-- Proof: db/tests/chat-and-admin-counts.sql (rolled back).

-- ── 1. The unread count ─────────────────────────────────────────────────────

create or replace function public.count_unread_messages()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer
  from public.messages m
  where m.deleted_at is null
    and m.author_id <> (select auth.uid())
    and m.created_at > now() - interval '14 days'
    and not exists (
      select 1 from public.message_reads r
       where r.message_id = m.id
         and r.profile_id = (select auth.uid())
    );
$$;

comment on function public.count_unread_messages() is
  'The chat dot: messages from the last 14 days, not deleted, not mine, that I have no read receipt for. Runs as the caller under RLS. Replaces a client-side count that hit the 1000-row cap.';

revoke execute on function public.count_unread_messages() from public;
revoke execute on function public.count_unread_messages() from anon;
grant execute on function public.count_unread_messages() to authenticated;

-- ── 2. The delivered tick, only for what is missing ────────────────────────

create or replace function public.mark_unread_delivered()
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.message_deliveries (message_id, profile_id)
  select m.id, (select auth.uid())
    from public.messages m
   where m.deleted_at is null
     and m.author_id <> (select auth.uid())
     and m.created_at > now() - interval '14 days'
     and not exists (
       select 1 from public.message_deliveries d
        where d.message_id = m.id
          and d.profile_id = (select auth.uid())
     )
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.mark_unread_delivered() is
  'Records this device as having received every recent message it has not yet been recorded for, and returns how many rows that added. One statement instead of an upsert of every unread id on every recount.';

revoke execute on function public.mark_unread_delivered() from public;
revoke execute on function public.mark_unread_delivered() from anon;
grant execute on function public.mark_unread_delivered() to authenticated;

-- ── 3. The Admin badge ─────────────────────────────────────────────────────

create or replace function public.count_admin_waiting()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  with waiting as (
    select count(*) as n
      from public.profiles p
     where p.id <> (select auth.uid())
       and not exists (select 1 from public.memberships m where m.profile_id = p.id)
       and not exists (
         select 1 from public.access_requests a
          where a.profile_id = p.id and a.status = 'dismissed'
       )
  ),
  pending as (
    select count(*) as n from public.memberships where status = 'pending'
  ),
  reports as (
    select count(*) as n
      from public.feedback f
     where f.status = 'new'
        or (
          f.status = 'in-progress'
          and (
            select fm.author_id
              from public.feedback_messages fm
             where fm.feedback_id = f.id
             order by fm.created_at desc
             limit 1
          ) = f.submitted_by
        )
  )
  select (waiting.n + pending.n + reports.n)::integer
    from waiting, pending, reports;
$$;

comment on function public.count_admin_waiting() is
  'The Admin badge: people with no membership and no dismissed request, plus pending membership rows, plus reports that are new or waiting on the club. Runs as the caller under RLS; replaces five client-side table reads.';

revoke execute on function public.count_admin_waiting() from public;
revoke execute on function public.count_admin_waiting() from anon;
grant execute on function public.count_admin_waiting() to authenticated;
