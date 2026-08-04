import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
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

export default function Login({ authError = null }) {
  const { signInWithEmail, signInWithGoogle } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'sending' | 'sent'
  const [error, setError] = useState(null)
  const [staleAuthError, setStaleAuthError] = useState(authError)

  useEffect(() => {
    setStaleAuthError(authError)
  }, [authError])

  const sending = status === 'sending'
  const displayedError =
    error ?? (staleAuthError ? `That sign-in link didn't work: ${staleAuthError}` : null)

  async function handleEmailSubmit(event) {
    event.preventDefault()
    setStaleAuthError(null)

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
      setError(err.message || 'Something went wrong sending the link. Try again.')
      setStatus('idle')
    }
  }

  async function handleGoogleClick() {
    setStaleAuthError(null)
    setError(null)
    setStatus('sending')
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message || 'Something went wrong signing in with Google. Try again.')
      setStatus('idle')
    }
  }

  function handleUseDifferentEmail() {
    setStatus('idle')
    setError(null)
  }

  return (
    // Dark chrome, matching the masthead. This used to be the same red->green
    // gradient the header carried, which on a FULL-SCREEN element runs all the
    // way to pure #3bd070 in the corner — 2.01:1 against the white text sitting
    // on it. Near-black is 19.54:1 and needs no width-dependent caveats.
    <div className="harlequin relative flex min-h-screen items-center justify-center overflow-hidden bg-chrome-grad px-4 py-10">
      <div className="brand-rule absolute inset-x-0 top-0" />
      {/* relative z-10 so the card sits above `.harlequin`'s decorative
          diagonals — that pseudo-element is absolutely positioned, and
          positioned boxes paint over non-positioned siblings. */}
      <div className="relative z-10 w-full max-w-[380px] rounded-card border border-line bg-surface-card p-6 shadow-card sm:p-8">
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
          Quins Club Hub is for Abu Dhabi Harlequins members. Sign in below — if
          the club hasn&apos;t set your account up yet, you can ask them to on
          the next screen.
        </p>

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
    </div>
  )
}
