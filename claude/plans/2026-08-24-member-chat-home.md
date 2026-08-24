# The member chat home — the Chats list, finished

**Status: NOT SHIPPED — spec agreed 24 Aug 2026 (evening), building now.**

The design is the "Member chat home" artboard on the Chat Dashboard canvas
(session artifact, 24 Aug 2026), which Jay picked for building after group
chats shipped. UI-only: `public.my_chats()` already returns everything this
screen needs, and **no database work is in scope**.

## Why

The Chats list shipped 24 Aug as one flat card of rows. The mockup Jay chose
gives the same data a home shape: what needs you at the top, the club's voice
as a hero, and the rest grouped the way people think about it — squads, then
conversations.

## What changes (`src/screens/ChatList.jsx` only, plus tests)

1. **An unread strip** under the search box: the red count disc and
   "unread in N chats", summing `my_chats()` rows. Rendered only when the
   total is above zero — no zero-state furniture.
2. **The club channel becomes a hero card** above the sections: gradient
   monogram disc with a megaphone, label, preview, time, and two condensed
   pills — "Announce-only" (only while the channel actually is; it reads
   `detail`) and "Pinned". Still a link to `/chat/club`.
3. **Two titled sections** using the shipped editorial `BlockTitle`
   (red slash + gradient rule): **Your squads** (squad + staff rows) and
   **Direct messages** (DM + group rows). Each is a Card of the existing row
   markup, unchanged. An empty section renders nothing — no empty-state cards.
4. **Search is untouched**: while a query is active the list renders exactly
   as today — one flat card of matches, hero and sections suppressed. The
   pencil, pickers, row markup, previews and unread badges are all unchanged.

## Not in scope

Coach squad view and welfare overview boards (unbuilt directions on the same
canvas), any `my_chats()` change, any new screen. The mockup's masthead and
tab bar are the app shell, not this screen.

## Tests (`tests/chat-home.test.jsx`)

Mocked `listChats` rows covering all five kinds. Assert: the strip sums
unread correctly and is ABSENT at zero unread; the club row renders as the
hero (and not again among plain rows); both section titles render; a search
query removes the section titles and hero and flattens to matches — the
existing `chat-list.test.jsx` keeps every intent (each kind routes to its
thread, previews, unread badges, search, the pencil) with its order/grouping
assertions updated to the new shape — the redesign changes the shape on
purpose, so the pins move with it.
