# Photo positioning — drag and drop, and where the face is

**STATUS: PHASES 1 AND 2 SHIPPED — the picker, the columns and the write path,
all applied to production 15 Aug 2026. PHASES 3-5 NOT STARTED.**

Jay, 15 Aug 2026:

> when people upload a pic, they need a drag and drop in box and also a viewer
> preview thing they can move the photo around in to see how it will actually
> show on the site, what parts of the photo will really show up

and, separately:

> admin also needs to be able to add photos for staff accounts

Scope, confirmed the same day: **all** of it — staff self-serve, admin acting for
staff, and players.

## The ruling this plan turns on

⚠️ **STORE A FOCAL POINT, NOT A CROP.** The same photograph is rendered at three
very different shapes:

| Where | Shape | Measured |
|---|---|---|
| Squad-contact lead tile | ~1:4 strip | 175×712 at a six-person squad, 390px viewport |
| Half tiles | ~1.9:1 landscape | 256×136 |
| Collapsed squad header | circle | 28×28 |

A crop that frames a face in the tall tile is a sliver of forehead in the
landscape one. **There is no single crop that is right for all three**, so asking
a volunteer to draw one is asking them to be wrong twice. One focal point — "my
face is here" — drives `object-position` at every shape, including shapes that do
not exist yet, and nobody re-uploads when a layout changes.

⚠️ **AND THE PREVIEW IS THE FEATURE.** "What parts of the photo will really show
up" is answerable only by rendering the real aspect ratios and moving them as the
point moves. `PHOTO_SHAPES` in the component is measured from `SquadStaffCard`,
not invented — **re-measure it when the tile layout changes, because a preview
that lies is worse than no preview.**

## Phase 1 — the picker ✅ built

`src/components/PhotoPositioner.jsx`: a drop zone, a positioning stage, and live
previews at all three shapes. `tests/photo-positioner.test.jsx`, and the
`photo-positioner` harness scenario.

⚠️ **THE HARNESS SCENARIO IS NOT OPTIONAL HERE.** jsdom gives every element a
zero-sized box, so `getBoundingClientRect()` returns all zeros and every pointer
position collapses to the same answer — **the drag maths is exactly the part the
unit tests cannot reach.** Verified in Chromium instead, with a generated image
carrying a different colour in each corner: dragging to the top-left produced
`focus = 2% 2%`, and every preview moved to `object-position: 2% 2%`.

⚠️ **A phone has no drag.** The tap target is the primary route and the drop zone
is the enhancement. The file input is real, focusable and carries `accept`;
`isAcceptableImage()` exists because **drag-and-drop bypasses `accept` entirely**,
so without it the two routes into the same field would disagree.

## Phase 2 — the column and the write path ✅ applied 15 Aug 2026

`20260815_photo_focal_point.sql` and `20260815_photo_focus_write_path.sql`, both
applied to production. Two smallints per table with a range CHECK, not one text
column: the value is user-controlled and ends up in a style attribute, and two
integers cannot carry anything else. Null means centre, so nothing changed
visually.

⚠️ **PROVED THE CHECK BITES** rather than trusting the migration's success —
`update … set photo_focus_x = 999` inside a transaction raised `check_violation`
and the transaction was rolled back, so no real row moved.

⚠️ **NEW FUNCTIONS, NOT NEW ARGUMENTS.** `set_my_photo_focus` and
`set_own_player_photo_focus`, because defaulted parameters on the existing
functions would create an OVERLOAD and PostgREST resolves an RPC by the JSON keys
it is given — an existing call carrying only `_photo_path` would become
ambiguous. It also matches what a person does: repositioning should not require
re-uploading. Authorisation is copied from the function each sits beside, not
generalised.

⚠️ **AND `revoke … from public` DID NOT REMOVE THE `anon` GRANT.** Supabase's
default privileges grant EXECUTE to `anon` explicitly, and revoking from the
PUBLIC pseudo-role leaves that untouched — `proacl` still read `anon=X` after the
usual revoke/grant pair. **This repo's own advisor walk recorded that finding
hours earlier and it was reproduced anyway.** Fixed with an explicit
`revoke … from anon`; both RPCs now 404 to an anon key.

## Phase 3 — wire the existing fields (not started)

Four call sites, and they do not behave the same today:

- `MyPhotoField` (More, staff self) — **uploads immediately**, because there is
  no form to defer to.
- `PhotoField` (PlayerForm, MyPlayerForm) — **defers to the form save**, so
  abandoning the form leaves no orphaned photograph of a child in the bucket.

⚠️ **THAT DIFFERENCE IS DELIBERATE AND MUST SURVIVE.** Both files argue for it in
their own headers. The picker is shared; the upload timing is not.

## Phase 4 — admin acting for staff (not started)

`/admin/staff` has no photo path at all today. This is the one that actually gets
faces onto the site this season: **two of the club's fifteen staff have a photo**,
and most will not log in to fix that.

⚠️ **IT NEEDS A NEW RPC AND IT IS THE ONLY PART OF THIS PLAN THAT WIDENS WHO CAN
WRITE WHAT.** `set_my_photo` is self-only by design. An admin-for-staff path must
be its own function, checking `private.is_admin(club_id)` — not a relaxation of
the existing one.

## Phase 5 — the tall lead tile (not started, and it is Jay's call)

The lead tile is 1:4 at a six-person squad, which is a poor shape for a person
however well positioned. Options: cap the lead's row span (puts tiles back
underneath it, which is what `fix/squad-tile-alignment` removed), give the lead a
fixed aspect and let the right column overflow, or leave it.

## What this plan deliberately does not do

- **No cropping, ever.** See the ruling.
- **No image resizing or re-encoding on the client.** Worth doing — a 12MP phone
  photo is a slow upload on pitch-side data — but it is a separate concern with
  its own failure modes, and bundling it here would hide it.
