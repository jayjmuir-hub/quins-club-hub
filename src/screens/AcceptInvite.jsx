import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import Spinner from '../components/Spinner.jsx'
import crest from '../assets/crest.png'
import { acceptInvite } from '../data/members.js'
import { useMemberships } from '../lib/memberships.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'
import { useAuth } from '../lib/auth.jsx'

// The invitee-facing half of Task 18's invite flow, reached via
// /accept-invite/:token (see src/App.jsx for why this route sits outside
// AppShell rather than nested inside it: a brand-new invitee has zero
// memberships, and AppShell only renders its routed children once
// memberships.length > 0 — this screen has to be reachable before that's
// true).
//
// On mount, calls acceptInvite(token), which runs the accept_invite
// SECURITY DEFINER RPC server-side (token lookup, "already used"/"wrong
// email" checks, the actual membership insert) — none of that validation
// happens here. On success this person now has one or more membership rows
// that didn't exist a moment ago — accept_invite returns `SETOF memberships`
// and creates one row per invite_targets row, so a parent invited for two
// children lands two. This screen deliberately ignores the RESOLVED VALUE
// (`.then(() => …)`, not `.then((row) => …)`): all it needs to know is that
// the call succeeded, so the array-vs-object change costs it nothing and
// nothing here may assume a single object. useMemberships()'s MembershipProvider has
// no way to know that on its own (its effect only re-runs on
// [session, reloadToken], and accepting an invite changes neither), so
// reload() is called explicitly before navigating home, or the rest of the
// app would still show the zero-membership screen after the redirect.
//
// A failure shows the RPC's own message (already friendly — see
// src/data/members.js's acceptInvite doc comment) in a role="alert" region,
// not a generic "something went wrong" wrapper: "this invite was already
// used" and "wrong email" are actionable, specific messages worth showing
// verbatim.

export default function AcceptInvite() {
  const { token } = useParams()
  const { reload } = useMemberships()
  const [status, setStatus] = useState('loading')
  const { signOut } = useAuth()
  const [error, setError] = useState(null)

  // Guards against React 18 StrictMode's double-invoke-in-dev (and any
  // accidental re-render before the token changes) calling the RPC twice —
  // accept_invite is not safely retryable by design: a second call for an
  // already-accepted token is exactly the "already been used" refusal this
  // screen must not confuse with a genuine failure.
  //
  // Deliberately no companion "mounted" flag here. StrictMode's dev-only
  // double-invoke (mount → synchronous cleanup → remount, before first
  // paint) doesn't actually unmount this screen for real, so there's nothing
  // to protect the in-flight promise's `.then()`/`.catch()` from — a
  // "mounted" ref set false by the throwaway first mount's cleanup would
  // just make that same promise's eventual resolution silently no-op
  // forever, which is exactly what used to make this screen hang under
  // `npm run dev`. calledRef alone already does the one job that matters
  // (never issue a second real network call), and a genuine unmount before
  // the promise settles (e.g. the user navigating away) is harmless: the
  // component is gone, so its setState calls are simply dropped by React
  // with a no-op (React 18 doesn't warn about this post-unmount).
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true

    acceptInvite(token)
      .then(() => {
        reload()
        setStatus('done')
      })
      .catch((err) => {
        setError(err)
        setStatus('error')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload comes
    // from context and is stable enough here; token is the only input this
    // effect should ever re-run for, and calledRef already guards a re-run
    // within the same mount.
  }, [token])

  if (status === 'done') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-app items-center justify-center bg-surface px-4 text-ink">
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface-card p-6 text-center shadow-card">
        {/* Standalone branding header for this screen only — this route is
            a brand-new invitee's first-ever view of the app (see the top of
            this file for why it sits outside AppShell), so a small crest +
            club name here is worth the couple of lines even though the rest
            of this card stays a plain unchromed status card. Not the full
            AppShell gradient header/nav — this is a lighter touch on
            purpose. */}
        <img
          src={crest}
          alt="Abu Dhabi Harlequins crest"
          className="mx-auto h-14 w-14 object-contain"
        />
        <p className="mt-2 text-center text-xs font-semibold uppercase tracking-widest text-ink-faint">
          Abu Dhabi Harlequins
        </p>

        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner label="Accepting your invite…" />
            <p aria-hidden="true" className="text-sm text-ink-muted">
              Accepting your invite…
            </p>
          </div>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-lg font-extrabold text-danger-ink">We couldn&apos;t accept that invite</h2>
            <p role="alert" className="mt-2 text-sm leading-relaxed text-danger-ink">
              {friendlyMessage(error, "We couldn't accept that invite. Try again.")}
            </p>
            {/* ⚠️ A WAY OUT (2 Sep 2026 UX review, High). This route sits
                outside the shell — no nav, no crest link, no sign-out — so a
                parent with a used or wrong-address invite was stranded on
                this card. AuthConfirm's error state already offers the same
                two doors. */}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                to="/"
                className="inline-block rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white"
              >
                Go to the app
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="inline-block rounded-[11px] border border-line px-4 py-2.5 text-sm font-bold text-ink"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
