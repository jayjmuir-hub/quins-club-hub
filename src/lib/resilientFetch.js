// Timeout + idempotent-only retry for Supabase DATA requests, so a stalled
// provider surfaces as a retry or an honest error instead of a spinner that
// hangs for minutes. Written after the 27-28 Aug 2026 Supabase latency incident
// (claude/handoffs/2026-08-28-supabase-incident-and-resilience.md); the plan is
// claude/plans/2026-08-28-provider-resilience.md §2.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A TIMEOUT IS THE MISSING PIECE, NOT RETRY
// ─────────────────────────────────────────────────────────────────────────────
// postgrest-js ALREADY retries — but only what is safe, and only when it can
// tell something went wrong (@supabase/postgrest-js, PostgrestBuilder):
//   - RETRYABLE_METHODS = GET, HEAD, OPTIONS. A POST (every .rpc(), every write)
//     is NEVER retried.
//   - it retries a THROWN fetch (network error) and a 520/503 response, up to 3
//     times with 1s/2s/4s backoff.
//   - it explicitly does NOT retry an AbortError.
// During the incident the request did not throw — it HUNG for 2-5 minutes — so
// postgrest's retry never triggered and the screen sat on "Loading…". The fix is
// to put a TIMEOUT under every idempotent read: convert a hang into a throw, and
// postgrest's own (idempotent-aware) retry takes it from there.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS TOUCHES, AND WHAT IT DELIBERATELY DOES NOT
// ─────────────────────────────────────────────────────────────────────────────
//   GET / HEAD on /rest/v1/  → one timed attempt. On timeout we throw a PLAIN
//                              error (NOT an AbortError), because postgrest
//                              retries a thrown GET but skips an AbortError. We
//                              do not retry here — postgrest does, and doubling
//                              it would multiply the wait.
//   read-only RPC (POST)     → postgrest will not retry a POST, so WE do: a
//                              bounded retry with backoff. Gated on an explicit
//                              allowlist (READ_RPCS) — see the warning there.
//   everything else          → passed straight through, untouched:
//                              • writes (POST to a non-read RPC, PATCH, DELETE,
//                                PUT) — a timeout that abandoned a write would
//                                risk a double-submit, so writes are left to
//                                hang exactly as before. Safety over speed.
//                              • storage uploads/downloads — legitimately slow.
//                              • /auth/v1/ — gotrue owns its own retry and token
//                                rotation; a stray retry there is dangerous.
//
// This composes UNDER the session guard (src/lib/supabase.js): the guard checks
// the bearer FIRST and refuses a downgrade before we are ever called, so we only
// ever time out / retry requests the guard has already approved.

const DATA_PATH = '/rest/v1/'
const RPC_PREFIX = '/rest/v1/rpc/'

// Read-only RPCs: POST by transport, but idempotent, so safe to time out and
// retry.
// ⚠️ FAIL-SAFE, AND THE DIRECTION MATTERS. A name MISSING here is simply not
// timed out or retried — it behaves exactly as today (hangs on a bad day),
// which is safe. A WRITE wrongly added here would be auto-retried and could
// double its side-effect. So when in doubt, leave it out. NEVER add a
// create_*, set_*, approve_*, register_*, save_*, open_*, delete_*, invite_*,
// leave_*, remove_*, publish_*, clear_*, reset_*, complete_*, accept_*,
// claim_*, log_*, touch_* — those change data.
export const READ_RPCS = new Set([
  'list_signup_squads',
  'my_chats',
  'my_conversations',
  'my_squad_staff',
  'dm_candidates',
  'group_candidates',
  'chat_mentionables',
  'announcement_audience',
  'announcement_stats',
  'approval_recipients',
  'member_contact_card',
  'member_identity',
  'message_read_stats',
  'pitch_occupancy',
  'storage_usage',
  'welfare_overview',
  'conversation_involves_minor',
])

export class RequestTimeoutError extends Error {
  constructor(ms) {
    // Plain words (2 Sep 2026 UX review): a parent does not need the millisecond
    // count; `ms` stays on the instance for logs.
    super('This is taking longer than usual. Check your signal and try again.')
    // ⚠️ NOT 'AbortError'. postgrest-js skips retry on an AbortError; a plain
    // name is what lets it retry a timed-out GET.
    this.name = 'RequestTimeoutError'
  }
}

function urlOf(input) {
  return typeof input === 'string' ? input : (input && input.url) || String(input)
}

function methodOf(input, init) {
  return String((init && init.method) || (input && input.method) || 'GET').toUpperCase()
}

/**
 * Decide how to treat a request.
 *   { touch: false }                 → pass straight through (write/upload/auth)
 *   { touch: true, retryHere: false }→ time out once; postgrest retries (GET/HEAD)
 *   { touch: true, retryHere: true } → time out + retry here (read-only RPC)
 */
export function classifyRequest(input, init) {
  const url = urlOf(input)
  if (!url.includes(DATA_PATH)) return { touch: false }
  const method = methodOf(input, init)
  if (method === 'GET' || method === 'HEAD') return { touch: true, retryHere: false }
  if (url.includes(RPC_PREFIX)) {
    const name = url.slice(url.indexOf(RPC_PREFIX) + RPC_PREFIX.length).split(/[?#]/)[0]
    if (READ_RPCS.has(name)) return { touch: true, retryHere: true }
  }
  return { touch: false }
}

/**
 * Builds a fetch that puts a timeout under idempotent Supabase data reads.
 *
 * @param fetchImpl  injectable for tests; defaults to a live-bound global fetch
 * @param timeoutMs  per-attempt deadline
 * @param maxAttempts total attempts for a read-only RPC (1 = no retry)
 * @param sleep      injectable delay, for tests
 * @param random     injectable jitter source, for tests
 */
export function createResilientFetch({
  fetchImpl,
  timeoutMs = 10000,
  maxAttempts = 3,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random = Math.random,
} = {}) {
  // Live-bound so a test that swaps globalThis.fetch is still seen, and so
  // passing window.fetch around does not throw "Illegal invocation".
  const doFetch = fetchImpl || ((...args) => globalThis.fetch(...args))

  async function timedAttempt(input, init) {
    const controller = new AbortController()
    const callerSignal = init && init.signal
    const onCallerAbort = () => controller.abort()
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort()
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true })
    }

    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        // Free the dead socket, but reject with a PLAIN error so postgrest will
        // still retry a timed-out GET (it skips retry on an AbortError).
        controller.abort()
        reject(new RequestTimeoutError(timeoutMs))
      }, timeoutMs)
    })

    const request = doFetch(input, { ...init, signal: controller.signal })
    // If the timeout wins the race, `request` rejects later with an AbortError
    // that nobody is awaiting — swallow it so it is not an unhandled rejection.
    request.catch(() => {})

    try {
      return await Promise.race([request, timeout])
    } finally {
      clearTimeout(timer)
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort)
    }
  }

  return async function resilientFetch(input, init) {
    const plan = classifyRequest(input, init)
    if (!plan.touch) return doFetch(input, init)
    if (!plan.retryHere) return timedAttempt(input, init)

    // A read-only RPC: postgrest will not retry a POST, so we do.
    let lastError
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await timedAttempt(input, init)
      } catch (error) {
        lastError = error
        // The caller cancelled — stop, do not burn retries on an aborted request.
        if (init && init.signal && init.signal.aborted) throw error
        if (attempt < maxAttempts - 1) {
          const backoff = 500 * 2 ** attempt
          await sleep(backoff + Math.floor(random() * 250))
        }
      }
    }
    throw lastError
  }
}
