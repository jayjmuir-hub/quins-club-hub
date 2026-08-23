import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { clearPhotoUrlCache } from '../data/photos.js'
import { syncApiCacheOwner } from './apiCache.js'
import { unsubscribeFromPush } from './push.js'

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
      .then(async ({ data }) => {
        const next = data?.session ?? null
        // ⚠️ AWAITED, AND BEFORE setSession. This is the cold-start check that
        // stops one person reading another's cached REST responses off a shared
        // device (see src/lib/apiCache.js). It has to finish before any screen
        // can issue a query, and this is the only point where that is
        // guaranteed: `loading` is cleared in the .finally below, so RequireAuth
        // is still showing its loading state for the whole of it.
        await syncApiCacheOwner(next?.user?.id ?? null)
        if (!mounted) return
        setSession(next)
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
      // Belt to the braces above: somebody signing in as a different person
      // within one page life. Not awaited, because that transition always
      // follows a sign-out, which has already purged synchronously through the
      // signOut wrapper in src/lib/supabase.js. A token refresh carries the
      // same uid, so this costs one localStorage read and returns.
      syncApiCacheOwner(newSession?.user?.id ?? null)
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

  // ── Password auth, added 8 Aug 2026 ────────────────────────────────────
  // See claude/decisions/2026-08-08-parent-self-registration.md. Parents now
  // self-register rather than being matched against a pre-seeded roster, so
  // the app needs sign-up, password sign-in and password reset. The magic-link
  // and Google functions above are DELIBERATELY LEFT INTACT — only their
  // buttons are hidden. Do not delete them.
  //
  // ⚠️ Magic link cannot actually be switched off. Supabase has no setting to
  // disable email SIGN-IN (only sign-up), and an email identity can always use
  // either route. Hiding the button is a UI decision, not a security boundary.

  async function signUpWithPassword(email, password) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Same reasoning as signInWithEmail above: come back to the page they
      // started on, and never echo the hash back.
      options: {
        emailRedirectTo:
          window.location.origin + window.location.pathname + window.location.search,
      },
    })
    if (error) throw error

    // ⚠️ SIGNING UP WITH AN ALREADY-REGISTERED EMAIL DOES NOT ERROR.
    // GoTrue returns 200 with an OBFUSCATED user — a plausible-looking user
    // object whose `identities` array is EMPTY — and sends no email. That is
    // deliberate on Supabase's part: erroring would confirm to anyone asking
    // that a given address has an account here, which for this app means
    // confirming a named family are club members.
    //
    // So we must NOT surface "that email is already taken". We return a flag,
    // and the screen shows the same "check your email" copy either way with a
    // visible route to sign in or reset instead. Telling the truth here is the
    // leak.
    const alreadyRegistered =
      Array.isArray(data?.user?.identities) && data.user.identities.length === 0

    // A session only comes back if email confirmation is OFF. It is ON
    // (dashboard, verified 8 Aug 2026), so this should always be null — it is
    // returned so the caller can branch rather than assume.
    return { alreadyRegistered, session: data?.session ?? null }
  }

  async function signInWithPassword(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function sendPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Absolute path, NOT origin + pathname: a reset link is opened from an
      // email, often on a different device, and must always land on the one
      // screen that can set a new password.
      //
      // ⚠️ Requires /reset-password in Supabase Auth → URL Configuration →
      // Redirect URLs, or Supabase silently falls back to the Site URL and the
      // person arrives holding a recovery session with nowhere to use it.
      redirectTo: window.location.origin + '/reset-password',
    })
    if (error) throw error
  }

  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  async function signOut() {
    // ⚠️ BEFORE supabase.auth.signOut(), NOT AFTER — the delete needs the
    // session that is about to end. This device's push row is THIS person's
    // claim on the phone; the next person to sign in here must not inherit
    // their notifications. Found 23 Aug 2026 on the first shared phone. A
    // failure here must not block signing out — the server-side takeover in
    // register_push_subscription covers the case where this did not run.
    try {
      await unsubscribeFromPush()
    } catch {
      // deliberately swallowed — see above
    }
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
    signUpWithPassword,
    signInWithPassword,
    sendPasswordReset,
    updatePassword,
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
