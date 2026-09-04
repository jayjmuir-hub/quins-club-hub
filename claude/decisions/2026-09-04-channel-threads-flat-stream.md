# Channel chat is a flat stream — a reply is a message with a quote — 4 Sep 2026

**Status: shipped in #693.** `src/data/messages.js` (the loaders and the
`parent` embed), `src/lib/useChannelThread.js` (`replyTo`, `focusId`,
`liveFixtures`), `src/components/MessageRow.jsx`, `src/components/ChannelThread.jsx`,
`tests/channel-flat-stream.test.jsx`.

## The ruling, in Jay's words, in order

The day started with a live report: the chat list's preview for the Age Group
Managers channel showed a new message, and opening the channel did not. The
message was a **reply**, folded behind an 11px "1 reply" toggle under the
second-to-last post. Three rulings followed in one afternoon:

1. *"people shouldn't have to click the 1 reply or whatever number to see it,
   like me people will be confused"* — so a first rework unfolded the threads
   permanently.
2. *"i don't really like the threads getting moved up the chat like that"* — a
   reply that appears under an old post is still up the history, not where a
   new message belongs.
3. *"so replies to a message will look like normal replies to a message in
   whatsapp?"* — yes. That is the model.

**A squad, staff or role channel is one flat stream, oldest to newest. A reply is
a message at the foot, at its own time, wearing a quote of what it answers.**
Exactly as the DM and group screens already worked, and exactly as WhatsApp does.

## What "a fixture thread" means now (ideas 2 and 4, chosen from four)

A fixture post used to gather its replies under its card, which was the one place
the fold earned its keep — a coach reading "who has the bibs" for Saturday did not
want Tuesday's chatter in between. Jay asked how that survives a flat stream and
was offered four routes:

1. **The card as the quote.** A reply to the fixture post quotes the fixture's
   name; tap it to scroll to the card. Cheapest; a coach still scrolls past the
   other chatter.
2. **Tap to filter, never to fold.** As 1, plus a fixture card (or any quote of
   it) filters the stream to that fixture's messages, with a bar at the top
   saying so and offering "Show everything". Nothing hidden by default; the way
   back always on screen.
3. **A chat room per fixture.** Cleanest model, rejected: it multiplies the
   places a parent must check, the same ground on which a second club mailbox
   was refused (`claude/runbooks/m365-add-alias-to-shared-mailbox.md`).
4. **The card stays at the top until kick-off**, so the thing people are
   replying to is in view however far the chat has moved on.

**Jay chose 2 and 4.** The event screen's "N replies · Open the thread" link
(`?thread=<postId>`) now lands in the filtered view of that fixture; the reply
count it shows still comes from `parent_id`, which every reply keeps.

## What was removed, and where the bodies are

- The nested `Reply` component, the `replies: [...]` shape, the "N replies"
  toggle, `forceOpen`, and the reply form under a post — `MessageRow.jsx`
  header comment.
- The two-query loaders that nested replies — tombstone above `flatStream` in
  `src/data/messages.js`.
- #692, earlier the same day, which force-opened a folded thread holding an
  unread reply. Superseded within hours; tombstone in `ChannelThread.jsx`.

## Arguments against, so nobody re-argues them from scratch

- **A reply shows twice** if you filter to a fixture: once in the full stream,
  once in the filtered view. WhatsApp and Slack's "also send to channel" both
  accept that; a message nobody can find is worse than one shown twice.
- **A long announcement with thirty answers is thirty bubbles**, interleaved
  with everything else. True, and it is what every WhatsApp coach already
  lives with. Staff get their summary from the fixture card's RSVP tally and
  the read-stats, not from a gathered thread — and for a fixture they still
  have the filter.
- **Pin is for posts only.** A reply pinned on its own would lose its quote's
  meaning in the pinned block, so the menu no longer offers it on a reply.
- **A reply's parent that is hard-deleted** nulls `parent_id` (FK set null), so
  the reply becomes a plain message; a soft-deleted parent quotes as "Message
  deleted" without re-showing a word of it. Same rules as the DM quote.

## Announce-only consequence

Under announce-only a parent may not start a post, and until today their only
door was the fold's inline form. Now Reply — from a bubble's menu or the visible
Reply affordance under every post (2 Sep 2026, UX review High) — arms the quote
and **unlocks the foot composer for that one reply**, the same way picking a
fixture already did. Cancelling the quote re-locks it.
