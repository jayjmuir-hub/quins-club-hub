-- The Chats list, delete-a-message, delete-a-chat — 24 Aug 2026.
-- claude/plans/2026-08-24-chat-list.md.
--
-- Jay, 23 Aug evening: "there is no logical way to send someone a DM ...
-- need to rethink the chat area and make it more like whatsapp." WhatsApp is
-- conversation-first: ONE list of everything you are in, newest on top. This
-- function is that list. One row per squad channel, staff channel, the club
-- channel and each DM the caller may read, each with its last message and an
-- unread count. Scope is decided by the same helpers the policies use
-- (private.can_see_team, private.can_edit_team, the DM participant test), so
-- the list can never show a row the reader could not open.
--
-- UNREAD counts every message in the channel not written by me, not removed,
-- from the last 14 days, without a message_reads row — posts AND replies.
-- The thread screens mark both on arrival (replies were not marked until now).
--
-- Jay, same evening: "need to be able to delete messages and entire chats too".
--   A MESSAGE: its author may remove it at ANY time (was: 15 minutes). Words
--   can still only be EDITED within 15 minutes — that limit moves from the
--   policy into the trigger, where it belongs with the other body rules.
--   A CHAT: "Delete chat" on a DM clears it FOR YOU — WhatsApp's meaning.
--   conversation_clears records when; the read policy hides everything
--   before that moment from that person; the list drops the row until the
--   other side writes again. The other participant's copy is untouched, and
--   so is an admin's review of a reviewable conversation — a clear is not a
--   shredder. Squad, staff and club channels are not deletable: they ARE the
--   squad. Every message in them still is.

-- ── Delete a message: the author, any time ─────────────────────────────────

drop policy "message edit" on public.messages;
create policy "message edit" on public.messages
  for update using (
    author_id = (select auth.uid())
    or (channel in ('squad', 'staff') and team_id is not null and private.can_edit_team(team_id))
    or (channel = 'squad' and team_id is null and private.is_admin(club_id))
    or (channel = 'dm' and private.admin_may_review(conversation_id))
  ) with check (channel in ('squad','staff','dm'));

create or replace function private.touch_message()
returns trigger
language plpgsql
security definer
set search_path = public
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

-- ── Delete a chat: clear a DM for me ───────────────────────────────────────

create table if not exists public.conversation_clears (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  cleared_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
comment on table public.conversation_clears is
  'When a participant last cleared a DM for themselves. Reads before cleared_at are hidden from them. See db/migrations/20260824_chat_list.sql.';
alter table public.conversation_clears enable row level security;
revoke all on public.conversation_clears from public, anon, authenticated;
grant select on public.conversation_clears to authenticated;
create policy "clear own" on public.conversation_clears
  for select using (profile_id = (select auth.uid()));

create or replace function private.cleared_before(_conversation uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select cleared_at from conversation_clears
   where conversation_id = _conversation and profile_id = auth.uid()
$$;
revoke all on function private.cleared_before(uuid) from public, anon;
grant execute on function private.cleared_before(uuid) to authenticated;

create or replace function public.clear_conversation(_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not private.in_conversation(_conversation) then
    raise exception 'not your conversation' using errcode = '42501';
  end if;
  insert into conversation_clears (conversation_id, profile_id, cleared_at)
  values (_conversation, auth.uid(), now())
  on conflict (conversation_id, profile_id) do update set cleared_at = excluded.cleared_at;
end;
$function$;
revoke all on function public.clear_conversation(uuid) from public, anon;
grant execute on function public.clear_conversation(uuid) to authenticated;

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
      when 'dm' then
        (private.in_conversation(conversation_id)
          and created_at > coalesce(private.cleared_before(conversation_id), '-infinity'::timestamptz))
        or private.admin_may_review(conversation_id)
      else false
    end
  );

-- ── The list ───────────────────────────────────────────────────────────────

create or replace function public.my_chats()
returns table (
  kind text, team_id uuid, conversation_id uuid, label text, detail text,
  last_at timestamptz, last_body text, last_author_id uuid, last_author_name text, unread bigint
)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m cross join me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  rows as (
    -- squad channels
    select 'squad'::text as kind, t.id as team_id, null::uuid as conversation_id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           lm.created_at as last_at, lm.body as last_body, lm.author_id as last_author_id,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id)) as unread
      from teams t cross join club
      left join lateral (select created_at, body, author_id from messages x
                          where x.team_id = t.id and x.channel = 'squad' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_see_team(t.id)
    union all
    -- staff channels, for the squad's staff
    select 'staff', t.id, null, t.name || ' · staff', 'Staff only',
           lm.created_at, lm.body, lm.author_id,
           (select count(*) from messages x cross join me
             where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from teams t cross join club
      left join lateral (select created_at, body, author_id from messages x
                          where x.team_id = t.id and x.channel = 'staff' and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
     where t.club_id = club.id and private.can_edit_team(t.id)
    union all
    -- the club channel
    select 'club', null, null, 'Whole club', 'Club-wide · admins post',
           lm.created_at, lm.body, lm.author_id,
           (select count(*) from messages x cross join me
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
               and x.author_id <> me.id and x.created_at > now() - interval '14 days'
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from club
      left join lateral (select created_at, body, author_id from messages x
                          where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and x.deleted_at is null
                          order by x.created_at desc limit 1) lm on true
    union all
    -- direct messages I am in
    select 'dm', null, c.id, pr.full_name,
           coalesce((select labelled.l from (
               select case m.role when 'admin' then 'Club admin' when 'coach' then 'Coach'
                                  when 'manager' then 'Team Manager' when 'medic' then 'Medic' else null end as l,
                      case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2 when 'medic' then 3 else 9 end as o
                 from memberships m where m.profile_id = pr.id and m.status = 'active') labelled
               where labelled.l is not null order by labelled.o limit 1), 'Direct message'),
           c.last_at, lm.body, lm.author_id,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null
               and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join profiles pr on pr.id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where me.id in (c.profile_a, c.profile_b)
       -- cleared, and nothing since: not listed (WhatsApp's "delete chat")
       and (cl.cleared_at is null or c.last_at > cl.cleared_at)
  )
  select r.kind, r.team_id, r.conversation_id, r.label, r.detail,
         r.last_at, r.last_body, r.last_author_id, p.full_name, r.unread
    from rows r
    left join profiles p on p.id = r.last_author_id
   order by r.last_at desc nulls last, r.label;
$function$;

revoke all on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

comment on function public.my_chats() is
  'The Chats list: every channel and DM the caller may read, newest first, with unread counts. See db/migrations/20260824_my_chats.sql.';
