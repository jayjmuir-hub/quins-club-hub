-- No punch-through (Jay's ruling, 31 Aug 2026 — with group mentions live).
--
-- FOUND BY THE HARNESS ON ITS FIRST CLEAN RUN, before this fix existed:
-- db/tests/group-mentions.sql check 4 went red against production because
-- message_push_subscriptions' mentions arm hard-coded 'squad_chat' with NO
-- channel guard — written 24 Aug (20260824_group_chats.sql) when mentions
-- could only exist in channels. The moment the provenance trigger let a
-- group's mentions survive (20260831_group_chat_mentions.sql), that arm
-- buzzed a mentioned group member under squad_chat, sailing past their
-- direct_messages opt-out.
--
-- Group members are already fully covered by the group arm (category
-- direct_messages, opt-out respected), so the mentions arm now excludes
-- channel = 'dm'. A mention changes what a group message LOOKS like, never
-- who it buzzes. Verbatim replacement otherwise.

CREATE OR REPLACE FUNCTION public.message_push_subscriptions(_message uuid)
 RETURNS TABLE(id uuid, endpoint text, p256dh text, auth text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with asked as (select * from messages where id = _message),
  staff_post as (
    select a.* from asked a
     where a.parent_id is null and a.channel = 'squad'
       and ((a.team_id is not null and a.author_role in ('admin','coach','manager','medic'))
            or (a.team_id is null and a.author_role = 'admin'))
  ),
  people as (
    select aud.profile_id, 'squad_chat'::text as category
      from staff_post a
      cross join lateral private.notice_audience(a.club_id, a.team_id) as aud(profile_id)
    union
    -- mentions buzz in the CHANNELS; a dm/group mention adds nothing here —
    -- the group arm below already reaches every member, opt-out respected.
    select m, 'squad_chat' from asked a, unnest(a.mentions) as m
     where a.channel <> 'dm'
    union
    select s.profile_id, 'squad_chat'
      from asked a cross join lateral private.staff_audience(a.team_id) s
     where a.channel = 'staff' and a.parent_id is null
    union
    -- a DM reaches the other side
    select case when c.profile_a = a.author_id then c.profile_b else c.profile_a end, 'direct_messages'
      from asked a join conversations c on c.id = a.conversation_id
     where a.channel = 'dm' and c.kind = 'dm'
    union
    -- a group message reaches every other member
    select gm.profile_id, 'direct_messages'
      from asked a join conversations c on c.id = a.conversation_id
      join conversation_members gm on gm.conversation_id = c.id
     where a.channel = 'dm' and c.kind = 'group'
  )
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join asked a
   where p.profile_id <> a.author_id
     and a.deleted_at is null
     and not exists (select 1 from notification_opt_outs o
                      where o.profile_id = p.profile_id and o.category = p.category);
$function$;
