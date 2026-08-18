import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import Button from '../components/Button.jsx'
import { takeSessionExpired } from '../lib/sessionExpired.js'
import { checkPassword } from '../lib/password.js'
import crest from '../assets/crest.png'

// Login screen: the first thing an uninvited or signed-out visitor sees.
// No router dependency — it renders standalone, and RequireAuth swaps it in
// place of whatever page was requested so the URL survives.
//
// ⚠️ REBUILT 8 AUG 2026 AROUND EMAIL + PASSWORD.
// See claude/decisions/2026-08-08-parent-self-registration.md. Parents now
// create their own account instead of being matched against a pre-seeded
// roster, so this screen carries sign-up, sign-in and password reset.
//
// `authError` is optional: RequireAuth passes it in when the visitor arrived
// via a failed magic-link/OAuth redirect (e.g. an expired link), so this
// screen can explain why they're back here instead of showing a blank form.
// It shares the same alert region as this screen's own errors, and is cleared
// the moment the user starts a fresh attempt so it can't reappear alongside
// (or instead of) a new error.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ⚠️ THE PASSWORDLESS ROUTES ARE HIDDEN, NOT REMOVED.
//
// Jay's ruling, 8 Aug 2026: mothball magic link and Google by hiding the
// buttons and keeping the code. `signInWithEmail` and `signInWithGoogle` in
// src/lib/auth.jsx are untouched and still work. Flip this to `true` to bring
// both back — that is the entire revival procedure.
//
// ⚠️ This is a UI decision, NOT a security boundary. Supabase has no setting
// that disables email SIGN-IN (only sign-up), and an account with an email
// identity can always request a magic link via the API whatever this screen
// renders. Do not describe passwords as "the only way in".
const SHOW_PASSWORDLESS = false

// ── Error translation ──────────────────────────────────────────────────────
//
// ⚠️ Deliberately a narrow allow-list, not a general error prettifier. Every
// other auth failure keeps its real message: "Email address is invalid",
// "Signups not allowed", and the rest are all things where the true text is
// more useful than anything generic, to the user AND to whoever they forward
// the screenshot to.

// Supabase enforces a per-project ceiling on auth emails (Authentication →
// Rate Limits). When it trips, GoTrue returns 429 with the bare string "email
// rate limit exceeded", and this screen used to render that verbatim. To a
// parent it reads as an accusation, names no remedy, and gives no hint that
// waiting fixes it — so they message the club instead of trying again ninety
// seconds later.
//
// ⚠️ THE CEILING IS 200/HOUR, measured on the dashboard 8 Aug 2026. This
// comment said "2 emails/hour" until then, quoting a 6 Aug reading, and that
// figure was repeated as a live blocker across three documents for two days
// after it had been raised. Re-read the dashboard; do not trust this number.
const RATE_LIMITED = /rate limit|too many requests|429/i

const RATE_LIMIT_MESSAGE =
  'Lots of people are signing in right now. Wait a couple of minutes and try again.'

// When Resend refuses a send for ANY reason, it returns a 429, the Send Email
// Auth Hook returns 500, and GoTrue hands the browser "Unexpected status code
// returned from hook: 500" — which contains no "rate limit", no "429", and
// nothing else RATE_LIMITED matches. Untranslated, a parent reads that and
// concludes the app is broken.
//
// NOT hypothetical: it happened on 6 Aug 2026 at 04:44 and is in the auth logs.
//
// ⚠️ THE CAUSE CHANGED ON 13 Aug 2026 AND THE HANDLING MUST NOT. This said
// "Resend's free tier sends 100 emails per DAY", which was the trigger in
// August; the account is on Resend Pro now and that daily cap is gone. The
// 429 → 500 → unreadable-message CHAIN is unchanged, and it is still reachable
// via the per-second rate limit, the monthly allowance, a revoked key or a
// suspended sending domain. **Do not delete the second pattern below because
// the original cause was fixed** — it is the only thing standing between a
// failed sign-in and a parent being told the app is broken.
//
// Deliberately vaguer than the rate-limit copy above. This same error covers
// every way the mail hook can fail, and promising "wait a couple of minutes"
// would be a lie if the real cause is the daily cap, which resets at midnight
// UTC.
const EMAIL_SEND_FAILED = /status code returned from hook|unexpected_failure/i

const EMAIL_SEND_FAILED_MESSAGE =
  'We couldn’t send that email just now. Please try again in a few minutes, or contact the club if it keeps happening.'

// ── Password-era errors, added 8 Aug 2026 ──────────────────────────────────
// Matched on GoTrue's `code` field first, because a stable code beats
// pattern-matching English prose. The message regexes are a fallback for
// older supabase-js responses that carry no code.

// The raw text, measured by probing the live signup endpoint on 8 Aug 2026:
//
//   "Password should contain at least one character of each:
//    abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789,
//    !@#$%^&*()_+-=[]{};'\:"|<>?,./`~."
//
// It enumerates all four character sets every single time, even when only one
// is missing, so it cannot tell a person what is actually wrong. The live
// checklist under the password field is the real fix; this is the safety net
// for the case where our rules and the dashboard have drifted apart.
const WEAK_PASSWORD_MESSAGE =
  'That password doesn’t meet the requirements. Check the list below the password box.'

// ⚠️ `weak_password` COVERS THREE DIFFERENT REFUSALS AND THIS APP TREATED THEM
// AS ONE. Found 17 Aug 2026, on Jay's own sign-up: every rule in the checklist
// was ticked green and the form still refused, saying "check the list below" —
// pointing at the one thing that was not the problem.
//
// supabase-js's AuthWeakPasswordError carries `reasons`, and the set is exactly
// (auth-js 2.112.3, lib/types.js):
//
//     ['length', 'characters', 'pwned']
//
// The first two ARE the checklist. The third is Supabase's leaked-password
// protection — the password appears in the Have I Been Pwned corpus — and has
// nothing to do with the rules on screen. All three arrive with
// `code: 'weak_password'`, which is why one message swallowed all three.
//
// ⚠️ THE MESSAGE HAS TO SAY THE RULES ARE FINE, because the person is looking at
// five green ticks while being told they failed. Telling them to check a list
// that is already satisfied is how somebody concludes the app is broken and
// gives up — which for a sign-up screen means the club loses a member.
const PWNED_PASSWORD_MESSAGE =
  'That password meets the rules below, but it has appeared in a known data breach — so it can’t be used here. Pick a different one and you’ll go straight through.'

/**
 * Whether this refusal is the leaked-password check rather than the rules.
 *
 * ⚠️ `reasons` FIRST, PROSE SECOND. The array is the stable contract; the
 * sentence is GoTrue's and can be reworded without warning. The fallback exists
 * because a response that arrives without `reasons` — an older server, a proxy
 * that drops the body — would otherwise fall back to the message that sends
 * somebody to a checklist they have already satisfied.
 */
function isPwnedPassword(error, raw) {
  const reasons = Array.isArray(error?.reasons) ? error.reasons : []
  if (reasons.includes('pwned')) return true
  return /known to be weak|easy to guess|data breach|pwned/i.test(raw)
}

// "Invalid login credentials" is accurate and unhelpful. The overwhelmingly
// common cause during onboarding is not a wrong password — it is someone who
// registered and never opened the confirmation email, or who is trying to sign
// in before creating an account at all.
const INVALID_CREDENTIALS_MESSAGE =
  'That email and password don’t match. If you’ve just registered, check your inbox for the confirmation email first — your account isn’t active until you open it.'

const EMAIL_NOT_CONFIRMED_MESSAGE =
  'Please open the confirmation email we sent you before signing in. Check your spam folder if it isn’t there.'

export function friendlyAuthError(error, fallback) {
  const raw = typeof error?.message === 'string' ? error.message : ''
  const code = typeof error?.code === 'string' ? error.code : ''

  if (code === 'weak_password' || /password should (be|contain)/i.test(raw)) {
    // ⚠️ THE LEAKED-PASSWORD CASE IS CHECKED FIRST, INSIDE THIS BRANCH RATHER
    // THAN BEFORE IT, so both refusals stay visibly part of the same GoTrue
    // error rather than looking like two unrelated conditions somebody could
    // reorder safely.
    return isPwnedPassword(error, raw) ? PWNED_PASSWORD_MESSAGE : WEAK_PASSWORD_MESSAGE
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(raw)) {
    return EMAIL_NOT_CONFIRMED_MESSAGE
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(raw)) {
    return INVALID_CREDENTIALS_MESSAGE
  }
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

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-base text-ink focus:border-brand'
const LABEL = 'mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-faint'

// The live checklist. Rendered as a list rather than a single "password must
// contain…" sentence so a person can see WHICH part they are missing — the
// thing GoTrue's own message conspicuously fails to tell them.
//
// aria-live="polite" so a screen reader announces items turning green as they
// type, rather than the sighted user getting feedback nobody else does.
function PasswordChecklist({ password }) {
  const { rules } = checkPassword(password)
  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
      {rules.map((rule) => (
        <li
          key={rule.id}
          // Unmet rules are the darker of the two: they are the ones the
          // person still has to act on. Both clear AA on the card
          // (ink-muted 6.06:1, ink-faint 5.52:1) — checked, not assumed.
          className={
            'flex items-center gap-2 text-xs ' +
            (rule.met ? 'text-ink-faint' : 'text-ink-muted')
          }
        >
          {/* The tick/dot is decorative — the met/not-met state is carried in
              the visually-hidden text below, because colour and glyph alone
              are not accessible. */}
          <span aria-hidden="true" className={rule.met ? 'text-brand' : 'text-line'}>
            {rule.met ? '✓' : '•'}
          </span>
          <span>{rule.label}</span>
          <span className="sr-only">{rule.met ? ' — done' : ' — still needed'}</span>
        </li>
      ))}
    </ul>
  )
}

// `embedded` — render as a plain card inside somebody else's page, instead of
// as the whole screen. Used by /delete-account, which is public and therefore
// has to offer sign-in itself. Without it the full-screen dark panel lands in
// the middle of a light page and the result reads as two pages stitched
// together — which is the first thing a Play reviewer sees.
//
// It also drops the crest, the club name and the intro paragraph. Not for
// tidiness: the host page already carries an <h1>, and a second one is wrong
// for anyone using a screen reader to navigate by heading.
//
// ⚠️ EMBEDDED ALSO FORCES SIGN-IN ONLY. /delete-account is reached by someone
// on their way OUT; offering them "Create an account" on that page is absurd,
// and the tab strip would be the most prominent thing on it.
export default function Login({ authError = null, embedded = false }) {
  const {
    signInWithEmail,
    signInWithGoogle,
    signUpWithPassword,
    signInWithPassword,
    sendPasswordReset,
  } = useAuth()

  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // 'idle' | 'busy' | 'confirm-sent' | 'reset-sent' | 'link-sent'
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [staleAuthError, setStaleAuthError] = useState(authError)
  // Lazy initialiser, so the flag is taken exactly once per mount rather than
  // on every render.
  const [sessionExpired, setSessionExpired] = useState(() => takeSessionExpired())

  useEffect(() => {
    setStaleAuthError(authError)
  }, [authError])

  const busy = status === 'busy'
  const signingUp = mode === 'signup' && !embedded
  const forgotting = mode === 'forgot'

  const displayedError =
    error ??
    (staleAuthError ? `That sign-in link didn't work: ${staleAuthError}` : null) ??
    (sessionExpired ? SESSION_EXPIRED_MESSAGE : null)

  const passwordOk = checkPassword(password).valid
  // Submit stays disabled until the client rules pass, so in the normal case
  // the parent never meets GoTrue's 422 at all. Sign-IN does not gate on this:
  // someone whose existing password predates a rule change must still be able
  // to get in, and refusing to submit would lock them out with no explanation.
  const canSubmit = signingUp ? passwordOk : true

  function clearBanners() {
    setStaleAuthError(null)
    setSessionExpired(false)
    setError(null)
  }

  function switchMode(next) {
    setMode(next)
    setStatus('idle')
    clearBanners()
    // Password is deliberately NOT carried between modes. Someone who typed a
    // password into "sign in", failed, and switched to "create account" should
    // be making a fresh decision, not silently reusing a guess.
    setPassword('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    clearBanners()

    const trimmed = email.trim()
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }

    // ⚠️ A PRESENCE check, not a rules check — the two are different and the
    // distinction is the point. `canSubmit` deliberately does NOT gate sign-in
    // on the password rules (see above: an existing password that predates a
    // rule change must still work). But submitting an EMPTY password sends a
    // real request that returns invalid_credentials, which this screen
    // translates into "if you've just registered, check your inbox…" —
    // confidently wrong advice for someone who simply left the box blank.
    if (!forgotting && password.length === 0) {
      setError('Enter your password.')
      return
    }

    setStatus('busy')
    try {
      if (forgotting) {
        await sendPasswordReset(trimmed)
        setStatus('reset-sent')
        return
      }

      if (signingUp) {
        const { alreadyRegistered } = await signUpWithPassword(trimmed, password)
        // ⚠️ We do NOT branch the copy on `alreadyRegistered`. Saying "you
        // already have an account" confirms to anyone who asks that a given
        // address is a club member. The flag exists so this decision is
        // visible and deliberate rather than accidental — the "already have an
        // account?" link on the confirmation panel is the way out for the
        // person who genuinely forgot.
        void alreadyRegistered
        setStatus('confirm-sent')
        return
      }

      await signInWithPassword(trimmed, password)
      // On success the auth listener in AuthProvider swaps the session and
      // RequireAuth renders the real page. Nothing to do here — deliberately
      // no setStatus('idle'), because this component is about to unmount and
      // setting state on the way out is a warning in the console.
    } catch (err) {
      setError(
        friendlyAuthError(
          err,
          forgotting
            ? 'Something went wrong sending the reset email. Try again.'
            : signingUp
              ? 'Something went wrong creating your account. Try again.'
              : 'Something went wrong signing in. Try again.',
        ),
      )
      setStatus('idle')
    }
  }

  // ── The mothballed passwordless handlers ────────────────────────────────
  // Unreachable while SHOW_PASSWORDLESS is false. Kept wired up so flipping
  // that constant is genuinely the whole revival, with nothing else to
  // reconnect. See the note on the constant.
  async function handleMagicLink() {
    clearBanners()
    const trimmed = email.trim()
    if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.')
      return
    }
    setStatus('busy')
    try {
      await signInWithEmail(trimmed)
      setStatus('link-sent')
    } catch (err) {
      setError(friendlyAuthError(err, 'Something went wrong sending the link. Try again.'))
      setStatus('idle')
    }
  }

  async function handleGoogleClick() {
    clearBanners()
    setStatus('busy')
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(friendlyAuthError(err, 'Something went wrong signing in with Google. Try again.'))
      setStatus('idle')
    }
  }

  // ── Panels shown instead of the form once something has been sent ───────

  const sentPanel = (heading, body, showSignInLink) => (
    <div className="mt-6">
      <h2 className="text-center text-base font-bold text-ink">{heading}</h2>
      <p className="mt-2 text-center text-sm text-ink-faint">{body}</p>
      <Button
        variant="secondary"
        onClick={() => {
          // ⚠️ The second arm is only reachable with SHOW_PASSWORDLESS on, and
          // it used to call switchMode(mode) — which does not clear `email`,
          // so a button labelled "Use a different email" returned you to the
          // form with the same address still in it. Harmless while mothballed;
          // it would have bitten whoever revived magic link.
          if (showSignInLink) {
            switchMode('signin')
          } else {
            setEmail('')
            switchMode(mode)
          }
        }}
        full
        className="mt-5"
      >
        {showSignInLink ? 'Back to sign in' : 'Use a different email'}
      </Button>
    </div>
  )

  let panel = null
  if (status === 'confirm-sent') {
    // ⚠️ THIS PANEL MUST NEVER CLAIM AN EMAIL WAS DEFINITELY SENT.
    //
    // Signing up with an address that already has a login is a no-op: GoTrue
    // answers 200 with an obfuscated user and sends NOTHING. We cannot say
    // "that email is taken" — that would confirm to anyone asking that a named
    // family are club members — so from here the two outcomes are
    // indistinguishable and the copy has to hold both.
    //
    // ⚠️ IT DID NOT, AND IT COST AN HOUR ON 8 AUG 2026. This opened with "We've
    // sent a confirmation link to X" and put the caveat in a second sentence.
    // Jay — who wrote the spec for this behaviour — read the first line, waited
    // for an email that was never coming, and reported it as a fault. A parent
    // has no chance. Lead with the condition, and give BOTH ways out equal
    // weight, because the app genuinely does not know which one applies.
    panel = (
      <div className="mt-6">
        <h2 className="text-center text-base font-bold text-ink">Check your email</h2>
        <p className="mt-2 text-center text-sm text-ink-faint">
          If <strong className="text-ink">{email.trim()}</strong> is new, we’ve sent a
          confirmation link — open it to activate your account.
        </p>
        <p className="mt-2 text-center text-sm text-ink-faint">
          <strong className="text-ink">
            If that address already has an account, nothing will arrive.
          </strong>{' '}
          Sign in below, or reset your password if you’ve forgotten it.
        </p>
        <Button variant="secondary" onClick={() => switchMode('signin')} full className="mt-5">
          Back to sign in
        </Button>
        <Button
          variant="secondary"
          onClick={() => switchMode('forgot')}
          full
          className="mt-3 !text-ink"
        >
          Reset my password
        </Button>
      </div>
    )
  } else if (status === 'reset-sent') {
    panel = sentPanel(
      'Check your email',
      <>
        If there’s an account for <strong className="text-ink">{email.trim()}</strong>, we’ve
        sent a link to set a new password.
      </>,
      true,
    )
  } else if (status === 'link-sent') {
    panel = sentPanel(
      'Check your email',
      <>
        We’ve sent a sign-in link to <strong className="text-ink">{email.trim()}</strong>. Open
        it on this device to continue.
      </>,
      false,
    )
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
          <p className="mt-4 text-center text-sm leading-relaxed text-ink-faint">
            Quins Club Hub is for Abu Dhabi Harlequins members. Create an account to
            get started, or sign in if you already have one.
          </p>
        </>
      )}

      {panel ?? (
        <>
          {/* Tab strip. Hidden when embedded — see the note on the component. */}
          {!embedded && !forgotting && (
            <div
              role="tablist"
              aria-label="Sign in or create an account"
              className="mt-6 grid grid-cols-2 gap-1 rounded-[11px] bg-surface-sunk p-1"
            >
              {[
                ['signin', 'Sign in'],
                ['signup', 'Create account'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => switchMode(value)}
                  className={
                    'rounded-[8px] px-3 py-2 text-sm font-bold transition ' +
                    (mode === value
                      ? 'bg-surface-card text-ink shadow-card'
                      : 'text-ink-faint')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <form className="mt-4" onSubmit={handleSubmit} noValidate>
            {displayedError && (
              <p
                role="alert"
                className="mb-4 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
              >
                {displayedError}
              </p>
            )}

            {forgotting && (
              <p className="mb-4 text-sm text-ink-faint">
                Enter your email address and we’ll send you a link to set a new password.
              </p>
            )}

            <label htmlFor="login-email" className={LABEL}>
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
              className={FIELD}
            />

            {!forgotting && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="login-password" className={LABEL}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-faint underline"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  // new-password on sign-up tells a password manager to OFFER
                  // to generate one; current-password on sign-in tells it to
                  // fill. Getting these the wrong way round is why managers
                  // sometimes overwrite a saved entry.
                  autoComplete={signingUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={FIELD}
                />
                {signingUp && <PasswordChecklist password={password} />}
              </div>
            )}

            <Button type="submit" disabled={busy || !canSubmit} full className="mt-4">
              {busy
                ? 'Please wait…'
                : forgotting
                  ? 'Email me a reset link'
                  : signingUp
                    ? 'Create account'
                    : 'Sign in'}
            </Button>

            {!signingUp && (
              <button
                type="button"
                onClick={() => switchMode(forgotting ? 'signin' : 'forgot')}
                className="mt-3 w-full text-center text-sm font-semibold text-ink-faint underline"
              >
                {forgotting ? 'Back to sign in' : 'Forgot password?'}
              </button>
            )}

            {/* ⚠️ THE ONE HOLE THE `?` BUTTON CANNOT COVER, AND IT IS THE
                LIKELIEST PROBLEM ANYBODY WILL EVER HAVE.
                claude/plans/2026-08-18-help-and-feedback.md puts a floating
                help button on every signed-in screen — but this screen is
                outside AppShell by definition, so somebody who cannot get in
                cannot reach it. That is the exact person who most needs to
                reach somebody.

                ⚠️ A MAILTO, NOT THE FORM. Making the report form work
                signed-out means accepting rows from anyone on the internet,
                which means spam handling, for a case one link covers. The
                subject is prefilled so the mailbox can see at a glance that
                this is a locked-out member rather than general help. */}
            <p className="mt-4 text-center text-sm text-ink-faint">
              Can&rsquo;t get in?{' '}
              <a
                href="mailto:help@adhquins-clubhub.com?subject=Can%27t%20sign%20in"
                className="font-semibold text-brand underline"
              >
                Email us
              </a>
            </p>

            {/* ⚠️ MOTHBALLED — see SHOW_PASSWORDLESS at the top of this file.
                Flip that constant to bring both routes back. */}
            {SHOW_PASSWORDLESS && !forgotting && (
              <>
                <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <span className="h-px flex-1 bg-line" />
                  or
                  <span className="h-px flex-1 bg-line" />
                </div>

                <Button variant="secondary" onClick={handleMagicLink} disabled={busy} full>
                  Email me a link instead
                </Button>

                {/* text-ink, not the variant's brand red: this is a neutral
                    alternative to the primary action above, and two red
                    controls stacked would read as two primary buttons. */}
                <Button
                  variant="secondary"
                  onClick={handleGoogleClick}
                  disabled={busy}
                  full
                  className="mt-3 !text-ink"
                >
                  Continue with Google
                </Button>
              </>
            )}
          </form>
        </>
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
