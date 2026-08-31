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
-- ⚠️ SIX branches, not five — this line said "all five" and was made wrong the
-- day after it was written, when 20260830_role_channels (#550) added a sixth
-- arm whose kind is a column reference (`rc.key`), not a quoted literal, so a
-- grep for `'x'::text as kind` returns a plausible-looking ONE row and hides
-- it. Count `union all` (5 = six arms) when re-checking. All six select the
-- same lm.attachment_path — but ⚠️ ONLY THE DM ARM IS EXERCISED HERE: the
-- other five (squad/staff/club/group/role) have NO last-attachment coverage,
-- and only the migration's compile against the live schema vouches for them.

-- ⚠️ EVERY INSERT BELOW SETS created_at EXPLICITLY, AND MUST. This harness's
-- whole shape is "a later message supersedes the previous one" — but
-- messages.created_at defaults to now(), which is TRANSACTION-CONSTANT, so
-- all three messages used to share one timestamp. my_chats picks the latest
-- with `order by x.created_at desc limit 1` and NO tie-break, so "latest" was
-- an arbitrary choice among three tied rows, and this file was green by luck.
-- It stayed green for as long as the physical scan order happened to return
-- the last-inserted row, and went red on 1 Sep 2026 when
-- 20260901_message_attachment_list's backfill perturbed that order — a
-- semantically harmless migration exposing a test that never tested what its
-- header claimed. Measured, not inferred: now() gave 1 distinct value across
-- three reads in one transaction; clock_timestamp() gave 3.
-- Staggered timestamps make the premise true instead of lucky.

begin;

create temporary table _log(seq serial, line text) on commit drop;
-- The asserts write to _log while running AS `authenticated` (as_user switches
-- role before each probe). Without these grants every insert dies on
-- "permission denied for table _log" — which is why this harness NEVER ran
-- green: committed 28 Aug 2026 after that morning's nightly, red on its first.
grant insert on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

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
  insert into messages (conversation_id, channel, body, attachment_path, created_at)
    values (conv, 'dm', '', a::text || '/holiday.jpg', now() - interval '3 minutes');
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  if r.last_attachment_path <> a::text || '/holiday.jpg' then
    raise exception 'ASSERT 1 FAILED: photo last_attachment_path = %', r.last_attachment_path;
  end if;
  if coalesce(r.last_body, '<null>') <> '' then
    raise exception 'ASSERT 1 FAILED: photo last_body = %', r.last_body;
  end if;
  insert into _log(line) values ('1 photo: empty body, attachment_path surfaced');

  -- 2. a later voice note supersedes it: audio extension, still no words
  insert into messages (conversation_id, channel, body, attachment_path, created_at)
    values (conv, 'dm', '', a::text || '/note.m4a', now() - interval '2 minutes');
  select * into r from public.my_chats() where kind = 'dm' and conversation_id = conv;
  if r.last_attachment_path <> a::text || '/note.m4a' then
    raise exception 'ASSERT 2 FAILED: voice last_attachment_path = %', r.last_attachment_path;
  end if;
  if coalesce(r.last_body, '<null>') <> '' then
    raise exception 'ASSERT 2 FAILED: voice last_body = %', r.last_body;
  end if;
  insert into _log(line) values ('2 voice note: empty body, audio attachment_path surfaced');

  -- 3. CONTROL: a later text message has words and NO attachment
  insert into messages (conversation_id, channel, body, created_at)
    values (conv, 'dm', 'see you Saturday', now() - interval '1 minute');
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
