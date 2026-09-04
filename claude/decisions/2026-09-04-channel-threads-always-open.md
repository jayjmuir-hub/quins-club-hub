# Channel threads are always open — 4 Sep 2026

**Status: shipped.** `src/components/MessageRow.jsx` (the note above `composing`),
`src/components/ChannelThread.jsx` (the tombstone in the stream loop),
`tests/message-row-replies-always-open.test.jsx`.

## The ruling

Jay, 4 Sep 2026: *"threads aren't a bad idea, but are they now open and viewable
all the time? people shouldn't have to click the 1 reply or whatever number to see
it, like me people will be confused."*

A reply in a squad, staff or role channel still sits under the post it answers.
It is no longer folded. The "N replies" toggle is gone. The only thing under a
post that still opens on demand is the inline reply **composer** — via Reply in
the chevron menu, the announce-only Reply affordance, or the `?thread=` deep
link — because a text box under every post would be noise.

## What it replaced, and why it went

Nested replies arrived with the first squad-chat build (23 Aug 2026, #326),
where a channel was announce-only by default and a reply under an announcement
was the only way a parent could speak. Folding them behind an 11px count was a
Slack habit, never a ruling; nothing in `claude/decisions/` chose it.

It failed live on 4 Sep. The chat list previews and counts the newest message in
a channel whether or not it is a reply (`my_chats()`), so a manager's Reply to
the second-to-last post was promised by the list and invisible in the chat. Jay
could not find it. Three people opened the chat and the app marked the hidden
reply read on arrival, so the badge cleared over a message nobody saw.

#692, earlier the same day, force-opened a thread holding an unread reply. It
helped only readers who had not yet opened the chat, and left everyone else one
tiny tap away. Superseded within hours; its hook in `ChannelThread.jsx` is a
tombstone and its test is deleted.

## Arguments against, so nobody re-argues them from scratch

- **A long announcement with thirty answers gets long.** True. WhatsApp coaches
  live with exactly that, and staff get the summary they actually use from the
  fixture card and the read-stats, not from a fold.
- **Flatten it entirely — WhatsApp has no threads.** Considered and rejected by
  Jay the same day: threads keep an answer next to its question, which a flat
  quote does less well when the question is three screens up. What went was the
  fold, not the thread.
- **A reply to an old post is still up the history, not at the bottom.** Still
  true, and stated to Jay before this was built. If it bites, the fix is to ALSO
  show the newest reply at the foot as a quoted bubble — a separate decision,
  and one that would show the same reply twice.

## Announce-only consequence

The Reply affordance under a post used to hide once the post had a reply, which
only made sense while the fold was the way in. It now shows under every post
whose composer is closed, answered or not — under announce-only the thread is a
parent's only door and it must always be visible.
