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
beforeEach(() => {
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    // Some environments refuse storage access entirely. Nothing to clear.
  }
})
