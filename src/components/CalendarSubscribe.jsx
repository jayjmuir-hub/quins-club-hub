import { useState } from 'react'
import Sheet from './Sheet.jsx'
import {
  calendarFeedUrl,
  calendarWebcalUrl,
  myCalendarToken,
  resetMyCalendarToken,
} from '../data/calendar.js'

// "Add to calendar" — hands out a personal subscription URL that Google and
// Apple Calendar poll, so fixture changes reach people without anyone
// re-importing anything.
//
// A SUBSCRIPTION, not a download, on purpose (Jay's call, 4 Aug 2026): a
// downloaded .ics is a snapshot, so moving a kick-off leaves every calendar
// silently wrong, which is worse than having no entry at all.
//
// The token is minted LAZILY — only when someone actually opens this sheet.
// Fetching it on every Schedule render would create a live bearer credential
// for every member who never wanted one.

const ACTION =
  'rounded-[11px] px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </svg>
  )
}

export default function CalendarSubscribe() {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)

  async function handleOpen() {
    setOpen(true)
    if (token) return

    setLoading(true)
    setError(null)
    try {
      setToken(await myCalendarToken())
    } catch (err) {
      setError(err.message || "We couldn't create your calendar link. Try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    setLoading(true)
    setError(null)
    try {
      setToken(await resetMyCalendarToken())
      setConfirmingReset(false)
      setCopied(false)
    } catch (err) {
      setError(err.message || "We couldn't reset your link. Try again.")
    } finally {
      setLoading(false)
    }
  }

  const url = calendarFeedUrl(token)

  async function handleCopy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Clipboard access is refused in plenty of ordinary situations (an
      // insecure context, a locked-down browser, no user gesture). The URL is
      // on screen and selectable, so this is a missing convenience, not a
      // failure worth an alert.
      setCopied(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-2 rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[13px] font-bold text-brand transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <CalendarIcon className="h-4 w-4" aria-hidden="true" />
        Add to calendar
      </button>

      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Add to your calendar">
          <p className="text-sm leading-relaxed text-ink-faint">
            Subscribe once and your fixtures stay up to date automatically — if a kick-off moves,
            your calendar moves with it. You&apos;ll only see the squads you already have access
            to.
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
            >
              {error}
            </p>
          )}

          {loading && !url && (
            <p role="status" className="mt-5 text-sm font-semibold text-ink-faint">
              Creating your link…
            </p>
          )}

          {url && (
            <>
              <div className="mt-5">
                <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint">
                  Your personal calendar link
                </span>
                {/* Selectable and wrapped rather than truncated: copying can
                    fail for perfectly ordinary reasons, and then reading it
                    off the screen is the fallback. */}
                <code
                  data-testid="calendar-url"
                  className="block break-all rounded-[11px] bg-surface-mute px-3 py-2.5 text-[12.5px] text-ink"
                >
                  {url}
                </code>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={handleCopy} className={`${ACTION} bg-brand text-white hover:bg-brand-deep`}>
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                {/* webcal: is what makes this one tap on iPhone and Mac. It
                    does nothing useful on Google, which is why the copyable
                    https URL above is the primary route. */}
                <a
                  href={calendarWebcalUrl(token)}
                  className={`${ACTION} border-[1.5px] border-line bg-surface-card text-brand hover:border-brand`}
                >
                  Add on Apple
                </a>
              </div>

              <div className="mt-6 border-t border-line pt-4 text-sm leading-relaxed text-ink-faint">
                <p className="font-bold text-ink">Google Calendar</p>
                <p className="mt-1">
                  Settings → Add calendar → From URL → paste the link above.
                </p>
                <p className="mt-3 font-bold text-ink">iPhone or iPad</p>
                <p className="mt-1">
                  Tap &ldquo;Add on Apple&rdquo; above, or Settings → Calendar → Accounts → Add
                  Account → Other → Add Subscribed Calendar.
                </p>
                <p className="mt-3 text-[12.5px] text-ink-muted">
                  New fixtures usually appear within a few hours — calendar apps decide how often
                  to check, and Google can be slow about it.
                </p>
              </div>

              <div className="mt-6 border-t border-line pt-4">
                {/* Stated plainly rather than buried: this URL works for
                    anyone who has it, with no login. Someone who forwards it
                    should know what they forwarded. */}
                <p className="text-[12.5px] leading-relaxed text-ink-muted">
                  Treat this link like a password — anyone with it can see your fixtures without
                  signing in. If you&apos;ve shared it by mistake, reset it and the old link stops
                  working immediately.
                </p>

                {confirmingReset ? (
                  <div className="mt-3 flex gap-2.5">
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(false)}
                      disabled={loading}
                      className={`${ACTION} flex-1 border-[1.5px] border-line bg-surface-card text-ink hover:bg-surface-mute`}
                    >
                      Keep it
                    </button>
                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={loading}
                      className={`${ACTION} flex-1 bg-brand-deep text-white hover:bg-brand`}
                    >
                      {loading ? 'Resetting…' : 'Yes, reset'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(true)}
                    className="mt-3 text-[13px] font-bold text-brand underline decoration-line underline-offset-4 hover:decoration-brand"
                  >
                    Reset my link
                  </button>
                )}
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  )
}
