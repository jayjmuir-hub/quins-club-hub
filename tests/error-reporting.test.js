import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Error tracking, and the policy around it.
//
// ⚠️ WHAT IS WORTH TESTING HERE IS NOT "DOES SENTRY WORK" — that is Sentry's
// job and it needs a network and a DSN. It is the POLICY wrapped around it, all
// of which is ours and all of which fails silently if it is wrong:
//
//   - nothing loads or sends without a DSN, so the SDK chunk is never fetched
//     by a club that has not opted in;
//   - a failure INSIDE reporting can never make an error path worse, because
//     every caller is already handling a crash;
//   - the global handlers register exactly once, because StrictMode
//     double-invokes and a duplicate handler means duplicate reports;
//   - a failed <img> does not become an error report.
//
// The test seam is an injected reporter rather than a mocked `import()`, so the
// real SDK never enters the test run. See setErrorReporterForTests.

import {
  reportError,
  errorReportingEnabled,
  installGlobalErrorReporting,
  setErrorReporterForTests,
  resetGlobalErrorReportingForTests,
} from '../src/lib/errorReporting.js'

beforeEach(() => {
  setErrorReporterForTests(null)
  resetGlobalErrorReportingForTests()
})

afterEach(() => {
  setErrorReporterForTests(null)
  resetGlobalErrorReportingForTests()
})

describe('reportError — off by default', () => {
  // ⚠️ THE DEFAULT STATE OF THE APP TODAY. `VITE_SENTRY_DSN` is a build-time
  // variable and is unset, so this is not an edge case — it is production.
  it('is a no-op with no DSN and no reporter, and does not throw', () => {
    expect(errorReportingEnabled()).toBe(false)
    expect(() => reportError(new Error('boom'))).not.toThrow()
  })

  it('reports once a reporter exists', () => {
    const sent = vi.fn()
    setErrorReporterForTests(sent)

    expect(errorReportingEnabled()).toBe(true)
    const err = new Error('boom')
    reportError(err, { componentStack: 'at Thing' })

    expect(sent).toHaveBeenCalledWith(err, { componentStack: 'at Thing' })
  })

  // ⚠️ THE SINGLE MOST IMPORTANT ASSERTION IN THIS FILE. Every caller is already
  // on an error path, so a throw from here would turn "the app crashed and told
  // us" into "the app crashed twice and the second one is our fault".
  it('swallows a reporter that throws', () => {
    setErrorReporterForTests(() => {
      throw new Error('sentry is down')
    })

    expect(() => reportError(new Error('boom'))).not.toThrow()
  })
})

describe('installGlobalErrorReporting — the failures a boundary cannot see', () => {
  function fakeTarget() {
    const handlers = {}
    return {
      handlers,
      addEventListener: vi.fn((name, fn) => {
        handlers[name] = fn
      }),
    }
  }

  // ⚠️ AN ERROR BOUNDARY CATCHES RENDER ERRORS AND NOTHING ELSE. In an app that
  // is mostly Supabase calls, a rejected promise is the likelier failure — and
  // without this handler the lazy-load option would have bought error tracking
  // for the rarest kind of fault only.
  it('reports an unhandled promise rejection', () => {
    const sent = vi.fn()
    setErrorReporterForTests(sent)
    const target = fakeTarget()

    installGlobalErrorReporting(target)
    const err = new Error('network down')
    target.handlers.unhandledrejection({ reason: err })

    expect(sent).toHaveBeenCalledWith(err, { kind: 'unhandledrejection' })
  })

  // A promise can be rejected with anything at all — a string, undefined, a
  // Supabase error object. Sentry wants an Error, so one is made.
  it('wraps a non-Error rejection rather than dropping it', () => {
    const sent = vi.fn()
    setErrorReporterForTests(sent)
    const target = fakeTarget()

    installGlobalErrorReporting(target)
    target.handlers.unhandledrejection({ reason: 'just a string' })

    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(sent.mock.calls[0][0].message).toBe('just a string')
  })

  it('reports a genuine window error', () => {
    const sent = vi.fn()
    setErrorReporterForTests(sent)
    const target = fakeTarget()

    installGlobalErrorReporting(target)
    const err = new Error('threw in a handler')
    target.handlers.error({ error: err })

    expect(sent).toHaveBeenCalledWith(err, { kind: 'window.onerror' })
  })

  // ⚠️ `window.onerror` ALSO FIRES FOR A FAILED <img> OR <script>, where
  // `event.error` is null. Reporting those fills the project with "Script error"
  // noise from other people's ad blockers and phone networks — which is how an
  // error tracker becomes something nobody reads.
  it('ignores a resource load failure', () => {
    const sent = vi.fn()
    setErrorReporterForTests(sent)
    const target = fakeTarget()

    installGlobalErrorReporting(target)
    target.handlers.error({ error: null, target: { tagName: 'IMG' } })

    expect(sent).not.toHaveBeenCalled()
  })

  // ⚠️ REACT 18 StrictMode DOUBLE-INVOKES, and this is called from main.jsx.
  // Registering twice means every rejection reported twice, which looks like the
  // app failing twice as often as it does.
  it('registers its handlers exactly once', () => {
    const target = fakeTarget()

    installGlobalErrorReporting(target)
    installGlobalErrorReporting(target)
    installGlobalErrorReporting(target)

    expect(target.addEventListener).toHaveBeenCalledTimes(2) // unhandledrejection + error
  })

  it('does nothing on a target with no addEventListener', () => {
    expect(() => installGlobalErrorReporting({})).not.toThrow()
    expect(() => installGlobalErrorReporting(null)).not.toThrow()
  })
})
