### Task 18: Invite flow (create + accept)
**Files:** Create `src/screens/InviteForm.jsx`, `src/screens/AcceptInvite.jsx`; add `invites` table migration; modify `src/data/members.js` (`createInvite`, `acceptInvite`).
**Interfaces:** Admin creates invite (email + role + team + optional child `player_id`); the invitee follows a tokenised link and, on first login, `acceptInvite(token)` creates the `membership` row and links parent→child; RLS/policy for `invites`.
- [ ] Migration: `invites` table (`id`, `club_id`, `email`, `role`, `team_id`, `player_id`, `token`, `created_by`, `created_at`, `accepted_at`) + RLS (admins manage; an authenticated invitee may read and accept a row matching their own email). Accepting runs through a `SECURITY DEFINER` function `accept_invite(token)` so the invitee never needs write access to `memberships`.
- [ ] Test: `createInvite` inserts with the right fields; `acceptInvite` calls the RPC and surfaces its error; the admin form validates email + role, and requires a team for coach/parent/player roles.
- [ ] Implement admin invite UI + accept screen. Commit.

---

## Migration status: ALREADY APPLIED — do not write or reapply it

The controller applied the migration directly against the live Supabase project
(`lusmshimxdcxpnrktlgz`) before this task was dispatched, rather than delegating schema/RLS
work to an implementer subagent, because this is the first task in the build that touches
the database and gets it wrong quietly (a bad RLS predicate doesn't throw, it just returns
the wrong rows). **The `invites` table, its RLS policies, and the `accept_invite` RPC already
exist on the live database, verified column-by-column, policy-by-policy, and grant-by-grant.**
Your job is the application code only: `src/data/members.js`'s `createInvite`/`acceptInvite`,
`src/screens/InviteForm.jsx`, `src/screens/AcceptInvite.jsx`, and wiring them in.

### The exact live schema you're building against

`public.invites` columns (verified via `information_schema.columns`):
- `id uuid primary key default gen_random_uuid()`
- `club_id uuid not null references clubs(id)`
- `email text not null`
- `role text not null check (role in ('admin','coach','parent','player'))`
- `team_id uuid references teams(id)` — **nullable, but a check constraint
  (`invites_team_required_unless_admin`) enforces `role = 'admin' OR team_id IS NOT NULL`
  at the database level.** Your `createInvite` and the `InviteForm` validation should enforce
  this client-side too (per the brief: "requires a team for coach/parent/player roles"), so a
  bad form submission gets a friendly inline error instead of a raw Postgres constraint-violation
  message.
- `player_id uuid references players(id)` — nullable, optional. Used to link the invited
  person to an existing player record (most commonly a parent invite naming their child; the
  schema doesn't distinguish "parent linking a child" from any other role that might supply
  one — that distinction lives entirely in how `InviteForm` chooses to expose the field).
- `token uuid not null default gen_random_uuid()` — **do not generate this client-side.**
  Leave it out of your insert entirely and let the column default supply it, then read it back
  from the inserted row (Supabase's `.insert(...).select().single()` pattern, same as other
  data-access functions in this codebase use to get a generated id back) so `createInvite` can
  return/display the accept link.
- `created_by uuid references profiles(id)` — set this to the calling admin's own id
  (`auth.uid()`/the current session's user id, available via `useAuth()`) when inserting.
- `created_at timestamptz not null default now()`
- `accepted_at timestamptz` — null until accepted; `accept_invite` sets it.

Live RLS policies on `invites` (verified via `pg_policies`):
- `"invites manage"` — `ALL`, both `USING` and `WITH CHECK` are `is_admin(club_id)`. An admin
  can select/insert/update/delete any invite for their own club. A non-admin's `createInvite`
  call will be refused by RLS (zero rows affected, not a thrown error at the network layer —
  same zero-row-refusal shape Tasks 14/15/16 already established a house pattern for: check
  the insert actually returned a row, and throw a friendly message yourself if it didn't,
  rather than assuming Supabase always throws on a refusal).
- `"invites read own"` — `SELECT` only, `lower(email) = lower(coalesce(auth.jwt()->>'email', ''))`.
  An authenticated invitee can read (only) invite rows addressed to their own verified login
  email — never another club member's invite, never one sent to a different address. This is
  what `AcceptInvite.jsx` can use to show "X invited you as a Coach for U12s, accept?" before
  the person clicks accept, if you choose to fetch-and-display the invite row first — or you
  can skip straight to calling `acceptInvite(token)` and let its own error surface if something's
  wrong. Your call; either is a reasonable read of the brief.

The `accept_invite(token uuid)` RPC (verified live, `SECURITY DEFINER`, granted to
`authenticated` only — NOT `anon`, deliberately tighter than this schema's existing read-only
helper functions because this one performs a real write):
- Looks up the invite by `token`, raises if not found, raises if `accepted_at IS NOT NULL`
  ("This invite has already been used."), raises if the invite's `email` doesn't match the
  calling user's own authenticated email ("This invite was sent to a different email address
  than the one you signed in with.").
- On success: inserts a `memberships` row (`profile_id = auth.uid()`, plus the invite's
  `club_id`/`team_id`/`role`/`player_id`), sets `accepted_at = now()` on the invite, and
  **returns the new `memberships` row** (the RPC's return type is `public.memberships`).
- Call it via `supabase.rpc('accept_invite', { _token: token })`. A thrown Postgres exception
  inside the function surfaces to the client as a normal Supabase error (`{ data, error }`) —
  your `acceptInvite(token)` data-access function should follow this codebase's established
  throw-on-error convention (throw the error, don't return a tuple), same as every other
  function in `src/data/members.js`/`src/data/*.js`.

### What to build

**`src/data/members.js` additions** (alongside the existing `loadMyMemberships`/
`listClubMembers`):
- `createInvite({ email, role, teamId, playerId })` — inserts one row into `invites`
  (`club_id` — you'll need this; `useMemberships()`'s `memberships`/`teams` context doesn't
  carry a bare club id today, so either derive it from an existing team row (`teams[0]?.club_id`,
  since every team shares the one club) or thread it in as a parameter from the caller —
  your call, document whichever you pick), `email`, `role`, `team_id: teamId ?? null`,
  `player_id: playerId ?? null`, `created_by:` the current user's id. Uses
  `.select().single()` (or `.maybeSingle()` per this codebase's zero-row-refusal convention —
  check `src/data/players.js`/`src/data/events.js` for which one this codebase actually uses
  for an insert-then-read-back, and match it) to get the generated `token` back, and throws a
  clear message if the insert is silently refused by RLS (e.g. a non-admin calling it).
- `acceptInvite(token)` — calls the RPC, throws on error, returns the new membership row.

**`src/screens/InviteForm.jsx`** — admin-only creation UI (open this in the shared `Sheet`
component, same as `EventForm`/`PlayerForm`/`Availability`, for visual consistency — this
codebase's established pattern for every add/edit screen). Fields: email, role
(admin/coach/parent/player), team (required unless role is admin — hide or disable the team
field for an admin invite, and validate its presence for the other three roles before
submitting, matching the check constraint so a bad submission never reaches the database),
optional player (for linking a parent to an existing child — use `listPlayers()` scoped to
the chosen team to populate this, since a parent invite's player must belong to that team).
On success, show the generated accept link/token in a way the admin can copy and send
manually (there's no email-sending infrastructure in this build — the brief doesn't ask for
one, and none of this project's constraints authorize adding a third-party email service).
Validate email format and required fields client-side with clear inline errors — sentence
case, active voice, matching this codebase's copy conventions.

**`src/screens/AcceptInvite.jsx`** — the invitee-facing screen, reached via a link containing
the token (e.g. a route like `/accept-invite/:token`).

**Concrete routing gap you must solve, already diagnosed for you:** `src/App.jsx` nests
`<AppShell><Routes>...</Routes></AppShell>` inside `RequireAuth`/`MembershipProvider`. Read
`src/components/AppShell.jsx` closely — it computes `ready = !loading && !error &&
memberships.length > 0`, and **only renders `children` (i.e. the `<Routes>` content) when
`ready` is true.** A brand-new invitee who has just signed in via magic link and has zero
memberships yet would hit `AppShell`'s `NoMembershipState` screen and get stuck there
forever — `/accept-invite/:token` would be unreachable as an ordinary route nested inside
`AppShell`'s children, no matter how you add it to the `<Routes>` block, because `AppShell`
itself never renders that block for a membership-less user. This is the actual reason the
brief's flow ("the invitee follows a tokenised link and, on first login, `acceptInvite(token)`
creates the membership row") requires you to change something about this structure, not just
add a route.

You have two reasonable ways to resolve this — pick one and explain your reasoning in your
report:
1. Route `/accept-invite/:token` OUTSIDE `AppShell` entirely (e.g. inside `RequireAuth` but
   as a sibling to `AppShell`, or restructure `App.jsx`'s route tree so this one path renders
   its own minimal layout instead of going through `AppShell`/its nav chrome). This avoids
   touching `AppShell` at all.
2. Teach `AppShell` (or `RequireAuth`, whichever is the better seam) to treat
   `/accept-invite/:token` as an exception to the "block until `ready`" rule, similar to how
   it already special-cases `isMoreRoute` — i.e. render `children` for this one path
   regardless of `memberships.length`.

Either way: after a successful `acceptInvite(token)` call, the person now has exactly one
membership row that didn't exist a moment ago. `useMemberships()`'s `reload()` function exists
for exactly this kind of case — call it explicitly after a successful accept so the rest of
the app picks up the new membership on the next render, then navigate the person into the
main app (e.g. `/`). Don't assume the provider will somehow notice on its own; its effect only
re-runs on `[session, reloadToken]` changes, and accepting an invite changes neither by itself.

On load, `AcceptInvite.jsx` calls `acceptInvite(token)`; on success, show a brief confirmation
and route to `/`. On failure, show the RPC's actual error message (already friendly, written
above) in a `role="alert"` region — don't wrap it in a generic "something went wrong."

### Binding project-wide rulings you must not violate

- Data-access functions throw on error, never return `{data, error}` tuples, and return `[]`
  not `null` for empty results (n/a here since these aren't list functions, but the
  throw-on-error half applies to both new functions).
- No native `confirm()` anywhere in this app.
- No jersey numbers anywhere in the UI — if `InviteForm`'s player picker shows players, use
  `initials()` from `src/lib/playerFormat.js`, not a jersey number, matching every other
  screen's convention.
- `--muted` text colour on paper/card backgrounds: use `#5c5854`, not `#77726e` (contrast
  failure — has shipped 3 times already in this codebase, always double-check this).
- Loading/empty/error states required on every screen; errors render in a `role="alert"`
  region (house convention).
- No disabled/dead placeholder controls for functionality that doesn't exist yet — this
  codebase has an explicit standing ruling against that pattern (Task 13), reaffirmed as
  recently as Task 17. If some future capability (e.g. actually emailing the invite) doesn't
  exist yet, omit the button entirely rather than showing a disabled one.
- `Sheet` is the shared modal component for add/edit screens — reuse it, don't build a new
  overlay pattern.
- TDD: write tests first per the brief's bullet list, watch them fail, implement minimally,
  watch them pass. Mock the Supabase client / data-access functions the same way existing
  tests in this codebase do (check `tests/players.test.js`-adjacent patterns or
  `tests/data.test.js` for the mocking convention already established for `src/data/*.js`
  functions).

Run `npm test` before you're done and confirm all existing + new tests pass (493 currently,
expect more after this task). Run `npm run build` and confirm it's clean.
