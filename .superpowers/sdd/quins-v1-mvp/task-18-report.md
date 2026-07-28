# Task 18 report: Invite flow (create + accept)

Branch `build/v1-mvp`, commits `689b010..HEAD`:

```
11879bf feat: add createInvite/acceptInvite data-access functions
7343c35 feat: add admin invite creation screen
02bd8b0 feat: add invite-acceptance screen
fe09c2e feat: wire the invite flow into routing and the admin screen
```

## What was built

**`src/data/members.js`** — two new functions alongside the existing
`loadMyMemberships`/`listClubMembers`:

- `createInvite({ clubId, email, role, teamId, playerId, createdBy })` — inserts
  one row into `invites` via `.insert({...}).select().maybeSingle()`, the same
  insert-then-read-back shape `upsertPlayer`/`upsertEvent` already use. `token`
  is left out of the insert entirely (the column default supplies it) and read
  back from the returned row. `teamId`/`playerId` default to `null` when
  omitted. Throws `"We couldn't send that invite. You may not have permission
  to invite members."` when the write comes back with no row (the RLS
  zero-row-refusal shape this codebase already has a house pattern for).
- `acceptInvite(token)` — calls `supabase.rpc('accept_invite', { _token: token
  })`, throws the RPC's error, returns the new `memberships` row on success.

Both follow the throw-on-error convention; neither is a list function so the
`[]`-not-`null` half of that ruling doesn't apply.

**`src/screens/InviteForm.jsx`** — admin-only invite creation UI, opened in the
shared `Sheet`. Fields: email (format-validated client-side), role (select:
admin/coach/parent/player), age group (hidden entirely for an admin invite,
required for the other three — matching the database's
`invites_team_required_unless_admin` check constraint so a bad submission
never reaches Postgres), and an optional player picker scoped to the chosen
team via `listPlayers({ teamIds: [teamId] })`. On success, shows the generated
accept link (`{origin}/accept-invite/{token}`) in a read-only, focus-to-select
input for the admin to copy and send manually — there is no email-sending
infrastructure in this build, and nothing in the project's constraints
authorises adding one. The player picker renders `full_name` only, never a
jersey number.

**`src/screens/AcceptInvite.jsx`** — the invitee-facing screen at
`/accept-invite/:token`. On mount, calls `acceptInvite(token)`; on success,
calls `reload()` from `useMemberships()` and then `<Navigate to="/" replace
/>`; on failure, shows the RPC's own error message in a `role="alert"` region
with no generic wrapper. A `useRef` guard prevents a second RPC call across a
re-render within the same mount (relevant because `accept_invite` is not
safely re-callable — a second call for an already-accepted token is a
legitimate "already used" refusal, not a retry).

**Routing gap (`src/App.jsx`)** — chose **option 1** from the brief: routed
`/accept-invite/:token` outside `AppShell` entirely, as a sibling route, rather
than teaching `AppShell` a path-based exception.

Reasoning: `AppShell` only renders its routed `children` once
`!loading && !error && memberships.length > 0`. A brand-new invitee who just
signed in via magic link has zero memberships until they accept, so nesting
this route inside the single shared `<AppShell>` the previous structure used
(one `AppShell` wrapping one `<Routes>` block) would make it permanently
unreachable — `AppShell` would show `NoMembershipState` regardless of the URL,
since it never even evaluates its own `<Routes>` children until `ready` is
true.

Restructured `App.jsx` so each of the four existing routes wraps its own
element in `<AppShell>` individually (`<Route path="/" element={<AppShell><Dashboard
/></AppShell>} />`, etc.) instead of one `<AppShell>` wrapping one shared
`<Routes>`. This is what makes it possible for `/accept-invite/:token` to sit
as a fifth, unwrapped sibling route with no `AppShell` at all — it needed no
new knowledge added to `AppShell` itself (no path-string special-casing to
keep in sync, unlike `isMoreRoute`), and every existing `AppShell` behaviour
(loading/error/zero-membership/role-label/nav) is untouched and still covered
by `tests/app-shell.test.jsx` exactly as before. The alternative (option 2:
teach `AppShell`/`RequireAuth` a `/accept-invite` exception) was rejected
because it would mean `AppShell` carrying knowledge of a specific unrelated
screen's route, the same kind of coupling the `isMoreRoute` comment in the
original file already flags as a wart, not a pattern to add to.

After a successful `acceptInvite`, `AcceptInvite.jsx` explicitly calls
`reload()` before navigating — `MembershipProvider`'s effect only re-runs on
`[session, reloadToken]`, and accepting an invite changes neither on its own,
so without the explicit call the app would still show the zero-membership
screen after the redirect to `/`.

**`src/screens/Admin.jsx`** — added a real "Invite a member" button in the
existing "Manage" card, opening `InviteForm` in the shared `Sheet` (a plain
`inviteOpen` boolean, since `InviteForm` has no "edit" mode/row to carry, unlike
`Roster`'s `formState`). This closes the intentional gap Task 17 left ("an
invite entry point is deliberately absent... Task 18 owns that flow and it
does not exist yet").

## Test count

- Before this task: 493 passing (per the brief).
- After: **525 passing**, 22 test files, all green. New/changed test files:
  `tests/scope.test.js` (+7: `createInvite`/`acceptInvite`), new
  `tests/invite-form.test.jsx` (15), new `tests/accept-invite.test.jsx` (6),
  `tests/admin.test.jsx` (+3: the invite entry point), `tests/app.test.jsx`
  (+1: the routing-gap regression test proving `/accept-invite/:token` renders
  for a zero-membership signed-in user).
- `npm run build` is clean (Vite 5.4.21, no errors/warnings; 477.85 kB JS
  gzip 133.07 kB).

## Self-review against the binding rulings

- **Throw-on-error, no `{data,error}` tuples**: both `createInvite` and
  `acceptInvite` throw; verified by `tests/scope.test.js`'s
  `rejects.toThrow(...)` assertions for both a real Postgres error and a
  silent RLS refusal (for `createInvite`) / RPC-raised exception (for
  `acceptInvite`).
- **No native `confirm()`**: none added. Neither new screen deletes or
  destroys anything requiring confirmation.
- **No jersey numbers**: `InviteForm`'s player picker renders `player.full_name`
  only; a dedicated test (`'has no jersey number anywhere in the player
  picker'`) passes a player row carrying `jersey_num: 7` and asserts neither
  "jersey" text nor the literal "7" appears.
- **`--muted` is `#5c5854`, never `#77726e`**: both new screens use
  `text-[#5c5854]` for muted copy (the player-picker hint in `InviteForm`, the
  loading caption and RPC-error framing text in `AcceptInvite`). Grepped both
  files for `77726e` — no hits.
- **Loading/empty/error states, errors in `role="alert"`**: `InviteForm`'s
  validation and creation-failure messages are both `role="alert"`;
  `AcceptInvite` has an explicit loading leg (`Spinner`, `aria-hidden` caption
  so it isn't double-announced alongside the spinner's own accessible name)
  and an error leg in `role="alert"`. Neither screen has a meaningful "empty"
  state (there's no list to be empty) — n/a here, same as e.g. `EventForm`.
- **No disabled/dead placeholder controls**: none added. The invite button in
  `Admin.jsx` is fully functional the moment it's clicked; nothing is stubbed
  or shown-but-disabled.
- **`Sheet` is the shared modal**: `InviteForm` is opened in `Sheet`, matching
  `EventForm`/`PlayerForm`/`Availability`. `AcceptInvite` is a full-page screen
  (reached directly by URL, not opened from within the app), so it does not
  use `Sheet` — there is no "opening" interaction for it to attach to, the
  same reasoning `Login.jsx` follows for not using `Sheet` either.
- **TDD**: every new behaviour was test-first — `tests/scope.test.js`'s new
  `describe('createInvite')`/`describe('acceptInvite')` blocks, then
  `tests/invite-form.test.jsx`, then `tests/accept-invite.test.jsx`, each
  confirmed failing (missing-export/module-not-found errors) before the
  corresponding implementation file was written, then confirmed passing.
  `tests/admin.test.jsx`'s three new invite-entry-point tests and
  `tests/app.test.jsx`'s routing-gap test were added alongside the
  `App.jsx`/`Admin.jsx` wiring commit.
- **Did not touch the database**: confirmed. No migration file was written or
  modified, no `mcp__Supabase__apply_migration`/`execute_sql` call was made
  this session, and `git diff --stat 689b010..HEAD` (below) touches only
  `src/` and `tests/` files.

```
$ git diff --stat 689b010..HEAD
 src/App.jsx                    | 30 ++--
 src/data/members.js             | 62 ++++++
 src/screens/AcceptInvite.jsx    | 90 +++++++++ (new)
 src/screens/Admin.jsx            | 25 ++-
 src/screens/InviteForm.jsx       | 313 ++++++++ (new)
 tests/accept-invite.test.jsx    | 115 +++ (new)
 tests/admin.test.jsx             | 45 ++-
 tests/app.test.jsx               | 22 ++-
 tests/invite-form.test.jsx       | 253 +++++ (new)
 tests/scope.test.js              | 128 ++-
```

## Concerns / things worth a second look

- **No server-side email delivery**: by design (brief explicitly rules this
  out for this build). The admin must copy the accept link out of `InviteForm`
  and send it manually (WhatsApp, email client, etc.). Worth flagging to Jay
  so he knows this is the expected v1 behaviour, not a bug.
- **`createInvite`'s `clubId` derivation**: `InviteForm` derives `clubId` from
  `teams[0]?.club_id` (every team shares the one club, per the brief's
  suggested approach) rather than threading a club id in as an explicit prop.
  If `teams` is ever empty when the form is opened (shouldn't happen for an
  admin, who sees all 15 teams via `visibleTeams`'s admin special-case, but
  worth noting), `clubId` would be `null` and the insert would fail the
  `invites.club_id NOT NULL` constraint — surfaced as a normal thrown Postgres
  error via `createInvite`'s existing `if (error) throw error`, not silently.
- **`AcceptInvite` player-linking display**: the screen doesn't fetch-and-show
  "X invited you as a Coach for U12s, accept?" before calling `acceptInvite` —
  the brief offered this as one of two reasonable reads and explicitly said
  either is fine ("skip straight to calling `acceptInvite(token)` and let its
  own error surface"). Chose the simpler of the two: the RPC's own messages
  are already specific enough (wrong email, already used) that a separate
  pre-fetch-and-confirm step felt like added complexity without a concrete
  benefit for a single-token, single-use link.
- **StrictMode double-invoke guard**: `AcceptInvite`'s `calledRef` guard against
  calling `acceptInvite` twice was added defensively (the RPC is genuinely not
  idempotent — a second call reports "already used", which would be a false
  failure straight after a true success). Not separately unit-tested with
  React StrictMode on (this app doesn't render under StrictMode in tests), but
  the existing test suite's normal single-render path exercises the guard's
  `calledRef.current` check trivially; flagging in case a future StrictMode
  adoption is worth a dedicated regression test then.

---

## Fixes applied after independent verification (2026-07-28)

Verification report: `.superpowers/sdd/quins-v1-mvp/task-18-visual-verification.md`
(2 confirmed defects, D1 High/dev-only, D2 Low/cosmetic). Both fixed on top of
`fe09c2e`.

### D1 — StrictMode double-invoke permanently hung `AcceptInvite` in dev

Root cause confirmed as described in the verification report: the `mounted`
ref and the `calledRef` guard were fighting each other. On React 18
StrictMode's dev-only mount→cleanup→remount, the *first* mount's cleanup set
`mounted = false` before the still-in-flight `acceptInvite` promise (started
by that same first mount) resolved/rejected, so its `.then()`/`.catch()`
silently no-opped forever — the screen never left "Accepting your invite…".

**Fix (option (a) from the verifier's suggestions): dropped the `mounted` ref
entirely, keeping only `calledRef`.** Reasoning: StrictMode's double-invoke is
not a real unmount that needs the in-flight promise's result ignored — there's
only ever one genuine, lasting mount in both dev and production, and
`calledRef` already fully solves the actual problem (never issue a second real
network call for a token). If the component were to genuinely unmount before
the promise settles (e.g. user navigates away mid-request), the resulting
`setState` calls on an unmounted component are simply dropped by React with no
warning in React 18+, so no protection was actually needed there either. This
keeps the success/failure/reload/navigate sequence identical in a real single
mount (production or dev-without-StrictMode) while fixing the dev/StrictMode
hang.

Added two regression tests in `tests/accept-invite.test.jsx` that render
`AcceptInvite` wrapped in `<StrictMode>` (RTL doesn't do this by default) and
assert the full success (`reload()` + navigate home) and failure (`role="alert"`)
sequences still complete, and that `acceptInvite` is still called exactly
once. Both pass against the fix and would have caught the original bug (confirmed
by temporarily reverting to the old `mounted`+`calledRef` code locally and
seeing both new StrictMode tests hang/timeout, then re-applying the fix).

### D2 — Unbranded first-ever screen for new invitees

Added a small standalone header to `AcceptInvite`'s existing card: the same
`crest` image import other screens (`Login.jsx`, `AppShell.jsx`) already use,
plus the "Abu Dhabi Harlequins" wordmark in the same small-caps muted style
`Login.jsx` uses for its "Quins Club Hub" subtitle. Deliberately did not add
the full `AppShell` gradient header, nav, or move this route back inside
`AppShell` — the code comment's reasoning for why this route must stay outside
`AppShell` (a zero-membership invitee needs to reach it) is untouched. Added a
test asserting the crest alt text and club name render on this screen.

### Verification

- `npm test`: 528 passed (22 files) — up from 525 baseline, +3 new tests (2
  StrictMode regression tests for D1, 1 branding test for D2). All green.
- `npm run build`: clean, no new warnings.

### Concerns

- The StrictMode regression tests are a genuinely new test *shape* for this
  repo (no other screen is tested under `<StrictMode>`); flagging in case the
  team wants to standardize this pattern for other screens with similar
  mount-effect guards, rather than leaving it a one-off here.
