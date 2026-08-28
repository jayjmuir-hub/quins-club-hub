# Voice messages — WhatsApp-style, on the chat-media rail

**STATUS: Built, shipping (2026-08-28).** Implemented as specced, with the
tap-to-record fallback in place of the hold gesture (see "The WhatsApp gesture").
Follows the polls build
(`claude/plans/2026-08-27-chat-polls.md`), the second half of Jay's "voice
messages and polls, exactly like WhatsApp". Rulings that gate it —
open posting, five-minute cap — are in
`claude/decisions/2026-08-28-voice-notes-open.md`. Read that first.

## What we are building

A WhatsApp voice note: hold the mic, talk, release to send. It appears as a
message in any chat you can already write in, with a play/pause control, a
scrubber, a duration and a playback-speed toggle. Anyone who can read the
message can play it; the author can delete it like any message. Max five
minutes.

Deliberately WhatsApp-faithful (Jay, twice: "look and work exactly like
WhatsApp"): hold-to-record, slide-left-to-cancel, slide-up-to-lock for
hands-free, a live timer and level meter while recording, and on playback a
waveform scrubber with a 1×/1.5×/2× speed toggle.

## Why this is small on the backend and real on the frontend

A voice note is **just another attachment on a message** — the exact rail chat
photos already run on. The backend work is a bucket config change and one upload
function; there are **no new tables and no new RLS**. The weight is all in the
frontend: capturing audio in the browser (with iOS's quirks) and the record /
playback UI.

### The rail that already exists (from chat photos, round 2)

- `messages.attachment_path` carries the object key; `sendDirectMessage` /
  `postMessage` / `postStaffMessage` already take an `attachmentPath` option.
- The `messages_body_check` constraint (`db/migrations/20260824_chat_round_2.sql`)
  already allows an **empty body when `attachment_path` is set** — so a wordless
  voice note is a legal message with no schema change.
- The private `chat-media` bucket keys objects `<profile_id>/<uuid>.<ext>`; its
  storage read policy defers to the message's own read policy and its write
  policy is own-folder-only. **These policies are extension-agnostic**, so an
  audio object is scoped exactly like a photo with nothing new written.
- `signChatPhotoUrl(path)` signs any object in the bucket, audio included.

## Backend changes (one migration)

`db/migrations/20260828_chat_voice.sql` — a single `update storage.buckets` on
`chat-media`:

- **Widen `allowed_mime_types`** to add the audio types browsers actually
  produce: `audio/webm`, `audio/mp4`, `audio/aac`, `audio/mpeg`, `audio/ogg`
  (kept alongside the existing image types — one bucket, one set of policies).
- **Raise `file_size_limit`** from 5 MB to **10 MB**. Five minutes of Opus/AAC
  is ~3–5 MB; 10 MB is headroom and is *also the hard length cap's teeth* — an
  over-length upload is refused by storage regardless of the UI (ruling 2).

No table, policy, function or trigger changes. Applied to production before the
frontend deploys (same ordering as the polls migration), then verified by a real
audio upload succeeding and an image still succeeding.

## Data layer (`src/data/chatMedia.js`, extended)

- `uploadChatVoice(profileId, blob, ext)` → uploads the recorded blob to
  `<profile_id>/<uuid>.<ext>` with its audio content-type, `upsert:false`. No
  resize (unlike photos). Returns the key for `attachment_path`.
- `isAudioAttachment(path)` → true when the key ends in an audio extension
  (`.webm` / `.m4a` / `.mp4` / `.aac` / `.mp3` / `.ogg`). The one helper that
  tells the renderer and the chat-list preview an attachment is a voice note.
- `signChatVoiceUrl` = `signChatPhotoUrl` (bucket-qualified already); reused, or
  aliased for clarity.
- `removeChatVoice` = `removeChatPhoto` (own-folder best-effort delete); reused.

**Duration** is read client-side from the `<audio>` element's `loadedmetadata`
(no DB column). The recorder also knows it at send time; it is passed to the
composer preview so the bubble can show the length before the object loads.

## Capture (`src/lib/voiceRecorder.js` + a composer control)

A small state machine over `MediaRecorder`, kept out of React so it is unit
testable: `idle → requesting → recording → (locked) → stopped(blob,ms) |
cancelled`.

- **Mic**: `getUserMedia({ audio: true })`. HTTPS is a given (production and the
  dev server both serve it), so the installed PWA can prompt for the mic.
- **Format negotiation**: `MediaRecorder.isTypeSupported` picks the first of
  `audio/webm;codecs=opus` (Chrome/Android) then `audio/mp4` (iOS Safari records
  AAC in an mp4 container). The chosen type decides the upload extension and
  content-type. ⚠️ **This is the single biggest portability risk** and must be
  proved on a real iPhone, not only in tests — Safari's `MediaRecorder` landed
  late and still differs (container, and historically flaky `ondataavailable`).
- **Five-minute cap**: a timer stops the recorder at 300 s and sends what it has.
- **Level meter**: an `AnalyserNode` off the same stream drives the recording
  waveform; its samples are discarded (v1 does not persist a waveform — see
  Playback).

### The WhatsApp gesture (and its fallback)

The composer's mic button uses pointer events: press starts recording; drag
**left** past a threshold cancels (bin icon highlights); drag **up** past a
threshold **locks** (recording continues hands-free with a Stop button);
release, when not locked, sends. A timer and level meter show throughout.

⚠️ **The gesture is the risk area on a touch PWA, iOS especially** (pointer
capture, `touch-action`, and the OS reclaiming a long press). **Fallback,
specified now so it is a decision not a scramble:** if the hold gesture proves
unreliable on a real device, degrade to **tap-to-start / tap-to-stop** with an
explicit Cancel and Send — same recorder state machine, a different trigger.
Parity is the target; a voice note that reliably records beats a faithful
gesture that sometimes loses the audio.

## Playback (`src/components/ChatAudio.jsx`)

Rendered by `ChatBubble` in place of `ChatPhoto` when `isAudioAttachment(path)`:

- Play/pause, a scrubber with a draggable play head, elapsed / total duration,
  and a **1× / 1.5× / 2×** speed toggle (`audio.playbackRate`).
- An **unplayed** dot on incoming notes until first played (per viewer, local —
  no receipt table; `localStorage` keyed by message id, best-effort).
- Adapts to the mine/their bubble colours, like `PollBubble`.
- **Waveform**: v1 draws a lightweight bar track as the scrubber (a fixed set of
  bars filling with progress), **not** a per-note amplitude waveform. A true
  precomputed waveform needs the samples stored or the blob decoded via Web
  Audio on load; that is the one place we knowingly fall short of pixel-parity in
  v1, called out so it is a choice. Enhancement path: capture amplitude buckets
  while recording and thread them through (needs a place to store them — a
  `attachment_meta jsonb` column, deferred).

## UI wiring (mirrors the polls wiring)

- `ChatBubble`: branch the existing `photoPath` slot — audio → `<ChatAudio>`,
  else `<ChatPhoto>`.
- Both composers (`ChannelThread.jsx`, `DmThread.jsx`): the mic control replaces
  the send button when the draft is empty (WhatsApp), sitting beside the photo
  and poll buttons; a recording overlay (timer, meter, cancel/lock); a recorded
  preview (play + duration + delete + send) before it goes.
- Both thread hooks (`useDmThread`, `useChannelThread`): a `sendVoice(blob, ext,
  ms)` that uploads then posts the message with the `attachmentPath`, reusing the
  photo send path. No poll-style realtime needed — a voice note is one immutable
  message, already covered by `subscribeMessages`.
- Chat-list / notification preview: when the attachment is audio and the body is
  empty, show **"🎤 Voice message"** (the photo path shows "📷 Photo").

## Testing

- **DB / storage**: the RLS is unchanged, so the existing chat-round-2 attachment
  coverage (`db/tests/chat-round-2.sql`) already proves an attachment is
  readable exactly where its message is. Add a focused check that the widened
  bucket **accepts an audio mime and still accepts an image**, and that the
  10 MB limit holds — proving the config change, against production, rolled back.
- **Vitest**: the recorder state machine (idle→recording→stopped/cancelled, the
  300 s auto-stop, format negotiation via a mocked `MediaRecorder`), the upload
  call shape, `isAudioAttachment`, duration formatting, the `ChatAudio` controls
  (play/pause/seek/speed, unplayed dot), and the "🎤 Voice message" preview.
  ⚠️ Tests mock `MediaRecorder`/`getUserMedia`; **they cannot prove iOS capture**
  — that is a real-device step in the plan, not a green suite.

## Sequencing to live

1. Apply `db/migrations/20260828_chat_voice.sql` (bucket widen) to **production**
   first — uploads reject until the mime/size are widened.
2. `npm test` + `npm run db:check` green; **and a real-iPhone capture test**.
3. PR, diff shown to Jay (`main` is production), merge → deploy.
4. Verify live: record and play a note on the deployed site, on Android **and**
   iOS.

## Known limitations (v1, YAGNI)

- No per-note amplitude **waveform** (a bar-scrubber stands in) — needs stored
  samples; deferred with an `attachment_meta` column.
- **Unplayed** state is per-device `localStorage`, not a receipt — it will not
  follow you across devices. Acceptable; a receipts table is out of scope.
- No transcription, no expiry, no forwarding of a voice note as anything but its
  object (forwarding copies the `attachment_path`, same as a photo).
- Duration shows "--:--" for the moment before metadata loads on a slow link.
