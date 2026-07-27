import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth.jsx'
import Login from '../screens/Login.jsx'

// Gates its children behind an authenticated session: shows a loading
// indicator while the initial session check is in flight, the Login screen
// when there is none, and the children once a session exists. It renders in
// place rather than redirecting to a /login route, so a magic-link recipient
// landing on any deep URL still lands correctly after sign-in.
//
// It also does the URL cleanup this app needs. supabase-js
// (detectSessionInUrl: true) consumes the magic-link/OAuth token from the URL
// fragment itself and fires onAuthStateChange — this component never parses
// or exchanges tokens. Two distinct fragment shapes need handling, and they
// can't share one condition because one requires a session and the other
// requires the *absence* of one:
//
// - Success: a #access_token=... fragment, cleared once a session exists
//   (supabase-js needed it to still be there to consume).
// - Failure: an expired/invalid magic link or a declined OAuth attempt never
//   produces a session, so Supabase instead leaves an
//   #error=...&error_description=... fragment. That has to be read
//   regardless of session state (there will never be one), captured so
//   Login can explain what happened, and then cleared.
//
// A captured authError otherwise lives for the app's whole lifetime, since
// this component never unmounts across sign-in/sign-out — Task 8 adds
// in-SPA sign-out, so without the cleanup effect below, a stale "that
// sign-in link didn't work" message from an earlier failed attempt could
// resurface on the Login screen after a later, unrelated sign-out. The
// effect clears it only on a real session-goes-away transition (tracked via
// a ref), not on first mount, so a freshly captured error from this load's
// own URL fragment is left alone.

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  const [authError, setAuthError] = useState(null)
  const hadSessionRef = useRef(false)

  // Capture and clear a failed-attempt error from the URL fragment. Runs
  // once on mount rather than depending on session, since a failed attempt
  // never establishes one.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const params = new URLSearchParams(hash.slice(1))
    const description = params.get('error_description')
    if (!description) return

    setAuthError(description)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [])

  // Clear the successful-attempt token fragment once supabase-js has
  // consumed it and a session exists.
  useEffect(() => {
    if (!session) return

    const hash = window.location.hash
    if (hash.includes('access_token')) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
    }
  }, [session])

  // Clear a captured authError once the session goes away — but only on a
  // genuine transition (had a session, now don't, e.g. sign-out), never on
  // first mount. hadSessionRef starts false, so the very first run here
  // never clears whatever the effect above just captured from this load's
  // own URL fragment.
  useEffect(() => {
    const hadSession = hadSessionRef.current
    hadSessionRef.current = Boolean(session)

    if (hadSession && !session) {
      setAuthError(null)
    }
  }, [session])

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center bg-[image:linear-gradient(100deg,theme(colors.quinsRedDark)_0%,theme(colors.quinsRed)_42%,#B23A38_62%,theme(colors.quinsGreen)_100%)] text-white"
      >
        <p className="text-sm font-semibold uppercase tracking-widest opacity-80">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <Login authError={authError} />
  }

  return children
}
