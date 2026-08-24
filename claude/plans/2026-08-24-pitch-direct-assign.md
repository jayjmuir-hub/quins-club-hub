# Plan — click an event, give it a pitch

**STATUS: NOT YET SHIPPED — approved 24 Aug 2026, in progress.** Update on
merge.

## Why

Jay: "in pitch management, none of the events are clickable, can't click
them to assign a pitch." Diagnosed live: not a regression and not a
click-eating overlay (probed with elementFromPoint) — the events on
`/admin/allocation` never had a handler. The only allocation path was the
coach-initiated request queue, and the 5 Aug decision record already said
direct assignment was wanted and "nothing was built for it".

## What ships

1. **Every event on the Allocation screen is clickable** — the bookings in
   the day grid and the rows in "Waiting for a pitch". Clicking opens a
   Sheet: the fixture's name, a select of active pitches (preset to the
   current pitch when there is one), Save / Cancel.
2. **Saving writes `events.pitch` directly** — new `setEventPitch` in
   `src/data/pitchRequests.js`; RLS already restricts events UPDATE to
   admins and that squad's staff, so a refusal surfaces as the same
   "not yours to decide" error the queue uses.
3. **A pending request rides along.** If the event has a `submitted`
   request, saving goes through the existing `allocatePitch` instead, so
   the request is closed as allocated and the coach's flow stays truthful.
   Fixture first, request second — that ordering rule is allocatePitch's
   and is kept.
4. **PitchGlance stays read-only on purpose** — its own header says
   requests go through the fixture; it is the staff windowshopping view,
   not the management screen.

## Not in scope

- Removing a pitch from an event (nobody asked; Pitch TBD via the fixture
  form already exists).
- Drag-to-move between pitch rows.
