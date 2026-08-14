import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Tests for the session guard in src/lib/supabase.js.
//
// WHAT IS BEING GUARDED AGAINST — supabase-js does this, by design:
//
//     async _getAccessToken() {
//       return (await this._getSessionToken()) ?? this.supabaseKey
//     }
//
// An empty session silently becomes an anon request. Postgres then refuses it
// politely: HTTP 200, zero rows, no error. Proved live on production 6 Aug 2026
// with the bearer as the only variable — user JWT 4 rows, publishable key 0
// rows, both 200.
//
// ⚠️ EVERY TEST BELOW IS A FAULT INJECTION, not a confirmation that the code
// runs. The fault is "the bearer is the publishable key". If these tests ever
// stop failing when the guard is removed, they are worthless — check that
// first, before trusting them.

const MODULE_PATH = '../src/lib/supabase.js'

const ANON_KEY = 'sb_publishable_TESTKEY'
// Shape does not matter to the guard — only "is it the anon key" does. A
// realistic-looking value keeps the intent readable.
const USER_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.sig'

const REST = 'https://example.supabase.co/rest/v1/profiles?select=id'
const AUTH = 'https://example.supabase.co/auth/v1/token?grant_type=refresh_token'

async function loadGuard() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON_KEY)
  return import(MODULE_PATH)
}

describe('session guard', () => {
  let fetchImpl

  beforeEach(() => {
    fetchImpl = vi.fn(async () => new Response('[]', { status: 200 }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('lets a signed-out visitor through — it has never seen a session', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })

    await guard.fetch(REST, { headers: { Authorization: `Bearer ${ANON_KEY}` } })

    // Someone on the login screen or /accept-invite must not be blocked.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(guard.isArmed()).toBe(false)
  })

  it('passes a real signed-in request through, and arms', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })

    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(guard.isArmed()).toBe(true)
  })

  it('FAULT: blocks the downgrade to anon once a session has been seen', async () => {
    const { createSessionGuard, SessionExpiredError } = await loadGuard()
    const onLostSession = vi.fn()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl, onLostSession })

    // 1. A normal signed-in request. This is the arming step.
    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })

    // 2. THE INJECTED FAULT: the session vanishes, so supabase-js falls back to
    //    the publishable key. This is byte-for-byte what production sent.
    await expect(
      guard.fetch(REST, { headers: { Authorization: `Bearer ${ANON_KEY}` } }),
    ).rejects.toBeInstanceOf(SessionExpiredError)

    // The request must never reach the network — a zero-row 200 is exactly the
    // silence we are trying to stop.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(onLostSession).toHaveBeenCalledTimes(1)
  })

  it('says something a parent can act on, not something about tokens', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })
    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })

    await expect(
      guard.fetch(REST, { headers: { Authorization: `Bearer ${ANON_KEY}` } }),
    ).rejects.toThrow(/signed out/i)
  })

  it('fires onLostSession ONCE, not on every following request', async () => {
    const { createSessionGuard } = await loadGuard()
    const onLostSession = vi.fn()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl, onLostSession })

    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })
    await expect(
      guard.fetch(REST, { headers: { Authorization: `Bearer ${ANON_KEY}` } }),
    ).rejects.toThrow()
    // A screen mid-load fires several requests at once. One message, not six —
    // but every one of them is still refused.
    await expect(
      guard.fetch(REST, { headers: { Authorization: `Bearer ${ANON_KEY}` } }),
    ).rejects.toThrow()

    expect(onLostSession).toHaveBeenCalledTimes(1)
  })

  it('FAULT: stays armed across retries — postgrest-js re-sends when fetch throws', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })
    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })

    // ⚠️ THE BUG THIS TEST EXISTS FOR. postgrest-js wraps every request in
    // executeWithRetry and re-sends on a thrown fetch. The first version of the
    // guard disarmed itself as it threw, so attempt 2 found a disarmed guard
    // and went through — one invisible throw, then the anon request hit the
    // database anyway, with green tests.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(
        guard.fetch(REST, { headers: { Authorization: `Bearer ${ANON_KEY}` } }),
      ).rejects.toThrow(/signed out/i)
    }

    // Only the arming call ever reached the network.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(guard.isArmed()).toBe(true)
  })

  it('NEVER guards /auth/v1/ — signing in must still work', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })
    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })

    // Armed, and the bearer is the publishable key — the guard's exact trigger.
    // Refreshing and signing out legitimately look like this, so blocking here
    // would lock everyone out permanently.
    await guard.fetch(AUTH, { headers: { Authorization: `Bearer ${ANON_KEY}` } })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('guards storage and edge functions too, not just the database', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })
    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })

    // Player photos are signed URLs behind a PRIVATE bucket. An anon request
    // there returns nothing, which reads as "this player has no photo".
    await expect(
      guard.fetch('https://example.supabase.co/storage/v1/object/sign/player-photos', {
        headers: { Authorization: `Bearer ${ANON_KEY}` },
      }),
    ).rejects.toThrow(/signed out/i)
  })

  it('disarm() releases it, so a deliberate sign-out does not break the login screen', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })
    await guard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })

    guard.disarm()
    await guard.fetch(REST, { headers: { Authorization: `Bearer ${ANON_KEY}` } })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('reads the bearer off a Request object, not just off init.headers', async () => {
    const { createSessionGuard } = await loadGuard()
    const guard = createSessionGuard({ anonKey: ANON_KEY, fetchImpl })

    // supabase-js passes (url, options) today. If it ever passes a Request, a
    // guard that only reads init would silently stop guarding — and would look
    // exactly like a guard that is working.
    await guard.fetch(
      new Request(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } }),
    )
    expect(guard.isArmed()).toBe(true)
  })

  it('END TO END: the real client is wired to the guard', async () => {
    const { supabase, sessionGuard } = await loadGuard()

    // ⚠️ THE LOAD-BEARING TEST. Every test above drives the guard directly, so
    // all ten could pass while the app itself talks to Supabase through
    // unguarded fetch. This one goes through supabase.from().
    //
    // Identity (supabase.rest.fetch === sessionGuard.fetch) does NOT work:
    // supabase-js wraps our fetch in an anonymous function to attach the auth
    // header. Behaviour is the only honest check.
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response('[]', { status: 200 }))
    try {
      // Let auth-js finish starting up before arming, so the assertion below
      // is about the request and not about start-up ordering.
      await supabase.auth.getSession()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Arm it exactly as a signed-in page would.
      await sessionGuard.fetch(REST, { headers: { Authorization: `Bearer ${USER_JWT}` } })
      expect(sessionGuard.isArmed()).toBe(true)

      // No session exists, so supabase-js falls back to the publishable key —
      // the real downgrade, produced by the real library, not by our fixture.
      const { error } = await supabase.from('profiles').select('id')

      expect(error).toBeTruthy()
      expect(String(error.message)).toMatch(/signed out/i)
      // Still armed: postgrest-js retried, and every retry must be refused too.
      expect(sessionGuard.isArmed()).toBe(true)
    } finally {
      globalThis.fetch = realFetch
    }
    // 15s, not the 5s default: postgrest-js retries a thrown fetch up to 3
    // times with 1s/2s/4s backoff (PostgrestBuilder.ts) before giving the error
    // back. That is ~7s of real waiting, and it is the honest cost of the
    // guard on a READ. Writes are unaffected — only idempotent methods retry,
    // so a name save fails immediately.
  }, 15000)

  it('refuses to build without the key it is meant to compare against', async () => {
    const { createSessionGuard } = await loadGuard()
    expect(() => createSessionGuard({})).toThrow(/anonKey/)
  })
})