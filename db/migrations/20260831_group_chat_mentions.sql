-- Group chat @ mentions (claude/plans/2026-08-31-group-chat-mentions.md).
--
-- Until now the provenance trigger hard-zeroed `mentions` on the whole
-- conversation arm — groups included. Now a GROUP keeps its mentions,
-- filtered to the conversation's members (minus the author, deduped) by the
-- same keep-filter the channels use; a 1:1 DM is still zeroed — the only
-- other person is already reading, so a mention there is noise.
--
-- Push is deliberately UNCHANGED (Jay's ruling, 31 Aug 2026: no
-- punch-through). A group message already notifies every member under the
-- `direct_messages` category via message_push_subscriptions; a mentioned
-- member who opted out of that category stays un-buzzed. The harness
-- (db/tests/group-mentions.sql) pins both halves.
--
-- Full replacement of private.set_message_provenance(), verbatim from
-- db/migrations/20260830_role_channels.sql except:
--   1. the conversation arm zeroes mentions only when conv.kind <> 'group';
--   2. the keep-filter gains a conversation-members arm.

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
    -- GROUP MENTIONS (31 Aug 2026): a group's mentions survive to the
    -- keep-filter below; a 1:1 DM's are still zeroed here.
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
          where new.channel in ('headcoaches','managers','medics','welfare','clubstaff')
         -- GROUP MENTIONS (31 Aug 2026): a group's audience is its members.
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
