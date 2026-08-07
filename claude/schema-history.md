# Quins Club Hub — schema and migration history

**Reference, not instruction. Not in the reading order** — `CLAUDE.md` step 4 is
`RESTORE.md`, and this file is what that file used to carry as a second document
glued onto its end.

What follows is the REASONING behind each migration, which the SQL does not carry.
Read the relevant section before changing a policy. **Do not trust its status lines** —
each one describes the moment it was written.

⚠️ **Neither `db/migrations/` nor this file is a complete record.** Supabase has 51
applied migrations; `db/migrations/` holds 17 files. The authoritative list is
Supabase's own (`list_migrations`), and the authoritative *definition* of the live
schema is the capture in `db/schema/` — see "Changing the schema safely" in
`RESTORE.md`. `events_series_id` (`20260805133133`) is applied with no file in the
repo; `src/screens/EventForm.jsx` writes the column it adds.

---

### Migration `self_service_profile` (4 Aug 2026)

File: `db/migrations/20260804_self_service_profile.sql`. Owner policies on
`player_contacts` and `player_parents`, an `is_own_player` arm on the photo storage write,
and `public.set_own_player_photo()`.

**READ THIS BEFORE "SIMPLIFYING" IT INTO A POLICY.** The obvious implementation is another
PERMISSIVE policy on `public.players` scoped by `is_own_player`. That is a real hole: **RLS
grants access to ROWS, not COLUMNS**, so it would let a parent write every column on their
child's row — `full_name`, `position`, `jersey_num` and, fatally, **`team_id`**. Moving
their own child into another age group would become an RLS-*approved* write, widening
everything `is_own_player`-adjacent with it. Column GRANTs cannot help (they attach to the
ROLE, and coaches and parents are both `authenticated`), and no policy can express
"unchanged except photo_path" — USING sees the old row, WITH CHECK the new one, nothing sees
both. Hence a SECURITY DEFINER function with a hard-coded column list.

That function has **two** guards, and the second is not decoration: you own the player, AND
the key lives in that player's own folder. Without the second, an owner could point
`photo_path` at another player's object and read it back through the signed-URL route.

`MyPlayerForm` is a separate screen, not a restricted mode on `PlayerForm`. The
club-controlled fields do not exist in the component, so there is no path — not disabled,
not hidden — through which they could be written. That is convenience; the database is the
boundary.

**Verified with simulated JWTs as a real parent:** own contact/parents/photo allowed; rename
own child 0 rows; move own child's squad 0 rows; another player's contact 0 rows; parent row
for another player refused; the RPC refused for a non-owned player and for a foreign folder
key.

### Migration `calendar_feed` (4 Aug 2026)

File: `db/migrations/20260804_calendar_feed.sql`, plus `supabase/functions/calendar`
(deployed with **verify_jwt off**).

**A calendar client cannot sign in.** It fetches a URL on a timer with no cookies, no
Authorization header and no way to refresh. **The URL is the credential.** Everything follows:
the token is a random uuid (not the profile id — a feed keyed on anything enumerable is no
protection), one per person, revocable, and the feed returns only what that person can
already see. Reset DELETEs and re-inserts, so the old token dies the instant the new one
exists — no grace period, because that is how a revoked link keeps working.

**The Edge Function holds the ANON key only** and could not read a fixture on its own. All
authorisation is in `public.calendar_events_for_token()`, which is a **line-by-line mirror of
`private.can_see_team`** with the profile resolved from the token instead of `auth.uid()`.
**If `can_see_team` changes, that function must change with it.** The duplication is the price
of a caller with no JWT; reimplementing scoping in TypeScript would put it somewhere nothing
tests.

An unknown token returns **zero rows, not an error** — distinguishing "no such token" from
"token with no fixtures" is an oracle for guessing tokens. So a bad token yields an empty
calendar with a 200, deliberately.

**ICS details that bite:** folding is 75 **octets** not characters (counting characters splits
UTF-8 mid-sequence); backslash/semicolon/comma are structural and must be escaped or a venue
like "Zayed Sports City, Abu Dhabi" truncates silently; CRLF is required or strict clients
reject the whole calendar; UIDs must be stable or every refresh duplicates every event.

The token is minted **lazily**, only when someone opens the sheet — minting on Schedule render
would create a live bearer credential for every member who never wanted one.

### Migration `access_requests` — the signup approval gate (4 Aug 2026)

File: `db/migrations/20260804_access_requests.sql`. Adds `public.access_requests` and
`private.is_admin_anywhere()`.

**READ THIS BEFORE PROPOSING "just close signup".** Signup cannot simply be turned off.
Invites are accepted at `/accept-invite/:token`, which sits behind `RequireAuth` — the
invitee must already have a session to accept one. Flipping Supabase's "allow new users to
sign up" would therefore kill the invite flow for **every new member**, not just for
strangers. Closing signup at the auth layer needs admin-side user creation through a
service-role Edge Function, which is a separate build. The gate is approval, not exclusion.

**What actually protects club data is unchanged**, and it is not this feature: an account
with no membership reads ZERO rows from every table, because every SELECT policy bottoms
out in a memberships row for `auth.uid()`. What was missing was the admin's side. The
"Waiting for access" list is derived by SUBTRACTION (every profile an admin can read, minus
everyone who already has a membership), so every stranger who ever signed in sat in it
permanently, indistinguishable from a real member mid-invite, with no way to clear them.

**Shape.** One row per profile (`profile_id` is UNIQUE), `status` in
`('pending','dismissed')`. There is deliberately **no 'granted' status** — granted access
*is* a memberships row, and the screen already subtracts members out; a second record of the
same fact would only give the two a way to disagree.

**The anti-spam mechanism is an ABSENCE.** The owner gets a SELECT policy and an INSERT
policy and nothing else — no UPDATE, no DELETE. Combined with the UNIQUE key, a dismissed
person cannot flip their own row back to `pending`, cannot delete it and try again, and
cannot insert a second one. Re-opening the door is an admin action. If you ever add an
owner-side UPDATE policy "for convenience", you have removed the gate.

The `status = 'pending'` clause in the insert policy's WITH CHECK is load-bearing for the
same reason: any status value a client can send is a value it can choose.

**Verified server-side with simulated JWTs** (not the MCP service role, whose `auth.uid()`
is null and makes every negative test look green): a dismissed owner's UPDATE and DELETE
both affect 0 rows while they can still read their own row; inserting for another profile
and self-inserting `status='dismissed'` are both refused outright; a second request hits the
unique key; a non-admin sees exactly one row and an admin sees all of them.

**`private.is_admin_anywhere()` is club-blind on purpose** — a requester has no club, so
they cannot put a `club_id` on their own row and the admin policies cannot be club-scoped.
Same single-club assumption as `can_admin_see_pending`; if a second club is ever added,
those two need revisiting together.

**Restore DELETES the row** rather than setting it back to `pending`. A reversed dismissal
did not turn into a request the person made; marking it pending would invent one and then be
indistinguishable from the real thing.

**Both admin-side reads fail OPEN.** A failed `listAccessRequests()` costs the notes and the
dismissals, not the screen — everyone reappears in the waiting list. Noisier is the correct
direction to fail; hiding someone genuinely waiting is not.

### Migration `player_parents` + head-shot photos (applied 3 Aug, shipped 4 Aug 2026)

File: `db/migrations/20260803_player_parents_and_photos.sql`. Adds `public.player_parents`,
`public.players.photo_path`, and a **private** storage bucket `player-photos` (5 MB cap,
`image/jpeg|png|webp` only) with two policies on `storage.objects` driven by two new
helpers, `private.photo_player(text)` and `private.photo_team(text)`.

**RLS shape.** `player_parents` mirrors `player_contacts` byte for byte — read =
`can_edit_team(player's team)` OR `is_own_player`, edit = `can_edit_team` only. Parent
details are the same class of safeguarding-sensitive data, so they get the same boundary
rather than a second one to reason about. A parent sees their own child's parent rows and
nobody else's. **Photo read is deliberately looser** — `can_see_team`, i.e. squad-wide,
matching `players`' own read policy, because the photo sits beside a name that audience can
already see. Jay approved that explicitly. Tightening it is a documented one-line swap; the
exact change is written out in the migration and in `db/schema/policies.sql`.

**The object key format is load-bearing security, not a naming convention.**
`<player_id>/<timestamp>.<ext>` — the storage policies parse the first path segment as the
player id to find the squad. Change the key format and you silently change who can read
photos. The uuid regex guard in `photo_player` matters too: `'not-a-uuid'::uuid` *raises*
rather than returning null, and inside a policy that surfaces an error on every unrelated
storage operation.

**Product rulings Jay locked in — fixed decisions, not defaults:**

- Relationship dropdown is a **fixed** list: Mother, Father, Step-mother, Step-father,
  Aunt, Uncle, Grandmother, Grandfather, Guardian. No free text, no additions. The
  database column is plain `text` on purpose so widening the list stays a UI change.
- "At least one parent" **warns, never blocks**. ~159 existing players have no parent rows;
  a hard rule would make every one of them unsaveable and break the bulk importer.
- Own contact fields (email/phone on the player) only for **U13+** —
  `src/lib/ageGroup.js`, `OWN_CONTACT_MIN_AGE = 13`. Senior sides count as adult. It
  **fails closed** on a missing/unparseable squad name.
- Phones stored **E.164**, default country AE, formatted nationally on display.
  Deliberately *not* formatted as-you-type — that reintroduced a caret-jump bug.
- Photos are client-resized to a 600px square JPEG at q0.82 before upload (~4 MB → ~40 KB).
  Signed URLs are cached for the session and **cleared on `signOut`**.

New runtime deps: `flag-icons@7`, `libphonenumber-js@1`.

**`saveParents` is delete-then-write, not atomic.** A failure between the two leaves the
player with no parent rows. Acceptable today (single-editor, low frequency); if it ever
matters, move it into a Postgres function.

### Migration `admin_can_see_pending_profiles` (3 Aug 2026)

`private.can_admin_see_pending(_profile uuid)` + policy `profile read pending`, so an
admin can see people who signed up but hold **no membership**. Without it they are
invisible: the Accounts screen lists memberships, and `profile read club admin` only
exposes people who already share a club with you.

**Signing up does not grant access, and nothing used to tell you it happened.** Magic-link
signup writes `auth.users` + `profiles` (via trigger) but no membership; only
`accept_invite` writes one. Public signup is open, so anyone with the URL can create a
login. They read zero rows from every table — every SELECT policy requires a membership —
so it is contained, but **close signup or add approval before pointing
abudhabiquins.com at the app**.

Both lookups in the helper are `security definer` on purpose: under the caller's own RLS
an admin only sees memberships in their own club, so a profile belonging solely to another
club would read as "unattached" and leak.

**Verify RLS by simulating a real JWT, not via the MCP service role** — service role has a
null `auth.uid()`, so every `auth.uid()`-based policy returns false and the result *looks*
like a clean negative test while proving nothing:

```sql
begin;
select set_config('request.jwt.claims','{"sub":"<user-uuid>","role":"authenticated"}',true);
set local role authenticated;
select count(*) from public.profiles;   -- or whatever you're checking
rollback;
```

Verified this way: admin sees 3 profiles, a genuine coach sees 1, an unattached signup
sees 1. (The coach case first read 3 — because that account turned out to be a *second
admin*. Check what a test account actually is before trusting a negative result.)

**Two admins currently exist.** `jayjmuir@yahoo.com` holds `admin`/`team_id` null even
though its invite was for `coach` on a team. `accept_invite` is correct (it inserts the
invite's own role verbatim — read in full to confirm), so that row was altered afterwards,
almost certainly by running `claude/runbooks/first-admin.md`'s bootstrap SQL against it. If that
account was meant to be a coach test account, it is not testing what you think.

### Migration `profiles_email_and_admin_access` (3 Aug 2026)

Applied while building the Accounts screen. It also fixed a **live latent bug**: `profiles`
RLS was own-row-only (`profile read own` = `id = auth.uid()`) with **no admin policy**, so
`listClubMembers()`'s `profiles(full_name)` embed returned `null` for every member except
the caller. `Admin.jsx`'s `?? 'Unnamed member'` fallback disguised it completely — the
member list had been showing "Unnamed member" for everybody.

- `profiles.email text` added and backfilled from `auth.users`. Client code can now
  identify members; `auth.users` itself stays unreachable from the browser by design, and
  no service-role key goes near the frontend.
- `private.handle_new_user()` now populates `email` on signup; new
  `private.handle_user_email_change()` + `on_auth_user_email_updated` trigger keeps it in
  sync if a user later changes their login email.
- `private.shares_admin_club(_profile uuid)` — `security definer` specifically so its
  `memberships` lookup is not itself subject to `memberships` RLS (which would recurse).
  Execute granted to `authenticated` only.
- New permissive policies `profile read club admin` (SELECT) and `profile update club
  admin` (UPDATE). They OR with the existing own-row policies.

**`profiles.email` is read-only from the app.** It mirrors `auth.users`; writing it would
desync the address people actually log in with. Password resets stay self-serve — an admin
cannot reset another user's password from the client (that needs the service role).

**`memberships` still has no unique constraint** on `(profile_id, club_id, role)` — only a
PK on a fresh uuid. Duplicate rows for one person are possible (one was created once by an
`ON CONFLICT DO NOTHING`, see above), which is why the Accounts screen groups by
`profile_id` instead of rendering one row per membership.

### Database schema changes (Task 18 — the first migration this build has applied)

`public.invites`: `id`, `club_id`, `email`, `role` (same check as `memberships`: admin/coach/
parent/player), `team_id` (nullable, but `invites_team_required_unless_admin` requires it
NOT NULL unless `role='admin'`), `player_id` (nullable, links to an existing player — most
commonly a parent naming their child), `token uuid default gen_random_uuid()` (never generate
this client-side — read it back from the insert), `created_by`, `created_at`, `accepted_at`.
RLS: `invites manage` (ALL, `is_admin(club_id)`) + `invites read own` (SELECT,
`lower(email) = lower(auth.jwt()->>'email')` — the invitee's own verified login email, never
a client-supplied value). `accept_invite(token uuid)`: `SECURITY DEFINER`, verifies the token
exists, isn't already accepted, and the caller's authenticated email matches (row-locked
`for update` against a concurrent double-accept), inserts the `memberships` row, stamps
`accepted_at`, returns the new membership row. Call it via
`supabase.rpc('accept_invite', { _token: token })` — the parameter name is `_token`, not
`token`.

**Gotcha worth remembering for any future `SECURITY DEFINER` function (Task 21 will likely
add more):** Supabase's default privileges auto-grant `EXECUTE` on every new public-schema
function to both `anon` and `authenticated`, regardless of an explicit
`REVOKE ALL ... FROM PUBLIC` — that only revokes the `PUBLIC` pseudo-role's implicit grant,
not each real role's own default-privilege grant. `get_advisors` (security) surfaces this
immediately after applying a migration. Since `accept_invite` performs a real write (unlike
this schema's existing read-only `SECURITY DEFINER` helpers — `is_admin`, `can_edit_team`,
`can_see_team`, `is_own_player` — which are harmless booleans left broadly grantable), it
needed an explicit follow-up `REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid) FROM anon`
— verified afterward via `information_schema.role_routine_grants` that only
`authenticated`/`service_role`/`postgres` can call it.

This is also the **first migration Supabase's own migration history has ever tracked** for
this project — `list_migrations` returned empty before this (the original schema was applied
as raw SQL outside that tracking system at some point before this repo's current build began).

### Database schema changes (Task 21 — RLS helpers moved to a `private` schema)

Two migrations, both controller-applied directly:

1. `move_rls_helpers_to_private_schema` — created `schema private` (`revoke all on schema
   private from public, anon, authenticated; grant usage ... to authenticated` — `anon` has no
   `USAGE` on the schema itself, though this doesn't matter for RLS evaluation, only for
   direct `schema.function()` calls, which `anon` never makes). Recreated `is_admin(_club)`,
   `can_see_team(_team)`, `can_edit_team(_team)`, `is_own_player(_player)` (all `STABLE
   SECURITY DEFINER`, `SET search_path = 'public'`) and `handle_new_user()` (`SECURITY
   DEFINER`, same search_path) in `private`, with bodies byte-identical to their old `public`
   versions. Re-pointed the `on_auth_user_created` trigger to `private.handle_new_user()`.
   Dropped and recreated all 14 policies that referenced the old functions (`teams.team
   manage`; `memberships.memb manage`+`memb read`; `invites.invites manage`; `players.player
   edit`+`player read`; `player_contacts.contact edit`+`contact read`; `events.event
   edit`+`event read`; `availability.avail coach manage`+`avail own insert`+`avail own
   update`+`avail read`) to call `private.*` instead of `public.*`, then dropped the 5 old
   `public` functions.
2. `restore_anon_execute_on_rls_helpers` — same-session fix-up: `grant execute on function
   private.is_admin/can_see_team/can_edit_team/is_own_player(uuid) to anon` (restores
   pre-migration behaviour — see the regression writeup above). `handle_new_user` intentionally
   has no `anon`/`authenticated` grant either before or after — it is only ever invoked by the
   trigger, which runs as the function owner regardless of the firing role's own grants.

`accept_invite(uuid)` is unchanged by this task — still in `public`, still `SECURITY DEFINER`,
still `authenticated`+`service_role` only (no `anon`), per the Task 18 gotcha fix.

**Net effect:** `GET /rest/v1/teams|players|player_contacts|events|availability|memberships`
behave identically for every role, before and after. `POST /rest/v1/rpc/is_admin` (and the
other three) now 404 — PostgREST can no longer find them anywhere in its exposed schema
cache — where before this task they were live, callable endpoints (the advisor's original
"anon/authenticated can execute via RPC" warning). `accept_invite` remains the one function
genuinely reachable via RPC, exactly as intended.
