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

// ⚠️ jsdom TESTS USED TO OPEN REAL WEBSOCKETS TO THE LIVE SUPABASE PROJECT.
// Five screen suites (app-shell, dashboard, dashboard-availability,
// name-prompt, parent-self-registration) render components that subscribe to
// realtime without mocking it, and jsdom's WebSocket is undici's — a genuine
// network client. Every `npm test` run therefore connected to production, and
// the only visible symptom was 5–7 "Unhandled Errors" from undici
// (`The "event" argument must be an instance of Event`) on a suite that still
// exited 0, which is why nobody looked (claude/open-items.md, measured
// 23 Aug 2026).
//
// This stub replaces jsdom's WebSocket with one that never connects: realtime
// subscriptions sit in CONNECTING forever, which every screen already
// tolerates (a subscription that hasn't delivered yet is indistinguishable
// from a quiet channel). No test constructs a WebSocket itself — checked, the
// matches in tests/ are all comments — and the node-environment files are
// untouched because this whole branch is jsdom-only. supabase-js only checks
// that the global EXISTS at import time, so replacing (not deleting — see
// vite.config.js on `delete globalThis.WebSocket`) keeps that contract.
if (typeof window !== 'undefined') {
  class QuietWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    constructor(url) {
      this.url = String(url)
      this.readyState = QuietWebSocket.CONNECTING
      this.onopen = null
      this.onclose = null
      this.onerror = null
      this.onmessage = null
    }
    send() {}
    close() {
      this.readyState = QuietWebSocket.CLOSED
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return false
    }
  }
  globalThis.WebSocket = QuietWebSocket
  window.WebSocket = QuietWebSocket
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

// jsdom implements window.scrollTo no further than a "Not implemented"
// console error. The chat screens land on the newest message by scrolling
// the window to the document end, so every suite that renders one would
// print that error per load. Stubbed globally for the same reason as
// createObjectURL above: a jsdom gap, not a property of any one suite.
// Tests that care replace it with their own spy (tests/app-shell.test.jsx,
// tests/chat-open-view.test.jsx).
if (typeof window !== 'undefined') {
  window.scrollTo = () => {}
}

beforeEach(() => {
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    // Some environments refuse storage access entirely. Nothing to clear.
  }
})

// ⚠️ NO TEST TALKS TO A REAL SUPABASE HOST. Same class of fix as the
// QuietWebSocket above, one layer down: jsdom's fetch and the node-env files'
// native fetch are genuine network clients, and a component whose data module
// is not mocked makes a genuine request. Locally that reached the LIVE
// project — measured 30 Aug 2026 on the Supabase dashboard as a steady
// stream of 401s with a `node` user-agent and stub fixture ids in the
// filters, traced to a long-lived vitest process. RLS refused everything, so
// the cost was production noise, not disclosure; it is still production
// traffic from a test suite.
//
// This wrapper rejects any fetch whose host ends in .supabase.co, instantly.
// An unmocked data module now takes its `.catch`/error path at once — the
// same observable behaviour the live 401 produced, minus the network. It
// promises nothing else: per the 11 Aug note below, a global guard cannot
// reliably surface an EXPLANATORY failure (components swallow the rejection),
// so this one does not claim to. It only keeps the suite off the network.
//
// The integration run (VITEST_MODE=integration) is exempt — hitting the live
// project is that suite's entire job, and it says so at the top of its file.
if (process.env.VITEST_MODE !== 'integration' && typeof globalThis.fetch === 'function') {
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = (input, init) => {
    let host = ''
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input)
      host = new URL(url, 'http://localhost').hostname
    } catch {
      // Unparseable input: let the real fetch produce its own error.
    }
    if (host === 'supabase.co' || host.endsWith('.supabase.co')) {
      return Promise.reject(
        new Error(`test tried to reach ${host} — mock the data module this component imports`),
      )
    }
    return realFetch(input, init)
  }
}

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
