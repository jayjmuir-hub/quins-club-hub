# Provider resilience — ride through Supabase blips

*28 Aug 2026.*

> **Status: NOT STARTED — spec only, nothing here has shipped.** Written during
> the 27–28 Aug 2026 Supabase latency incident
> (`claude/handoffs/2026-08-28-supabase-incident-and-resilience.md`). Jay asked
> "I can't have this happen" and whether to switch providers; the agreed answer
> is **no migration, make the app ride through blips** — reasoning in the
> handoff. **Build AFTER the incident clears**, smallest-risk item first.

## The principle

No provider is immune, and this app is deeply coupled to Supabase (Postgres +
RLS *is* the security model on children's data, plus Auth, Storage, Edge
Functions, PostgREST, Realtime). A migration is months of work and the riskiest
possible change to the security model — it would swap Supabase's bad days for
someone else's. So the work is **degrade gracefully**, not **depend on a
different provider**. Keep a reliability scorecard (§6); one bad week ≠ migrate,
a sustained pattern reopens the question with a real plan.

## What the incident actually looked like (grounded)

- Symptom: intermittent hangs. ~1 in 10 signup RPC calls timed out (>20–25 s),
  the rest fast (~0.25 s). It flapped. The stall was **server-side** — Supabase's
  own edge logs recorded 143,000–315,000 ms origin response times across
  `/rest/v1/*` **and** `/auth/v1/token`, i.e. a shared platform bottleneck, not
  our database (idle `pg_stat_activity`, normal pgbouncer).
- User-visible failure mode: a stalled request **hangs forever** on a spinner —
  "Loading squads…" never resolves — because nothing in the request path has a
  timeout. A manual page refresh fixes it; the app should do automatically what
  the refresh does.

## Current state of the code — what exists, what's missing

**The single fetch chokepoint** is `global.fetch` on the Supabase client:
`src/lib/supabase.js:189-198` sets `fetch: sessionGuard.fetch`. Every REST,
Storage and Functions request funnels through `guardedFetch`
(`src/lib/supabase.js:103-143`), which today only inspects the bearer token and
then calls `doFetch` — **no timeout, no retry**. The file says so explicitly:
"No auth helpers, no query helpers, no retry logic — those belong to later
tasks" (`src/lib/supabase.js:5-6`). This is the seam.

**Two retry-adjacent behaviours already exist and must be respected, not
duplicated:**

1. **postgrest-js already retries REST/RPC on a thrown fetch.** The guard's own
   comment documents it: postgrest wraps every request in `executeWithRetry` and
   re-sends when fetch throws (`src/lib/supabase.js:125-139`). So a timeout that
   *throws* already triggers one library-level retry for `/rest/v1/*` and
   `.rpc()`. Auth (gotrue-js), Storage and Functions are **separate** clients and
   do not share that behaviour.
2. **The session guard must stay armed across retries.** An earlier version
   disarmed on the retry path and let an anon request through invisibly
   (`src/lib/supabase.js:124-139`). Any timeout/abort we add must throw in a way
   that leaves `armed`/`notified` untouched — i.e. wrap `doFetch`, do not touch
   the guard's state machine.

**A service-worker cache already provides offline reads — but only for the
installed PWA, and it has no network timeout.** `vite.config.js:180-208`
registers a Workbox `NetworkFirst` route over cacheable `GET /rest/v1/*`
(`urlPattern: isCacheableRestGet`, cache `quins-supabase-rest-get`). The cache is
privacy-scoped: `isCacheableRestGet` (`pwa-cache-rules.js:45-69`) drops the three
unfiltered club-wide admin reads, and `src/lib/apiCache.js` purges on owner
change so one device can't leak person A's data to person B. **This is why the
installed PWA "barely noticed" the incident.** The gap: the `NetworkFirst`
options set no `networkTimeoutSeconds` (`vite.config.js:197-206`), so when the
network stalls for minutes Workbox waits for it before falling back to cache —
the fallback only fired promptly on the requests that *errored* fast (525s).

## Proposed changes — priority order, smallest risk first

### 1. `networkTimeoutSeconds` on the NetworkFirst route  *(one line, lowest risk)*
Add `networkTimeoutSeconds: 8` (say) to `vite.config.js:197-206`. Workbox then
falls back to the cached copy after 8 s of network silence instead of hanging.
Turns the installed PWA's "barely noticed" from luck into a guarantee, for every
cacheable GET, with zero app-code change. **Only affects the installed PWA / SW —
does nothing for `.rpc()` POSTs (signup squads) or auth**, which is why it is
step 1, not the whole answer.

### 2. Timeout + bounded retry at the fetch chokepoint  *(the core fix)*
Wrap `doFetch` inside `createSessionGuard` (`src/lib/supabase.js:90-143`) — or a
thin layer the guard delegates to — with:
- **An `AbortController` timeout** (e.g. 12 s) so no single request can hang for
  minutes. On timeout, abort and throw.
- **Bounded retry with backoff (e.g. 2 retries, 400 ms → 1200 ms + jitter)** —
  but only for **safe, idempotent requests**: `GET /rest/v1/*` and read-only
  `.rpc()`. **Do not auto-retry non-idempotent writes** (account creation, the
  signup RPC's write path, POST/PATCH/DELETE). A silent retry on a create can
  double-create; for those, surface an honest error and let the user retry (§3).
- **Interaction with postgrest-js retry (§ "Current state" #1):** decide
  deliberately whether our retry sits *above* postgrest's or we let postgrest own
  REST retries and we only add the *timeout*. Leaning: **add the timeout for all
  paths, add explicit backoff-retry only where postgrest doesn't already cover it
  (auth token, storage) or where we want more than one attempt.** Prove the total
  attempt count with an injected fault before trusting it.
- **Must not disturb the guard** (§ #2): wrap `doFetch` only; never touch
  `armed`/`notified`.

### 3. Honest "taking longer than usual…" UI  *(no backend risk)*
Replace dead-looking infinite spinners on the key loads with a state that, after
~6 s, says "taking longer than usual…" and offers Retry. The seams already exist:
- `SignupWizard` already has a `teamsFailed` branch for
  `listSignupSquads().catch(...)` (`src/components/SignupWizard.jsx:61-73`) — add
  a "slow" state between loading and failed.
- `MembershipProvider` already tracks `loading` and `error`
  (`src/lib/memberships.jsx:121-309`) and drives `AppShell`'s `ready` gate — a
  "slow" signal here is what turns the whole-app spinner honest.
- `listSignupSquads` itself is a one-liner (`src/data/signupSquads.js:9-13`);
  the timeout in §2 gives it a bounded failure to render.

### 4. Broaden stale-while-revalidate to the browser  *(most design work)*
Bring more of the PWA's offline benefit to the **non-installed browser** so a
slow moment shows prior data, not a spinner. **Hard constraint:** obey the exact
privacy rules `isCacheableRestGet` (`pwa-cache-rules.js:45-69`) and
`apiCache.js`'s owner-scoped purge already encode — the club-wide admin reads
must never be cached, and a cache must never survive an owner change. This is the
item most likely to grow scope; spec it in its own pass before building.

## Reliability scorecard  *(§6)*
Keep a short running log of Supabase incidents that touched us: date, impact,
duration, whether our resilience changes helped. The migration question reopens
only on a **sustained** pattern of major incidents, with this as the evidence.

## Test plan (repo rule 6 — prove against an injected fault)
- §1: build the SW, stub a stalled `/rest/v1` GET, confirm cache serves within
  `networkTimeoutSeconds`. Extend `tests/pwa-build.test.js` / pwa-cache tests.
- §2: drive `createSessionGuard` with a fake fetch that hangs, then one that
  throws N times then succeeds; assert the timeout fires, the retry count is
  exactly what's intended, writes are **not** retried, and the guard's `armed`
  state is unchanged across the whole sequence.
- §3: render each screen with a fetch that never resolves; assert the "slow"
  copy appears and Retry re-issues the call.
- Verify live after deploy with the handoff's probe loop (all fast, 0 timeouts).

## Open questions
- Exact timeout/retry numbers — pick from measured p99 once healthy, not guessed.
- Whether to centralise retry in the guard vs. per-call in `src/data/*` (leaning
  guard: one chokepoint, already there).
- §4 browser SWR is a separate spec; don't fold it into the first build.
