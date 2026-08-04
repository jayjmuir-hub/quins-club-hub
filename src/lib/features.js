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
  // RSVP / availability tracking (Task 16). Turned off 2026-07-29 — the
  // club decided it isn't ready to rely on digital RSVP yet. This only
  // hides EventDetail.jsx's two entry points: the availability summary bar
  // and the "set availability" button. src/screens/Availability.jsx, the
  // `availability` table, its RLS policies, and the realtime subscription
  // are untouched and still covered by tests/availability.test.jsx.
  //
  // claude/runbooks/e2e-roles.md's Availability/RSVP-realtime sections and part of
  // tests/schedule.test.jsx assume this is on — both say so inline. Flip
  // this back to true to re-enable, no other change needed.
  availability: false,
}
