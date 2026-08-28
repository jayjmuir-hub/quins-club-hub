-- Harness for db/migrations/20260828_my_chats_last_attachment.sql.
-- Run with `npm run db:check -- my-chats-attachment`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
-- Tests the LIVE public.my_chats() (post-migration): the Chats list must be able
-- to preview a photo/voice-only latest message, so it surfaces the latest
-- message's attachment_path. A message with an attachment and no words is legal
-- (body = ''), and before this migration my_chats returned only that empty body,
-- which the client rendered as "No messages yet" over a DM full of history.
--
--   1. a DM whose latest message is a PHOTO   -> last_body '', last_attachment_path set
--   2. a DM whose latest message is a VOICE   -> last_body '', last_attachment_path set (audio ext)
--   3. CONTROL: a DM whose latest message is TEXT -> last_body the text, last_attachment_path NULL
--      (without this control an always-NULL / always-populated column passes vacuously)
--
-- All five branches of my_chats (squad/staff/club/dm/group) select the same
-- lm.attachment_path; the DM branch is exercised here and the migration's
-- compile against the live schema covers the rest.

begin;

create temporary table _log(seq serial, line text) on commit drop;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c6','ZZ Attach Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000051','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-attach-a@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000052','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-attach-b@example.invalid', now(),'{}'::jsonb, now(), now());

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000051','f0000000-0000-4000-8000-0000000000c6', null, null, 'admin','active'),
 ('f0000000-0000-4000-8000-000000000052','f0000000-0000-4000-8000-0000000000c6', null, null, 'admin','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp.assert_attach() returns void language plpgsql as $fn$
declare
  r record; conv uuid;
  a constant uuid := 'f0000000-0000-4000-8000-000000000051';
  b constant uuid := 'f0000000-0000-4000-8000-000000000052';
begin
  perform pg_temp.as_user(a::text);
  conv := public.open_conversation(b);

  -- 1. latest message is a photo (no caption): body '', attachment set
  insert into messages (conversation_id, channel, body, attachment_path)
    values (conv, 'dm', '', a::text || '/holiday.jpg');
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  if r.last_attachment_path <> a::text || '/holiday.jpg' then
    raise exception 'ASSERT 1 FAILED: photo last_attachment_path = %', r.last_attachment_path;
  end if;
  if coalesce(r.last_body, '<null>') <> '' then
    raise exception 'ASSERT 1 FAILED: photo last_body = %', r.last_body;
  end if;
  insert into _log(line) values ('1 photo: empty body, attachment_path surfaced');

  -- 2. a later voice note supersedes it: audio extension, still no words
  insert into messages (conversation_id, channel, body, attachment_path)
    values (conv, 'dm', '', a::text || '/note.m4a');
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  if r.last_attachment_path <> a::text || '/note.m4a' then
    raise exception 'ASSERT 2 FAILED: voice last_attachment_path = %', r.last_attachment_path;
  end if;
  if coalesce(r.last_body, '<null>') <> '' then
    raise exception 'ASSERT 2 FAILED: voice last_body = %', r.last_body;
  end if;
  insert into _log(line) values ('2 voice note: empty body, audio attachment_path surfaced');

  -- 3. CONTROL: a later text message has words and NO attachment
  insert into messages (conversation_id, channel, body)
    values (conv, 'dm', 'see you Saturday');
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  if r.last_body <> 'see you Saturday' then
    raise exception 'ASSERT 3 FAILED: text last_body = %', r.last_body;
  end if;
  if r.last_attachment_path is not null then
    raise exception 'ASSERT 3 FAILED: text row carried attachment_path = % (column not reflecting reality)', r.last_attachment_path;
  end if;
  insert into _log(line) values ('3 control: a text message has its words and a NULL attachment_path');

  reset role;
end $fn$;

select pg_temp.assert_attach();
select line from _log order by seq;

rollback;
