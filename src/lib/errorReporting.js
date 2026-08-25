// Error tracking — loaded only once something has already gone wrong.
//
// Closes the last open half of the 13 Aug 2026 readiness audit's "no
// monitoring, alerting or error tracking" item. `claude/runbooks/monitoring.md`
// set out three options and Jay picked this one.
//
// ⚠️ SENTRY IS NEVER IN THE MAIN BUNDLE, AND THAT IS THE WHOLE POINT OF THE
// SHAPE OF THIS FILE. `@sentry/react` is about 25-30 KB gzipped against a main
// bundle of ~260 KB — an 11% tax on every parent opening the app on pitch-side
// mobile data, to carry code that does nothing for the ~100% of sessions that
// never crash. The dynamic `import()` below is a Vite code-split point, so those
// bytes live in their own chunk and are fetched at the moment of a crash and
// never before. **Do not turn this into a top-level import**; the cost is not
// the SDK, it is who pays for it.
//
// ⚠️ AND IT COSTS SOMETHING REAL: no breadcrumbs, and no automatic global
// handlers. Sentry's normal setup instruments fetch, history and console from
// the first paint, and none of that exists here — a report says what threw and
// where, not what the person did first. That is the trade, it was made
// deliberately, and `installGlobalErrorReporting()` below buys back the part
// that mattered most (an unhandled promise rejection, which in a data-fetching
// app is the likelier failure than a render crash).
//
// ⚠️ NOTHING HAPPENS WITHOUT A DSN. `VITE_SENTRY_DSN` is a build-time variable,
// so every function here is a no-op wherever it is unset and no chunk is ever
// fetched. That is deliberate rather than unfinished: shipping an SDK that
// initialises against nothing would be all of the cost and none of the benefit.
// It is unset in local development and in tests, which is why the suite drives
// this file through setErrorReporterForTests below rather than a real DSN.
//
// ⚠️ IT IS SET IN PRODUCTION, AND THIS COMMENT SAID OTHERWISE FOR TWO DAYS.
// It read "absent today — Jay has not created the account yet" until 18 Aug
// 2026. Sentry went live on 16 Aug — EU region, proven by firing a real error
// at the deployed site and watching it arrive — and a code review then read
// this comment and recommended deleting `@sentry/react` as dead weight.
// The status of a live service does not belong in a source comment, because
// nothing recompiles when it changes. `claude/runbooks/monitoring.md` owns it.

// ⚠️ READ ONCE, AT MODULE SCOPE. `import.meta.env` is replaced at BUILD time by
// Vite, so this is a constant in the bundle — not a lookup, and not something a
// test can change after import. Tests exercise the behaviour through the
// injected reporter instead; see setErrorReporterForTests.
const DSN = import.meta.env.VITE_SENTRY_DSN

// The in-flight (or settled) load, so a burst of errors loads the SDK once
// rather than racing several imports of the same chunk.
let loading = null

// ⚠️ A TEST SEAM RATHER THAN A MOCK OF `import()`. Vitest can mock a module
// specifier, but the thing worth testing here is the POLICY — no DSN means no
// load, failures never escape, the global handler is registered once — and that
// is testable without pulling the real SDK into the test run.
let reporterOverride = null

/** @internal — tests only. Pass null to restore the real behaviour. */
export function setErrorReporterForTests(fn) {
  reporterOverride = fn
  loading = null
}

/** Whether reporting is switched on at all. Exported so a screen could say so. */
export function errorReportingEnabled() {
  return Boolean(reporterOverride) || Boolean(DSN)
}

// Outlook Safe Links / CefSharp (and similar embedded Chromium scanners) walk
// the live page and reject a promise with this shape. It is not Club Hub.
// JAVASCRIPT-REACT-3 (25 Aug 2026) was that payload: no stack, 0 users, culprit
// the origin. Id / MethodName / ParamCount vary, so the digits and the method
// word are not pinned.
const BROWSER_SCANNER_NOISE =
  /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/

function looksLikeBrowserScannerNoise(value) {
  if (typeof value?.message === 'string' && BROWSER_SCANNER_NOISE.test(value.message)) {
    return true
  }
  return BROWSER_SCANNER_NOISE.test(String(value ?? ''))
}

async function loadSentry() {
  if (!loading) {
    loading = import('@sentry/react')
      .then((Sentry) => {
        Sentry.init({
          dsn: DSN,
          // ⚠️ NO `tracesSampleRate` AND NO SESSION REPLAY. Both are performance
          // and UX products rather than error tracking, both cost bandwidth on
          // every session, and replay in particular would record the screens of
          // an app whose subject matter is CHILDREN. Neither is switched on by
          // accident here.
          integrations: [],
          // ⚠️ `integrations: []` DOES NOT DISABLE SENTRY'S OWN GLOBAL HANDLERS.
          // JAVASCRIPT-REACT-3 arrived with mechanism
          // `auto.browser.global_handlers.onunhandledrejection` — Sentry's
          // handler, not ours. `ignoreErrors` is what actually stops that path
          // paging Jay. The scanner regex is the same one `reportError` uses;
          // the Non-Error prefix is Sentry wrapping a string rejection.
          ignoreErrors: [
            BROWSER_SCANNER_NOISE,
            'Non-Error promise rejection captured',
          ],
          // Errors carry no user identity. `sendDefaultPii` defaults to false;
          // it is written out because a future reader will wonder whether it was
          // considered.
          sendDefaultPii: false,
        })
        return Sentry
      })
      .catch(() => null)
  }
  return loading
}

/**
 * Reports an error, if reporting is switched on. Never throws and never
 * rejects.
 *
 * ⚠️ IT MUST NOT BE POSSIBLE FOR THIS TO MAKE THINGS WORSE. Every caller is
 * already on an error path — a render crash, a rejected promise — and a failure
 * here (offline, chunk 404 after a deploy, an ad blocker eating the request)
 * must be invisible. So the dynamic import is caught, the capture is caught, and
 * nothing is awaited by the caller.
 */
export function reportError(error, context) {
  // Whole surface, not only the unhandledrejection listener: a scanner Error,
  // a wrapped `new Error(String(reason))`, or the raw string all match.
  if (looksLikeBrowserScannerNoise(error)) return

  if (reporterOverride) {
    try {
      reporterOverride(error, context)
    } catch {
      /* see above */
    }
    return
  }

  if (!DSN) return

  loadSentry()
    .then((Sentry) => {
      if (!Sentry) return
      Sentry.captureException(error, context ? { extra: context } : undefined)
    })
    .catch(() => {
      /* see above */
    })
}

let globalsInstalled = false

/**
 * Catches the failures no error boundary can see.
 *
 * ⚠️ AN ERROR BOUNDARY CATCHES RENDER ERRORS AND NOTHING ELSE. A rejected
 * promise in a data module, an `onClick` that throws, a failure inside a
 * `useEffect` callback — React does not route any of those to a boundary, and in
 * an app that is mostly Supabase calls that is where the failures actually are.
 * Without this, choosing the lazy-load option would have bought error tracking
 * for the rarest kind of fault.
 *
 * ⚠️ IDEMPOTENT, because React 18's StrictMode double-invokes effects in
 * development and this would otherwise register twice and report twice.
 */
export function installGlobalErrorReporting(target = globalThis) {
  if (globalsInstalled || !target?.addEventListener) return
  globalsInstalled = true

  target.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason
    if (looksLikeBrowserScannerNoise(reason)) return
    reportError(reason instanceof Error ? reason : new Error(String(reason)), {
      kind: 'unhandledrejection',
    })
  })

  target.addEventListener('error', (event) => {
    // ⚠️ ONLY REAL ERRORS. `window.onerror` also fires for a failed <img> or
    // <script> load, where `event.error` is null and the target is an element —
    // reporting those would fill the project with "Script error" noise from
    // other people's ad blockers.
    if (event?.error instanceof Error) {
      reportError(event.error, { kind: 'window.onerror' })
    }
  })
}

/** @internal — tests only. */
export function resetGlobalErrorReportingForTests() {
  globalsInstalled = false
}
