-- Chat file attachments — widen chat-media for Excel / Word / PDF / CSV.
-- Spec: claude/plans/2026-09-04-chat-file-attachments.md.
-- Ruling: claude/decisions/2026-09-04-chat-file-attachments.md (reopens
-- ruling 2 of claude/decisions/2026-08-24-chat-photos-open.md).
--
-- Approach A: the same private chat-media bucket photos and voice already
-- use. Storage RLS is extension-agnostic (own-folder write, message-linked
-- read), so this migration only widens allowed_mime_types and raises the
-- size ceiling to 25 MB. It does NOT route through the Documents repo.
--
-- ⚠️ Image and audio types are KEPT. Clobbering them would break chat
-- photos and voice notes. db/tests/chat-file-media.sql asserts both survive.
--
-- IDEMPOTENT: the harness inlines this file verbatim against a database that
-- may already carry it; re-running sets the same values.

begin;

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

commit;
