# Photos keep their shape, and the positioner becomes one honest circle

**STATUS: NOT YET SHIPPED — being built on `claude/photo-pipeline`.**

Jay, 26 Aug 2026, three observations in one conversation:

> send pics in chat doesn't seem to work as well as whatsapp, why not?

> and the ios pic issue?

> we need to have a new look at the profile pic focus circle, do we need all
> those different size looks now? can't we have a simple one size view and
> slide the photo around in the focus circle to see what will be visible?

Investigation showed the three are one problem wearing three hats.

## What is actually wrong

1. **Every upload path runs the HEAD-SHOT resizer.** `resizePhoto`
   (`src/lib/imageResize.js`) centre-crops to a 600×600 square — right for a
   roster avatar, wrong for a landscape team photo in chat (both ends chopped)
   and wrong as the *input* to a focal-point picker (the edges are discarded
   before anybody positions anything).
2. **The 5 MB check runs BEFORE the resize** (`src/data/chatMedia.js`), so the
   5–8 MB files modern phones produce are refused even though the resizer one
   line later would have made them tiny.
3. **iPhones shoot HEIC.** The picker usually converts silently, but a HEIC
   arriving via the Files app or AirDrop hits `ALLOWED_TYPES` and is refused
   as "not a photo" — while Safari could have decoded it and our re-encode
   would have output JPEG anyway.
4. **The positioner previews shapes that no longer exist.** `PHOTO_SHAPES`
   (1:4 "Featured", 1.9:1 "Tile") was measured from the 15 Aug SquadStaffCard
   tile layout. That layout was replaced; every real surface today is 1:1 —
   circles (StaffAvatar 44/28px) or rounded squares (PlayerAvatar 32–112px).
   The 2026-08-15 plan's own rule — *re-measure when the tile layout changes,
   a preview that lies is worse than no preview* — was broken by nobody
   noticing.
5. **Consequence of 1 + 4 together: positioning is currently a no-op.** A
   square (post-crop) photo in a square avatar has no overflow, so
   `object-position` moves nothing. The picker only *appears* to work because
   its stale non-square previews respond.

## The design

### A second resize mode: keep the shape

`resizePhotoFit(file)` in `src/lib/imageResize.js`: preserve aspect ratio,
downscale so the longest edge is ≤ 1600px, re-encode JPEG at the existing
quality. ~200–400 KB out. The square `resizePhoto` stays for nothing — all
five upload paths (chat, staff self, admin-for-staff, player, own player,
social ideas) switch to fit — but the function itself is kept until the last
caller is gone, then deleted in the same PR.

**Failure contract differs from the old one, deliberately.** `resizePhoto`
falls back to the original on any failure; that is safe for JPEG/PNG/WebP
(displayable anyway) and WRONG for HEIC (half the club's phones cannot render
it). `resizePhotoFit` returns `null` on failure; the caller decides:
displayable original → upload it as before; HEIC → refuse with a message that
tells the person what to do ("Could not read that photo — try saving it as a
JPEG first").

### Upload gates, reordered

In `chatMedia.js` and both photo upload functions in `photos.js` (and
`socialIdeas.js`):

1. Type gate FIRST, widened: JPEG, PNG, WebP, **HEIC/HEIF** (`image/heic`,
   `image/heif`), matching `accept` on every picker input.
2. **Resize second.**
3. **Size gate LAST, on the output** (5 MB, the bucket limit). A resized
   photo virtually never trips it; an un-resizable original still can, and
   the message stays accurate.

### The positioner: one circle, slide the photo

`PhotoPositioner` keeps its drop zone, file input and focal-point storage
(two percentages — **no schema change, no renderer change**) and replaces the
stage + three-preview strip + safe-zone window with:

- One fixed circular viewport (~240px), the photo inside at `object-cover`
  with `object-position` driven by the stored focus — exactly the code path
  every real avatar uses, which is what makes the preview honest.
- Drag moves the PHOTO, not a marker: dragging left slides the photo left,
  i.e. focus moves right — the WhatsApp/Instagram gesture. Only the long
  axis can move (the short axis has no overflow under `object-cover`); a
  square photo cannot move at all, which is now truthful rather than broken.
- Drag maths: for photo aspect `p` in a 1:1 viewport of side `S`, the
  overflow is `S·(p−1)` horizontally when `p>1`, `S·(1/p−1)` vertically when
  `p<1`; `Δfocus = −Δpx / overflow × 100`, clamped 0–100.
- `PHOTO_SHAPES` and `safeZone`/`safeWindow` are deleted with their tests.
  Tombstone comment records why (stale shapes; the 1:1 world).

### Zoom: deliberately NOT built

Examined 26 Aug 2026 and deferred, with Jay's agreement, because it is a
third stored value (migration, new RPCs), a transform every one of ~6 render
sites must apply identically (the Phase-4b three-layers lesson), and clamp
maths in the component's historically bug-prone area — while slide-plus-full-
photo covers the common case. **Adding it later is purely additive** (null
zoom = no zoom); nothing shipped here gets reworked. Do not build it without
evidence from real uploads.

### What existing data does

- Stored focal points: still valid, still percentages, unchanged meaning.
- Existing photos: already square (the old crop is baked in), so sliding
  does nothing for them until the person re-uploads. Acceptable; nothing
  breaks, and the picker being inert on a square photo is the truth.
- Chat display (`ChatPhoto`) already handles non-square: `max-h` thumbnail,
  `object-contain` overlay. No change.

## Testing

- `resizePhotoFit`: aspect preserved, long-edge cap, `null` on failure
  (discriminates against the old fall-back-to-original contract).
- Gate order: a >5 MB JPEG that resizes small is ACCEPTED (fails against the
  old order); an unreadable HEIC is refused with the save-as-JPEG message; an
  unreadable oversized JPEG still gets "too large".
- Positioner: drag left on a landscape photo increases focus x (inverse
  contract, discriminates against marker-drag); square photo drag is a no-op;
  vertical drag on landscape is a no-op; focus still round-trips to
  `object-position`.
- jsdom gives zero-sized rects, so drag tests mock `getBoundingClientRect`;
  the Chromium harness scenario (`photo-positioner`) is updated to match the
  new single-circle stage — it remains the only place the real geometry is
  seen.
