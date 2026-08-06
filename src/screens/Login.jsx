import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { takeSessionExpired } from '../lib/sessionExpired.js'
import crest from '../assets/crest.png'

// Login screen: the first thing an uninvited or signed-out visitor sees.
// No router dependency (renders standalone) and no sign-up, password,
// "remember me", extra social providers, or membership/role logic — those
// are explicitly out of scope for this screen.
//
// `authError` is optional: RequireAuth passes it in when the visitor arrived
// via a failed magic-link/OAuth redirect (e.g. an expired link), so this
// screen can explain why they're back here instead of showing a blank form.
// It shares the same alert region as this screen's own errors, and is
// cleared the moment the user starts a fresh attempt so it can't reappear
// alongside (or instead of) a new error.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The ONE auth error worth translating, because it is the one a normal person
// will actually meet and the raw text is actively harmful.
//
// Supabase enforces a per-project ceiling on auth emails (Authentication →
// Rate Limits). When it trips, GoTrue returns 429 with the bare string
// "email rate limit exceeded", and this screen used to render that verbatim.
// To a parent it reads as an accusation, names no remedy, and gives no hint
// that waiting fixes it — so they message the club instead of trying again
// ninety seconds later. Hitting the ceiling is survivable; that message is
// what turned it into a support request.
//
// ⚠️ NOT HYPOTHETICAL. The live value read from the dashboard on 6 Aug 2026
// is **2 emails/hour** — the built-in-provider default, NOT the 30 the docs
// quote for custom SMTP, because this project sends via a Send Email Auth
// Hook and Supabase does not count that as custom SMTP. On 2/hour this path
// is reachable on the third sign-in of any hour.
//
// ⚠️ Deliberately a narrow allow-list, not a general error prettifier. Every
// other auth failure keeps its real message: "Email address is invalid",
// "Signups not allowed", and the rest are all things where the true text is
// more useful than anything generic, to the user AND to whoever they forward
// the screenshot to.
const RATE_LIMITED = /rate limit|too many requests|429/i

const RATE_LIMIT_MESSAGE =
  'Lots of people are signing in right now. Wait a couple of minutes and try again — or use Continue with Google if that’s your email.'

// ⚠️ SECOND ENTRY, ADDED 6 AUG 2026 FOR A WALL WE KNOW WE WILL HIT.
//
// Resend's free tier sends 100 emails per DAY — read off the account, not
// guessed (Settings -> Usage, "Daily limit 5 / 100"). 143 people need magic
// links, so the cap is reachable on day one of any rollout.
//
// When it trips, Resend returns 429 daily_quota_exceeded, the Send Email Auth
// Hook returns 500, and GoTrue hands the browser
// "Unexpected status code returned from hook: 500" — which contains no "rate
// limit", no "429", and nothing else RATE_LIMITED matches. Untranslated, a
// parent reads that and concludes the app is broken.
//
// NOT hypothetical: it happened on 6 Aug 2026 at 04:44 and is in the auth logs.
//
// Deliberately vaguer than the rate-limit copy above. This same error covers
// every way the mail hook can fail, and promising "wait a couple of minutes"
// would be a lie if the real cause is the daily cap, which resets at midnight
// UTC. Google is offered first because for half the club it works instantly
// and sends no email at all.
const EMAIL_SEND_FAILED = /status code returned from hook|unexpected_failure/i

const EMAIL_SEND_FAILED_MESSAGE =
  'We couldn’t send your sign-in link just now. If your email is a Gmail address, use Continue with Google below — it works straight away. Otherwise try again later, or contact the club.'

// ⚠️ Deliberately a narrow allow-list, not a general error prettifier — see
// the header comment. Two entries, both for failures a parent can neither
// understand nor act on. Everything else keeps its real message.
export function friendlyAuthError(error, fallback) {
  const raw = typeof error?.message === 'string' ? error.message : ''
  if (RATE_LIMITED.test(raw)) return RATE_LIMIT_MESSAGE
  if (EMAIL_SEND_FAILED.test(raw)) return EMAIL_SEND_FAILED_MESSAGE
  return raw || fallback
}

// Set by the session guard in src/lib/supabase.js at the moment it catches a
// silent downgrade to anon (commit c80f51e). Before this, that guard threw
// people to the login screen mid-task with no explanation whatsoever — the
// outcome was right and the experience read as the app breaking.
const SESSION_EXPIRED_MESSAGE =
  'You were signed out because your session expired. Sign in again and carry on where you left off.'

// `embedded` — render as a plain card inside somebody else's page, instead of
// as the whole screen. Used by /delete-account, which is public and therefore
// has to offer sign-in itself. Without it the full-screen dark panel lands in
// the middle of a light page and the result reads as two pages stitched
// together — which is the first thing a Play reviewer sees.
//
// It also drops the crest, the club name and the intro paragraph. Not for
// tidiness: the host page already carries an <h1>, and a second one is wrong
// for anyone using a screen reader to navigate by heading.
export default function Login({ authError = null, embedded = false }) {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'sending' | 'sent'
  const [error, setError] = useState(null)
  const [staleAuthError, setStaleAuthError] = useState(authError)
  // Lazy initialiser, so the flag is taken exactly once per mount rather than
  // on every render.
  const [sessionExpired, setSessionExpired] = useState(() => takeSessionExpired())

  useEffect(() => {
    setStaleAuthError(authError)
  }, [authError])

  const sending = status === 'sending'
  const displayedError =
    error ??
    (staleAuthError ? `That sign-in link didn't work: ${staleAuthError}` : null) ??
    (sessionExpired ? SESSION_EXPIRED_MESSAGE : null)

  async function handleEmailSubmit(event) {
    event.preventDefault()
    setStaleAuthError(null)
    setSessionExpired(false)

    const trimmed = email.trim()
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }

    setError(null)
    setStatus('sending')
    try {
      await signInWithEmail(trimmed)
      setStatus('sent')
    } catch (err) {
      setError(friendlyAuthError(err, 'Something went wrong sending the link. Try again.'))
      setStatus('idle')
    }
  }

  async function handleGoogleClick() {
    setStaleAuthError(null)
    setSessionExpired(false)
    setError(null)
    setStatus('sending')
    try {
      await signInWithGoogle()
    } catch (err) {
      // Google sends no email, so it cannot be rate-limited this way — routed
      // through the same helper anyway so the two buttons can never drift into
      // treating the same error differently.
      setError(friendlyAuthError(err, 'Something went wrong signing in with Google. Try again.'))
      setStatus('idle')
    }
  }

  function handleUseDifferentEmail() {
    setStatus('idle')
    setError(null)
  }

  const card = (
    /* relative z-10 so the card sits above `.harlequin`'s decorative
       diagonals — that pseudo-element is absolutely positioned, and
       positioned boxes paint over non-positioned siblings. Embedded, there is
       no such backdrop, so neither the z-index, the shadow nor the width cap
       applies: the host page owns the layout. */
    <div
      className={
        embedded
          ? 'w-full rounded-card border border-line bg-surface-card p-6'
          : 'relative z-10 w-full max-w-[380px] rounded-card border border-line bg-surface-card p-6 shadow-card sm:p-8'
      }
    >
      {!embedded && (
        <>
          {/* crest.png is 370x400 (portrait) — object-contain keeps its native
              aspect ratio inside the square box instead of stretching to fill
              it (see AppShell's header badge for the same fix/reasoning). */}
          <img
            src={crest}
            alt="Abu Dhabi Harlequins crest"
            className="mx-auto h-20 w-20 object-contain"
          />
          <h1 className="mt-4 text-center text-xl font-extrabold tracking-tight text-ink">
            Abu Dhabi Harlequins
          </h1>
          <p className="mt-1 text-center text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Quins Club Hub
          </p>
          {/* This used to say "invite-only ... ask your club admin", which was
              true when signing in without an invite was a dead end. It now
              sends people hunting for an admin through some channel the app
              knows nothing about, when the app will take their request directly
              — see src/components/RequestAccess.jsx. Signing in is still not
              the same as getting access: an account with no membership reads
              zero rows from every table. */}
          <p className="mt-4 text-center text-sm leading-relaxed text-ink-faint">
            Quins Club Hub is for Abu Dhabi Harlequins members. Sign in below —
            if the club hasn&apos;t set your account up yet, you can ask them to
            on the next screen.
          </p>
        </>
      )}

        {status === 'sent' ? (
          <div className="mt-6">
            <h2 className="text-center text-base font-bold text-ink">Check your email</h2>
            <p className="mt-2 text-center text-sm text-ink-faint">
              We&apos;ve sent a sign-in link to{' '}
              <strong className="text-ink">{email.trim()}</strong>. Open it
              on this device to continue.
            </p>
            <button
              type="button"
              onClick={handleUseDifferentEmail}
              className="mt-5 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-brand transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className="mt-6" onSubmit={handleEmailSubmit} noValidate>
            {displayedError && (
              <p
                role="alert"
                className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
              >
                {displayedError}
              </p>
            )}

            <label
              htmlFor="login-email"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint"
            >
              Email address
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand"
            />

            <button
              type="submit"
              disabled={sending}
              className="mt-4 w-full rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              {sending ? 'Sending…' : 'Email me a link'}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={sending}
              className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-ink transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Continue with Google
            </button>
          </form>
        )}
    </div>
  )

  if (embedded) return card

  return (
    // Dark chrome, matching the masthead. This used to be the same red->green
    // gradient the header carried, which on a FULL-SCREEN element runs all the
    // way to pure #3bd070 in the corner — 2.01:1 against the white text sitting
    // on it. Near-black is 19.54:1 and needs no width-dependent caveats.
    <div className="harlequin relative flex min-h-screen items-center justify-center overflow-hidden bg-chrome-grad px-4 py-10">
      <div className="brand-rule absolute inset-x-0 top-0" />
      {card}
    </div>
  )
}
