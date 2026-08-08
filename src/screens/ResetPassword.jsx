import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import Button from '../components/Button.jsx'
import { checkPassword } from '../lib/password.js'
import crest from '../assets/crest.png'

// Where a password-reset link lands. Added 8 Aug 2026 with password auth —
// see claude/decisions/2026-08-08-parent-self-registration.md.
//
// ⚠️ THIS ROUTE IS PUBLIC, and deliberately so, but it is NOT unauthenticated
// in practice. Clicking the emailed link puts a RECOVERY session in the URL
// hash, which supabase-js consumes on load (detectSessionInUrl). So by the
// time this renders, the visitor is signed in — that is what makes
// updateUser({ password }) legal for them and nobody else.
//
// It sits OUTSIDE <Authed> and outside AppShell for the same reason
// /accept-invite does: AppShell gates on memberships.length > 0, and a parent
// with no squad yet would be shown the request-access screen instead of the
// form they were sent here to use.
//
// ⚠️ Requires /reset-password in Supabase Auth → URL Configuration → Redirect
// URLs. Without it Supabase silently falls back to the Site URL and the person
// arrives on the dashboard holding a recovery session with nowhere to spend it.

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand'
const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint'

export default function ResetPassword() {
  const { session, loading, updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState('idle') // 'idle' | 'busy' | 'done'
  const [error, setError] = useState(null)

  // The link is single-use and time-limited. Someone who opens it twice, or
  // opens it after it expires, arrives with no session at all — and the most
  // confusing possible outcome is a form that looks fine and then fails on
  // submit. Say so up front instead.
  const [linkDead, setLinkDead] = useState(false)
  useEffect(() => {
    if (loading) return
    // ⚠️ NOT a one-way latch, deliberately. Written as `if (!session)
    // setLinkDead(true)` first, which can never recover: AuthProvider sets the
    // session in a .then and clears loading in a .finally — separate
    // microtasks — so if `loading` ever goes false while the recovery session
    // is still a tick behind, the screen sticks on "this link has expired" for
    // a link that worked perfectly. supabase-js normally resolves the URL hash
    // inside getSession() before returning, so the race is latent rather than
    // live, but a latch has no way back if it ever loses.
    setLinkDead(!session)
  }, [loading, session])

  const { rules, valid } = checkPassword(password)
  const mismatch = confirm.length > 0 && confirm !== password
  const canSubmit = valid && confirm === password && status !== 'busy'

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    if (!canSubmit) return
    setStatus('busy')
    try {
      await updatePassword(password)
      setStatus('done')
    } catch (err) {
      // Not routed through friendlyAuthError: the failures reachable HERE are
      // a different set (expired recovery session, password reuse), and the
      // sign-in screen's translations would mislead. The raw message is the
      // more useful thing for the handful of people who get this far.
      setError(err?.message || 'Could not set your new password. Try the link again.')
      setStatus('idle')
    }
  }

  return (
    <div className="harlequin relative flex min-h-screen items-center justify-center overflow-hidden bg-chrome-grad px-4 py-10">
      <div className="brand-rule absolute inset-x-0 top-0" />
      <div className="relative z-10 w-full max-w-[380px] rounded-card border border-line bg-surface-card p-6 shadow-card sm:p-8">
        <img
          src={crest}
          alt="Abu Dhabi Harlequins crest"
          className="mx-auto h-20 w-20 object-contain"
        />
        <h1 className="mt-4 text-center text-xl font-extrabold tracking-tight text-ink">
          Set a new password
        </h1>

        {loading ? (
          <p className="mt-6 text-center text-sm text-ink-faint">Checking your link…</p>
        ) : status === 'done' ? (
          <div className="mt-6">
            <p className="text-center text-sm text-ink-faint">
              Your password has been changed. You’re signed in — carry on below.
            </p>
            <Button as="a" href="/" full className="mt-5">
              Go to Quins Club Hub
            </Button>
          </div>
        ) : linkDead ? (
          <div className="mt-6">
            <p role="alert" className="text-center text-sm text-ink-muted">
              That reset link has expired or has already been used. Password reset links
              only work once. Ask for a fresh one from the sign-in screen.
            </p>
            <Button as="a" href="/" variant="secondary" full className="mt-5">
              Back to sign in
            </Button>
          </div>
        ) : (
          <form className="mt-6" onSubmit={handleSubmit} noValidate>
            {error && (
              <p
                role="alert"
                className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
              >
                {error}
              </p>
            )}

            <div className="flex items-baseline justify-between">
              <label htmlFor="new-password" className={LABEL}>
                New password
              </label>
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint underline"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              id="new-password"
              name="password"
              type={show ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
            />

            <ul className="mt-2 space-y-1" aria-live="polite">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className={
                    'flex items-center gap-2 text-xs ' +
                    (rule.met ? 'text-ink-faint' : 'text-ink-muted')
                  }
                >
                  <span aria-hidden="true" className={rule.met ? 'text-brand' : 'text-line'}>
                    {rule.met ? '✓' : '•'}
                  </span>
                  <span>{rule.label}</span>
                  <span className="sr-only">{rule.met ? ' — done' : ' — still needed'}</span>
                </li>
              ))}
            </ul>

            <label htmlFor="confirm-password" className={LABEL + ' mt-4'}>
              Confirm new password
            </label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type={show ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={FIELD}
            />
            {mismatch && (
              <p className="mt-1.5 text-xs font-semibold text-brand-deep">
                The two passwords don’t match.
              </p>
            )}

            <Button type="submit" disabled={!canSubmit} full className="mt-4">
              {status === 'busy' ? 'Saving…' : 'Save new password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
