import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import Spinner from '../components/Spinner.jsx'
import { acceptInvite } from '../data/members.js'
import { useMemberships } from '../lib/memberships.jsx'

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
// happens here. On success this person now has exactly one membership row
// that didn't exist a moment ago; useMemberships()'s MembershipProvider has
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
  const [error, setError] = useState(null)

  // Guards against React 18 StrictMode's double-invoke-in-dev (and any
  // accidental re-render before the token changes) calling the RPC twice —
  // accept_invite is not safely retryable by design: a second call for an
  // already-accepted token is exactly the "already been used" refusal this
  // screen must not confuse with a genuine failure.
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return undefined
    calledRef.current = true

    let mounted = true

    acceptInvite(token)
      .then(() => {
        if (!mounted) return
        reload()
        setStatus('done')
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setStatus('error')
      })

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload comes
    // from context and is stable enough here; token is the only input this
    // effect should ever re-run for, and calledRef already guards a re-run
    // within the same mount.
  }, [token])

  if (status === 'done') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f3] px-4 text-[#221f1d]">
      <div className="w-full max-w-[420px] rounded-2xl border border-[#e6e3e1] bg-white p-6 text-center shadow-[0_6px_24px_rgba(20,20,20,0.10)]">
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Spinner label="Accepting your invite…" />
            <p aria-hidden="true" className="text-sm text-[#5c5854]">
              Accepting your invite…
            </p>
          </div>
        )}

        {status === 'error' && (
          <>
            <h2 className="text-lg font-extrabold text-quinsRedDark">We couldn&apos;t accept that invite</h2>
            <p role="alert" className="mt-2 text-sm leading-relaxed text-quinsRedDark">
              {error?.message || "We couldn't accept that invite. Try again."}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
