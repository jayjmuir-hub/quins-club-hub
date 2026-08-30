-- 30 Aug 2026 — ROLE CHANNELS: club-wide chats whose membership is DERIVED
-- from roles, never stored. claude/plans/2026-08-30-role-channels.md.
--
-- Five new values for messages.channel (team_id NULL, conversation_id NULL):
--
--   headcoaches  head-coach flagged coaches, + admins ticked 'chat-headcoaches'
--   managers     manager role anywhere,      + admins ticked 'chat-managers'
--   medics       medic role,                 + admins ticked 'chat-medics'
--   welfare      admins holding the existing 'welfare' right — the grant IS
--                the membership; deliberately NOT all admins (same tightest
--                circle that gates DM review, 20260828_dm_review_welfare)
--   clubstaff    any active staff role: coach, manager, medic, admin
--
-- ⚠️ ADMIN ACCESS TO THE FIRST THREE IS A PER-ADMIN TICK, not a birthright —
-- Jay's ruling, 30 Aug 2026: "a selectable rights thing, only pertaining to
-- admin people, done only by super admin". The ticks are new admin_rights
-- values; ADMIN_RIGHTS deliberately has no DB constraint (src/lib/scope.js
-- explains why), so no schema change is needed for the rights themselves.
-- Default off: channels start pure, and an admin is in one only when a super
-- deliberately puts them there — audited by the existing rights log.
--
-- ⚠️ ONE HELPER ANSWERS MEMBERSHIP EVERYWHERE. private.in_role_channel is
-- called by all four messages policies, can_reply_to, and my_chats; its
-- enumerating twin role_channel_audience feeds the mention filter and the
-- member sheet. Two functions, one rule — a channel whose read policy and
-- member list could disagree would be exactly the drift this repo warns about.

-- ── The channel values ──────────────────────────────────────────────────────

alter table public.messages drop constraint messages_channel_check;
alter table public.messages add constraint messages_channel_check
  check (channel in ('squad','staff','dm',
                     'headcoaches','managers','medics','welfare','clubstaff'));

-- A role-channel message belongs to the club alone: no squad, no conversation,
-- no fixture. The BEFORE trigger does not zero these silently — a client that
-- sends one gets an explicit refusal instead of a quiet correction.
alter table public.messages add constraint messages_role_channel_shape
  check (channel not in ('headcoaches','managers','medics','welfare','clubstaff')
         or (team_id is null and conversation_id is null and event_id is null));

-- ── Membership: the single rule ─────────────────────────────────────────────

create or replace function private.in_role_channel(_channel text, _club uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select case _channel
    when 'clubstaff' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and m.role in ('coach','manager','medic','admin'))
    when 'headcoaches' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and ((m.role = 'coach' and m.is_head_coach)
           or (m.role = 'admin' and 'chat-headcoaches' = any(m.admin_rights))))
    when 'managers' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and (m.role = 'manager'
           or (m.role = 'admin' and 'chat-managers' = any(m.admin_rights))))
    when 'medics' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and (m.role = 'medic'
           or (m.role = 'admin' and 'chat-medics' = any(m.admin_rights))))
    when 'welfare' then exists (
      select 1 from public.memberships m
       where m.profile_id = (select auth.uid())
         and m.club_id = _club and m.status = 'active'
         and m.role = 'admin' and 'welfare' = any(m.admin_rights))
    else false
  end;
$function$;

revoke execute on function private.in_role_channel(text, uuid) from public;
revoke execute on function private.in_role_channel(text, uuid) from anon;
grant execute on function private.in_role_channel(text, uuid) to authenticated;

-- The enumerating twin: every member of a role channel, with the reason they
-- are in it — "Head coach — U10 Mixed", "Manager — U16B, U18B", "Admin — chat
-- access". A derived list can explain itself, which is the whole point of the
-- member sheet; one row per person, reasons aggregated.
create or replace function private.role_channel_audience(_channel text, _club uuid)
returns table(profile_id uuid, reason text)
language sql
stable security definer
set search_path to ''
as $function$
  with rows as (
    select m.profile_id,
           case
             when _channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach
               then 'Head coach — ' || t.name
             when _channel = 'managers' and m.role = 'manager'
               then 'Manager — ' || t.name
             when _channel = 'medics' and m.role = 'medic'
               then 'Medic' || coalesce(' — ' || t.name, '')
             when _channel = 'welfare' and m.role = 'admin' and 'welfare' = any(m.admin_rights)
               then 'Welfare'
             when _channel = 'clubstaff' and m.role in ('coach','manager','medic')
               then initcap(m.role) || coalesce(' — ' || t.name, '')
             when _channel = 'clubstaff' and m.role = 'admin'
               then 'Club admin'
             when _channel in ('headcoaches','managers','medics') and m.role = 'admin'
                  and ('chat-' || _channel) = any(m.admin_rights)
               then 'Admin — chat access'
           end as reason
      from public.memberships m
      left join public.teams t on t.id = m.team_id
     where m.club_id = _club and m.status = 'active'
  )
  select r.profile_id, string_agg(distinct r.reason, ' · ' order by r.reason)
    from rows r
   where r.reason is not null
   group by r.profile_id;
$function$;

revoke execute on function private.role_channel_audience(text, uuid) from public;
revoke execute on function private.role_channel_audience(text, uuid) from anon;
grant execute on function private.role_channel_audience(text, uuid) to authenticated;

-- ── The four messages policies gain their role-channel arms ────────────────
-- Each arm is the one helper; the existing arms are reproduced VERBATIM from
-- pg_get_expr on live (30 Aug 2026), not from the schema capture.

drop policy "message read" on public.messages;
create policy "message read" on public.messages
  for select using (
case channel
    when 'squad'::text then
    case
        when (team_id is null) then (exists ( select 1
           from memberships m
          where ((m.profile_id = ( select auth.uid() as uid)) and (m.club_id = messages.club_id) and (m.status = 'active'::text))))
        else private.can_see_team(team_id)
    end
    when 'staff'::text then private.can_edit_team(team_id)
    when 'dm'::text then ((private.in_conversation(conversation_id) and (created_at > coalesce(private.cleared_before(conversation_id), '-infinity'::timestamp with time zone))) or private.admin_may_review(conversation_id))
    when 'headcoaches'::text then private.in_role_channel(channel, club_id)
    when 'managers'::text    then private.in_role_channel(channel, club_id)
    when 'medics'::text      then private.in_role_channel(channel, club_id)
    when 'welfare'::text     then private.in_role_channel(channel, club_id)
    when 'clubstaff'::text   then private.in_role_channel(channel, club_id)
    else false
end);

-- club_id is stamped by the BEFORE trigger (set_message_provenance), and RLS
-- WITH CHECK evaluates the row AFTER before-triggers — same order the dm arm
-- already relies on for conversation_id.
drop policy "message create" on public.messages;
create policy "message create" on public.messages
  for insert with check (
case channel
    when 'squad'::text then (((parent_id is not null) and private.can_reply_to(parent_id)) or ((parent_id is null) and
    case
        when (team_id is null) then private.is_admin(( select m.club_id
           from memberships m
          where ((m.profile_id = ( select auth.uid() as uid)) and (m.status = 'active'::text))
          order by m.created_at
         limit 1))
        else (private.can_edit_team(team_id) or ((not private.channel_announce_only(team_id)) and private.can_see_team(team_id)) or ((event_id is not null) and private.can_see_team(team_id)))
    end))
    when 'staff'::text then private.can_edit_team(team_id)
    when 'dm'::text then private.in_conversation(conversation_id)
    else (channel in ('headcoaches','managers','medics','welfare','clubstaff')
          and (((parent_id is not null) and private.can_reply_to(parent_id))
            or ((parent_id is null) and private.in_role_channel(channel, club_id))))
end);

-- Moderation in a role channel: the author, or an admin WHO IS A MEMBER — a
-- non-member admin cannot even read Welfare, and must not be able to moderate
-- what they cannot see.
drop policy "message edit" on public.messages;
create policy "message edit" on public.messages
  for update using (((author_id = ( select auth.uid() as uid))
    or ((channel = any (array['squad'::text, 'staff'::text])) and (team_id is not null) and private.can_edit_team(team_id))
    or ((channel = 'squad'::text) and (team_id is null) and private.is_admin(club_id))
    or ((channel = 'dm'::text) and private.admin_may_review(conversation_id))
    or ((channel in ('headcoaches','managers','medics','welfare','clubstaff'))
        and private.in_role_channel(channel, club_id) and private.is_admin(club_id))))
  with check ((channel = any (array['squad'::text, 'staff'::text, 'dm'::text,
    'headcoaches'::text, 'managers'::text, 'medics'::text, 'welfare'::text, 'clubstaff'::text])));

-- Reported messages keep the existing rule (any club admin) — report handling
-- is an admin duty even where reading is not, exactly as for reported DMs.
drop policy "message delete" on public.messages;
create policy "message delete" on public.messages
  for delete using (
case
    when private.message_reported(id) then
    case channel
        when 'dm'::text then private.admin_may_review(conversation_id)
        else private.is_admin(club_id)
    end
    else ((author_id = ( select auth.uid() as uid))
      or ((channel = any (array['squad'::text, 'staff'::text])) and (team_id is not null) and private.can_edit_team(team_id))
      or ((channel = 'squad'::text) and (team_id is null) and private.is_admin(club_id))
      or ((channel = 'dm'::text) and private.admin_may_review(conversation_id))
      or ((channel in ('headcoaches','managers','medics','welfare','clubstaff'))
          and private.in_role_channel(channel, club_id) and private.is_admin(club_id)))
end);

-- ── Replies reach role channels ────────────────────────────────────────────

create or replace function private.can_reply_to(_parent uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from messages p
     where p.id = _parent
       and p.parent_id is null
       and p.deleted_at is null
       and case p.channel
         when 'squad' then
           case when p.team_id is null then exists (
                  select 1 from memberships m
                   where m.profile_id = (select auth.uid())
                     and m.club_id = p.club_id and m.status = 'active')
                else private.can_see_team(p.team_id) end
         when 'staff' then private.can_edit_team(p.team_id)
         when 'dm' then false
         else private.in_role_channel(p.channel, p.club_id)
       end);
$function$;

-- ── Provenance: role channels in the mention filter and the role lookup ────
-- Reproduced verbatim from pg_get_functiondef on live (30 Aug 2026), with
-- three additions marked ROLE CHANNELS.

create or replace function private.set_message_provenance()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  parent public.messages;
  ev public.events;
  conv public.conversations;
begin
  new.author_id := auth.uid();
  if new.author_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if new.parent_id is not null then
    select * into parent from messages where id = new.parent_id;
    if parent.id is null then
      raise exception 'no such message to reply to' using errcode = 'P0002';
    end if;
    if parent.parent_id is not null then
      raise exception 'replies are one level deep' using errcode = '23514';
    end if;
    if parent.deleted_at is not null then
      raise exception 'that message was removed' using errcode = '23514';
    end if;
    if parent.channel = 'dm' then
      raise exception 'a direct message has no threads' using errcode = '23514';
    end if;
    new.team_id  := parent.team_id;
    new.channel  := parent.channel;
    new.event_id := parent.event_id;
    new.conversation_id := null;
    new.pinned   := false;
  elsif new.conversation_id is not null then
    -- The conversation decides everything else. For a DM the pair rule is
    -- re-checked on EVERY message; for a group, membership is the whole rule
    -- (24 Aug ruling).
    select * into conv from conversations where id = new.conversation_id;
    if conv.id is null then
      raise exception 'no such conversation' using errcode = 'P0002';
    end if;
    if conv.kind = 'group' then
      if not exists (select 1 from conversation_members gm
                      where gm.conversation_id = conv.id
                        and gm.profile_id = new.author_id) then
        raise exception 'not your conversation' using errcode = '42501';
      end if;
    else
      if new.author_id not in (conv.profile_a, conv.profile_b) then
        raise exception 'not your conversation' using errcode = '42501';
      end if;
      if not private.can_dm(case when conv.profile_a = new.author_id then conv.profile_b else conv.profile_a end) then
        raise exception 'you cannot message this person' using errcode = '42501';
      end if;
    end if;
    new.channel  := 'dm';
    new.team_id  := null;
    new.event_id := null;
    new.pinned   := false;
    new.mentions := '{}';
    update conversations set last_at = now() where id = conv.id;
  elsif new.event_id is not null then
    select * into ev from events where id = new.event_id;
    if ev.id is null then
      raise exception 'no such fixture' using errcode = 'P0002';
    end if;
    if new.team_id is null then
      new.team_id := ev.team_id;
    elsif new.team_id is distinct from ev.team_id then
      raise exception 'that fixture belongs to another squad' using errcode = '23514';
    end if;
  end if;

  if new.channel = 'staff' and new.team_id is null then
    raise exception 'a staff channel belongs to a squad' using errcode = '23514';
  end if;

  -- ROLE CHANNELS: the author's badge comes from their best role ANYWHERE in
  -- the club — a head coach posting in Club Head Coaches has only a
  -- team-scoped coach row, which the (team_id = new.team_id) arm below would
  -- miss for a team-less message.
  select m.role, m.title into new.author_role, new.author_title
    from memberships m
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null
          or new.channel in ('headcoaches','managers','medics','welfare','clubstaff'))
   order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                        when 'medic' then 3 else 9 end,
            m.team_id nulls last
   limit 1;

  new.club_id := coalesce(
    conv.club_id,
    (select club_id from teams where id = new.team_id),
    (select m.club_id from memberships m
      where m.profile_id = new.author_id and m.status = 'active'
      order by m.created_at limit 1));
  if new.club_id is null then
    raise exception 'no club for this message' using errcode = '23502';
  end if;

  if coalesce(array_length(new.mentions, 1), 0) > 0 then
    select coalesce(array_agg(distinct m), '{}') into new.mentions
      from unnest(new.mentions) as m
     where m <> new.author_id
       and m in (
         select profile_id from private.notice_audience(new.club_id, new.team_id) as aud(profile_id)
          where new.channel = 'squad'
         union
         select profile_id from private.staff_audience(new.team_id) where new.channel = 'staff'
         -- ROLE CHANNELS: the audience is the derived membership.
         union
         select rca.profile_id from private.role_channel_audience(new.channel, new.club_id) rca
          where new.channel in ('headcoaches','managers','medics','welfare','clubstaff'));
  end if;

  new.edited_at  := null;
  new.deleted_at := null;
  return new;
end;
$function$;

-- ── The member sheet: who is in this channel, and why ──────────────────────
-- For EVERY channel kind, not just the role ones — "who is in here?" is the
-- same question everywhere. The gate re-applies the channel's own read rule;
-- the names disclosed are exactly the names the caller already sees beside
-- every message in that channel.

create or replace function public.channel_members(_channel text, _team uuid default null)
returns table(profile_id uuid, full_name text, reason text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  my_club uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select m.club_id into my_club from memberships m
   where m.profile_id = auth.uid() and m.status = 'active'
   order by m.created_at limit 1;
  if my_club is null then
    raise exception 'no active membership' using errcode = '42501';
  end if;

  if _channel = 'squad' and _team is not null then
    if not private.can_see_team(_team) then
      raise exception 'not your squad' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name,
             string_agg(distinct
               case m.role when 'admin' then 'Club admin'
                           when 'coach' then case when m.is_head_coach then 'Head coach' else 'Coach' end
                           when 'manager' then 'Manager' when 'medic' then 'Medic'
                           when 'parent' then 'Parent' when 'player' then 'Player'
                           else initcap(m.role) end, ' · ')
        from private.notice_audience((select t.club_id from teams t where t.id = _team), _team) aud(pid)
        join profiles p on p.id = aud.pid
        left join memberships m on m.profile_id = p.id and m.status = 'active'
                                and (m.team_id = _team or m.role = 'admin')
       group by p.id, p.full_name;
  elsif _channel = 'staff' and _team is not null then
    if not private.can_edit_team(_team) then
      raise exception 'not your staff channel' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name,
             string_agg(distinct
               case m.role when 'admin' then 'Club admin'
                           when 'coach' then case when m.is_head_coach then 'Head coach' else 'Coach' end
                           when 'manager' then 'Manager' when 'medic' then 'Medic'
                           else initcap(m.role) end, ' · ')
        from private.staff_audience(_team) aud(pid)
        join profiles p on p.id = aud.pid
        left join memberships m on m.profile_id = p.id and m.status = 'active'
                                and (m.team_id = _team or m.role = 'admin')
       group by p.id, p.full_name;
  elsif _channel = 'club' then
    -- ⚠️ ADMIN-ONLY, unlike every other arm, and the asymmetry is deliberate.
    -- "Who can see what" promises names are squad-scoped: a parent may list
    -- their own squad (the arm above), but enumerating every member of the
    -- club would hand any parent every adult's name across all squads.
    -- Message authors' names still show beside their posts, as they always
    -- have — a feed is not a directory. Admins already read the full
    -- Accounts list, so for them this discloses nothing new.
    if not private.is_admin(my_club) then
      raise exception 'not your channel' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name,
             string_agg(distinct
               case m.role when 'admin' then 'Club admin'
                           when 'coach' then 'Coach' when 'manager' then 'Manager'
                           when 'medic' then 'Medic' when 'parent' then 'Parent'
                           when 'player' then 'Player' else initcap(m.role) end, ' · ')
        from memberships m join profiles p on p.id = m.profile_id
       where m.club_id = my_club and m.status = 'active'
       group by p.id, p.full_name;
  elsif _channel in ('headcoaches','managers','medics','welfare','clubstaff') then
    if not private.in_role_channel(_channel, my_club) then
      raise exception 'not your channel' using errcode = '42501';
    end if;
    return query
      select p.id, p.full_name, rca.reason
        from private.role_channel_audience(_channel, my_club) rca
        join profiles p on p.id = rca.profile_id;
  else
    raise exception 'no such channel' using errcode = '22023';
  end if;
end;
$function$;

revoke execute on function public.channel_members(text, uuid) from public;
revoke execute on function public.channel_members(text, uuid) from anon;
grant execute on function public.channel_members(text, uuid) to authenticated;

-- ── my_chats: the five rows appear for their members ───────────────────────
-- Reproduced verbatim from live, with the role-channels union arm added and
-- the detail column carrying the live member count.

create or replace function public.my_chats()
 returns table(kind text, team_id uuid, conversation_id uuid, label text, detail text, last_at timestamp with time zone, last_body text, last_author_id uuid, last_attachment_path text, last_author_name text, unread bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m cross join me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  rows as (
    select 'squad'::text as kind, t.id as team_id, null::uuid as conversation_id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           lm.created_at as last_at, lm.body as last_body, lm.author_id as last_author_id,
           lm.attachment_path as last_attachment_path,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id)) as unread
      from teams t cross join club
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_see_team(t.id)
    union all
    select 'staff', t.id, null, t.name || ' · staff', 'Staff only',
           lm.created_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from teams t cross join club
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_edit_team(t.id)
    union all
    select 'club', null, null, 'Whole club', 'Club-wide · admins post',
           lm.created_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from club
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
    union all
    -- ROLE CHANNELS (20260830): a row per channel the caller belongs to.
    select rc.key, null, null, rc.label,
           (select count(*) from private.role_channel_audience(rc.key, club.id))::text || ' people',
           lm.created_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.club_id = club.id and x.channel = rc.key and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from (values ('headcoaches','Club Head Coaches'),
                   ('managers','Club Managers'),
                   ('medics','Club Medics'),
                   ('welfare','Welfare'),
                   ('clubstaff','Club Staff')) rc(key, label)
      cross join club cross join me
      left join lateral (select created_at, body, author_id, attachment_path from messages x
                          where x.club_id = club.id and x.channel = rc.key and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where private.in_role_channel(rc.key, club.id)
    union all
    select 'dm', null, c.id, pr.full_name,
           coalesce((select labelled.l from (
               select case m.role when 'admin' then 'Club admin' when 'coach' then 'Coach'
                                  when 'manager' then 'Team Manager' when 'medic' then 'Medic' else null end as l,
                      case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2 when 'medic' then 3 else 9 end as o
                 from memberships m where m.profile_id = pr.id and m.status = 'active') labelled
               where labelled.l is not null order by labelled.o limit 1), 'Direct message'),
           c.last_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join profiles pr on pr.id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id, attachment_path from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where me.id in (c.profile_a, c.profile_b) and c.kind = 'dm'
       and (cl.cleared_at is null or c.last_at > cl.cleared_at)
    union all
    select 'group', null, c.id, c.title,
           (select count(*) from conversation_members gm where gm.conversation_id = c.id)::text || ' people',
           c.last_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join conversation_members my on my.conversation_id = c.id and my.profile_id = me.id
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id, attachment_path from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where c.kind = 'group' and (cl.cleared_at is null or c.last_at > cl.cleared_at)
  )
  select r.kind, r.team_id, r.conversation_id, r.label, r.detail,
         r.last_at, r.last_body, r.last_author_id, r.last_attachment_path, p.full_name, r.unread
    from rows r left join profiles p on p.id = r.last_author_id
   order by r.last_at desc nulls last, r.label;
$function$;

-- ══ WHAT THIS DOES NOT DO ═════════════════════════════════════════════════
--
-- ⚠️ NO PUSH NOTIFICATIONS for role-channel posts — squad chat only pushes
-- staff posts today, and parity is a later decision, not an accident here.
-- ⚠️ NO channel_settings row (announce-only etc.) — role channels are open
-- chat among peers by construction.
-- ⚠️ THE THREE NEW RIGHTS NEED NO SCHEMA — admin_rights has no check
-- constraint, by design (src/lib/scope.js). The client list and this file's
-- helper are the two places that know the 'chat-*' names.
