import '@testing-library/jest-dom'
import { beforeEach } from 'vitest'

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
