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
    <div className="flex min-h-screen items-center justify-center bg-[image:linear-gradient(100deg,theme(colors.quinsRedDark)_0%,theme(colors.quinsRed)_42%,#B23A38_62%,theme(colors.quinsGreen)_100%)] px-4 py-10">
      <div className="w-full max-w-[380px] rounded-2xl border border-[#e6e3e1] bg-white p-6 shadow-[0_6px_24px_rgba(20,20,20,0.10)] sm:p-8">
        {/* crest.png is 369x400 (portrait) — object-contain keeps its native
            aspect ratio inside the square box instead of stretching to fill
            it (see AppShell's header badge for the same fix/reasoning). */}
        <img
          src={crest}
          alt="Abu Dhabi Harlequins crest"
          className="mx-auto h-20 w-20 object-contain"
        />
        <h1 className="mt-4 text-center text-xl font-extrabold tracking-tight text-[#221f1d]">
          Abu Dhabi Harlequins
        </h1>
        <p className="mt-1 text-center text-xs font-semibold uppercase tracking-widest text-[#77726e]">
          Quins Club Hub
        </p>
        <p className="mt-4 text-center text-sm leading-relaxed text-[#77726e]">
          Quins Club Hub is invite-only for Abu Dhabi Harlequins members — ask
          your club admin if you don&apos;t have access yet.
        </p>

        {status === 'sent' ? (
          <div className="mt-6">
            <h2 className="text-center text-base font-bold text-[#221f1d]">Check your email</h2>
            <p className="mt-2 text-center text-sm text-[#77726e]">
              We&apos;ve sent a sign-in link to{' '}
              <strong className="text-[#221f1d]">{email.trim()}</strong>. Open it
              on this device to continue.
            </p>
            <button
              type="button"
              onClick={handleUseDifferentEmail}
              className="mt-5 w-full rounded-[11px] border-[1.5px] border-[#e6e3e1] bg-white px-4 py-2.5 text-sm font-bold text-quinsRed transition hover:border-quinsRed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form className="mt-6" onSubmit={handleEmailSubmit} noValidate>
            {displayedError && (
              <p
                role="alert"
                className="mb-4 rounded-[11px] bg-[#fbeae8] px-3 py-2 text-sm font-semibold text-quinsRedDark"
              >
                {displayedError}
              </p>
            )}

            <label
              htmlFor="login-email"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#77726e]"
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
              className="w-full rounded-[11px] border-[1.5px] border-[#e6e3e1] px-3 py-2.5 text-base text-[#221f1d] focus:border-quinsRed"
            />

            <button
              type="submit"
              disabled={sending}
              className="mt-4 w-full rounded-[11px] bg-quinsRed px-4 py-2.5 text-sm font-bold text-white transition hover:bg-quinsRedDark disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
            >
              {sending ? 'Sending…' : 'Email me a link'}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-[#77726e]">
              <span className="h-px flex-1 bg-[#e6e3e1]" />
              or
              <span className="h-px flex-1 bg-[#e6e3e1]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleClick}
              disabled={sending}
              className="w-full rounded-[11px] border-[1.5px] border-[#e6e3e1] bg-white px-4 py-2.5 text-sm font-bold text-[#221f1d] transition hover:border-quinsRed disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
            >
              Continue with Google
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
