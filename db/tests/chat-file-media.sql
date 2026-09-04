-- Harness for db/migrations/20260912_chat_file_attachments.sql.
-- Run with `npm run db:check -- chat-file-media`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (regenerate if it changes).
--
-- No new RLS — documents reuse the extension-agnostic chat-media policies.
-- The risk is the migration REPLACING image/audio types instead of extending
-- them. The discriminating assertions are that jpeg/png/webp and audio/webm
-- survive, ppt is NOT admitted, and the ceiling is 25 MB.
-- The outsider-refused tripwire stays in db/tests/chat-round-2.sql (arm 5)
-- and db/tests/chat-album-media.sql; this file does not re-prove it.
begin;

create temporary table _log(seq serial, line text) on commit drop;

-- ── migration under test: db/migrations/20260912_chat_file_attachments.sql, verbatim ──
update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp',
         'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/csv',
         'application/csv'
       ],
       file_size_limit = 26214400
 where id = 'chat-media';
-- ── end of inlined migration ──────────────────────────────────────────────────

do $$
declare types text[]; lim bigint;
begin
  select allowed_mime_types, file_size_limit into types, lim
    from storage.buckets where id = 'chat-media';
  if types is null then raise exception 'ASSERT FAILED: chat-media bucket not found'; end if;
  if not ('application/pdf' = any(types)) then raise exception 'ASSERT FAILED: application/pdf not accepted'; end if;
  if not ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = any(types)) then
    raise exception 'ASSERT FAILED: xlsx MIME not accepted';
  end if;
  if not ('text/csv' = any(types)) then raise exception 'ASSERT FAILED: text/csv not accepted'; end if;
  if not ('application/csv' = any(types)) then raise exception 'ASSERT FAILED: application/csv not accepted'; end if;
  -- DISCRIMINATING: image and audio types must SURVIVE.
  if not ('image/jpeg' = any(types)) then raise exception 'ASSERT FAILED: image/jpeg was clobbered — photos would break'; end if;
  if not ('image/png' = any(types)) then raise exception 'ASSERT FAILED: image/png was clobbered — photos would break'; end if;
  if not ('image/webp' = any(types)) then raise exception 'ASSERT FAILED: image/webp was clobbered — photos would break'; end if;
  if not ('audio/webm' = any(types)) then raise exception 'ASSERT FAILED: audio/webm was clobbered — voice would break'; end if;
  -- ppt is v1-out
  if 'application/vnd.ms-powerpoint' = any(types) then raise exception 'ASSERT FAILED: ppt was admitted; v1 forbids it'; end if;
  if 'application/vnd.openxmlformats-officedocument.presentationml.presentation' = any(types) then
    raise exception 'ASSERT FAILED: pptx was admitted; v1 forbids it';
  end if;
  if lim < 26214400 then raise exception 'ASSERT FAILED: file_size_limit is %, expected >= 26214400', lim; end if;
  insert into _log(line) values ('1 chat-media accepts pdf/office/csv AND still accepts image+audio; limit 25 MB; ppt refused');
end $$;

select line from _log order by seq;

rollback;
