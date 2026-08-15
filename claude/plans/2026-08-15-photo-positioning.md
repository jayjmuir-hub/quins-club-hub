# Photo positioning — drag and drop, and where the face is

**STATUS: PHASES 1-4 SHIPPED, PLUS PHASE 4b — WITHOUT WHICH NONE OF THE OTHER
FOUR DID ANYTHING VISIBLE.** Only PHASE 5 — what to do about the 1:4 lead
tile — remains, and it is Jay's call rather than a build.

⚠️ **THIS PLAN HAD NO RENDER PHASE, AND THAT IS THE WHOLE STORY OF THE BUG
BELOW.** Every phase is about CAPTURING the focal point — the picker, the
column, the write path, the admin route — and each one shipped, was tested and
worked. Nobody wrote down "and then the tiles draw it", because it reads as too
obvious to be a step. It was the only step that was missing, and the feature was
declared complete without it. **A plan whose phases all end at the database
needs a phase that ends at the screen.**

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

## Phase 3 — wire the existing fields (staff done, players not)

✅ **`MyPhotoField` (More, staff self-serve)** has a drop zone and the
positioner. ⚠️ **Positioning is a SECOND action, not part of the upload** — the
upload here is immediate and its ordering is argued for at the top of that file
for reasons that have nothing to do with where a face is, and `set_my_photo_focus`
is a separate RPC for the same reason.

⚠️ **THE FOCAL-POINT RESET IS BEST-EFFORT AND OUTSIDE THE ROLLBACK, AND THE
EXISTING TEST IS WHAT FORCED IT.** Awaited inside the upload's `try`, a failure
would land in the `catch` and DELETE A PHOTO THAT HAD ALREADY SAVED — turning a
cosmetic problem into data loss. A stale focal point is the lesser harm by a
wide margin.

⚠️ **AND THE "Add a photo" BUTTON WAS REMOVED, NOT KEPT ALONGSIDE THE DROP
ZONE.** Rendering both gave two controls with the SAME accessible name doing the
same thing — a duplicate to a screen reader, and caught by a test as "Found
multiple elements with the role button".

✅ **`PhotoField` (PlayerForm, MyPlayerForm)** has the drop zone and the
positioner too.

⚠️ **NOTHING SAVES ITSELF THERE, AND THAT IS THE POINT.** `focus` is the
surrounding form's state exactly as `file` and `removed` already were, because
the FORM decides when any of it reaches the database — the property that stops
an abandoned form leaving an orphaned photograph of a child in the bucket.

⚠️ **THE TWO PARENT FORMS SAVE IT DIFFERENTLY, MIRRORING HOW THEY ALREADY SAVE
THE PATH.** `PlayerForm` (coach, admin) carries both columns in ONE `upsertPlayer`,
so there is no window where a photo has a position chosen for the previous one.
`MyPlayerForm` (a parent) has no such reach and makes a second call to
`set_own_player_photo_focus`, scoped by `private.is_own_player` — following the
route its photo already takes rather than inventing a third place for the rule
to live.

⚠️ **AND THE "Add photo" BUTTON STAYS HERE**, unlike the staff card where it was
removed. That card had no other control, so its button and drop zone were
duplicates by accessible name; this one sits beside Change/Remove, whose labels
differ.

Four call sites, and they do not behave the same today:

- `MyPhotoField` (More, staff self) — **uploads immediately**, because there is
  no form to defer to.
- `PhotoField` (PlayerForm, MyPlayerForm) — **defers to the form save**, so
  abandoning the form leaves no orphaned photograph of a child in the bucket.

⚠️ **THAT DIFFERENCE IS DELIBERATE AND MUST SURVIVE.** Both files argue for it in
their own headers. The picker is shared; the upload timing is not.

## Phase 4 — admin acting for staff ✅ shipped 15 Aug 2026

A photo control on every `/admin/staff` row: drop zone, positioner, save.

⚠️ **IT REQUIRED REVERSING A RULING, TWICE.** Staff photos were own-photo-only;
Jay overruled that, and then widened it again to match the player-photo rule
after *"just like teamsnap, sometimes photos need to be uploaded by staff when
parents forget"*. `claude/decisions/2026-08-15-admin-may-set-staff-photos.md`.

⚠️ **`uploadStaffPhoto` NEEDED NO SIBLING.** It already took a profile id and
built the key from it — what blocked an admin was the STORAGE POLICY, not the
client. Worth remembering before writing a parallel function for the next case.

⚠️ **THE SIGNED URL IS RE-FETCHED AFTER SAVING.** `staff-photos` is private, so
the RPC returns only the key; reusing the local object URL would show the right
face until the next reload and then break.

## Phase 4b — the renderers actually read it ✅ shipped 15 Aug 2026

The phase this plan forgot. `SquadStaffCard` (Home) and `PlayerAvatar` (roster,
dashboard, detail hero) drew `object-cover` with no `object-position`, so every
crop was centred whatever anybody chose. Jay found it on a real head coach:
*"like it isn't adjusting the photo in the pill at all"*.

⚠️ **THREE LAYERS, AND FIXING ANY TWO CHANGES NOTHING.** `my_squad_staff()` did
not return the columns; `listMySquadStaff` did not map them; the tiles did not
apply them. The RPC is the one that is not obvious: it is SECURITY DEFINER with a
fixed column list *precisely* so a parent cannot read another member's `profiles`
row, so there is no client-side `select` to widen — a missing column there is a
migration (`db/migrations/20260815_my_squad_staff_focus.sql`), and adding one
means a DROP, which loses every grant and hands `anon` EXECUTE back.

⚠️ **THE ADMIN SCREEN WORKED THROUGHOUT, WHICH IS WHY THIS SURVIVED.**
`/admin/staff` reads `profiles` directly and previewed the point correctly, so
the natural check after saving showed the feature working. **The screen that
proves a photo feature is the one a parent sees, not the one that saved it.**

⚠️ **AND `PHOTO_SHAPES` IS NOW LOAD-BEARING RATHER THAN DECORATIVE.** The preview
and the real tiles share one `focusToObjectPosition`, so a preview that lies can
now only lie about the SHAPE. Re-measure it when the tile layout changes.

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
