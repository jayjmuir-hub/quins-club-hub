# Five photo chat wallpapers, crest letterhead default

**Date:** 25 Aug 2026 · **STATUS: ships with the pull request that adds this file**

Jay, 25 Aug 2026: land exactly five chat wallpapers. Crest letterhead is
the default on every chat (DM, group, squad/channel, club, floating dock)
unless they pick another. There is no `plain` preset.

## The five keys, in picker order

| Key | Label | Veil |
|---|---|---|
| `harlequin` | Harlequin (kit diamonds + crest bat) | 0.50 |
| `dusk` | Dusk (Zayed dusk photo) | 0.42 |
| `crest` | Crest (DEFAULT; cream paper, faded shield) | 0.22 |
| `doodle` | Club doodle (lighter than the others) | 0.46 |
| `kit` | Kit (green/red hoop fabric) | 0.52 |

Each paper is a covered, centered JPEG at `/chat-backgrounds/{key}.jpg`,
washed toward the theme surface:

`linear-gradient(rgb(var(--surface-rgb) / VEIL), rgb(var(--surface-rgb) / VEIL)), url(/chat-backgrounds/KEY.jpg)`

`--surface-rgb` (not a hardcoded grey) so dark mode stays dark.

## Fallback

`getChatBackground()` and `backgroundStyle(key)` resolve a known five-key
or `crest`. Old stored keys (`plain`, `green`, `warm`, `hoops`, `maroon`,
`sky`, `rose`, `slate`, `club`, `dawn`, `pitch`, `pitchlines`, `balls`,
`shield`, and any unknown) fall back to `crest`. localStorage key stays
`chat-background`.

## What stays

- Presets only, no uploads.
- Device-level choice, one wallpaper for every chat on this screen.
- The picker is a sheet (not an in-flow card). No group headings — just
  the five tiles.

The 17-preset SVG gallery in
`claude/plans/2026-08-25-chat-wallpapers-and-dm-order.md` is superseded
for the papers; its DM-first list half still stands.
