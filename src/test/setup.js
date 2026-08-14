import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

// ⚠️ EVERY KEYSTROKE IN THIS SUITE USED TO WAIT A TICK, AND IT WAS THE SINGLE
// BIGGEST THING THE TESTS SPENT THEIR TIME ON.
//
// user-event's default `delay` is 0, which still means an awaited macrotask
// between every character. On a suite that types into a lot of forms that is
// most of the wall clock. Measured 14 Aug 2026: tests/invite-form.test.jsx
// 11.8s -> 5.0s, and the whole suite at four workers (the shape of the CI
// runner) 78s -> 55s. All tests passed either way.
//
// ⚠️ IT IS SAFE HERE BECAUSE NOTHING IN THIS APP DEBOUNCES A KEYSTROKE, and
// that was checked rather than assumed: the only debounce in `src/` is the
// realtime subscription in src/data/events.js, which already takes an
// injectable `debounceMs` and is nowhere near an input. **If a debounced input
// is ever added, its test must pass its own `delay` and this comment is the
// reason why.**
//
// ⚠️ PATCHED IN ONE PLACE RATHER THAN AT 283 CALL SITES, deliberately. The
// alternative was editing every `userEvent.setup()` in 46 files, which fixes
// today's tests and silently loses the speed the first time somebody writes a
// new one the ordinary way. A caller who genuinely needs a delay still wins:
// their options are spread AFTER the default.
//
// ⚠️ IMPORTED CONDITIONALLY, AND A STATIC IMPORT HERE BREAKS THE SUITE. This
// setup file runs for EVERY test file including the ones that declare
// `@vitest-environment node`, and user-event reads `window.navigator` at import
// time to stub the clipboard. Importing it unconditionally fails those files
// with `Cannot read properties of undefined (reading 'navigator')` — pointing
// at a library nothing in that file uses. Caught by tests/test-timeout.test.js,
// which is the only node-environment file here and went red the moment the
// static import went in.
if (typeof window !== 'undefined') {
  const { default: userEvent } = await import('@testing-library/user-event')
  const setupWithoutDelay = userEvent.setup.bind(userEvent)
  userEvent.setup = (options = {}) => setupWithoutDelay({ delay: null, ...options })
}

// jsdom keeps ONE localStorage for the whole test file, so anything a screen
// persists survives into the next test in that file. Roster's team filter is
// the first such state (desktop-spec.md §10 decision 2 — the filter has to
// outlive a reload, or a coach re-filters on every visit), and without this
// clear, a test that clicks a team pill silently changes the starting state
// of every test after it. That surfaced immediately as three unrelated search
// tests failing with "no players rendered".
//
// Cleared globally rather than in the one suite that noticed, so the next
// screen that persists something doesn't have to rediscover this.
// jsdom implements neither URL.createObjectURL nor revokeObjectURL. Nothing
// noticed until a test finally exercised the photo picker: PhotoField creates
// a local preview URL for the chosen file, so choosing one threw inside an
// effect and React unmounted the whole tree — leaving an empty <body> and an
// error that says nothing about object URLs.
//
// Stubbed globally rather than per-file: it is a jsdom gap, not a property of
// any one suite, and the next test to touch a file input should not have to
// rediscover it. The identity is unique per call so a test can still assert
// that revoke was called with what create returned.
if (typeof URL.createObjectURL !== 'function') {
  let counter = 0
  URL.createObjectURL = () => `blob:jsdom/${++counter}`
  URL.revokeObjectURL = () => {}
}

beforeEach(() => {
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    // Some environments refuse storage access entirely. Nothing to clear.
  }
})

// ⚠️ UNIT TESTS MUST MOCK EVERY DATA MODULE THEIR COMPONENT IMPORTS.
//
// This is a working rule rather than an enforced one, and it has cost two
// rounds of CI failures. A screen test that renders a component whose data
// module is NOT mocked makes a genuine request. CI sets PLACEHOLDER Supabase
// env vars (see .github/workflows/test.yml), so the client constructs happily
// and then reaches for placeholder.supabase.co — and the environments differ:
// locally it fails fast and the component's `.catch` runs, in CI it does not,
// `Promise.all` never settles, and the screen sits in `loading`.
//
// The symptom is several copies of "unable to find an element", naming
// nothing, on a suite that is green on the machine that wrote it. Local green
// is not evidence, and the error points at the assertion rather than the cause.
//
// ⚠️ A GLOBAL `fetch` GUARD WAS TRIED HERE ON 11 Aug 2026 AND REMOVED AGAIN.
// It did make local behaviour match CI, but it did NOT surface the explanatory
// message it existed to give — the throw is swallowed by the component's own
// `.catch`, and the mechanism could not be pinned down. A guard whose comment
// promises a clear failure and delivers a silent one is worse than none, so it
// was taken out rather than shipped on a claim that could not be
// substantiated. Doing it properly is a real piece of work: it needs to
// intercept the client's transport, not the global.
//
// `tests/allocation.test.jsx` carries the worked example of the rule.
