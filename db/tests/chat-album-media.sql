-- Harness for db/migrations/20260901_message_attachment_list.sql.
-- Run with `npm run db:check -- chat-album-media`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
-- ══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
-- A chat photo is not protected by an unguessable name. `chat media read` on
-- storage.objects grants a read when you OWN the object, or a LIVE message
-- points at it. Before the album a message pointed at one object; now it
-- points at up to ten, and the policy's `x.attachment_path = name` becomes
-- `name = any(x.attachment_paths)`.
--
-- Both ways of getting that wrong are silent from the app:
--   too narrow  -> photos 2..10 are invisible to everyone but the sender
--   too wide    -> photographs of children are readable across the club
--
-- ⚠️⚠️ THE SAFETY PROPERTY OF THIS POLICY IS INVISIBLE IN ITS OWN TEXT, AND
-- A TIDY-UP WILL DESTROY IT. The EXISTS carries NO conversation-membership
-- condition. Read literally it says "if any live message references this
-- object, any authenticated user may read it". It is safe ONLY because the
-- subquery runs as the CALLER and public.messages has its own RLS (verified
-- 31 Aug 2026: relrowsecurity = true), so the caller sees only the message
-- rows they are entitled to. The membership check is INHERITED, never stated.
--
-- ⚠️ THEREFORE: KEEP THE EXISTS INLINE AND INVOKER. Wrapping it in a helper
-- like private.message_has_attachment(name) and marking it SECURITY DEFINER —
-- as most private.* helpers here are — makes RLS on messages stop applying,
-- and the policy then means what it literally says: EVERY member reads EVERY
-- chat photo, in every squad. It would look tidier and it would pass a naive
-- fixture, because the test user is usually a legitimate member.
-- ASSERTION 2 BELOW IS THE ONE THAT CATCHES THAT. It looks redundant. It is
-- not. (private.chat_media_owner is INVOKER too — verified, prosecdef = false.)
--
-- ══ ASSERTIONS ════════════════════════════════════════════════════════════
--   1. the SENDER can read attachment 7 of their own album
--   2. ⚠️ another member of the SAME conversation can read attachment 7
--   3. ⚠️ an authenticated member of the club who is NOT in that conversation
--      is REFUSED attachment 7 — the SECURITY DEFINER tripwire
--   4. ⚠️ once the message is soft-deleted, attachment 7 is refused even to a
--      member of the conversation — `deleted_at is null` must survive
--   5. the backfill left NO row with attachment_path set and an empty list
--      (such a row's photo is unreadable to everyone, including its sender),
--      with a control proving the count can be non-zero
--   6. the database itself refuses an 11th attachment — a client cap is a
--      suggestion, the constraint is the rule
--
-- Assertions 2 and 3 are a matched pair: 2 alone passes under a wide-open
-- policy, 3 alone passes under a policy that grants nobody anything.

begin;

create temporary table _log(seq serial, line text) on commit drop;
-- The asserts write to _log while running AS `authenticated` (as_user switches
-- role before each probe), so the grants are required or every insert dies on
-- "permission denied for table _log".
grant insert on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name)
values ('f0000000-0000-4000-8000-0000000000d1','ZZ Album Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000061','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-album-sender@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000062','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-album-peer@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000063','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-album-outsider@example.invalid',now(),'{}'::jsonb, now(), now());

-- All three are ACTIVE members of the club. The outsider's exclusion is from
-- the CONVERSATION, not from the club — if it were from the club, assertion 3
-- would pass for the wrong reason and prove nothing about this policy.
insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000061','f0000000-0000-4000-8000-0000000000d1', null, null, 'admin','active'),
 ('f0000000-0000-4000-8000-000000000062','f0000000-0000-4000-8000-0000000000d1', null, null, 'admin','active'),
 ('f0000000-0000-4000-8000-000000000063','f0000000-0000-4000-8000-0000000000d1', null, null, 'admin','active');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

create function pg_temp._chk(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', what; end if;
  insert into _log(line) values (what);
end $$;

create function pg_temp.assert_album() returns void language plpgsql as $fn$
declare
  conv uuid; msg uuid; n int; caught text; paths text[];
  sender   constant uuid := 'f0000000-0000-4000-8000-000000000061';
  peer     constant uuid := 'f0000000-0000-4000-8000-000000000062';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000063';
  photo7   text;
  -- 20260901_attachment_metadata (arms 7-10)
  meta_msg uuid; legacy_msg uuid;
  meta_paths text[]; meta_first text; meta_name text;
  legacy_attachments jsonb;
begin
  -- An eight-photo album, every object under the sender's own prefix (the
  -- `chat media write` policy allows nothing else).
  select array_agg(sender::text || '/zz-album-' || i || '.jpg' order by i)
    into paths from generate_series(1, 8) i;
  photo7 := paths[7];

  perform pg_temp.as_user(sender::text);
  conv := public.open_conversation(peer);
  insert into messages (conversation_id, channel, body, attachment_paths)
       values (conv, 'dm', 'Tour photos', paths)
    returning id into msg;
  insert into storage.objects (bucket_id, name)
       select 'chat-media', unnest(paths);

  -- 1. the sender reads their own attachment 7
  select count(*) into n from storage.objects
   where bucket_id = 'chat-media' and name = photo7;
  perform pg_temp._chk(n = 1, '1 sender reads attachment 7 of their own album');
  reset role;

  -- 2. a DIFFERENT member of the same conversation reads attachment 7.
  --    Fails if the policy still only looks at attachment_path (photo 7 is
  --    not element 1), which is exactly the pre-migration behaviour.
  perform pg_temp.as_user(peer::text);
  select count(*) into n from storage.objects
   where bucket_id = 'chat-media' and name = photo7;
  perform pg_temp._chk(n = 1, '2 a member of the conversation reads attachment 7');
  reset role;

  -- 3. ⚠️ THE TRIPWIRE. An authenticated, active club member who is NOT in
  --    this conversation must be REFUSED. Passes today only because the
  --    EXISTS runs as the caller and messages'' RLS hides the row.
  perform pg_temp.as_user(outsider::text);
  select count(*) into n from storage.objects
   where bucket_id = 'chat-media' and name = photo7;
  perform pg_temp._chk(n = 0, '3 a club member outside the conversation is REFUSED attachment 7');
  reset role;

  -- 4. soft-delete hides the whole album, not just element 1
  update messages set deleted_at = now() where id = msg;
  perform pg_temp.as_user(peer::text);
  select count(*) into n from storage.objects
   where bucket_id = 'chat-media' and name = photo7;
  perform pg_temp._chk(n = 0, '4 a soft-deleted message hides attachment 7');
  reset role;
  update messages set deleted_at = null where id = msg;

  -- 5. the backfill left nothing stranded. A row with attachment_path set and
  --    an empty list is unreadable by EVERYONE, its sender included, because
  --    `name = any('{}')` is false.
  select count(*) into n from messages
   where attachment_path is not null and cardinality(attachment_paths) = 0;
  perform pg_temp._chk(n = 0, '5 backfill: no row has attachment_path with an empty list');

  --    CONTROL for 5: the same count must be able to report a positive number,
  --    or the zero above proves nothing. Written directly, bypassing the sync
  --    trigger, then removed.
  --    ⚠️ THE BODY IS NON-EMPTY ON PURPOSE. messages_body_check now demands
  --    `cardinality(attachment_paths) > 0` whenever the body is blank, so a
  --    stranded PHOTO-ONLY row is impossible to create at all — the constraint
  --    already forbids it. The reachable stranded case is a row that has words
  --    AND an attachment_path with an empty list, so that is what the control
  --    builds. (Found by this harness failing on its first post-migration run.)
  alter table messages disable trigger sync_attachment_paths;
  insert into messages (conversation_id, channel, body, attachment_path, attachment_paths)
       values (conv, 'dm', 'zz stranded probe', sender::text || '/zz-stranded.jpg', '{}');
  select count(*) into n from messages
   where attachment_path is not null and cardinality(attachment_paths) = 0;
  alter table messages enable trigger sync_attachment_paths;
  delete from messages where attachment_path = sender::text || '/zz-stranded.jpg';
  perform pg_temp._chk(n = 1, '5-control: the stranded-row count can report non-zero');

  -- ── 20260901_attachment_metadata: the three columns stay in step ────────
  -- ⚠️ THE POINT OF THESE ARMS. `attachments` jsonb carries what a DOCUMENT
  -- needs and a photo does not: its ORIGINAL FILENAME. Storage keys are
  -- <uuid>/<random>.pdf, so without this a document could only ever render as
  -- "a PDF". attachment_paths and attachment_path are DERIVED from it by
  -- private.sync_attachment_paths, so the storage policy is untouched.

  -- 7. new code writes `attachments` -> the other two are derived
  insert into messages (conversation_id, channel, body, attachments)
       values (conv, 'dm', 'Fixtures',
               jsonb_build_array(
                 jsonb_build_object('file', sender::text || '/zz-a.pdf',
                                    'type', 'application/pdf',
                                    'size', 284000,
                                    'name', 'Fixtures September.pdf'),
                 jsonb_build_object('file', sender::text || '/zz-b.jpg',
                                    'type', 'image/jpeg',
                                    'size', 120000,
                                    'name', 'Team.jpg')))
    returning id into meta_msg;
  select attachment_paths, attachment_path into meta_paths, meta_first
    from messages where id = meta_msg;
  perform pg_temp._chk(
    meta_paths = array[sender::text || '/zz-a.pdf', sender::text || '/zz-b.jpg'],
    '7 writing attachments derives attachment_paths, in order');
  perform pg_temp._chk(meta_first = sender::text || '/zz-a.pdf',
    '7b and derives attachment_path as element 1');

  -- 8. ⚠️ THE ORIGINAL FILENAME SURVIVES — the entire reason for the reshape.
  select attachments -> 0 ->> 'name' into meta_name from messages where id = meta_msg;
  perform pg_temp._chk(meta_name = 'Fixtures September.pdf',
    '8 a document keeps its original filename, which a storage key cannot carry');

  -- 9. CONTROL, and it is the one that matters for a PWA. A CACHED OLD BUNDLE
  --    writes only attachment_path; both new columns must still be derived, or
  --    that member''s photo becomes unreadable to everyone the moment the
  --    policy reads a list they are not in.
  insert into messages (conversation_id, channel, body, attachment_path)
       values (conv, 'dm', '', sender::text || '/zz-legacy.jpg')
    returning id into legacy_msg;
  select attachment_paths, attachments into meta_paths, legacy_attachments
    from messages where id = legacy_msg;
  perform pg_temp._chk(meta_paths = array[sender::text || '/zz-legacy.jpg'],
    '9 an old client writing attachment_path still gets attachment_paths');
  perform pg_temp._chk(legacy_attachments -> 0 ->> 'file' = sender::text || '/zz-legacy.jpg',
    '9b and gets an attachments entry, so nothing is stranded');

  -- 9c. ⚠️ WRITE PRECEDENCE, ASSERTED RATHER THAN IMPLIED. Three writable
  --     columns means one statement can set two of them with DISAGREEING
  --     values — new code writing `attachments` while something stale also
  --     sets attachment_path, or a bulk UPDATE touching both. The trigger's
  --     if/elsif arms imply a winner; without this arm that implication rots
  --     into "whichever the trigger happened to check first". THE RULE:
  --     `attachments` wins whenever it is present and non-empty, then
  --     attachment_paths, then attachment_path. The loser is silently
  --     derived, never an error — erroring would break the cached-bundle
  --     case that arm 9 exists to protect.
  insert into messages (conversation_id, channel, body, attachments, attachment_path)
       values (conv, 'dm', 'conflict',
               jsonb_build_array(jsonb_build_object('file', sender::text || '/zz-winner.jpg')),
               sender::text || '/zz-loser.jpg')
    returning id into meta_msg;
  select attachment_path, attachment_paths into meta_first, meta_paths
    from messages where id = meta_msg;
  perform pg_temp._chk(meta_first = sender::text || '/zz-winner.jpg',
    '9c precedence: attachments beats a conflicting attachment_path');
  perform pg_temp._chk(meta_paths = array[sender::text || '/zz-winner.jpg'],
    '9d and the derived list follows the winner, not the loser');

  -- 10. the cap counts the jsonb, not just the derived array
  begin
    insert into messages (conversation_id, channel, body, attachments)
    select conv, 'dm', 'eleven',
           jsonb_agg(jsonb_build_object('file', sender::text || '/zz-many-' || i || '.jpg'))
      from generate_series(1, 11) i;
    caught := null;
  exception when check_violation then caught := 'capped';
  end;
  perform pg_temp._chk(caught = 'capped', '10 the cap counts attachments, not only the derived list');

  -- 6. the cap is the database''s rule, not the client''s suggestion
  begin
    insert into messages (conversation_id, channel, body, attachment_paths)
    select conv, 'dm', 'eleven',
           array_agg(sender::text || '/zz-over-' || i || '.jpg' order by i)
      from generate_series(1, 11) i;
    caught := null;
  exception when check_violation then caught := 'capped';
  end;
  perform pg_temp._chk(caught = 'capped', '6 the database refuses an 11th attachment');
end $fn$;

select pg_temp.assert_album();
select line from _log order by seq;

-- ══ SELF-TEST ═══════════════════════════════════════════════════════════════
-- ⚠️ A check that has never failed is not a check. This arm proves assertion 3
-- can actually fail, by granting the outsider a read the policy should not.
do $$
declare n int;
begin
  create policy "zz self test wide open" on storage.objects
    for select to authenticated using (bucket_id = 'chat-media');
  perform set_config('request.jwt.claims',
    '{"sub":"f0000000-0000-4000-8000-000000000063","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from storage.objects
   where bucket_id = 'chat-media'
     and name = 'f0000000-0000-4000-8000-000000000061/zz-album-7.jpg';
  reset role;
  drop policy "zz self test wide open" on storage.objects;
  if n = 0 then
    raise exception 'SELF-TEST FAILED: assertion 3 cannot detect a wide-open policy';
  end if;
  raise notice 'SELF-TEST PASSED — assertion 3 catches a wide-open chat-media read policy';
end $$;

rollback;
