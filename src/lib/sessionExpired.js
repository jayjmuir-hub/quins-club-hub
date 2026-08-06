// A one-word note passed from the session guard to the login screen.
//
// WHY IT EXISTS. The session guard in supabase.js sits BELOW React, in the
// fetch layer. When it catches a silent downgrade to anon (commit c80f51e) it
// signs the app out — which is right, the UI was lying — but React only ever
// learns "there is no session", never why. The result, live on 6 Aug 2026, was
// somebody being thrown to the login screen mid-task with no explanation at
// all. Better than the silent nothing it replaced; still not good enough.
//
// WHY ITS OWN MODULE. It has to be readable from both supabase.js and
// Login.jsx. Exporting it from either one would make the import circular, and
// putting the literal string in both invites the two halves to drift apart —
// a typo would produce no error anywhere, just a message that never appears.
//
// WHY sessionStorage. The message is about THIS TAB, right now. localStorage
// would resurface it days later in a different window, attached to nothing.
//
// Every access is wrapped: storage can throw outright in some privacy modes,
// and a missing explanation is a far smaller problem than a login screen that
// crashes.

export const SESSION_EXPIRED_KEY = 'quins:session-expired'

export function markSessionExpired() {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1')
  } catch {
    // Nothing to do. The sign-out still happens; only the reason is lost.
  }
}

// Read AND clear, in one call, so the message cannot be shown twice.
export function takeSessionExpired() {
  try {
    if (sessionStorage.getItem(SESSION_EXPIRED_KEY) === null) return false
    sessionStorage.removeItem(SESSION_EXPIRED_KEY)
    return true
  } catch {
    return false
  }
}
