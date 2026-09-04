-- 20260910_role_channel_pill — in a role channel, wear the role the channel is for (4 Sep 2026)
--
-- After 20260908 gave the pill its squad, one bubble in Age Group Managers
-- still read "Admin" with no squad: its author is a club admin AND a squad's
-- manager, and the provenance trigger ranks admin above manager, and an
-- admin row has no squad. Jay is one of them. In a channel that exists FOR
-- managers, the manager row is the one the reader wants.
--
-- So the membership pick gains one rule ahead of the role rank: in a role
-- channel, a membership that QUALIFIES the author for that channel comes
-- first — manager in 'managers', head coach in 'headcoaches', medic in
-- 'medics'. Everywhere else (squad chats, staff chats, clubstaff, welfare,
-- committee, the whole-club channel) the order is exactly as before, so an
-- admin still posts to a squad as Admin. Backfilled for the role-channel
-- messages already stamped 'admin' whose author holds the channel's role.
--
-- Reasoning and proof: claude/schema-history.md, "20260910_role_channel_pill".
-- Harness: db/tests/role-channel-pill.sql (rolled back against production).
begin;

-- Captured live 4 Sep 2026 after 20260908; the only change is the first
-- ORDER BY term and its comment.
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

  -- The author's badge: role, title AND SQUAD (20260908), from one membership.
  -- ROLE CHANNELS: the best role ANYWHERE in the club — a head coach posting in
  -- Club Head Coaches has only a team-scoped coach row, which the
  -- (team_id = new.team_id) arm would miss for a team-less message.
  -- 20260910: in a role channel the membership that QUALIFIES the author for
  -- it comes first, so an admin-who-manages posts to Age Group Managers as
  -- "U11 · Team Manager", not "Admin". Elsewhere the order is unchanged.
  -- Deterministic since 20260908: role rank, team-scoped first, squad name.
  select m.role, m.title, m.team_id
    into new.author_role, new.author_title, new.author_team_id
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null
          or new.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
   order by case
              when new.channel = 'managers'    and m.role = 'manager' then 0
              when new.channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach then 0
              when new.channel = 'medics'      and m.role = 'medic' then 0
              else 1 end,
            case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                        when 'medic' then 3 else 9 end,
            (m.team_id is null),
            t.name
   limit 1;
  -- The squad is for the STAFF pill. A parent's row also has a team, and
  -- stamping it would make the column mean two things (caught by the
  -- harness's control, 4 Sep 2026).
  if new.author_role is null or new.author_role not in ('admin','coach','manager','medic') then
    new.author_team_id := null;
  end if;

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

-- Backfill: role-channel messages stamped 'admin' whose author holds the
-- channel's role get that membership's role, title and squad. messages_touch
-- would copy the old values back (20260908's lesson) — off for the statement.
alter table public.messages disable trigger messages_touch;
update public.messages x
   set (author_role, author_title, author_team_id) = (
     select m.role, m.title, m.team_id
       from public.memberships m
       left join public.teams t on t.id = m.team_id
      where m.profile_id = x.author_id and m.status = 'active'
        and ((x.channel = 'managers'    and m.role = 'manager')
          or (x.channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach)
          or (x.channel = 'medics'      and m.role = 'medic'))
      order by (m.team_id is null), t.name
      limit 1)
 where x.channel in ('managers','headcoaches','medics')
   and x.author_role = 'admin'
   and exists (select 1 from public.memberships m
                where m.profile_id = x.author_id and m.status = 'active'
                  and ((x.channel = 'managers'    and m.role = 'manager')
                    or (x.channel = 'headcoaches' and m.role = 'coach' and m.is_head_coach)
                    or (x.channel = 'medics'      and m.role = 'medic')));
alter table public.messages enable trigger messages_touch;

commit;
