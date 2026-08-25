# Chat wallpapers grow into a gallery, and DMs lead the list

**Date:** 25 Aug 2026 · **Status: shipped with the pull request that adds this file**

Jay, after the chrome-free round: "we need better chat backgrounds" — ruled
down to **"too few choices"** (not too faint, not the wrong style, and NOT
per-chat: one wallpaper for all chats, on this device, as today). And in the
same breath: "DMs should always be at the top of the chat screen".

## What stays — the round-3 rulings survive intact

- **Presets only, no uploads.** Nothing a member posts can become someone
  else's wallpaper.
- **Device-level choice**, stored in localStorage under `chat-background`.
- **Every preset is a low-alpha overlay** painted over the theme surface —
  dark mode stays dark, light stays light, one definition each.
- **Inline SVG/CSS data URIs only** — no network, no asset store. The crest
  watermark is DRAWN (shield + quarters in SVG), not the crest PNG embedded;
  embedding the PNG in a data URI would bloat the bundle for a watermark.
- **Stored keys keep working**: `green` and `warm` stay valid keys (now the
  Green and Sand tints), so nobody's saved choice resets.

## The gallery — 17 presets in four groups

| Group | Presets |
|---|---|
| Colours | Plain, Green, Maroon, Sky, Sand (`warm`), Rose, Slate — flat ~10% tints |
| Gradients | Club colours (green→maroon diagonal), Dawn, Dusk, Pitch green — richer than the old washes (~14–16% at the strong stop) |
| Patterns | Club doodle (kept), Pitch lines, Hoops, Match balls — tiles at ~14–18% stroke, a touch bolder than the old 14% so they read as wallpaper |
| Club | Harlequins (the masthead's diagonal motif), Crest (drawn shield + quarters watermark) |

`BACKGROUND_PRESETS` gains a `group` field; `BACKGROUND_GROUPS` names the
four rows. `getChatBackground`/`setChatBackground`/`backgroundStyle` keep
their signatures — no caller changes for the mechanism.

## The picker becomes shared

The 4-swatch grid in the DM thread's ⋯ menu becomes
`src/components/ChatBackgroundPicker.jsx`: grouped rows with small labels,
same swatch buttons, current choice ringed. The thread swaps to it, and —
the bug-fix half — **Chat.jsx (squad/club/staff chat) gains the same menu
entry, the same picker, and actually PAINTS the wallpaper**, which it never
did despite the picker promising "for every chat". Same paint site as the
thread: the message-list wrapper, `data-background` for the tests.

## DMs lead the list

`ChatList` section order becomes **Direct messages → Your squads →
Archived**, and the filter chips reorder to match (All · Unread · Groups &
DMs · Squads). The sidebar's chat sub-items reorder the same way — the two
are driven by the same `?filter=` and must not disagree.

## Tests

- Preset table: unique keys, every non-plain preset carries a style and a
  group, `green`/`warm` still resolve (stored-choice compatibility).
- Picker: renders the four group labels, saves the choice.
- Chat.jsx: paints the chosen background (`data-background`), offers the
  menu entry.
- ChatList: DMs section renders before Squads; chip order matches.

## Arguments against, recorded

- **Per-chat wallpapers** (WhatsApp's full model): offered, declined — more
  setup and more to remember for a club app; the storage shape (one key)
  would need a per-conversation map. Reopen only if asked.
- **Real crest PNG as watermark**: rejected for bundle weight and the
  zero-request rule; the drawn shield keeps the idea at ~300 bytes.
- **Uploads**: not reopened. The round-3 safety reasoning stands.
