-- Harness for db/migrations/20260828_chat_voice.sql.
-- Run with `npm run db:check -- chat-voice`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below (regenerate if it changes).
--
-- There is no RLS to prove here — a voice object reuses the extension-agnostic
-- chat-media policies untouched. The one real risk is the migration REPLACING
-- the image mime types instead of extending them, which would break chat
-- photos. The discriminating assertion is exactly that: images must survive.
begin;

create temporary table _log(seq serial, line text) on commit drop;

-- ── migration under test: db/migrations/20260828_chat_voice.sql, verbatim ─────
update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp',
         'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg'
       ],
       file_size_limit = 10485760
 where id = 'chat-media';
-- ── end of inlined migration ──────────────────────────────────────────────────

do $$
declare types text[]; lim bigint;
begin
  select allowed_mime_types, file_size_limit into types, lim
    from storage.buckets where id = 'chat-media';
  if types is null then raise exception 'ASSERT FAILED: chat-media bucket not found'; end if;
  -- audio is now accepted (both containers browsers produce)
  if not ('audio/webm' = any(types)) then raise exception 'ASSERT FAILED: audio/webm (Android/Chrome) not accepted'; end if;
  if not ('audio/mp4'  = any(types)) then raise exception 'ASSERT FAILED: audio/mp4 (iOS Safari) not accepted'; end if;
  -- DISCRIMINATING: the image types must SURVIVE — a replace, not an extend,
  -- would silently break chat photos and this is the check that catches it.
  if not ('image/jpeg' = any(types)) then raise exception 'ASSERT FAILED: image/jpeg was clobbered — photos would break'; end if;
  if not ('image/png'  = any(types)) then raise exception 'ASSERT FAILED: image/png was clobbered — photos would break'; end if;
  if not ('image/webp' = any(types)) then raise exception 'ASSERT FAILED: image/webp was clobbered — photos would break'; end if;
  -- the size ceiling is also the length cap's teeth
  if lim <> 10485760 then raise exception 'ASSERT FAILED: file_size_limit is %, expected 10485760', lim; end if;
  insert into _log(line) values ('1 chat-media now accepts audio AND still accepts every image type; limit raised to 10 MB');
end $$;

select line from _log order by seq;

rollback;
