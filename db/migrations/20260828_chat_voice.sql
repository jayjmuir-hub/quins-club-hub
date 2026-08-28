-- Voice messages — Jay, 28 Aug 2026 ("plain bar, build it and take it live").
-- Spec: claude/plans/2026-08-28-voice-messages.md. Ruling (open like photos,
-- five-minute cap): claude/decisions/2026-08-28-voice-notes-open.md.
--
-- A voice note is JUST ANOTHER ATTACHMENT on a message — the chat-media rail
-- photos already run on (db/migrations/20260824_chat_round_2.sql). The
-- read/write/remove storage policies key on the object's OWNER FOLDER and the
-- message's own read policy; they are extension-agnostic, so an audio object is
-- scoped exactly like a photo with NOTHING new written. This migration only
-- widens the bucket so the storage API will accept audio at all.
--
-- ⚠️ The image types are KEPT, not replaced — clobbering them would break chat
-- photos. db/tests/chat-voice.sql asserts both survive.
--
-- file_size_limit 5 MB → 10 MB: five minutes of Opus/AAC is ~3–5 MB, and this
-- ceiling is also the length cap's teeth — an over-long upload is refused by
-- storage, not merely by the recorder UI (ruling 2).
--
-- IDEMPOTENT: the harness inlines this file verbatim against a database that
-- may already carry it; re-running sets the same values.
begin;

update storage.buckets
   set allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp',
         'audio/webm', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg'
       ],
       file_size_limit = 10485760
 where id = 'chat-media';

commit;
