# Chat file attachments — implementation plan

**Status: BUILT in this pull request — 4 Sep 2026.** Spec:
`claude/plans/2026-09-04-chat-file-attachments.md`. Rulings:
`claude/decisions/2026-09-04-chat-file-attachments.md`. Dated 2026-09-04.

## Tasks (done in this PR)

1. **chatMedia + push labels.** `CHAT_FILE_TYPES`, `MAX_CHAT_FILE_BYTES`
   (26214400), `isFileAttachment`, `uploadChatFile` returning
   `{ file, type, size, name }`. `attachmentPreviewLabel` names a file before
   the photo default (`📄 name.xlsx` when the original name is known, else
   `📄 File`). Push `messageBody()` uses generic `📄 File` only — never
   `attachments[].name`.
2. **Storage migration** `db/migrations/20260912_chat_file_attachments.sql`
   widens `chat-media` MIME types, keeps image/audio, `file_size_limit` 25 MB.
   Harness `db/tests/chat-file-media.sql`. Existing outsider-refused tripwire
   in `db/tests/chat-round-2.sql` is untouched.
3. **FileCard + whole-surface.** `src/components/FileCard.jsx`; ChatBubble
   branches audio / album / file / photo. ChatAlbum filters files out of the
   photo grid. DM, channel, dock, Starred, list, pin/quote previews.
4. **Composer.** Separate file control beside the photo tray.
   `useAttachmentTray` stays image-only. `usePendingChatFile` holds one file.
   Send writes `attachments` jsonb only. ppt refused.
5. **Report / delete / docs.** Welfare report opens the file via signed URL.
   Author delete removes every object on the message, best-effort.
   Decision + both plans + changelog in this PR.

## Tests

- `tests/chat-file-media.test.js`
- `tests/chat-file-card.test.jsx`
- `tests/chat-file-send.test.jsx`
- `tests/pending-chat-file.test.jsx`
- `tests/push-body-attachments.test.js` (📄 File arm)
- `tests/welfare.test.jsx` (reported file)
- `tests/chat-list.test.jsx` (list preview)
