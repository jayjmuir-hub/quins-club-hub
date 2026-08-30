-- 30 Aug 2026, same day as 20260830_role_channels — the managers channel is
-- named "Club Age Group Managers" (Jay: the people in it are the age group
-- managers, and the club's own vocabulary wins). ONLY the display label in
-- my_chats changes; the channel KEY stays 'managers' everywhere — in
-- messages.channel, the policies, the route and the chat-managers right —
-- because a key rename would strand every message already posted under it.
-- The client labels (src/lib/roleChannels.js, adminRightLabel) rename in the
-- same PR.

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
