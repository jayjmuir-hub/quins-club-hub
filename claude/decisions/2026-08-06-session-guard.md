# Decision — the session guard (6 Aug 2026)

**Commit `c80f51e` on `build/v1-mvp`.** Closes §1 of
`claude/handoffs/2026-08-06-roster-onboarding.md` — "why did the request arrive
as `anon`".

---

## The finding

⚠️ **supabase-js silently substitutes the publishable key for a missing
session.** From the copy in this repo's `node_modules`
(`@supabase/supabase-js/dist/index.mjs`, `SupabaseClient`):

```js
async _getAccessToken() {
  return (await this._getSessionToken()) ?? this.supabaseKey
}
```

The sibling method's own doc comment gives the game away — `_getSessionToken`
exists *"so callers can distinguish 'no session' from 'has session'"*. The
fallback in `_getAccessToken` is deliberate library behaviour, and it is wrong
for this app.

**Two things track "is this person signed in", and they can disagree:**

| | What it holds | When it updates |
|---|---|---|
| `AuthProvider` (`src/lib/auth.jsx`) | a **snapshot** | at mount, and on auth events |
| `_getAccessToken` | **live storage** | on every single request |

When they disagree the app renders a signed-in shell whose every request
arrives as `anon`. Nothing throws. Nothing logs.

## Proved live, against an injected fault

On production, same URL, same `apikey` header, **only the bearer swapped**:

| | Bearer | Status | Rows |
|---|---|---|---|
| A (control) | user JWT | **200** | **4** |
| B (fault) | publishable key | **200** | **0** |

Both `200`, no error body either way. The positive control ran first — the
`window.fetch` hook captured a real `role: authenticated` JWT on
`/rest/v1/players` — so B's zero means something.

## ⚠️ It got HARDER to spot, not easier

Before migration `grant_anon_execute_on_two_profile_helpers` the name save
raised a loud `42501 permission denied for function shares_admin_club`. **That
grant was correct, and it converted the loud error into a silent zero-row
no-op.** At 279 people the only remaining symptom is *"I pressed save and
nothing happened"* — no error, no log, and no reason for anyone to suspect
their session.

## GoTrue is innocent — evidence of absence, not absence of evidence

89 auth log entries over 24h: **23/23 `/token` 200, 3/3 `/callback` 302-with-
login, 6/6 `/authorize` clean.** Zero occurrences of `pkce`, `code_verifier`,
`invalid_grant`, `refresh_token_not_found` or `Already Used`. The downgrade is
entirely client-side.

⚠️ `auth.audit_log_entries` is **completely empty (0 rows)** on this project.
A query against it returns `[]` regardless of what happened — do not read that
as evidence of anything.

**One clue, unresolved:** refreshes ran roughly hourly all day, then a
**4h36m gap (08:59:18Z → 13:35:18Z)**. A tab that sleeps through its refresh
window is the most likely trigger, but that is NOT proved.

## What was built

`createSessionGuard()` in `src/lib/supabase.js`, passed to `createClient` as
`global.fetch`.

- Watches the bearer on `/rest/v1/`, `/storage/v1/`, `/functions/v1/`.
- Once a real user JWT has gone out, it is **armed**. A later drop back to the
  publishable key is the downgrade: refuse the request, sign out locally so
  the UI stops lying, raise `SessionExpiredError`.
- ⚠️ **`/auth/v1/` is never guarded.** Sign-in, refresh and sign-out
  legitimately carry the publishable key; guarding them locks everyone out.
- Armed state starts **false**, so a genuinely signed-out visitor — login
  screen, `/accept-invite/<token>` — is never blocked.

## ⚠️ Two defects the tests caught. Both would have shipped green.

### 1. `onAuthStateChange('SIGNED_OUT')` is the WRONG disarm signal

auth-js emits `SIGNED_OUT` when it **discovers** there is no session — which
happens *inside* the `getSession()` call `_getAccessToken` makes immediately
before the request goes out. Order of events:

```
discover no session → emit SIGNED_OUT → disarm → send the anon request unguarded
```

The guard disarmed itself microseconds before it was needed, and **passed all
ten of its direct tests while doing nothing whatsoever in the app.**

Fixed by wrapping `supabase.auth.signOut` instead, which keys on **intent**.

### 2. postgrest-js RETRIES a thrown fetch

`PostgrestBuilder.ts` wraps every request in `executeWithRetry`. The first
version of the guard disarmed itself as it threw, so attempt 2 found a
disarmed guard and went straight through — **one invisible throw, then the
anon request reached the database anyway.**

The guard now stays armed; a separate `notified` flag keeps the message to one
per incident. Only an explicit `disarm()` clears it.

**Retry budget: 3 attempts, 1s/2s/4s backoff, idempotent methods only.** So a
blocked READ costs ~7s before the message appears; a WRITE fails immediately.

## The load-bearing test

`tests/session-guard.test.js` — 12 tests. Eleven drive the guard directly, so
**all eleven could pass while the app talked to Supabase through unguarded
fetch.** The twelfth goes through `supabase.from()` and is the only one that
proves the wiring.

⚠️ **Identity (`supabase.rest.fetch === sessionGuard.fetch`) does NOT work** —
supabase-js wraps our fetch in an anonymous function to attach the auth header.
Behaviour is the only honest check.

## Deliberately not done

- **Finding out why the session went empty in the first place.** Fix the
  silence first; once the app reports the condition, the trigger reports
  itself.
- **Retrying the request after a silent refresh.** That hides the condition
  again, which is the whole problem.
