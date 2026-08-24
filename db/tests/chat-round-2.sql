-- Harness for db/migrations/20260824_chat_round_2.sql.
-- Run with `npm run db:check -- chat-round-2`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (regenerate if it changes; the
-- begin/commit pair is stripped — the harness owns the transaction).
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. the body check discriminates: bare-empty refused, empty-with-photo
--     accepted, over-2000 still refused, plain text still works (control)
--  2. quotes: same-conversation and readable cross-conversation (round 4's
--     reply-privately) accepted; squad-channel and unreadable-target refused
--  3. forwarded defaults false and can be set true
--  4. chat-media writes: own folder yes (control), someone else's folder no
--  5. chat-media reads follow the LIVE message: the other party sees the
--     photo while the message lives, an outsider never does (with a seeing
--     control), and a soft-deleted message takes the photo out of sight of
--     everyone but its owner
--  6. quoting a soft-deleted message keeps the pointer (the client renders
--     "Message deleted" from deleted_at; nothing resurrects the body)
begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000d0','ZZ Roundtwo Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000091','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r2-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000092','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r2-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000093','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r2-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000094','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-r2-parent2@example.invalid', now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000e7','f0000000-0000-4000-8000-0000000000d0','U8 ZZ Roundtwo', 1041),
 ('f0000000-0000-4000-8000-0000000000e8','f0000000-0000-4000-8000-0000000000d0','U9 ZZ Roundtwo', 1042);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000df','f0000000-0000-4000-8000-0000000000d0','f0000000-0000-4000-8000-0000000000e7','Zz Probe Roundone'),
 ('f0000000-0000-4000-8000-0000000000e0','f0000000-0000-4000-8000-0000000000d0','f0000000-0000-4000-8000-0000000000e7','Zz Probe Roundtwo'),
 ('f0000000-0000-4000-8000-0000000000e1','f0000000-0000-4000-8000-0000000000d0','f0000000-0000-4000-8000-0000000000e8','Zz Probe Roundthree');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000091','f0000000-0000-4000-8000-0000000000d0','f0000000-0000-4000-8000-0000000000e7', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000092','f0000000-0000-4000-8000-0000000000d0','f0000000-0000-4000-8000-0000000000e7','f0000000-0000-4000-8000-0000000000df','parent','active'),
 ('f0000000-0000-4000-8000-000000000094','f0000000-0000-4000-8000-0000000000d0','f0000000-0000-4000-8000-0000000000e7','f0000000-0000-4000-8000-0000000000e0','parent','active'),
 ('f0000000-0000-4000-8000-000000000093','f0000000-0000-4000-8000-0000000000d0','f0000000-0000-4000-8000-0000000000e8','f0000000-0000-4000-8000-0000000000e1','parent','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- ── migration under test: db/migrations/20260824_chat_round_2.sql, verbatim ──
-- (begin/commit stripped — the harness owns the transaction)

alter table public.messages add column if not exists quoted_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists forwarded boolean not null default false;
alter table public.messages add column if not exists attachment_path text;

create index if not exists messages_quoted_idx on public.messages (quoted_id) where quoted_id is not null;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  length(btrim(body)) <= 2000
  and (length(btrim(body)) >= 1 or attachment_path is not null)
);

-- ⚠️ THE GUARD BELOW IS THE ROUND-4 VERSION, NOT ROUND 2's ORIGINAL. The
-- original demanded same-conversation; 20260824_chat_round_4.sql relaxed
-- it for reply-privately (dm-only + readable-by-sender). This harness
-- inlines what PRODUCTION RUNS, or its quote asserts would test a trigger
-- that no longer exists anywhere but git history.
create or replace function private.messages_quote_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare q record;
begin
  if new.quoted_id is null then return new; end if;
  if new.channel <> 'dm' or new.conversation_id is null then
    raise exception 'quotes are for direct and group chats only';
  end if;
  select id into q from public.messages where id = new.quoted_id;
  if q.id is null then
    raise exception 'quoted message is not one you can read';
  end if;
  return new;
end $$;

drop trigger if exists messages_quote_guard on public.messages;
create trigger messages_quote_guard
  before insert on public.messages
  for each row execute function private.messages_quote_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function private.chat_media_owner(_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(_name, '/', 1), '')::uuid
$$;

grant execute on function private.chat_media_owner(text) to authenticated;

drop policy if exists "chat media read" on storage.objects;
create policy "chat media read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      private.chat_media_owner(name) = (select auth.uid())
      or exists (select 1 from public.messages x
                 where x.attachment_path = name and x.deleted_at is null)
    )
  );

drop policy if exists "chat media write" on storage.objects;
create policy "chat media write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and private.chat_media_owner(name) = (select auth.uid())
  );

drop policy if exists "chat media remove" on storage.objects;
create policy "chat media remove" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and private.chat_media_owner(name) = (select auth.uid())
  );

-- ── end of inlined migration ────────────────────────────────────────────────

create function pg_temp.assert_round2() returns void language plpgsql as $fn$
declare
  n int; caught text; conv uuid; other_conv uuid;
  msg uuid; squad_msg uuid; photo_msg uuid; photo_key text;
  coach    constant uuid := 'f0000000-0000-4000-8000-000000000091';
  parent   constant uuid := 'f0000000-0000-4000-8000-000000000092';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000093';
  parent2  constant uuid := 'f0000000-0000-4000-8000-000000000094';
begin
  -- 1: the body check discriminates
  perform pg_temp.as_user(coach::text);
  begin
    insert into messages (team_id, channel, body) values ('f0000000-0000-4000-8000-0000000000e7','squad','');
    caught := null;
  exception when check_violation then caught := 'empty'; end;
  if caught is distinct from 'empty' then raise exception 'ASSERT 1 FAILED: bare-empty body was accepted'; end if;
  begin
    insert into messages (team_id, channel, body) values ('f0000000-0000-4000-8000-0000000000e7','squad', repeat('x', 2001));
    caught := null;
  exception when check_violation then caught := 'long'; end;
  if caught is distinct from 'long' then raise exception 'ASSERT 1 FAILED: a 2001-char body was accepted'; end if;
  insert into messages (team_id, channel, body, attachment_path)
    values ('f0000000-0000-4000-8000-0000000000e7','squad','', coach || '/zz-probe-a.jpg');
  insert into messages (team_id, channel, body) values ('f0000000-0000-4000-8000-0000000000e7','squad','Zz probe: text still works')
    returning id into squad_msg;
  reset role;
  insert into _log(line) values ('1 body check: bare-empty and over-2000 refused; photo-only and plain text accepted');

  -- 2: a quote stays home
  perform pg_temp.as_user(coach::text);
  conv := public.open_conversation(parent);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Zz probe: quote me') returning id into msg;
  reset role;
  perform pg_temp.as_user(parent::text);
  insert into messages (conversation_id, channel, body, quoted_id) values (conv, 'dm', 'Zz probe: quoting', msg);
  reset role;
  perform pg_temp.as_user(coach::text);
  other_conv := public.open_conversation(parent2);
  -- ⚠️ REPOINTED 24 Aug 2026 (round 4): cross-conversation quotes of a
  -- READABLE message are now ALLOWED — that is reply-privately
  -- (db/migrations/20260824_chat_round_4.sql). The anchor now pins the
  -- new rule instead of the old one; the unreadable case below still
  -- refuses, which is the half that was ever about safety.
  insert into messages (conversation_id, channel, body, quoted_id) values (other_conv, 'dm', 'Zz probe: reply-privately', msg);
  begin
    insert into messages (team_id, channel, body, quoted_id) values ('f0000000-0000-4000-8000-0000000000e7','squad','Zz probe: squad quote', msg);
    caught := null;
  exception when others then caught := 'squad'; end;
  reset role;
  if caught is distinct from 'squad' then raise exception 'ASSERT 2 FAILED: squad-channel quote was accepted'; end if;
  perform pg_temp.as_user(outsider::text);
  begin
    -- the outsider cannot read msg, so the guard sees no conversation for it
    insert into messages (conversation_id, channel, body, quoted_id)
      values (conv, 'dm', 'Zz probe: blind quote', msg);
    caught := null;
  exception when others then caught := 'blind'; end;
  reset role;
  if caught is distinct from 'blind' then raise exception 'ASSERT 2 FAILED: an outsider quoted into a conversation they are not in'; end if;
  insert into _log(line) values ('2 quotes: same-conversation and readable cross-conversation yes; squad channel and outsider refused');

  -- 3: forwarded defaults false, settable true
  perform pg_temp.as_user(parent::text);
  insert into messages (conversation_id, channel, body, forwarded) values (conv, 'dm', 'Zz probe: passed along', true);
  select count(*) into n from messages where conversation_id = conv and forwarded;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: % forwarded row(s)', n; end if;
  select count(*) into n from messages where id = msg and forwarded;
  reset role;
  if n <> 0 then raise exception 'ASSERT 3 FAILED: an ordinary message reads as forwarded'; end if;
  insert into _log(line) values ('3 forwarded: false unless the sender says so');

  -- 4: chat-media writes — own folder yes, someone else''s no
  photo_key := parent || '/zz-probe-photo.jpg';
  perform pg_temp.as_user(parent::text);
  insert into storage.objects (bucket_id, name) values ('chat-media', photo_key);
  begin
    insert into storage.objects (bucket_id, name) values ('chat-media', coach || '/zz-probe-intruder.jpg');
    caught := null;
  exception when others then caught := 'folder'; end;
  reset role;
  if caught is distinct from 'folder' then raise exception 'ASSERT 4 FAILED: wrote into somebody else''s folder'; end if;
  insert into _log(line) values ('4 chat-media writes: own folder only (own-folder control passed)');

  -- 5: chat-media reads follow the LIVE message
  perform pg_temp.as_user(coach::text);
  select count(*) into n from storage.objects where bucket_id = 'chat-media' and name = photo_key;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: photo visible before any message carries it'; end if;
  reset role;
  perform pg_temp.as_user(parent::text);
  insert into messages (conversation_id, channel, body, attachment_path) values (conv, 'dm', '', photo_key)
    returning id into photo_msg;
  reset role;
  perform pg_temp.as_user(coach::text);
  select count(*) into n from storage.objects where bucket_id = 'chat-media' and name = photo_key;
  if n <> 1 then raise exception 'ASSERT 5 FAILED: the other party cannot see the photo (control)'; end if;
  reset role;
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from storage.objects where bucket_id = 'chat-media' and name = photo_key;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: an outsider sees a DM photo'; end if;
  reset role;
  perform pg_temp.as_user(parent::text);
  update messages set deleted_at = now() where id = photo_msg;
  reset role;
  perform pg_temp.as_user(coach::text);
  select count(*) into n from storage.objects where bucket_id = 'chat-media' and name = photo_key;
  if n <> 0 then raise exception 'ASSERT 5 FAILED: a deleted message still shows its photo'; end if;
  reset role;
  perform pg_temp.as_user(parent::text);
  select count(*) into n from storage.objects where bucket_id = 'chat-media' and name = photo_key;
  reset role;
  if n <> 1 then raise exception 'ASSERT 5 FAILED: the owner lost sight of their own upload'; end if;
  insert into _log(line) values ('5 chat-media reads: audience while the message lives, owner-only after delete, outsider never');

  -- 6: quoting a soft-deleted message keeps the pointer
  perform pg_temp.as_user(coach::text);
  update messages set deleted_at = now() where id = msg;
  -- TWO quotes since the round-4 repoint: the in-conversation one from
  -- assert 2 and the reply-privately one it now also sends.
  select count(*) into n from messages where quoted_id = msg;
  reset role;
  if n <> 2 then raise exception 'ASSERT 6 FAILED: % quote pointer(s) after the soft delete', n; end if;
  insert into _log(line) values ('6 a soft-deleted original keeps its quotes pointed (client shows "Message deleted")');
end $fn$;

select pg_temp.assert_round2();

select line from _log order by seq;

rollback;
