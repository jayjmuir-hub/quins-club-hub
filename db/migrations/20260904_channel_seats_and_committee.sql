-- Channel seats and a Committee channel (Jay, 3 Sep 2026 —
-- claude/plans/2026-09-03-channel-seats-and-committee.md).
--
-- Role-channel membership stays DERIVED (20260830_role_channels). Two
-- additions, both additive:
--
--   1. A sixth channel, `committee`, whose members are every row in
--      public.club_officers for the club — hold a title and you are in, lose
--      it and you are out. Supers are NOT in it by being super (Jay: titles
--      only). Reason in the member sheet: the title itself.
--
--   2. public.channel_seats — a SUPER may seat a person in any role channel
--      with a reason. Additive only: a seat adds a member, and nothing here
--      can remove a derived one (exclusions are how a channel drifts away
--      from its own name). Audited by trigger into channel_seat_audit, shown
--      on /admin/rights-log. Reason in the member sheet:
--      "Seated by the club — <reason>".
--
-- ⚠️ A SEAT IN `welfare` GRANTS THE CHANNEL ONLY, NEVER DM REVIEW.
-- private.can_review_dm is untouched and still demands the explicit
-- `welfare` right on an admin row. The harness proves a seated non-admin is
-- refused welfare_overview (with a control).
--
-- ⚠️ EVERY LIST OF THE FIVE KEYS GAINS THE SIXTH. Grep 'clubstaff' on the live
-- schema before editing this again: messages_channel_check,
-- messages_role_channel_shape, the four messages policies, can_reply_to (no
-- list — it delegates), set_message_provenance (two lists), channel_members,
-- my_chats. in_role_channel and role_channel_audience are the two functions
-- that ANSWER membership, so the committee arm and the seats arm live there
-- and nowhere else.
--
-- Harness: db/tests/channel-seats.sql.

begin;

-- ── 1. The sixth channel value ──────────────────────────────────────────────

alter table public.messages drop constraint messages_channel_check;
alter table public.messages add constraint messages_channel_check
  check (channel in ('squad','staff','dm',
                     'headcoaches','managers','medics','welfare','clubstaff','committee'));

alter table public.messages drop constraint messages_role_channel_shape;
alter table public.messages add constraint messages_role_channel_shape
  check (channel not in ('headcoaches','managers','medics','welfare','clubstaff','committee')
         or (team_id is null and conversation_id is null and event_id is null));

-- ── 2. Seats ────────────────────────────────────────────────────────────────

create table public.channel_seats (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  channel     text not null check (channel in
                ('headcoaches','managers','medics','welfare','clubstaff','committee')),
  reason      text not null check (length(btrim(reason)) between 1 and 120),
  granted_by  uuid not null default auth.uid() references public.profiles(id) on delete set default,
  created_at  timestamptz not null default now(),
  unique (club_id, profile_id, channel)
);

comment on table public.channel_seats is
  'A super seats a person in a role channel, with a reason. Additive to the derived '
  'membership; never an exclusion. Read by any active member (the member sheet explains '
  'itself), written and removed by supers only. 20260904_channel_seats_and_committee.';

alter table public.channel_seats enable row level security;

create policy "seats read member" on public.channel_seats
  for select to authenticated
  using (exists (
    select 1 from public.memberships me
     where me.profile_id = (select auth.uid())
       and me.status = 'active'
       and me.club_id = channel_seats.club_id
  ));

create policy "seats write super" on public.channel_seats
  for insert to authenticated
  with check (private.is_super_admin());

create policy "seats delete super" on public.channel_seats
  for delete to authenticated
  using (private.is_super_admin());

revoke all on table public.channel_seats from public, anon;
grant select, insert, delete on table public.channel_seats to authenticated;
grant all on table public.channel_seats to service_role;

-- The audit: written by a trigger, never by the app (the membership_audit
-- lesson — a client-side audit is one a new path can forget). Plain uuids,
-- no foreign keys, so a departed person's history survives them.
create table public.channel_seat_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  seat_id     uuid not null,
  club_id     uuid not null,
  profile_id  uuid not null,
  channel     text not null,
  action      text not null check (action in ('seated','unseated')),
  actor_id    uuid,
  reason      text
);

alter table public.channel_seat_audit enable row level security;

create policy "seat audit read super" on public.channel_seat_audit
  for select to authenticated
  using (private.is_super_admin());

revoke all on table public.channel_seat_audit from public, anon;
grant select on table public.channel_seat_audit to authenticated;
grant all on table public.channel_seat_audit to service_role;

create or replace function private.audit_channel_seat()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into channel_seat_audit (seat_id, club_id, profile_id, channel, action, actor_id, reason)
    values (new.id, new.club_id, new.profile_id, new.channel, 'seated', auth.uid(), new.reason);
    return new;
  else
    insert into channel_seat_audit (seat_id, club_id, profile_id, channel, action, actor_id, reason)
    values (old.id, old.club_id, old.profile_id, old.channel, 'unseated', auth.uid(), old.reason);
    return old;
  end if;
end;
$function$;

create trigger channel_seats_audit
  after insert or delete on public.channel_seats
  for each row execute function private.audit_channel_seat();

-- ── 3. The two functions that answer membership ─────────────────────────────

create or replace function private.in_role_channel(_channel text, _club uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select (case _channel
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
    -- COMMITTEE: titles only. Not supers, not admins — a title.
    when 'committee' then exists (
      select 1 from public.club_officers o
       where o.profile_id = (select auth.uid())
         and o.club_id = _club)
    else false
  end)
  -- SEATS: additive, for any of the six.
  or exists (
    select 1 from public.channel_seats s
     where s.profile_id = (select auth.uid())
       and s.club_id = _club
       and s.channel = _channel);
$function$;

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
    union all
    -- COMMITTEE: the title is the reason.
    select o.profile_id, o.title
      from public.club_officers o
     where _channel = 'committee' and o.club_id = _club
    union all
    -- SEATS: a seated row explains itself too.
    select s.profile_id, 'Seated by the club — ' || s.reason
      from public.channel_seats s
     where s.club_id = _club and s.channel = _channel
  )
  select r.profile_id, string_agg(distinct r.reason, ' · ' order by r.reason)
    from rows r
   where r.reason is not null
   group by r.profile_id;
$function$;

-- ── 4. Every list of the five keys gains the sixth ──────────────────────────

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
    when 'committee'::text   then private.in_role_channel(channel, club_id)
    else false
end);

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
    else (channel in ('headcoaches','managers','medics','welfare','clubstaff','committee')
          and (((parent_id is not null) and private.can_reply_to(parent_id))
            or ((parent_id is null) and private.in_role_channel(channel, club_id))))
end);

drop policy "message edit" on public.messages;
create policy "message edit" on public.messages
  for update using (((author_id = ( select auth.uid() as uid))
    or ((channel = any (array['squad'::text, 'staff'::text])) and (team_id is not null) and private.can_edit_team(team_id))
    or ((channel = 'squad'::text) and (team_id is null) and private.is_admin(club_id))
    or ((channel = 'dm'::text) and private.admin_may_review(conversation_id))
    or ((channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
        and private.in_role_channel(channel, club_id) and private.is_admin(club_id))))
  with check ((channel = any (array['squad'::text, 'staff'::text, 'dm'::text,
    'headcoaches'::text, 'managers'::text, 'medics'::text, 'welfare'::text, 'clubstaff'::text, 'committee'::text])));

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
      or ((channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
          and private.in_role_channel(channel, club_id) and private.is_admin(club_id)))
end);

-- set_message_provenance: the author-badge arm and the mention filter. The
-- body is the live one (20260831_group_chat_mentions) with 'committee' in
-- both lists and nothing else changed.
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
    if conv.kind <> 'group' then
      new.mentions := '{}';
    end if;
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

  select m.role, m.title into new.author_role, new.author_title
    from memberships m
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null
          or new.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
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
         union
         select rca.profile_id from private.role_channel_audience(new.channel, new.club_id) rca
          where new.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee')
         union
         select gm.profile_id from conversation_members gm
          where new.conversation_id is not null
            and gm.conversation_id = new.conversation_id);
  end if;

  new.edited_at  := null;
  new.deleted_at := null;
  return new;
end;
$function$;

-- channel_members: the role-channel arm's list.
create or replace function public.channel_members(_channel text, _team uuid default null::uuid)
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
  elsif _channel in ('headcoaches','managers','medics','welfare','clubstaff','committee') then
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

-- my_chats: the sixth row in the VALUES list. Body otherwise the live one.
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
    select rc.key, null, null, rc.label,
           (select count(*) from private.role_channel_audience(rc.key, club.id))::text || ' people',
           lm.created_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.club_id = club.id and x.channel = rc.key and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from (values ('headcoaches','Club Head Coaches'),
                   ('managers','Club Age Group Managers'),
                   ('medics','Club Medics'),
                   ('welfare','Welfare'),
                   ('clubstaff','Club Staff'),
                   ('committee','Committee')) rc(key, label)
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

commit;
