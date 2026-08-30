-- ══════════════════════════════════════════════════════════════════════════
--  Grok-sweep items 1 & 2 — the welfare directory and DM/group reports move
--  behind the explicit `welfare` grant · 30 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- WHAT. Two leftovers from the 28 Aug Phase-4 narrowing (`can_review_dm`):
--
-- 1. `public.welfare_overview()` — the Welfare dashboard rows (every squad /
--    staff / club channel, every reviewable DM and group, with participant
--    names and open-report counts) still gated on `private.is_admin`, so a
--    pitches-only admin could enumerate every reviewable child conversation
--    by calling the RPC directly. Gate → `private.can_review_dm`.
--
-- 2. `public.message_reports` read/resolve still `private.is_admin`. Jay's
--    ruling 30 Aug 2026: SPLIT BY CONTEXT, not a flat swap — a report on a
--    conversation message (DM or group: private correspondence, reviewable
--    only under the welfare gate) requires `can_review_dm`; a report on a
--    channel message (squad / staff / club / role channels: content any
--    admin moderates) stays `is_admin`. This mirrors the existing
--    "message delete" policy (20260830_role_channels.sql), which already
--    routes reported DMs through admin_may_review and reported channel
--    messages through is_admin — report visibility now matches deletability.
--    The reporter keeps sight of their own report (read only).
--
-- The classifier is a SECURITY DEFINER helper: a policy subquerying
-- public.messages directly would run under the caller's RLS, and a
-- non-welfare admin cannot see DM messages — the classification itself must
-- not depend on being allowed to read the message.
--
-- ROLLBACK. Re-create the prior definitions:
--   welfare_overview: as in db/migrations/20260824_group_chats.sql:532-599
--     (gate: `ok as (select private.is_admin(club.id) as yes from club)`).
--   "report read":    using (reporter_id = (select auth.uid()) or private.is_admin(club_id))
--   "report resolve": using (private.is_admin(club_id)) with check (private.is_admin(club_id))
--   then `drop function private.report_on_conversation(uuid)`.
--
-- Proven both directions in db/tests/dm-review-welfare.sql (extended in the
-- same PR): negative (pitches-only admin refused) AND positive (welfare
-- holder still succeeds; ordinary admin keeps channel reports).

begin;

-- ── The classifier ─────────────────────────────────────────────────────────
-- True when the reported message lives in a conversation (DM or group).
-- SECURITY DEFINER so the split is decidable by admins who may not read the
-- message itself; it leaks only the message's channel *class*, never content.
create or replace function private.report_on_conversation(_message uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from messages m
     where m.id = _message and m.conversation_id is not null
  );
$$;
revoke all on function private.report_on_conversation(uuid) from public, anon;
grant execute on function private.report_on_conversation(uuid) to authenticated;

-- ── The report policies, split by context ─────────────────────────────────
drop policy if exists "report read" on public.message_reports;
create policy "report read" on public.message_reports
  for select using (
    (reporter_id = (select auth.uid()))
    or case when private.report_on_conversation(message_id)
            then private.can_review_dm(club_id)
            else private.is_admin(club_id)
       end
  );

drop policy if exists "report resolve" on public.message_reports;
create policy "report resolve" on public.message_reports
  for update using (
    case when private.report_on_conversation(message_id)
         then private.can_review_dm(club_id)
         else private.is_admin(club_id)
    end
  )
  with check (
    case when private.report_on_conversation(message_id)
         then private.can_review_dm(club_id)
         else private.is_admin(club_id)
    end
  );

-- ── welfare_overview: gate swap, body otherwise verbatim ──────────────────
-- Copied from db/migrations/20260824_group_chats.sql:532-599 with ONE change:
-- `ok` keys on private.can_review_dm(club.id) instead of private.is_admin.
create or replace function public.welfare_overview()
returns table (kind text, id uuid, label text, detail text, members bigint, last_at timestamptz, open_reports bigint)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m, me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  ok as (select private.can_review_dm(club.id) as yes from club)
  select rows.kind, rows.id, rows.label, rows.detail, rows.members, rows.last_at, rows.open_reports from (
    -- squad channels
    select 'squad'::text as kind, t.id as id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           (select count(*) from private.notice_audience(t.club_id, t.id)) as members,
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'squad') as last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'squad' and r.resolved_at is null) as open_reports
      from teams t, club where t.club_id = club.id
    union all
    -- staff channels
    select 'staff', t.id, t.name, 'Staff',
           (select count(*) from private.staff_audience(t.id)),
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'staff'),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'staff' and r.resolved_at is null)
      from teams t, club where t.club_id = club.id
    union all
    -- the club channel
    select 'club', club.id, 'Whole club', 'Club-wide · admins post',
           (select count(distinct profile_id) from memberships m where m.club_id = club.id and m.status = 'active'),
           (select max(created_at) from messages x where x.club_id = club.id and x.channel = 'squad' and x.team_id is null),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and r.resolved_at is null)
      from club
    union all
    -- direct messages — the ADULT-DMS shape (23 Aug): reviewable ones only.
    select 'dm', c.id, pa.full_name || ' · ' || pb.full_name,
           case when private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
                then 'Direct message · involves a minor' else 'Direct message · reported' end,
           2::bigint, c.last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.conversation_id = c.id and r.resolved_at is null)
      from club
      cross join conversations c
      join profiles pa on pa.id = c.profile_a
      join profiles pb on pb.id = c.profile_b
     where c.club_id = club.id
       and c.kind = 'dm'
       and private.conversation_reviewable(c.id)
    union all
    -- groups: listed only when reviewable, which for a group means a minor
    -- AND a report (24 Aug ruling 3)
    select 'group', c.id, c.title, 'Group · reported, involves a minor',
           (select count(*) from conversation_members gm where gm.conversation_id = c.id),
           c.last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.conversation_id = c.id and r.resolved_at is null)
      from club
      cross join conversations c
     where c.club_id = club.id
       and c.kind = 'group'
       and private.conversation_reviewable(c.id)
  ) rows, ok
  where ok.yes
  order by last_at desc nulls last;
$function$;
revoke all on function public.welfare_overview() from public, anon;
grant execute on function public.welfare_overview() to authenticated;

-- ── Guard ──────────────────────────────────────────────────────────────────
do $g$
declare src text; q text;
begin
  src := pg_get_functiondef('public.welfare_overview()'::regprocedure);
  if src not like '%can_review_dm%' then
    raise exception 'ABORTING: welfare_overview still gates on is_admin.';
  end if;
  select pg_get_expr(polqual, polrelid) into q from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='message_reports' and p.polname='report read';
  if q is null or q not like '%can_review_dm%' or q not like '%report_on_conversation%' then
    raise exception 'ABORTING: report read is not split by context (qual=%).', q;
  end if;
  select pg_get_expr(polqual, polrelid) into q from pg_policy p join pg_class c on c.oid=p.polrelid
    where c.relname='message_reports' and p.polname='report resolve';
  if q is null or q not like '%can_review_dm%' or q not like '%report_on_conversation%' then
    raise exception 'ABORTING: report resolve is not split by context (qual=%).', q;
  end if;
  raise notice 'Welfare overview and DM/group reports behind the welfare grant; channel reports stay any-admin.';
end $g$;

commit;
