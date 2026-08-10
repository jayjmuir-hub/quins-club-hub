// Feature flags for capabilities the app has already built but that the
// club isn't ready to switch on yet. Turning a flag off hides its UI entry
// points only — the underlying schema, RLS policies, data layer and
// component all stay in place, fully built and fully tested. Flipping a
// flag back to true requires no other change.
//
// Keep this file import-free and side-effect-free (same rule as
// src/lib/scope.js): it's read by components, not a provider, and it must
// stay trivially mockable in tests via `vi.mock('../src/lib/features.js', ...)`.

export const FEATURES = {
  // RSVP / availability tracking (Task 16).
  //
  // ✅ ON since 10 Aug 2026 — Jay's call, after asking "where is the
  // availability function?" twice. It was turned off 2026-07-29 because the
  // club was not ready to rely on digital RSVP; that reservation was about
  // the club's readiness, not about the feature, and it was his to withdraw.
  //
  // ⚠️ THIS FLAG IS NARROWER THAN IT SOUNDS. It hides EventDetail.jsx's two
  // entry points and nothing else: the availability summary bar and the
  // "set availability" button. src/screens/Availability.jsx, the
  // `availability` table, its RLS policies and the realtime subscription were
  // never switched off, and stayed covered by tests/availability.test.jsx the
  // whole time this was false.
  //
  // ⚠️ AVAILABILITY IS RSVP — THE INTENT. It is NOT attendance, which is the
  // FACT: a separate table, a separate screen (src/screens/Register.jsx), and
  // deliberately NOT behind this flag, because attendance shipped INSTEAD of
  // RSVP and one flag would have switched both on together.
  // `availability.status` is in/out/maybe, set BEFORE the event by the player
  // or parent. `attendance.status` is present/absent/excused, set AFTER it by
  // a coach. Do not compute either from the other: an "attendance %" that
  // reads availability reports who SAID they would come as who CAME.
  availability: true,
}
