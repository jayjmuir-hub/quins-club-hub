import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { clearPhotoUrlCache } from '../data/photos.js'

// Auth context for the app: current session/user, loading state, and the
// three sign-in/sign-out actions. No sign-up, password auth, profile
// loading, or membership loading here — those belong to other tasks.

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        setSession(data?.session ?? null)
      })
      .catch(() => {
        // Swallow here only: loading still resolves to false below so the
        // app doesn't hang. The user simply starts signed out.
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signInWithEmail(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // ⚠️ COME BACK TO THE PAGE THEY STARTED ON, not the site root.
      //
      // This used to be window.location.origin, which drops the path — and
      // that quietly broke the ONE journey where the path is the whole point.
      // An invitee opens /accept-invite/<token>, RequireAuth renders Login in
      // place (URL preserved), they request a link... and the magic link
      // returned them to "/", where a person with zero memberships is shown
      // the REQUEST ACCESS gate. An invited parent being asked to request
      // access is the wrong screen, and the invite only completed if they
      // went back to the original message and tapped the link a second time.
      //
      // Deliberately origin + pathname + search, NOT window.location.href:
      // the HASH is where Supabase puts #access_token=... and
      // #error_description=..., and echoing a stale fragment back into the
      // next magic link is at best confusing and at worst leaks a token into
      // an email.
      //
      // Requires the deep path to be allow-listed in Supabase Auth → URL
      // Configuration → Redirect URLs, or Supabase silently falls back to the
      // Site URL and this change looks like it did nothing.
      // `https://adhquins-clubhub.com/**` is present — verified 6 Aug 2026.
      options: {
        emailRedirectTo:
          window.location.origin + window.location.pathname + window.location.search,
      },
    })
    if (error) throw error
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Same reasoning as signInWithEmail above: an invitee who signs in with
      // Google from /accept-invite/<token> must come back to that page, not
      // to "/". Kept identical to the magic-link case on purpose — two
      // sign-in buttons on one screen that land you in different places is
      // the kind of difference nobody notices until it is a support request.
      options: {
        redirectTo:
          window.location.origin + window.location.pathname + window.location.search,
      },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    // Drop any signed photo URLs held in memory. They expire within the hour
    // on their own, but the next person to use this browser must not inherit
    // working links to the previous user's squad photos in the meantime.
    clearPhotoUrlCache()
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signInWithEmail,
    signInWithGoogle,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
