# Task 10: Data-access modules — Report

## What I implemented

Three plain async data modules, no React, no writes, no caching — matching the brief's decisions exactly:

- **`src/data/events.js`**
  - `listEvents({ teamIds, from, to })` — queries `events`, optionally `.in('team_id', teamIds)`, optionally `.gte('starts_at', from)` / `.lte('starts_at', to)`, always `.order('starts_at', { ascending: true })`.
  - `subscribeEvents(callback)` — opens a realtime channel on `postgres_changes` for the `events` table (`event: '*', schema: 'public', table: 'events'`), returns an idempotent unsubscribe function.

- **`src/data/players.js`**
  - `listPlayers({ teamIds })` — queries `players`, optional `.in('team_id', teamIds)`, always `.order('full_name', { ascending: true })`.
  - `getPlayerContact(playerId)` — queries `player_contacts` filtered by `.eq('player_id', playerId)` using `.maybeSingle()`, returns the row or `null` (never throws on zero rows — that's the expected outcome for a parent RLS hides contact info from).

- **`src/data/availability.js`**
  - `listAvailability(eventId)` — queries `availability` filtered by `.eq('event_id', eventId)`.
  - `subscribeAvailability(eventId, callback)` — opens a realtime channel filtered **server-side** via `filter: 'event_id=eq.<id>'`, returns an idempotent unsubscribe function.

**`teamIds` semantics** (the brief's one-keystroke, opposite-consequence case): `teamIds: []` short-circuits before touching `supabase.from` at all and returns `[]`; `teamIds: undefined`/omitted queries without a team filter, letting RLS decide. Both branches are tested explicitly for both `listEvents` and `listPlayers`.

**Realtime channel naming (self-review finding, fixed before reporting):** initial implementation used a fixed channel name (`'events-changes'`, `` `availability-changes-${eventId}` ``). Since Tasks 11–13 will mount multiple screens that each call these subscribe functions (e.g. dashboard and schedule both showing events), two concurrent calls would have opened two realtime channels with the identical topic string. Fixed by suffixing both channel names with a per-module call counter, so every subscription gets a distinct topic. Covered by new tests asserting two calls produce different channel names.

## What I tested and results

`tests/data.test.js`, 25 tests, all against a mocked `supabase` client (no network):

- Each list function: correct table, correct `select('*')`, correct `.in()`/`.gte()`/`.lte()`/`.eq()` args (or absence thereof), correct `.order()` args, correct return value.
- `teamIds: []` → no `supabase.from` call, returns `[]` (tested for both `listEvents` and `listPlayers`).
- `teamIds: undefined` → queries, no `.in()` call (tested for both).
- `data: null` from Supabase → function returns `[]`, never `null` (tested for `listEvents`, `listPlayers`, `listAvailability`).
- Supabase error → thrown, not swallowed (tested for all four query functions).
- `getPlayerContact` → uses `.maybeSingle()`, returns `null` (not a throw) when the row is absent.
- `subscribeEvents` / `subscribeAvailability` → `supabase.channel()` called, `.on('postgres_changes', {...}, callback)` called with the right filter object (including the `event_id=eq.<id>` string filter for availability), `.subscribe()` called, returns a function.
- Unsubscribe idempotency: calling the returned function twice does not throw, and `supabase.removeChannel` is called exactly once.
- Distinct channel topics per call, for both `subscribeEvents` and `subscribeAvailability`.

Full suite: `npm test` → **167 passed (11 test files)**, pristine, no warnings.
Build: `npm run build` → succeeds, no warnings, produces `dist/`.

## TDD evidence

**RED** — ran the test file before the modules existed:
```
$ npx vitest run tests/data.test.js
 FAIL  tests/data.test.js [ tests/data.test.js ]
Error: Failed to resolve import "../src/data/events.js" from "tests/data.test.js". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```
Expected: the modules didn't exist yet, so Vite's import resolution fails before any test can run — a legitimate RED (proves the tests were written and run against nothing first).

**GREEN** — after implementing all three modules:
```
$ npx vitest run tests/data.test.js
 ✓ tests/data.test.js (24 tests) 22ms
 Test Files  1 passed (1)
      Tests  24 passed (24)
```
(A 25th test — the `subscribeEvents` channel-uniqueness case — was added during self-review and is included in the final 167-test full-suite run above.)

## Files changed

- `src/data/events.js` (new)
- `src/data/players.js` (new)
- `src/data/availability.js` (new)
- `tests/data.test.js` (new)

## Mocking strategy and why I trust it

The real Supabase `PostgrestFilterBuilder` is both **chainable** (`.select().in().order()...`) and **thenable** (`await query` resolves it without an explicit terminal call). A mock that only implements one of those would pass tests for the wrong reasons — e.g. a mock that resolves on any method call would let a function querying the wrong table still return the right data shape.

`createQueryBuilder({ data, error })` in the test file builds a single object whose chain methods (`select`, `in`, `gte`, `lte`, `eq`, `order`) each record their call arguments into a `calls` object and return the same builder instance (mirroring real chaining), plus a real `.then` property so `await query` resolves exactly like the real client does. Assertions check `calls.in`, `calls.gte`, etc. directly — not just the final return value — so a function that queried the wrong table or skipped a filter would fail even if it happened to return the mocked data. `maybeSingle()` is mocked separately as a function returning a resolved promise, matching its real terminal (non-thenable-chain) role.

Realtime is mocked with a plain `{ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }` channel object returned from `supabase.channel`, plus `supabase.removeChannel` as a spy. This is enough to assert the exact `.on()` filter argument and the unsubscribe wiring without needing a real WebSocket.

I trust this because every assertion in the suite is on either (a) the exact arguments passed to a mocked method, or (b) the final resolved/thrown value — never on incidental mock behaviour. The mock stayed simpler than the code it tests (no conditional logic beyond call recording), so I didn't hit the "stop and flag" threshold from the brief.

## Self-review findings

- **Fixed before reporting:** realtime channel names were static, risking topic collisions across concurrent subscribers on the same table/event once Tasks 11–13 mount multiple screens. Added a per-call sequence suffix to both `subscribeEvents` and `subscribeAvailability`, plus a test proving two calls get distinct channel names. Second commit (`38eedee`).
- Verified all three modules follow `src/data/members.js`'s exact style: header comment explaining RLS scoping and the throw-on-error/`[]`-not-`null` convention, JSDoc above each exported function, `const { data, error } = await ...; if (error) throw error; return data ?? []`.
- Verified no React import anywhere in `src/data/` (data modules stay plain async functions, as required).
- Verified no index barrel file was created.
- Verified none of the excluded scope leaked in: no `upsertEvent`/`upsertPlayer`/`setAvailability`, no caching, no query client, no pagination, no retry logic, no joins beyond what was asked for (`select('*')` only).
- Confirmed `npm test` and `npm run build` both produce pristine output (no warnings) after the fix.

## Issues or concerns

None. Signatures match the brief verbatim; `teamIds: []` vs `undefined` is tested both ways as required; `getPlayerContact` returns `null` rather than throwing on the RLS-hidden case; realtime subscriptions return idempotent unsubscribe functions filtered server-side where specified.
