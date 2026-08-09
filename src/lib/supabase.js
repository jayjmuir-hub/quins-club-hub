import { createClient } from '@supabase/supabase-js'
import { markSessionExpired } from './sessionExpired.js'
import { clearCachedApiResponses } from './apiCache.js'

// Single-responsibility Supabase client for the app. No auth helpers, no
// query helpers, no retry logic — those belong to later tasks.
//
// The one thing that DOES live here is the session guard below, because it has
// to sit underneath every request the client makes and there is no other place
// that does.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const missing = []
if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')

if (missing.length > 0) {
  throw new Error(
    `Missing required Supabase env var(s): ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in the values from Supabase → Settings → API.',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// THE SESSION GUARD — why this exists
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ supabase-js SILENTLY DOWNGRADES A SIGNED-IN REQUEST TO ANON. From its own
// source (@supabase/supabase-js dist/index.mjs, SupabaseClient):
//
//     async _getAccessToken() {
//       return (await this._getSessionToken()) ?? this.supabaseKey
//     }
//
// If `auth.getSession()` comes back empty for ANY reason, every subsequent
// request goes out bearing the publishable key instead — which Postgres reads
// as role `anon`. Nothing throws. Nothing logs.
//
// That matters here because two different things track "is Jay signed in":
//   - AuthProvider holds a SNAPSHOT, set at mount and on auth events.
//   - _getAccessToken reads LIVE STORAGE on every single request.
// They can disagree, and when they do the app renders a signed-in person whose
// every request arrives as a stranger.
//
// Proved live on production 6 Aug 2026 — same URL, same apikey header, only the
// bearer swapped: user JWT returned 4 rows, publishable key returned 0 rows,
// BOTH HTTP 200, no error body either way. See
// claude/decisions/2026-08-06-session-guard.md.
//
// ⚠️ THIS GOT HARDER TO SPOT, NOT EASIER. Before migration
// `grant_anon_execute_on_two_profile_helpers` the name save raised a loud
// `42501 permission denied for function shares_admin_club`. That grant was
// correct, and it turned the loud error into a silent zero-row no-op. At 279
// people the only symptom left is "I pressed save and nothing happened".
//
// WHAT THE GUARD DOES: it watches the bearer on every outgoing data request.
// Once it has seen a real user JWT go out, it knows a session existed on this
// page. If a later request drops back to the publishable key, that is the
// downgrade — so it refuses the request, signs the app out locally so the UI
// stops lying, and raises a message a parent can act on.
//
// WHY "once we have seen a real JWT" rather than asking React: this file sits
// below React and must not import it. The armed flag is self-contained, and it
// is also why a genuinely signed-out visitor never trips it — a person on the
// login screen or on /accept-invite has never had a JWT, so the guard stays
// disarmed and every anon request they make proceeds normally.

// Only DATA paths. `/auth/v1/` is excluded deliberately: signing in, refreshing
// and signing out all legitimately carry the publishable key, and guarding them
// would break sign-in itself.
const GUARDED_PATH_SEGMENTS = ['/rest/v1/', '/storage/v1/', '/functions/v1/']

export class SessionExpiredError extends Error {
  constructor() {
    super("You've been signed out. Sign in again, then try that once more.")
    this.name = 'SessionExpiredError'
  }
}

/**
 * Builds the guarded fetch. Exported as a factory purely so the tests can drive
 * it directly with a fake fetch — the app only ever uses the instance below.
 *
 * @param anonKey       the publishable key; seeing it as the bearer IS the fault
 * @param fetchImpl     injectable for tests
 * @param onLostSession called once, at the moment the downgrade is caught
 */
export function createSessionGuard({ anonKey, fetchImpl, onLostSession } = {}) {
  if (!anonKey) throw new Error('createSessionGuard needs the publishable anonKey.')
  // Default must be a wrapper, not a bare reference: passing window.fetch around
  // detached from window throws "Illegal invocation" in the browser.
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args))
  const lost = onLostSession || (() => {})

  // Has a real user JWT ever gone out on this page? Starts false so a
  // signed-out visitor is never blocked.
  let armed = false
  // Separate from `armed` on purpose — see the retry note below.
  let notified = false

  async function guardedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input)
    const isDataRequest = GUARDED_PATH_SEGMENTS.some((segment) => url.includes(segment))

    if (isDataRequest) {
      // supabase-js passes headers in `init`, but a Request object carries its
      // own — read both rather than assuming which call style produced this.
      let bearer = ''
      try {
        const headers = new Headers((init && init.headers) || (input && input.headers) || {})
        bearer = (headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
      } catch {
        // An unreadable header is not evidence of a downgrade. Fall through and
        // let the request go: a guard that blocks on uncertainty would be a new
        // outage of its own.
        bearer = ''
      }

      if (bearer && bearer !== anonKey) {
        armed = true
        notified = false
      } else if (armed) {
        // ⚠️ STAY ARMED. postgrest-js wraps every request in executeWithRetry
        // and RE-SENDS when fetch throws (PostgrestBuilder.ts). The first
        // version of this disarmed itself here, so the retry found a disarmed
        // guard and went through — the guard fired once, invisibly, and the
        // anon request reached the database anyway. That is worse than no
        // guard, because the tests looked green.
        //
        // Only an explicit disarm() clears this now. `notified` is what keeps
        // the message to one per incident.
        if (!notified) {
          notified = true
          lost()
        }
        throw new SessionExpiredError()
      }
    }

    return doFetch(input, init)
  }

  return {
    fetch: guardedFetch,
    disarm() {
      armed = false
      notified = false
    },
    isArmed() {
      return armed
    },
  }
}

// Assigned just after createClient below. The guard's own clean-up MUST go
// through this and not through supabase.auth.signOut, because that wrapper
// disarms the guard — which would re-open the retry hole described above.
let nativeSignOut = null

export const sessionGuard = createSessionGuard({
  anonKey: supabaseAnonKey,
  onLostSession: () => {
    // scope 'local' — clear THIS browser only, and make no network call. The
    // session is already gone; the point is to make the UI admit it, so
    // AuthProvider hears SIGNED_OUT and RequireAuth shows the login screen
    // instead of a signed-in shell that cannot save anything.
    //
    // Deliberately NOT 'global': a stale tab must not revoke the session on
    // someone's phone.
    //
    // Leave a note first, so the login screen can say WHY. Verified live on
    // 6 Aug 2026 that without this the person is simply thrown to a login
    // screen mid-task with no explanation — the right outcome, presented as
    // though the app had broken.
    markSessionExpired()
    // The service worker's cached REST responses belong to a session that no
    // longer exists. Purged HERE as well as in the signOut wrapper below,
    // because this path deliberately calls nativeSignOut and so never reaches
    // that wrapper — see the note on it. Not awaited: the sign-out below is the
    // urgent half, and syncApiCacheOwner() purges again on the next load if
    // this has not finished.
    clearCachedApiResponses()
    if (nativeSignOut) nativeSignOut({ scope: 'local' }).catch(() => {})
  },
})

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: sessionGuard.fetch,
  },
})

// A DELIBERATE sign-out must not leave the guard armed, or the next anon
// request — the login screen doing its ordinary work — would be blocked.
//
// ⚠️ THIS WAS FIRST WRITTEN AS onAuthStateChange('SIGNED_OUT') AND THAT WAS
// WRONG — it disarmed the guard at the exact moment the guard was needed, and
// the end-to-end test caught it. auth-js emits SIGNED_OUT when it *discovers*
// there is no session, which happens INSIDE the getSession() call that
// _getAccessToken makes just before the request goes out. So the order was:
// discover no session -> emit SIGNED_OUT -> disarm -> send the anon request
// unguarded. The guard passed all ten of its direct tests while doing nothing
// whatsoever in the app.
//
// Wrapping signOut instead keys on INTENT: the app asked to sign out, so the
// app already knows, and there is nothing left to warn anybody about.
nativeSignOut = supabase.auth.signOut.bind(supabase.auth)
supabase.auth.signOut = async (...args) => {
  sessionGuard.disarm()
  // ⚠️ THE PURGE GOES HERE, NOT IN AuthProvider's signOut(), and the difference
  // is which paths it catches. Two callers never touch that function: the
  // account-deletion flow calls supabase.auth.signOut directly
  // (src/data/account.js), and the session guard's own cleanup goes through
  // nativeSignOut above. This wrapper is the one place a deliberate sign-out
  // cannot get past. clearPhotoUrlCache() sits in AuthProvider for historical
  // reasons and has the same gap; it is a smaller one, because a signed photo
  // URL dies within the hour on its own.
  await clearCachedApiResponses()
  return nativeSignOut(...args)
}
