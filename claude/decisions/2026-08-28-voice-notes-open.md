# Voice notes are open, like WhatsApp — capped at five minutes

**Jay, 28 Aug 2026**, settling the question the chat-photos ruling deliberately
left open. Design: `claude/plans/2026-08-28-voice-messages.md`. Offered three
postures — open like WhatsApp, adults/staff spaces only, staff-post-only — and
three length caps; he chose **open** and **five minutes**.

## The rulings

1. **Anyone who can write in a chat can send a voice note there** — squad
   channels, staff channels, the club channel, DMs, groups. No per-space
   carve-out, no staff gate. Same posture as
   `claude/decisions/2026-08-24-chat-photos-open.md` and
   `claude/decisions/2026-08-24-groups-open-no-warnings.md`.
2. **A voice note runs at most five minutes.** Enforced at the recorder (it
   stops itself) and again at the bucket's `file_size_limit`, so a hand-crafted
   over-length upload is refused by storage, not merely by the UI.
3. **The safety valve is the report → welfare loop, which now *listens*.** A
   reported voice note reaches the same welfare queue a reported text or photo
   does; the difference is the officer plays it rather than reads it. The
   `chat-media` bucket stays private and readable only by people who can read
   the message; the author may delete (which deletes the object).

## The reasoning — and the argument against, which is real

⚠️ **This ruling knowingly crosses the line the photos ruling drew.** Chat photos
declined *documents* for one stated reason: *"photos can be moderated by looking
at them; files cannot."* **A voice note is a file in exactly that sense** — a
welfare officer cannot glance at a report and see what a two-minute note
contains; they must sit and listen to the whole thing. So voice sits on the
*declined* side of the photos line, and this ruling overrides that on purpose.

Why it was overridden:

- The club **already** sends voice notes on its squad WhatsApp groups, with no
  private storage, no author-visible delete, no report loop and no welfare
  oversight. This does not create voice-note sharing at the club — it moves what
  already happens onto strictly better rails, the same argument that carried
  photos.
- The un-glanceable cost is bounded, not eliminated: the **five-minute cap** is
  the concession that keeps a reported note reviewable in minutes rather than
  in an afternoon. That cap is the price of openness, and it is why "no cap /
  full WhatsApp parity" was declined.

### If this ever has to be walked back

The escape hatch, cheapest first: **shorten the cap**, then **restrict to
adults/staff spaces** (voice allowed only where no minor reads — staff channels
and adult-only DMs/groups), then **staff-post-only**. Each was offered on 28 Aug
and declined for parity; each remains a one-policy change because the storage
and RLS are unchanged by the posture (see the plan). **If a complaint about a
voice note ever lands, reread this section first.**

## What this deliberately declined (v1)

No cap beyond five minutes, no transcription (an automated transcript would be a
second un-verified artifact, not moderation), no per-space restriction, no
disappearing/expiry. Photos and text are unchanged. Polls
(`claude/decisions/2026-08-27-chat-polls-open-visible.md`) are a separate
feature and unaffected.
