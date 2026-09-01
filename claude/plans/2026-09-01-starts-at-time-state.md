# "Starts at" — a fourth time state for events that never finish

**Status: NOT SHIPPED — spec only, 1 Sep 2026.** Nothing in this file has been
built. Update this line the moment it has, and record any deviation from the
spec here rather than leaving the code as the only account of it.

## What this is, and what already shipped instead

Jay, 1 Sep 2026, entering a real club item — *"the online shop opens at 7pm
tonight"* — found it did not fit: **a specific start time and no end time.**

The three time states are **Timed · Time TBD · All day**, and none of them says
"starts, does not finish". `time_tbd` means the opposite (the day is known, the
time is not). `all_day` throws away the 7pm, which is the actual information.

✅ **The twenty-minute version SHIPPED the same day:** the end time became
OPTIONAL for a Timed event —
`claude/decisions/2026-09-01-optional-end-time.md`. That unblocked the case.

❌ **This plan is the honest version, and it is NOT built.** Read the decision
record first: it explains what the cheap fix does and does not buy, and this
plan only makes sense as an upgrade to it.

## Why bother, given A shipped

Under A, "no end" is **implicit** — it is the absence of a value. Three costs:

1. ⚠️ **A future external fixture feed inserting rows with a NULL end would
   silently become "starts at" events.** That is not hypothetical: the column is
   nullable *precisely* so such a feed cannot hard-fail
   (`db/migrations/20260808_event_end_time_and_notes.sql`). A meaning inherited
   from absence is the same shape as the storage-policy trap in
   `claude/handoffs/2026-09-01-chat-photo-albums.md` — safe today, silently
   wrong later.
2. **The calendar feed guesses.** A 7pm shop opening exports as a 2-hour block,
   because `endFor()` falls back to the per-type duration. Every subscriber sees
   a made-up finish.
3. **The push "when" line cannot distinguish it** from a timed fixture.

None of those is urgent. That is why A shipped and this waits.

## The measurement that makes this cheap

**Taken 1 Sep 2026 against production, and worth re-taking before building:**

| Query | Result |
|---|---|
| events, total | 529 |
| `ends_at IS NULL` | 27 |
| `ends_at IS NULL` AND not `all_day` AND not `time_tbd` | **0** |
| `all_day` | 0 |
| `info_only` (diary) | 0 |

So **no existing row means "starts at"**, and there is nothing to backfill.
⚠️ **Re-run it.** A shipped after this was taken, so plain-timed NULL-end rows
now accumulate — every one of them is a "starts at" event entered under A, and
the migration must decide whether to adopt them (recommended: yes, that is
exactly what they are).

## The design

### Storage: an explicit column, NOT a derived state

`starts_only boolean not null default false`, mirroring how `all_day` and
`time_tbd` are already done.

⚠️ **DO NOT derive it from `ends_at IS NULL`.** That is the cheap thing and it
is wrong for reason 1 above — an external feed's null would become a claim
nobody made. State it.

Three CHECK constraints, each named so a violation names itself:

```
not (starts_only and all_day)
not (starts_only and time_tbd)
starts_only = false or ends_at is null
```

⚠️ Three mutually-exclusive booleans is already at the edge of what this shape
carries well. **If a FIFTH state is ever proposed, convert to an enum first** —
do not add a fourth boolean and a sixth constraint.

### The four surfaces

| Surface | Files | What changes |
|---|---|---|
| Migration | new `db/migrations/…` | column + 3 CHECKs; adopt existing plain-timed NULL-end rows |
| DB functions | `calendar_events_for_token`, `fixture_push_when`, `send_availability_nudges` | return the column; a third "when" wording |
| Edge | `supabase/functions/calendar/index.ts`, `push-send/index.ts` | ICS `DTEND` decision; push wording |
| App | `src/lib/eventFormat.js`, `src/screens/EventForm.jsx`, `src/screens/AddGameForm.jsx` | fourth segment; chip + detail wording |
| Harnesses | `db/tests/club-diary-allday.sql`, `club-diary-push.sql`, `fixture-push.sql`, `tournaments.sql` | plus `search-path.sql` if any helper is added |

## ⚠️ THE OPEN QUESTION — settle it BEFORE writing code

**What does the calendar feed emit?** ICS has no point-in-time event: RFC 5545
requires `DTEND` after `DTSTART`, and a zero-length event renders
inconsistently and is dropped by some clients. Three candidates, each a small
lie:

- a short fixed block (15 or 30 min) — reads as "brief", which is usually true
- the existing per-type guess (2h for a social) — status quo, most wrong
- an all-day `VALUE=DATE` entry — loses the 7pm, the thing that mattered

**This is Jay's call, not the implementer's.** It decides the edge work.

## ⚠️ Traps that have already bitten this codebase, all of which apply here

1. **`private.fixture_push_when` HAS TWO OVERLOADS** — a row form
   (`fixture_push_when(events)`) and a primitives form
   (`(timestamptz, timestamptz, boolean, boolean)`). Verified 1 Sep 2026.
   Change one and the other still emits the old wording.
2. **TAKE ANY FUNCTION BODY FROM `pg_get_functiondef` ON LIVE, NEVER FROM THE
   MIGRATION THAT CREATED IT.** Live `private.send_fixture_push` already
   diverges from `db/migrations/20260819_fixture_push.sql`, because
   `20260830_push_hardening` changed it. Editing the obvious file silently
   reverts push hardening with every test still green.
3. **`calendar_events_for_token` needs a signature change → DROP+CREATE → THE
   ACL DROPS**, and a fresh function grants EXECUTE to **PUBLIC** by default.
   #610 hit exactly this on 1 Sep. The migration must re-apply the measured
   grants and assert PUBLIC absent, or it silently undoes
   `calendar_feed_revoke_public_execute`.
4. **Make the new field OPTIONAL in the edge function's `Event` type**, so the
   function can be deployed BEFORE the migration and change nothing. Every
   field in that file already follows this; the header explains why.
5. **Edge functions do not deploy with a merge.** There is no CI deploy —
   `npx.cmd supabase functions deploy <name> --project-ref lusmshimxdcxpnrktlgz`.
   `verify_jwt` is pinned in `supabase/config.toml`.
6. **Run the FULL `npm run db:check`, not just the new harness.** Every
   `private.*` function must carry a pinned `search_path` or sit on an argued
   exemption list, and `db/tests/search-path.sql` enforces it across the schema.
   A session turned production red on 1 Sep by testing only its own file.
7. **Do a WRITE-PATH pass.** "Where does this value get displayed" and "what
   does creating this row DO" are different questions; only the first tends to
   get asked. The blank-push bug (#612) was found by asking the second.

## Suggested sequence

1. Settle the ICS question with Jay.
2. Migration + DB functions → apply to production (announce first).
3. Deploy both edge functions; verify the calendar feed's bytes for a real
   "starts at" row, including `content-type` — the SPA catch-all answers any
   path with HTML and a 200 alone proves nothing.
4. Frontend PR; verify live from the served bundle, markers absent before and
   present after, with a control present in both.

⚠️ **Check the fourth segment on a real phone before committing to the UI.** The
control already carries three options and a fourth may not fit. If it does not,
the fallback is a checkbox inside Timed — which is very close to what A already
does, and at that point ask whether B still earns its cost.
