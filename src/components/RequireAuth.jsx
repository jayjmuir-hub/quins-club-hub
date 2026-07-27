import { useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import Login from '../screens/Login.jsx'

// Gates its children behind an authenticated session: shows a loading
// indicator while the initial session check is in flight, the Login screen
// when there is none, and the children once a session exists. It renders in
// place rather than redirecting to a /login route, so a magic-link recipient
// landing on any deep URL still lands correctly after sign-in.
//
// It also does the one piece of URL cleanup this app needs: supabase-js
// (detectSessionInUrl: true) consumes the magic-link/OAuth token from the URL
// fragment itself and fires onAuthStateChange — this component never parses
// or exchanges tokens. Once a session is established, if a leftover
// #access_token=... or #error_description=... fragment is still in the
// address bar, it's stripped with replaceState (not pushState, so no extra
// history entry) so it isn't left visible or bookmarkable.

export default function RequireAuth({ children }) {
  const { session, loading } = useAuth()

  useEffect(() => {
    if (!session) return

    const hash = window.location.hash
    if (hash.includes('access_token') || hash.includes('error_description')) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      )
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
    return <Login />
  }

  return children
}
