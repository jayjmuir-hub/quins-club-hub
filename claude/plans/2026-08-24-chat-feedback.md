# Chat feedback — Jay's first real test drive, 24 Aug 2026 (evening)

**Status: ROUND 1 SHIPPING (this branch); the rest NOT STARTED.** Seventeen
items from Jay testing chat on the live site the day group chats and the
member chat home shipped. Nothing here is invented; the phrasing is his,
trimmed. An item deleted from this list is a finding that ceases to exist.

## Round 1 — bugs and quick wins (this branch)

1. **View-as showed every squad's channel** — my_chats() answers for the real
   account; the list now scopes to effective memberships like every other
   screen. FIXED.
2. **Back button dead in a thread** — the transparent sticky masthead band
   (z-40) ate clicks on the pinned ChatHeader beneath it; the band is
   pointer-events-none now, its contents re-enabled. FIXED.
3. **Welfare "remove message" looked like it worked and didn't** — the
   database was proved innocent (rolled-back probe: admin deletes of reported
   channel and DM messages both succeed through RLS). The client's zero-row
   delete was silent; it now throws, and a missing joined message refuses
   loudly instead of "removing" nothing. MADE LOUD — if it recurs, the error
   will say why.
4. **Thread didn't stay at the newest message** — both thread screens now
   stick to the bottom as messages arrive, unless the reader has scrolled up
   into history. FIXED.
5. **Composer hides long messages** — textareas auto-grow to ~6 lines. FIXED.
6. **Enter to send, changeable** — device-level toggle on More → Chat;
   off by default (phones), Shift+Enter always a new line. FIXED.
7. **"You" on your own messages** — channel bubbles and DM/group bubbles.
   FIXED.
8. **Real timestamps** — message bubbles show the clock (today) or date +
   clock (older), club time. List rows stay relative on purpose. FIXED.
9. **Unread marker** — DM/group threads draw a "New" divider at the first
   unread message, captured before read-marking erases it. Channel bubbles
   already carried a per-message dot. FIXED.

## Round 2 — needs design or a ruling, in Jay's words

- "i want the main chat interface to float over the screen when opened" +
  "floating chat button accessible from every page" — a UX shift; mock on
  the design canvas first.
- "add attachments and pics to a chat" — squad-chat Phase 4. ⚠️ Reopens the
  photo-consent question for images of children; needs a ruling before code.
- "reply to with quotes for a message" (DMs/groups — channels already
  thread).
- "forwarding a message or multiple messages, click to add to forward
  multiple".
- "emojis" — an emoji picker button (typing emoji already works).
- "chat icon option in all coach, manager, etc pills" — tap a staff pill,
  land in a DM.

## Noted, no action

- Group chats and DMs behaved for the rest of the drive; the report → welfare
  → resolve loop worked end to end.
