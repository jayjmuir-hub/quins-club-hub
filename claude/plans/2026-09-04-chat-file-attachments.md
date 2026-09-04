# Chat file attachments — Excel, Word, PDF on the existing chat-media rail

**Status: BUILT in this pull request — 4 Sep 2026.** Spec for
`claude/plans/2026-09-04-chat-file-attachments-implementation.md`. Dated
2026-09-04.

Jay, 4 Sep 2026, reopened images-only
(`claude/decisions/2026-08-24-chat-photos-open.md` ruling 2). Rulings:
`claude/decisions/2026-09-04-chat-file-attachments.md`.

## What ships

Any member who can already write in a chat can attach **one** allowlisted file
(≤ 25 MB) as a FileCard message on the private `chat-media` bucket. The card
shows icon, original filename, and human size; tap opens a signed URL. No
in-bubble Office preview. Caption deferred.

Works on DM, channel, floating dock, Starred, list preview (`📄 File` from the
path — `my_chats()` still has no filename), and push preview (`📄 File`, never
the original name). Photo albums and voice notes are unchanged.

## Shape

Writers call `uploadChatFile(profileId, file)` and send
`attachments: [{ file, type, size, name }]`. The trigger still derives
`attachment_path` / `attachment_paths`. Do not invent parallel columns.

Allowlisted MIME → ext: pdf, doc, docx, xls, xlsx, csv (`text/csv` and
`application/csv`). ppt/pptx, zip, and images-as-files are refused.

## What this is not

- Not the Documents repo.
- Not an album of files.
- Not a drop-zone for PDFs (drop still hits the photo tray and is refused as
  not a photo). The file door is a separate control beside that tray.
