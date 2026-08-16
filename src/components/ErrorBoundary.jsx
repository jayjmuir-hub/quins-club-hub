import React from 'react'
import { clearCachedApiResponses } from '../lib/apiCache.js'
import { reportError } from '../lib/errorReporting.js'
import Button from './Button.jsx'

// The screen a person gets instead of a blank white page.
//
// ══ WHY THIS EXISTS ══════════════════════════════════════════════════════
//
// ⚠️ THERE WAS NO ERROR BOUNDARY ANYWHERE IN src/ UNTIL 13 Aug 2026, and
// React 18's behaviour without one is not "the broken bit disappears" — it
// UNMOUNTS THE ENTIRE TREE. One null where a component expected a string, one
// row with a shape nothing anticipated, and a parent standing on a pitch gets
// a white page with no text on it and no way back.
//
// This is not theoretical for this codebase. RESTORE.md already records the
// same mechanism biting in tests: "throws inside an effect and React unmounts
// the ENTIRE tree — an empty <body> and an error mentioning nothing about
// object URLs". The only difference in production is that nobody is reading a
// stack trace.
//
// ⚠️ AND "JUST REFRESH IT" DOES NOT WORK HERE, WHICH IS THE PART THAT MAKES
// THIS WORSE THAN THE USUAL CASE. This app is a PWA with a service worker. A
// reload is served the SAME bundle from the cache, and the runtime cache
// (`quins-supabase-rest-get`, NetworkFirst over GET /rest/v1/*) may hand back
// the SAME poisoned response that caused the crash. So the one thing every
// non-technical person tries first is also the one thing that reliably fails.
//
// That is why the fallback offers THREE escalating things rather than one:
//
//   1. Try again        — re-render. Fixes a transient failure and nothing else.
//   2. Clear saved data — purge the cached REST responses, THEN reload. This is
//                         the one that fixes a stale cached row whose shape no
//                         longer matches the code.
//   3. Sign out         — offered by the caller, not by this component.
//
// ⚠️ WHY A CLASS. componentDidCatch and getDerivedStateFromError have no hook
// equivalent. React has never shipped one. This is not legacy code and must
// not be "modernised" into a function component — there is nothing to modernise
// it into.
//
// ⚠️ WHY THE RAW ERROR IS HIDDEN BEHIND A BUTTON. "Cannot read properties of
// null (reading 'trim')" tells a parent nothing and reads as a broken app.
// But this club has NO error tracking of any kind (13 Aug audit), so the only
// route from a crash to a diagnosis is Jay asking someone what it said. Hidden
// by default, one tap away, and never the headline.
//
// ⚠️ RESETTING ON NAVIGATION IS THE CALLER'S JOB, and it is easy to miss.
// A boundary holds its error state until something clears it, so a crashed
// screen inside AppShell would STAY crashed while the person taps other tabs —
// nav visible, content permanently broken, which is arguably worse than the
// blank page. Callers key the boundary on the pathname so a route change
// remounts it. See src/App.jsx and src/components/AppShell.jsx.

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, showDetail: false, clearing: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // ⚠️ THE CONSOLE LINE STAYS, AND IS STILL THE ONLY RECORD MOST OF THE TIME.
    // Error tracking is switched on by a build-time DSN which is absent today,
    // so without this line a crash would leave no trail at all — and even with
    // Sentry running, the console is what someone reads over a parent's shoulder
    // at the side of a pitch.
    if (this.props.onError) {
      this.props.onError(error, info)
    } else {
      console.error('[Quins] Unhandled render error:', error, info?.componentStack)
    }

    // ⚠️ REPORTED WHETHER OR NOT A CALLER SUPPLIED `onError`, and that asymmetry
    // with the branch above is deliberate: `onError` is a rendering concern (a
    // caller wanting to know), and error TRACKING must not be switchable off by
    // a caller happening to pass a callback.
    //
    // ⚠️ NOT AWAITED, AND IT CANNOT THROW. `reportError` loads Sentry lazily —
    // the SDK is not in the main bundle, see src/lib/errorReporting.js — and
    // swallows every failure of its own, because this is already the error path
    // and making it worse is the one unacceptable outcome.
    reportError(error, { componentStack: info?.componentStack })
  }

  handleRetry = () => {
    // ⚠️ Clears the error and nothing else. If the cause is still there the
    // child throws again on the next render and this boundary catches it
    // again — the fallback reappears rather than the tree going blank, which
    // is the behaviour tests/error-boundary.test.jsx pins.
    this.setState({ error: null, showDetail: false })
  }

  handleClearCache = async () => {
    this.setState({ clearing: true })
    const clear = this.props.onClearCache ?? clearCachedApiResponses
    try {
      await clear()
    } catch {
      // A purge that fails must not replace one error screen with another.
      // The reload below is still worth attempting.
    }
    // Injectable so a test never has to reload jsdom, which cannot.
    const reload = this.props.onReload
    if (reload) reload()
    else if (typeof window !== 'undefined') window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        role="alert"
        className="mx-auto max-w-md rounded-[11px] border border-black/10 bg-white p-6 text-center"
      >
        <h2 className="text-base font-extrabold text-brand-deep">
          Something went wrong on this screen
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          The rest of the app still works. Try again, and if it keeps happening use
          &ldquo;Clear saved data&rdquo; — that usually fixes it.
        </p>

        {/* ⚠️ BOTH ROUTE THROUGH <Button>, AND THE FIRST DRAFT DID NOT —
            tests/button-sweep.test.js caught it. Anything carrying a fill or a
            hairline border goes through the component; that is the invariant
            the 10 Aug routing sweep established and this screen is not an
            exception to it. The text link below stays raw, which is one of the
            categories the sweep deliberately leaves alone. */}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button onClick={this.handleRetry}>Try again</Button>
          <Button
            variant="secondary"
            onClick={this.handleClearCache}
            disabled={this.state.clearing}
          >
            {this.state.clearing ? 'Clearing…' : 'Clear saved data'}
          </Button>
        </div>

        {/* ⚠️ NOT a <details>. A closed <details> still puts the text in the
            DOM, so the raw exception would be one "view source" or one screen
            reader away from a parent — and it would break the test that says a
            person is never shown it. State-driven, so it genuinely is not
            there until asked for. */}
        {this.state.showDetail ? (
          <p className="mt-4 break-words text-left font-mono text-xs text-ink-muted">
            {this.state.error?.message || String(this.state.error)}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => this.setState({ showDetail: true })}
            className="mt-4 text-xs underline text-ink-muted"
          >
            Show technical details
          </button>
        )}
      </div>
    )
  }
}
