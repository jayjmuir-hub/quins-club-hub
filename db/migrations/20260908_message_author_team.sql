-- 20260908_message_author_team — the role pill says which squad (4 Sep 2026)
--
-- Jay, from a screenshot of the Age Group Managers channel: "these tags should
-- include their age group". A manager's bubble there wore TEAM MANAGER and
-- nothing said U11 or U13, which in a club-wide channel is the one thing the
-- reader wants to know. The trigger already picks the membership whose role and
-- title it stamps on the message; it simply never kept WHICH squad that
-- membership was for. This records it.
--
-- One new column, stamped by the same trigger from the same membership pick, so
-- the squad on the pill is the squad that gave the author the role on the pill.
-- The pick is now deterministic: role rank, then team-scoped before club-wide,
-- then SQUAD NAME — a manager on two squads used to get whichever row the
-- planner returned first (three such staff on 4 Sep 2026). Backfilled from
-- CURRENT memberships for every existing staff message, which is the best the
-- past can offer; a staff member who changed squad since will wear the new one
-- on old messages. `touch_message` preserves it like the other provenance.
--
-- Reasoning and proof: claude/schema-history.md, "20260908_message_author_team".
-- Harness: db/tests/message-author-team.sql (rolled back against production).
--
-- Nothing here grants. The column rides the table's existing grants and RLS.
begin;

alter table public.messages
  add column if not exists author_team_id uuid references public.teams(id) on delete set null;

comment on column public.messages.author_team_id is
  'The squad whose membership gave the author their author_role/author_title, stamped by messages_provenance. Null for a club-wide role or a non-staff author.';

-- Captured from the live database on 4 Sep 2026 (NOT from the creating
-- migration — later migrations had added the committee channel). The only
-- changes: the select stamps m.team_id too, joins teams for a deterministic
-- order, and orders by squad name last.
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
  -- Deterministic since 20260908: a manager on two squads wears the same one
  -- every time (squad name, last). Before, the planner chose.
  select m.role, m.title, m.team_id
    into new.author_role, new.author_title, new.author_team_id
    from memberships m
    left join teams t on t.id = m.team_id
   where m.profile_id = new.author_id and m.status = 'active'
     and (m.team_id = new.team_id or m.team_id is null
          or new.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
   order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
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

-- Captured live 4 Sep 2026; the one change is the author_team_id line.
create or replace function private.touch_message()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  new.club_id    := old.club_id;
  new.team_id    := old.team_id;
  new.channel    := old.channel;
  new.parent_id  := old.parent_id;
  new.event_id   := old.event_id;
  new.conversation_id := old.conversation_id;
  new.author_id  := old.author_id;
  new.author_role  := old.author_role;
  new.author_title := old.author_title;
  new.author_team_id := old.author_team_id;
  new.mentions   := old.mentions;
  new.created_at := old.created_at;

  if new.deleted_at is not null and old.deleted_at is null then
    new.body := '(removed)';
    new.pinned := false;
  elsif old.deleted_at is not null then
    new.body := old.body;
    new.deleted_at := old.deleted_at;
    new.pinned := false;
  elsif new.body is distinct from old.body then
    -- Only the author edits words, and only for 15 minutes (24 Aug 2026:
    -- the limit used to sit in the policy, which also blocked a late
    -- delete). An admin reviewing a DM may remove; rewriting is not a review.
    if auth.uid() <> old.author_id then
      raise exception 'only the author can edit a message' using errcode = '42501';
    end if;
    if old.created_at < now() - interval '15 minutes' then
      raise exception 'a message can be edited for 15 minutes' using errcode = '42501';
    end if;
    new.edited_at := now();
  end if;
  return new;
end;
$function$;

-- Backfill: the same pick the trigger makes, from CURRENT memberships. Staff
-- messages only — a parent's row is null either way — and never a DM, whose
-- bubbles wear no pill.
-- ⚠️ messages_touch (BEFORE UPDATE) copies OLD.author_team_id over NEW, which
-- is right for an edit and wrong for this one backfill — with it on, the
-- update wrote nothing (caught by the harness, 4 Sep 2026). Off for the
-- statement, on again straight after; the migration runs in one transaction.
alter table public.messages disable trigger messages_touch;
update public.messages x
   set author_team_id = (
     select m.team_id
       from public.memberships m
       left join public.teams t on t.id = m.team_id
      where m.profile_id = x.author_id and m.status = 'active'
        and (m.team_id = x.team_id or m.team_id is null
             or x.channel in ('headcoaches','managers','medics','welfare','clubstaff','committee'))
      order by case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2
                           when 'medic' then 3 else 9 end,
               (m.team_id is null),
               t.name
      limit 1)
 where x.author_role in ('admin','coach','manager','medic')
   and x.channel <> 'dm'
   and x.author_team_id is null;
alter table public.messages enable trigger messages_touch;

commit;
