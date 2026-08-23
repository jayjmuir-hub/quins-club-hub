-- Squad chat — adult DMs are private unless reported. 23 Aug 2026.
--
-- Jay, the evening after phase 3 shipped: "I don't think dm between adults
-- should be visible to anyone except those people, unless a message is
-- reported." The morning ruling ("any club admin may read a DM") was made for
-- safeguarding, and an adult-to-adult conversation is not a safeguarding case
-- until someone inside it says so. So the rule is now:
--
--   a conversation is REVIEWABLE by an admin when it involves a minor
--   (private.is_minor_profile on either side), OR when any message in it has
--   been reported — resolved or not, because resolving a report should not
--   re-seal what an admin has already, legitimately, read.
--
-- Everything an admin could previously do to a DM now goes through
-- private.admin_may_review(conversation): reading it, seeing it in the
-- Welfare overview, removing a message in it, and logging the open. Nothing
-- changes for participants, for minors' conversations, or for reports.
--
-- The notice in the thread changes to match: an adults-only conversation
-- says "If a message is reported, club admins can review it."

-- Whether a conversation is open to admin review at all (no caller check).
create or replace function private.conversation_reviewable(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and (private.is_minor_profile(c.profile_a)
         or private.is_minor_profile(c.profile_b)
         or exists (select 1 from message_reports r
                      join messages x on x.id = r.message_id
                     where x.conversation_id = c.id)))
$$;
revoke all on function private.conversation_reviewable(uuid) from public, anon;
grant execute on function private.conversation_reviewable(uuid) to authenticated;

-- The caller is an admin of the conversation's club AND it is reviewable.
create or replace function private.admin_may_review(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and private.is_admin(c.club_id)
       and private.conversation_reviewable(c.id))
$$;
revoke all on function private.admin_may_review(uuid) from public, anon;
grant execute on function private.admin_may_review(uuid) to authenticated;

-- For the thread's notice: does this conversation involve a minor? Only a
-- participant or a reviewer gets an answer; anyone else gets null.
create or replace function public.conversation_involves_minor(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
    from conversations c
   where c.id = _conversation
     and (private.in_conversation(c.id) or private.admin_may_review(c.id))
$$;
revoke all on function public.conversation_involves_minor(uuid) from public, anon;
grant execute on function public.conversation_involves_minor(uuid) to authenticated;

-- ── Policies ──────────────────────────────────────────────────────────────

drop policy "conversation read" on public.conversations;
create policy "conversation read" on public.conversations
  for select using ((select auth.uid()) in (profile_a, profile_b) or private.admin_may_review(id));

drop policy "message read" on public.messages;
create policy "message read" on public.messages
  for select using (
    case channel
      when 'squad' then
        case when team_id is null then exists (
               select 1 from memberships m
                where m.profile_id = (select auth.uid())
                  and m.club_id = messages.club_id and m.status = 'active')
             else private.can_see_team(team_id) end
      when 'staff' then private.can_edit_team(team_id)
      when 'dm' then private.in_conversation(conversation_id) or private.admin_may_review(conversation_id)
      else false
    end
  );

drop policy "message edit" on public.messages;
create policy "message edit" on public.messages
  for update using (
    (author_id = (select auth.uid()) and created_at > now() - interval '15 minutes')
    or (channel in ('squad', 'staff') and team_id is not null and private.can_edit_team(team_id))
    or (channel = 'squad' and team_id is null and private.is_admin(club_id))
    -- an admin may REMOVE a DM message only in a conversation they may review
    or (channel = 'dm' and private.admin_may_review(conversation_id))
  ) with check (channel in ('squad','staff','dm'));

-- ── The access log only accepts an open that was allowed ─────────────────

create or replace function public.log_welfare_access(_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  conv public.conversations;
begin
  select * into conv from conversations where id = _conversation;
  if conv.id is null then raise exception 'no such conversation' using errcode = 'P0002'; end if;
  if me in (conv.profile_a, conv.profile_b) then return; end if;
  if not private.admin_may_review(_conversation) then raise exception 'not reviewable' using errcode = '42501'; end if;
  insert into welfare_access_log (club_id, admin_id, conversation_id) values (conv.club_id, me, _conversation);
end;
$function$;

-- ── The overview lists only what an admin may open ────────────────────────

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
  ok as (select private.is_admin(club.id) as yes from club)
  select rows.kind, rows.id, rows.label, rows.detail, rows.members, rows.last_at, rows.open_reports from (
    select 'squad'::text as kind, t.id as id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           (select count(*) from private.notice_audience(t.club_id, t.id)) as members,
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'squad') as last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'squad' and r.resolved_at is null) as open_reports
      from teams t, club where t.club_id = club.id
    union all
    select 'staff', t.id, t.name, 'Staff',
           (select count(*) from private.staff_audience(t.id)),
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'staff'),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'staff' and r.resolved_at is null)
      from teams t, club where t.club_id = club.id
    union all
    select 'club', club.id, 'Whole club', 'Club-wide · admins post',
           (select count(distinct profile_id) from memberships m where m.club_id = club.id and m.status = 'active'),
           (select max(created_at) from messages x where x.club_id = club.id and x.channel = 'squad' and x.team_id is null),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and r.resolved_at is null)
      from club
    union all
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
       and private.conversation_reviewable(c.id)
  ) rows, ok
  where ok.yes
  order by last_at desc nulls last;
$function$;
