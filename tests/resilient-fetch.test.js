// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import {
  createResilientFetch,
  classifyRequest,
  RequestTimeoutError,
  READ_RPCS,
} from '../src/lib/resilientFetch.js'

// ⚠️ EVERY TEST HERE IS A FAULT INJECTION — a hung or failing fetch. If they
// pass with the timeout removed, they are worthless. The point of this module is
// that a request that never comes back becomes a throw the caller can act on.

const HOST = 'https://example.supabase.co'
const REST_GET = `${HOST}/rest/v1/profiles?select=id`
const READ_RPC = `${HOST}/rest/v1/rpc/list_signup_squads`
const WRITE_RPC = `${HOST}/rest/v1/rpc/create_poll`
const WRITE_PATCH = `${HOST}/rest/v1/messages?id=eq.1`
const AUTH = `${HOST}/auth/v1/token?grant_type=password`
const STORAGE = `${HOST}/storage/v1/object/upload/player-photos`

const OK = { ok: true, status: 200 }
const never = () => new Promise(() => {}) // hangs forever
const instant = () => Promise.resolve() // no real backoff wait in tests

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('classifyRequest', () => {
  it('times out + retries a read-only RPC, only', () => {
    expect(classifyRequest(READ_RPC, { method: 'POST' })).toEqual({ touch: true, retryHere: true })
  })
  it('times out a GET but leaves the retry to postgrest', () => {
    expect(classifyRequest(REST_GET, {})).toEqual({ touch: true, retryHere: false })
  })
  it('never touches a write RPC, a PATCH, auth, or storage', () => {
    expect(classifyRequest(WRITE_RPC, { method: 'POST' })).toEqual({ touch: false })
    expect(classifyRequest(WRITE_PATCH, { method: 'PATCH' })).toEqual({ touch: false })
    expect(classifyRequest(AUTH, { method: 'POST' })).toEqual({ touch: false })
    expect(classifyRequest(STORAGE, { method: 'POST' })).toEqual({ touch: false })
  })
  it('the allowlist holds only reads — no write verbs slipped in', () => {
    for (const name of READ_RPCS) {
      expect(name).not.toMatch(/^(create|set|approve|register|save|open|delete|invite|leave|remove|publish|clear|reset|complete|accept|claim|log|touch|add)_/)
    }
  })
})

describe('createResilientFetch', () => {
  it('passes writes/uploads/auth straight through — never times them out', async () => {
    // A write that hangs must keep hanging, not be abandoned after the deadline:
    // abandoning a write risks a double-submit.
    const d = deferred()
    const fetchImpl = vi.fn(() => d.promise)
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 20, sleep: instant })

    const inFlight = rf(WRITE_RPC, { method: 'POST' })
    const settledFirst = await Promise.race([
      inFlight.then(() => 'request').catch(() => 'request'),
      new Promise((r) => setTimeout(() => r('timer'), 80)),
    ])
    // 80ms is 4× the deadline; the request is still pending, i.e. NOT timed out.
    expect(settledFirst).toBe('timer')

    d.resolve(OK)
    await expect(inFlight).resolves.toBe(OK)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('GET: times out with a PLAIN error (so postgrest retries), and does NOT retry here', async () => {
    const fetchImpl = vi.fn(never)
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 20, sleep: instant })

    const err = await rf(REST_GET, {}).then(
      () => null,
      (e) => e,
    )
    expect(err).toBeInstanceOf(RequestTimeoutError)
    expect(err.name).toBe('RequestTimeoutError')
    expect(err.name).not.toBe('AbortError') // postgrest skips retry on AbortError
    // One attempt only — postgrest owns GET retry, doubling it would multiply the wait.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('aborts the underlying request when it times out, freeing the socket', async () => {
    let seenSignal
    const fetchImpl = vi.fn((_input, init) => {
      seenSignal = init.signal
      return new Promise(() => {})
    })
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 20, sleep: instant })
    await rf(REST_GET, {}).catch(() => {})
    expect(seenSignal).toBeInstanceOf(AbortSignal)
    expect(seenSignal.aborted).toBe(true)
  })

  it('read-RPC: retries a hung attempt and resolves when one comes back', async () => {
    let call = 0
    const fetchImpl = vi.fn(() => {
      call += 1
      return call < 3 ? new Promise(() => {}) : Promise.resolve(OK)
    })
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 20, maxAttempts: 3, sleep: instant, random: () => 0 })

    await expect(rf(READ_RPC, { method: 'POST' })).resolves.toBe(OK)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('read-RPC: gives up after maxAttempts if it never comes back', async () => {
    const fetchImpl = vi.fn(never)
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 20, maxAttempts: 3, sleep: instant, random: () => 0 })

    await expect(rf(READ_RPC, { method: 'POST' })).rejects.toBeInstanceOf(RequestTimeoutError)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('read-RPC: a network error (not a hang) is retried too', async () => {
    let call = 0
    const fetchImpl = vi.fn(() => {
      call += 1
      return call < 2 ? Promise.reject(new TypeError('Failed to fetch')) : Promise.resolve(OK)
    })
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 50, maxAttempts: 3, sleep: instant, random: () => 0 })

    await expect(rf(READ_RPC, { method: 'POST' })).resolves.toBe(OK)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('read-RPC: a caller abort stops the retries at once', async () => {
    const controller = new AbortController()
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 50, maxAttempts: 5, sleep: instant, random: () => 0 })

    controller.abort()
    await expect(rf(READ_RPC, { method: 'POST', signal: controller.signal })).rejects.toBeTruthy()
    // Aborted before the loop could retry — one attempt, then stop.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('a fast GET passes through untouched', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(OK))
    const rf = createResilientFetch({ fetchImpl, timeoutMs: 20, sleep: instant })
    await expect(rf(REST_GET, {})).resolves.toBe(OK)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
