import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Sheet } from './Sheet.jsx'
import Button from './Button.jsx'
import MyReportsList from './MyReportsList.jsx'
import {
  submitFeedback,
  captureContext,
  feedbackRef,
  listFeedback,
} from '../data/feedback.js'

// The sheet that lets any member say "this is broken" or "this would be
// better", from any signed-in screen. Opened from the account menu's
// "Report a problem" item. Design: claude/plans/2026-08-18-help-and-feedback.md
// (the flow) and claude/plans/2026-08-24-help-into-account-menu.md (the trigger).
//
// ══ ⚠️ THIS WAS HelpButton.jsx, A FLOATING `?`, UNTIL 24 Aug 2026 ═════════
//
// A 44px disc floated bottom-right on every screen. Jay's verdict was all four
// failure modes at once — it covered content, was still missed, read as
// clutter, and caught accidental taps by the tab bar — and the corner is now
// the desktop chat dock's. Do not bring a floating trigger back; if the menu
// item proves too hidden, the agreed fallback is a visible row on the More
// page (see the 24 Aug plan's closing section).
//
// ⚠️ open/onClose ARE PROPS ON PURPOSE. AppShell owns the state so the account
// menu — a different subtree of the masthead — can open the sheet without a
// context or an event bus. This component keeps owning the RESET (see close()):
// the parent only knows open/closed, never the half-typed words.
//
// ══ ⚠️ TWO STEPS, AND THE FIRST ONE IS NOT A TEST ════════════════════════
//
// The panel opens on a choice because the admin wants a sorted inbox. It is a
// sorting HINT, not a question the member can get wrong — which is why the
// closing line invites anything at all. Somebody whose problem is neither a
// bug nor an idea ("I don't understand what U12 means") must not bounce off.
// **Do not turn that line into a third button.**

/**
 * Friendly names for the screens a member actually reaches.
 *
 * ⚠️ A FALLBACK, NOT A ROUTE TABLE. src/App.jsx owns the routes; this only
 * decides what a human is told they are looking at. An unmapped path shows its
 * own pathname, which is ugly but never wrong — the alternative, guessing a
 * label from the URL, is wrong quietly.
 */
const ROUTE_LABELS = {
  '/': 'Home',
  '/schedule': 'Schedule',
  '/roster': 'Roster',
  '/notices': 'Notices',
  '/chat': 'Chat',
  '/chat/dm': 'Messages',
  '/more': 'More',
  '/approvals': 'Approvals',
  '/game-time': 'Game time',
}

export function routeLabel(pathname) {
  if (!pathname) return null
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname]
  // Nested routes (/admin/accounts, /lineup/:id) — name the section, which is
  // the part a person recognises, rather than the whole path with an id in it.
  const [, first] = pathname.split('/')
  if (first && ROUTE_LABELS[`/${first}`]) return ROUTE_LABELS[`/${first}`]
  if (first === 'admin') return 'Admin'
  return pathname
}

const PROMPTS = {
  bug: { title: "Something's broken", label: 'What went wrong?' },
  idea: { title: "I've got a suggestion", label: 'What would make this better?' },
}

export default function HelpSheet({ open, onClose }) {
  const location = useLocation()
  // 'choose' -> 'form' -> 'sent'. Deliberately a string rather than three
  // booleans: three booleans have eight states, five of which are nonsense.
  const [step, setStep] = useState('choose')
  const [kind, setKind] = useState(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [sentRef, setSentRef] = useState(null)
  // The member's own reports. `null` means "not fetched yet" and is distinct
  // from `[]`, which means "fetched, and you have never reported anything" —
  // those two need different words on screen.
  const [mine, setMine] = useState(null)
  const [mineError, setMineError] = useState(null)

  const here = routeLabel(location.pathname)

  function close() {
    onClose()
    // ⚠️ RESET ON CLOSE, NOT ON OPEN. Sheet unmounts its children when closed,
    // but this state lives out here — without this, reopening shows the last
    // person's half-typed report, and on a shared family phone that is
    // somebody else's words.
    setStep('choose')
    setKind(null)
    setBody('')
    setError(null)
    setSaving(false)
    setSentRef(null)
    setMine(null)
    setMineError(null)
  }

  // ⚠️ FETCHED ON DEMAND, NOT ON OPEN. Most taps of the `?` are somebody about
  // to report something, not somebody checking on an old one — loading this
  // every time would put a query behind a button that usually does not need it.
  async function showMine() {
    setStep('mine')
    setMineError(null)
    try {
      setMine(await listFeedback())
    } catch (err) {
      setMine([])
      setMineError(err?.message || 'Could not load your reports.')
    }
  }

  function choose(nextKind) {
    setKind(nextKind)
    setStep('form')
    setError(null)
  }

  async function send(e) {
    e.preventDefault()
    if (!body.trim()) {
      setError('Tell us what happened first.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const row = await submitFeedback({
        kind,
        body,
        route: location.pathname,
        context: captureContext({
          route: location.pathname,
          appVersion: typeof __BUILD_REF__ === 'string' ? __BUILD_REF__ : null,
        }),
      })
      setSentRef(feedbackRef(row?.ref))
      setStep('sent')
    } catch (err) {
      // ⚠️ THE MEMBER'S WORDS SURVIVE A FAILURE. Staying on the form with
      // `body` intact means a flaky pitch-side connection costs a retry, not
      // the paragraph they just typed.
      //
      // ⚠️ THE PENDING-MEMBER CASE IS NOT AN EDGE CASE, IT IS A LIKELY ONE.
      // Both the insert policy and the stamping trigger require an ACTIVE
      // membership, so a parent who signed up an hour ago and is waiting on a
      // coach cannot file anything — and "I signed up and nothing happened" is
      // exactly what that person wants to report. Widening the policy to
      // pending members would let anybody who can reach the sign-up form write
      // rows, so the answer is a route out rather than a wider door.
      const noMembership = /no active membership/i.test(err?.message ?? '')
      setError(
        noMembership
          ? 'Your account is still waiting to be approved, so this form is not open yet. Email help@adhquins-clubhub.com and we will pick it up.'
          : err?.message || 'That did not send. Try again in a moment.',
      )
    } finally {
      setSaving(false)
    }
  }

  const prompt = kind ? PROMPTS[kind] : null

  return (
    <Sheet open={open} onClose={close} title={step === 'form' && prompt ? prompt.title : 'Need a hand?'}>
        {step === 'choose' && (
          <div>
            {here && (
              <p className="mb-4 text-[13px] text-ink-muted">
                You&rsquo;re on the {here} page.
              </p>
            )}
            <button
              type="button"
              onClick={() => choose('bug')}
              className="mb-2 flex min-h-[44px] w-full items-center gap-3 rounded-[11px] border border-line px-3 py-3 text-left transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">Something&rsquo;s broken</span>
                <span className="block text-[13px] text-ink-faint">Wrong info, or it won&rsquo;t work</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => choose('idea')}
              className="mb-4 flex min-h-[44px] w-full items-center gap-3 rounded-[11px] border border-line px-3 py-3 text-left transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex-1">
                <span className="block text-[15px] font-semibold text-ink">I&rsquo;ve got a suggestion</span>
                <span className="block text-[13px] text-ink-faint">Something that&rsquo;d make this better</span>
              </span>
            </button>
            {/* ⚠️ NOT A THIRD LANE. This is a way BACK to something already
                reported, not a third kind of thing to report — which is why it
                is a quiet link under the divider and not a card like the two
                above. The note at the top of this file still stands: the
                sorting question has exactly two answers. */}
            <button
              type="button"
              onClick={showMine}
              className="mb-3 min-h-[44px] w-full border-t border-line pt-3 text-left text-[13px] font-semibold text-brand-ink underline"
            >
              See what you&rsquo;ve already reported
            </button>
            <p className="text-[13px] text-ink-faint">
              Anything else — just say what&rsquo;s on your mind and Jay will sort it out.
            </p>
          </div>
        )}

        {step === 'form' && prompt && (
          <form onSubmit={send}>
            <label htmlFor="feedback-body" className="mb-1.5 block text-[13px] font-semibold text-ink-muted">
              {prompt.label}
            </label>
            <textarea
              id="feedback-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              autoFocus
              className="mb-4 w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-[15px] text-ink focus:border-brand focus:outline-none"
            />

            {/* ⚠️ SHOWN BEFORE IT IS SENT, IN PLAIN WORDS, AND THAT IS THE
                POINT. It tells the member the app already knows where they
                are — so they do not waste effort describing it — and it means
                nobody can feel they were measured without being told. Anything
                added to captureContext() must be readable here too. */}
            <div className="mb-4 rounded-[11px] bg-surface-sunk p-3">
              <p className="mb-2 text-[13px] font-semibold text-ink">Sent automatically with your message</p>
              {here && <p className="text-[13px] text-ink-muted">The page you&rsquo;re on — {here}</p>}
              <p className="text-[13px] text-ink-muted">Your device and browser</p>
              <p className="text-[13px] text-ink-muted">Which version of the app you have</p>
            </div>

            {error && (
              <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-ink">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep('choose')} disabled={saving}>
                Back
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </form>
        )}

        {step === 'mine' && (
          <div>
            {/* ⚠️ ONE COPY, SHARED WITH /my-reports. Extracted 19 Aug 2026 — a second
                copy of this list would drift, and the drift would be invisible
                because nobody has both views open at once. */}
            <MyReportsList reports={mine} error={mineError} />

            <div className="mt-4">
              <Button type="button" variant="secondary" onClick={() => setStep('choose')}>
                Back
              </Button>
            </div>
          </div>
        )}

        {step === 'sent' && (
          <div>
            <p className="mb-2 text-[15px] font-semibold text-ink">Thanks — that&rsquo;s with us</p>
            <p className="mb-4 text-[13px] text-ink-muted">
              We&rsquo;ve emailed you a copy. Any update will show up here under
              <span className="font-semibold"> See what you&rsquo;ve already reported</span>.
            </p>
            {sentRef && (
              <div className="mb-4 rounded-[11px] bg-surface-sunk p-3 text-center">
                <p className="text-[13px] text-ink-faint">Reference</p>
                <p className="text-[15px] font-semibold text-ink">{sentRef}</p>
              </div>
            )}
            <Button type="button" onClick={close}>
              Done
            </Button>
          </div>
        )}
    </Sheet>
  )
}
