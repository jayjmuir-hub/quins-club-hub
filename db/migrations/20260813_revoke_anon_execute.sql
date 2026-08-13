-- 13 Aug 2026 — take EXECUTE away from `anon` on the RPCs that never intended
-- to give it.
--
-- ══ ⚠️ THE MECHANISM, BECAUSE NINE MIGRATIONS ARE WRITTEN AS THOUGH THIS WAS
-- ══ ALREADY DONE ══════════════════════════════════════════════════════════
--
-- The house pattern in db/migrations is:
--
--     revoke execute on function public.foo() from public;
--     grant  execute on function public.foo() to authenticated;
--
-- It reads as "authenticated only". **It is not.** Supabase ships
--
--     alter default privileges in schema public
--       grant all on functions to anon, authenticated, service_role;
--
-- which is a grant to `anon` BY NAME. Revoking the `PUBLIC` pseudo-role does
-- not touch a named grant, so every function created in `public` is
-- anon-executable the moment it exists, and the revoke removes a privilege that
-- was never the one letting `anon` in.
--
-- ⚠️ THIS WAS ALREADY WRITTEN DOWN IN THIS REPO AND NOBODY HAD APPLIED IT.
-- db/schema/functions.sql says it exactly, in the photo_backup_list_objects
-- entry, and calls the revoke "the load-bearing half". The same file's grant-
-- delta note reached the same conclusion about three more functions on 12 Aug
-- and recorded them as "Recorded as found... Not fixed here." Two correct
-- observations, never joined up — the same shape as the branching failure,
-- where "the migration table is polluted" and "branching replays migrations"
-- were both on record and nobody put them together.
--
-- ══ ⚠️ WHAT IS **NOT** REVOKED, AND WHY IT MATTERS MORE THAN WHAT IS ═══════
--
-- ⛔ **public.calendar_events_for_token(uuid) KEEPS `anon`. DO NOT REVOKE IT.**
-- It is the calendar feed. `supabase/functions/calendar/index.ts` calls it over
-- PostgREST with the publishable key, on behalf of a request from Google or
-- Apple Calendar that carries no session at all. Two migrations
-- (20260805_calendar_feed_pitch.sql, 20260808_calendar_feed_end_time_and_notes.sql)
-- grant it `to anon, authenticated, service_role` deliberately.
-- ⚠️ AND THE BLAST RADIUS IS UNUSUALLY BAD: `netlify.toml` records that a
-- subscribed calendar URL cannot be changed remotely once a parent's phone
-- holds it. Revoking here would silently break every subscribed feed in the
-- club with no way to tell anyone and no way to repair it from this end.
--
-- ⛔ **public.register_my_player(...) KEEPS `anon`**, granted explicitly to
-- `authenticated, anon` by 20260809_register_my_player_gender.sql and again by
-- 20260811_self_registration.sql. A deliberate decision, not a default.
--
-- ══ WHY REVOKING THE EIGHT BELOW CANNOT BREAK ANYTHING ═════════════════════
--
-- Every one of them derives its entire effect from `auth.uid()`, which is NULL
-- for `anon`. An unauthenticated caller already got nothing: `approve_membership`
-- and `set_admin_rights` find no membership, `set_own_player_*` fail closed
-- inside `private.is_own_player()`, the two calendar-token functions are
-- SECURITY INVOKER so RLS filters them to zero rows, `claim_roster_access`
-- matches on the caller's email, and `set_series_time_from` is SECURITY INVOKER.
--
-- ⚠️ THAT IS PRECISELY THE PROBLEM THIS FIXES: they were safe **by their
-- bodies, not by their grants.** Every one of those arguments is a separate
-- thing that has to stay true, in eight functions, forever. A grant is one
-- thing that stays true on its own.
--
-- ⚠️ Supabase's `anon` role is what the browser uses BEFORE sign-in; after
-- sign-in the JWT role is `authenticated`. So no signed-in user path touches
-- any of these grants, and no screen changes behaviour.

-- ══ ⚠️ BOTH REVOKES ARE NEEDED. NEITHER ALONE IS SUFFICIENT. ══════════════
--
-- Measured while applying this, and it is the sharpest form of the finding:
-- the first pass revoked only `from anon` and **three of the eight did not
-- budge**. Their `proacl` carried a leading `=X/postgres` — the empty grantee,
-- i.e. a grant to `PUBLIC` — and `anon` is a member of `PUBLIC`, so
-- `has_function_privilege('anon', ...)` stayed true.
--
--   approve_membership       {postgres=X, authenticated=X, service_role=X}
--   claim_roster_access      {=X, postgres=X, authenticated=X, service_role=X}
--                             ^^ PUBLIC
--
-- So the two grants are INDEPENDENT and a function can hold either, or both:
--
--   `revoke ... from public` alone  -> the named `anon` grant survives
--                                      (this is the nine migrations' bug)
--   `revoke ... from anon` alone    -> the PUBLIC grant survives, and anon
--                                      inherits through it (this bug)
--
-- ⚠️ A FUNCTION IS ONLY SHUT TO anon WHEN BOTH ARE GONE. Checking one and
-- concluding is how this stayed open in two different ways at once. The only
-- honest check is `has_function_privilege('anon', oid, 'execute')`, which is
-- what db/tests/grants.sql now asserts — never a reading of the migration text.

revoke execute on function public.approve_membership(uuid) from anon;
revoke execute on function public.set_admin_rights(uuid, boolean, text[]) from anon;
revoke execute on function public.set_series_time_from(uuid, timestamptz, integer, integer) from anon;
revoke execute on function public.claim_roster_access() from anon;
revoke execute on function public.my_calendar_token() from anon;
revoke execute on function public.reset_my_calendar_token() from anon;
revoke execute on function public.set_own_player_photo(uuid, text) from anon;
revoke execute on function public.set_own_player_gender(uuid, text) from anon;

-- The three that also carried a PUBLIC grant.
revoke execute on function public.claim_roster_access() from public;
revoke execute on function public.my_calendar_token() from public;
revoke execute on function public.reset_my_calendar_token() from public;

-- ══ VERIFIED LIVE AFTER APPLYING ══════════════════════════════════════════
--
-- Only `calendar_events_for_token` and `register_my_player` still answer true
-- to has_function_privilege('anon', ..., 'execute'); every other function in
-- `public` answers false, and `authenticated` is unchanged throughout.
--
-- ✅ AND THE CALENDAR FEED WAS SMOKE-TESTED END TO END, because it is the one
-- thing here that could not be repaired if it broke. GET /calendar.ics with a
-- deliberately bogus token: **200, `content-type: text/calendar; charset=utf-8`,
-- a valid VCALENDAR body, no permission error.** The content-type is the
-- assertion that matters — the SPA catch-all answers any unknown path with
-- index.html, so a bare 200 there proves nothing.

-- ══ WHAT IS NOT DONE HERE ═════════════════════════════════════════════════
--
-- ⚠️ THE DEFAULT PRIVILEGE ITSELF IS NOT CHANGED. Altering Supabase's
-- `alter default privileges ... to anon` would fix this for every FUTURE
-- function in one line, and would also be a project-wide change to a
-- platform default that other Supabase machinery may rely on — including
-- anything PostgREST exposes that nobody in this repo wrote. Out of scope for
-- a fix aimed at eight named functions.
--
-- ⚠️ SO A NEW FUNCTION IS STILL ANON-EXECUTABLE THE MOMENT IT IS CREATED, and
-- the house pattern still will not stop it. **The guard against regression is
-- db/tests/grants.sql**, which now asserts the whole anon list rather than
-- these eight — so a future function that forgets its revoke turns that
-- harness red instead of being noticed a fortnight later, or never.
