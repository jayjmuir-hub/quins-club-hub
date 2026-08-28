-- my_chats(): return the latest message's attachment_path, so the Chats list
-- can preview a photo/voice-only message instead of "No messages yet".
--
-- THE BUG. A message with an attachment and no caption is legal — the
-- messages_body_check constraint yields the ">= 1 char" arm to attachment_path
-- (see db/schema/tables.sql), so a photo or voice note is stored with body = ''.
-- my_chats returned last_body = '' for such a latest message, and the list's
-- previewLine() reads an empty body as "no message" and printed
-- "No messages yet" over a DM that plainly had a long history. The row itself
-- stayed (scopeChatRows keeps any DM whose last_author_id is set), and the
-- timestamp was right (it comes from conversations.last_at, not the body) — only
-- the one-line summary was wrong.
--
-- THE FIX. Surface the latest message's attachment_path as last_attachment_path.
-- Presentation stays in the client: src/data/chatMedia.js attachmentPreviewLabel()
-- already turns a path into "🎤 Voice message" (audio extension) or "📷 Photo".
-- Polls are unaffected — a poll message carries its question as the body, so it
-- was never empty. This is a purely additive column; older clients that ignore
-- it behave exactly as before.
--
-- Rebased on the current definition (squad/staff/club/dm/group), which the
-- 20260824 group-chats migration last shaped. No data change.
--
-- ⚠️ DROP then CREATE, not CREATE OR REPLACE: adding a column changes the
-- function's OUT-parameter row type, which Postgres refuses to REPLACE
-- ("cannot change return type of existing function"). Nothing in the database
-- depends on my_chats() — it is called only by the app (src/data/messages.js
-- listChats) — so the drop is safe; the grants are re-applied below.
drop function if exists public.my_chats();

create function public.my_chats()
returns table (
  kind text, team_id uuid, conversation_id uuid, label text, detail text,
  last_at timestamptz, last_body text, last_author_id uuid,
  last_attachment_path text, last_author_name text, unread bigint
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
    -- staff channels, for the squad's staff
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
    -- the club channel
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
    -- direct messages I am in
    select 'dm', null, c.id, pr.full_name,
           coalesce((select labelled.l from (
               select case m.role when 'admin' then 'Club admin' when 'coach' then 'Coach'
                                  when 'manager' then 'Team Manager' when 'medic' then 'Medic' else null end as l,
                      case m.role when 'admin' then 0 when 'coach' then 1 when 'manager' then 2 when 'medic' then 3 else 9 end as o
                 from memberships m where m.profile_id = pr.id and m.status = 'active') labelled
               where labelled.l is not null order by labelled.o limit 1), 'Direct message'),
           c.last_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null
               and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join profiles pr on pr.id = (case when c.profile_a = me.id then c.profile_b else c.profile_a end)
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id, attachment_path from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where me.id in (c.profile_a, c.profile_b)
       and c.kind = 'dm'
       -- cleared, and nothing since: not listed (WhatsApp's "delete chat")
       and (cl.cleared_at is null or c.last_at > cl.cleared_at)
    union all
    -- groups I am in
    select 'group', null, c.id, c.title,
           (select count(*) from conversation_members gm where gm.conversation_id = c.id)::text || ' people',
           c.last_at, lm.body, lm.author_id, lm.attachment_path,
           (select count(*) from messages x cross join me
             where x.conversation_id = c.id and x.deleted_at is null
               and x.author_id <> me.id
               and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
               and not exists (select 1 from message_reads r where r.message_id = x.id and r.profile_id = me.id))
      from conversations c cross join me
      join conversation_members my on my.conversation_id = c.id and my.profile_id = me.id
      left join conversation_clears cl on cl.conversation_id = c.id and cl.profile_id = me.id
      left join lateral (select body, author_id, attachment_path from messages x
                          where x.conversation_id = c.id and x.deleted_at is null
                            and x.created_at > coalesce(cl.cleared_at, '-infinity'::timestamptz)
                          order by x.created_at desc limit 1) lm on true
     where c.kind = 'group'
       and (cl.cleared_at is null or c.last_at > cl.cleared_at)
  )
  select r.kind, r.team_id, r.conversation_id, r.label, r.detail,
         r.last_at, r.last_body, r.last_author_id, r.last_attachment_path, p.full_name, r.unread
    from rows r
    left join profiles p on p.id = r.last_author_id
   order by r.last_at desc nulls last, r.label;
$function$;

revoke all on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

comment on function public.my_chats() is
  'The Chats list: every channel and DM the caller may read, newest first, with unread counts. last_attachment_path lets the client preview a photo/voice-only latest message. See db/migrations/20260828_my_chats_last_attachment.sql.';
