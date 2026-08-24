# The floating chat dock — chat beside your work, on desktop

**Status: NOT SHIPPED — direction picked and spec agreed 24 Aug 2026
(evening), building on branch `claude/chat-round1`'s successor.**

Jay's feedback items "i want the main chat interface to float over the screen
when opened" and "floating chat button accessible from every page", answered
by **Option A — the dock** on the Chat Dashboard design canvas (picked over
the full-height drawer, 24 Aug). Round-2 item from
`claude/plans/2026-08-24-chat-feedback.md`.

## Shape

- **Desktop only** (the `desktop:` breakpoint). The phone keeps its tab bar —
  chat is already one thumb-tap away there, and a floating bubble would sit
  on top of the composer.
- **A chat bubble bottom-right of every page except `/chat` routes** (the
  full page IS chat there). Carries the existing unread dot —
  `useDockBadges().chat`, already computed in `AppShell` for the mobile dock;
  no new queries while closed.
  ⚠️ **Merge AFTER PR #367** (Help leaving the corner for the AccountMenu,
  `claude/plans/2026-08-24-help-into-account-menu.md`) — the corner belonged
  to the floating Help button, which ate the dock's clicks until the two
  sessions coordinated on 24 Aug. Expect a trivial AppShell import/render
  conflict with #367 whichever merges second.
- **Click → a compact panel (~380×560) over the content**, dark-chrome
  header, two states:
  - **List**: the same `my_chats()` rows as the Chats screen, compact,
    scoped by the same effective-membership filter (exported from
    `ChatList.jsx` so the two cannot drift). Search omitted — the dock is
    for the top of the list; the full page has search.
  - **Thread**: any row opens IN the panel. DMs and groups get the full
    behaviour (stream, composer, mark-read, "New" divider not required
    v1). Channels get stream + composer; the database's announce-only
    refusal shows as the error, which is honest. No fixture threads,
    mentions, pins, read-stats or reports in the dock — the header's
    "expand" icon deep-links to the real screen for all of that.
- The panel stays mounted across navigation (it lives in `AppShell`), so a
  half-written message survives moving from Roster to Schedule.
- No new database anything. Every read and write is an existing data
  function.

## Out of scope (deliberately)

Mobile, reply-quotes/forward/emoji (their own round-2 items), a second
"minimized with unread count" pill state, drag-to-move.

## Tests

`tests/floating-dock.test.jsx`: the bubble renders with the badge dot and is
absent on `/chat` routes; opening lists the mocked rows (scoped); a DM row
opens the thread in-panel and send calls `sendDirectMessage`; the expand icon
navigates to `chatPath(row)`; close returns to the bubble.
