# Chat file attachments — documents reopen, on the existing chat-media rail

**Jay, 4 Sep 2026**, reopening ruling 2 of
`claude/decisions/2026-08-24-chat-photos-open.md` (images-only). That ruling
declined documents because *"photos can be moderated by looking at them; files
cannot."* This ruling overrides that on purpose, with a narrow v1 type list, a
25 MB cap, and no in-bubble Office preview.

## The rulings

1. **Open posture.** Anyone who can already write in a chat may attach a file
   there — squad, staff, club, DM, group. No per-space carve-out.
2. **Types v1 only:** pdf, doc, docx, xls, xlsx, csv. **Not** ppt/pptx, zip, or
   images-as-files (those stay on the photo door).
3. **25 MB** (`26214400`) per file — the same ceiling as the Documents repo,
   enforced in the client and as `storage.buckets.file_size_limit`.
4. **UI is FileCard.** Icon, original filename, human size; tap opens a signed
   URL. No in-bubble Office preview. Caption is deferred.
5. **Approach A: extend `chat-media`.** Do not route through the Documents
   repo. Storage RLS stays the existing own-folder write / message-linked
   read. This migration only widens MIME types and the size ceiling.
6. **One file per send** for documents. Do not mix a file into a photo album.

## What this deliberately does not change

- Photo albums and voice notes stay on their existing doors
  (`useAttachmentTray` remains image-only; a dropped PDF is still "not a
  photo").
- `messages.attachments` jsonb is already `[{ file, type, size, name }, ...]`.
  Writers use that shape only. Derived `attachment_path` / `attachment_paths`
  are never written beside it (`src/data/messages.js` `attachmentColumns`).
- **Push bodies never carry the original filename.** In-app previews may show
  `📄 name.xlsx`; `messageBody()` in `supabase/functions/push-send/index.ts`
  uses the generic `📄 File`. A document named after the child it concerns
  must not land on a parent's lock screen. That is the same safeguarding
  line the album work drew when it added `name` to the jsonb.

## The argument this overrides

Ruling 2 of the photos decision: documents cannot be glanced at in a welfare
queue. Accepted then; overridden now because the club already shares
spreadsheets and PDFs on WhatsApp with none of the rails chat already has
(private bucket, author delete, report loop). v1 keeps the surface small
(no zip, no ppt) so a welfare officer opens one signed URL rather than an
archive.

Do not re-open "put chat files in the Documents repo" without a new reason —
that was Approach B, declined the same day.
