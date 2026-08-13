import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import crest from '../assets/crest.png'

// Where every emailed auth link lands: confirm-your-email, password reset,
// email change, and the (currently hidden) magic link.
//
// ══ WHY THIS EXISTS ═════════════════════════════════════════════════════
// Until 9 Aug 2026 the emails linked straight at
// `https://<project-ref>.supabase.co/auth/v1/verify?...`. That worked, and it
// cost us twice:
//
//   1. SPAM. The mail is FROM send.adhquins-clubhub.com and every link in it
//      pointed at supabase.co. Sender domain ≠ link domain is a textbook
//      phishing signature and Gmail, Outlook and Yahoo all weight it heavily.
//      Janice's confirmation landed in Yahoo's junk folder.
//   2. TRUST. Jay's words: "how do we fix the link saying lush?" — the project
//      ref reads as `lusmshimxdcxpnrktlgz`, which is exactly the sort of
//      hostname people are taught not to click.
//
// The Send Email Hook hands over a `token_hash`, NOT a finished URL, so
// nothing ever forced us to assemble a supabase.co link out of it. The email
// now points here, and this screen redeems the token with verifyOtp. Every
// link in every auth email reads as the club's own domain.
//
// ⚠️ THE PAID ALTERNATIVE WAS REJECTED ON COST, not on merit. Supabase's
// custom-domain add-on would give auth.adhquins-clubhub.com and needs no code
// at all. This comment used to add "but it requires a PAID plan, and this org
// is on Free. Pro plus the add-on is roughly $35/month ... If the project ever
// moves to Pro for other reasons, that route becomes worth reconsidering."
//
// ⚠️ THE PROJECT MOVED TO PRO ON 13 Aug 2026, so the condition this comment set
// has been met and the sum has changed: Pro is being paid for anyway, so the
// add-on alone is the marginal cost.
//
// ⚠️ IT IS STILL NOT RECOMMENDED, and this is a note rather than a plan. This
// screen already achieves the same outcome — every link in every auth email
// reads as the club's own domain — and it is deployed, tested and working. The
// add-on would buy a tidier hostname in a place no parent looks, for a
// recurring fee. It is Jay's call, not a judgement to be made in a refactor.
// Whichever way it goes, THIS SCREEN KEEPS WORKING and must not be deleted:
// the emailed links point here, and they are already in people's inboxes.
//
// ══ ⚠️ THE OPEN REDIRECT THIS SCREEN COULD HAVE BEEN ════════════════════
// `next` arrives in the query string, from an email, and this screen redirects
// to it AFTER establishing a session. An attacker who could get an arbitrary
// value in there would have a link on the club's own domain that signs a
// person in and then bounces them to a site of the attacker's choosing —
// carrying the trust of adhquins-clubhub.com with them.
//
// So `next` is validated as a SAME-ORIGIN PATH before it is used, and anything
// else falls back to '/'. See safeNext below; it is the most security-relevant
// twelve lines in this file.

const TITLE = {
  signup: 'Confirming your email address',
  email: 'Confirming your email address',
  invite: 'Opening your invitation',
  magiclink: 'Signing you in',
  recovery: 'Opening your password reset',
  email_change: 'Confirming your new email address',
}

// The types Supabase's verifyOtp accepts for an emailed link. Anything else in
// the URL is refused rather than passed through — verifyOtp would reject it
// anyway, but with a message written for a developer, not for a parent.
const VALID_TYPES = new Set(Object.keys(TITLE))

/**
 * The path to send someone to once their token is redeemed.
 *
 * ⚠️ SAME-ORIGIN PATHS ONLY. Rejects anything that is not a plain absolute
 * path on this site:
 *   - `//evil.example` — protocol-relative, a browser treats it as a HOST
 *   - `https://evil.example` — absolute
 *   - `/\evil.example` — backslash, which some browsers normalise to `//`
 *   - anything not starting with `/`
 *
 * A full URL on OUR OWN origin is accepted and reduced to its path, because
 * that is the shape Supabase's `redirect_to` arrives in.
 */
export function safeNext(raw, origin) {
  if (typeof raw !== 'string' || raw === '') return '/'

  // Absolute URL: keep it only if the origin matches ours exactly.
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      if (url.origin !== origin) return '/'
      return `${url.pathname}${url.search}${url.hash}` || '/'
    } catch {
      return '/'
    }
  }

  // Must be a plain path, and must not be the protocol-relative `//host` form
  // or its backslash cousin.
  if (!raw.startsWith('/')) return '/'
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}

export default function AuthConfirm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  // ⚠️ StrictMode mounts effects TWICE in development, and this token is
  // SINGLE-USE. Without this guard the second run redeems an already-spent
  // token, fails, and shows "this link has expired" for a link that just
  // worked — in dev only, which is the worst place to lose an hour.
  const ran = useRef(false)

  const type = params.get('type') ?? ''
  const heading = TITLE[type] ?? 'Opening your link'

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const tokenHash = params.get('token_hash')
    const next = safeNext(params.get('next'), window.location.origin)

    if (!tokenHash || !VALID_TYPES.has(type)) {
      setError('That link is missing something. Ask for a new one and try again.')
      return
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type })
      .then(({ error: verifyError }) => {
        if (verifyError) {
          // Supabase's own wording here is developer-facing ("Token has
          // expired or is invalid"), and this screen is read by a parent on a
          // phone. One sentence, and it says what to do next.
          setError(
            'That link has expired or has already been used. Ask for a new one and try again.',
          )
          return
        }

        // ⚠️ RECOVERY GOES TO /reset-password, ALWAYS, whatever `next` says.
        // verifyOtp has just put a recovery session in place and that session
        // exists for exactly one purpose: setting a new password. Dropping the
        // person on the dashboard instead leaves them holding it with nowhere
        // to spend it — which is the precise failure ResetPassword's own header
        // comment warns about from the other side.
        navigate(type === 'recovery' ? '/reset-password' : next, { replace: true })
      })
      .catch(() => {
        setError("We couldn't open that link. Check your connection and try again.")
      })
    // Deliberately runs once, on mount. See `ran` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main className="mx-auto mt-10 max-w-[420px] px-5 text-center">
      <img src={crest} alt="" className="mx-auto h-14 w-14" />
      {error ? (
        <>
          <h1 className="mt-4 text-lg font-extrabold text-ink">This link didn&apos;t work</h1>
          <p role="alert" className="mt-2 text-sm leading-relaxed text-ink-muted">
            {error}
          </p>
          <a
            href="/"
            className="mt-5 inline-block rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white"
          >
            Go to sign in
          </a>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-lg font-extrabold text-ink">{heading}</h1>
          {/* No spinner component here on purpose: this screen is usually on
              display for a few hundred milliseconds, and a spinner that flashes
              in and out reads as a glitch. */}
          <p className="mt-2 text-sm text-ink-muted">One moment…</p>
        </>
      )}
    </main>
  )
}
