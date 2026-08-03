# Implementation plan — view-as switcher + admin Accounts screen

Spec: `docs/superpowers/specs/2026-08-03-view-as-and-accounts-design.md`

Two independent tracks. A (1→2) is the view-as switcher; B (3→4) is Accounts.
They touch disjoint files and can run in parallel. Task 5 verifies both.

## Global constraints

- **Verify the plan against the real files before writing code.** Every prior
  plan in this repo contained at least one wrong assumption (see
  `.superpowers/sdd/club-overview-dashboard/progress.md`). Report discrepancies
  rather than silently working around them.
- Data-layer unit tests go in `tests/data.test.js` using its existing
  `createQueryBuilder()` chainable+thenable mock. Do **not** create new
  `tests/*-data.test.js` files. `tests/availability.test.jsx` is a *screen*
  test despite the name — do not use it as a data-layer pattern.
- Data-access functions throw on error and return `[]`/`null` rather than
  undefined. RLS refusals come back as **success with zero rows**, so writes
  use `.select().maybeSingle()` and throw a friendly message on null — copy
  `createInvite`'s `REFUSED_INVITE` shape in `src/data/members.js`.
- `src/lib/scope.js` stays import-free and side-effect-free.
- Desktop gating uses `hidden desktop:flex` (820px), matching the Overview nav
  item. Never gate on a JS width check where CSS will do.
- Commit locally after each task. **Never push** — no credentials in this
  sandbox; the controller relays via bundle.
- Run `npx vitest run` and `npm run build` before reporting done.

---

## Track A — view-as switcher

### Task 1 — `MembershipProvider` gains view-as state

File: `src/lib/memberships.jsx` (currently 84 lines, returns
`{ memberships, teams, loading, error, reload }`).

Add `viewAs` state and return the **effective** membership set as
`memberships`, plus `realMemberships`, `viewAs`, `setViewAs`.

```js
// Synthetic set while previewing. Shape matches the fields scope.js reads.
function syntheticMemberships(viewAs, realMemberships) {
  if (!viewAs) return realMemberships
  const clubId = realMemberships[0]?.club_id ?? null
  return [{
    id: 'view-as',
    role: viewAs.role,
    team_id: viewAs.teamId,
    player_id: null,
    club_id: clubId,
  }]
}
```

Rules:

- Only a **real admin** may preview: if `!isAdmin(realMemberships)`, force
  `viewAs` to `null` no matter what is stored. Import `isAdmin` from
  `scope.js` (it is import-free, safe to depend on).
- Persist to `localStorage` key `quins.viewAs` in a try/catch, same shape as
  `readStoredFilter` in `Schedule.jsx`. Store `{ role, teamId }`.
- **Self-heal on load**: if the stored `teamId` is not present in the loaded
  `teams`, drop the preview. A stale team id would otherwise render an app
  scoped to nothing, which looks like a data-loss bug.
- Clear `viewAs` when `session` becomes null (sign-out must not leak a preview
  into the next login).

Tests → `tests/memberships.test.jsx` (exists, 7 tests). Cover: default is
real set; setting viewAs yields the synthetic set; non-admin cannot set it;
stale stored teamId is dropped; sign-out clears it; `realMemberships` always
reflects truth.

### Task 2 — switcher UI + preview banner

Files: `src/components/AppShell.jsx` (role badge at lines 198-203 mobile /
216-223 desktop is the anchor), plus a new
`src/components/ViewAsSwitcher.jsx` and its `Sheet`.

- Trigger button next to the desktop role badge, `hidden desktop:flex`,
  rendered only when `isAdmin(realMemberships)`.
- Sheet lists: **All age groups (Admin)** first, then for each visible team a
  **Coach** and a **Parent** entry. Use `realMemberships` to build the team
  list (`visibleTeams(realMemberships, teams)`) — while previewing, the
  effective set has only one team and the list would collapse to it.
- Banner: sticky, above the header, club dark red `#8E1526`, white text,
  rendered whenever `viewAs` is set. **Must render regardless of effective
  role** — it is the only way back. Wording exactly:
  `Preview — viewing as {Role}, {Team}. Data shown is filtered in your browser only.`
  plus an **Exit preview** button calling `setViewAs(null)`.
- The banner and switcher gate on `isAdmin(realMemberships)`, never on the
  effective set. Getting this wrong soft-locks the admin — this is the single
  highest-risk line in the plan.

Tests → new `tests/view-as.test.jsx`. Cover: switcher hidden for non-admin;
selecting a coach persona re-scopes a child screen; banner shows and exit
restores; banner still visible while previewing as parent (anti-soft-lock);
switcher absent below the desktop breakpoint (class assertion only — jsdom has
no layout).

---

## Track B — Accounts

### Task 3 — membership/profile write functions

File: `src/data/members.js` (currently `loadMyMemberships`,
`listClubMembers`, `createInvite`, `acceptInvite`).

- Update `listClubMembers()` to select `profiles(full_name, email)`. The
  `email` column and the admin-read policy now exist (migration
  `profiles_email_and_admin_access`, applied 2026-08-03) — **verify against
  the live schema before assuming**.
- `updateMembershipRole({ membershipId, role, teamId })` — update
  `memberships`. Enforce in JS that `role === 'admin'` ⇒ `teamId` is `null`,
  and every other role requires a non-null `teamId` (mirrors the
  `invites_team_required_unless_admin` DB constraint on invites; memberships
  has no such constraint, so this is the only guard).
- `deleteMembership(membershipId)`.
- `updateProfileName({ profileId, fullName })` — updates `profiles.full_name`.

All writes: `.select().maybeSingle()`, throw a friendly message on null.
Deletes: `.select()` and throw if zero rows came back.

Tests → extend `tests/data.test.js`.

### Task 4 — Accounts screen

New `src/screens/Accounts.jsx`, route `/accounts` in `src/App.jsx`, nav item
in `src/components/Nav.jsx` next to Overview.

- Gate on **effective** `memberships` via `isAdmin(memberships)` → render the
  same `NotAuthorised` shape `Admin.jsx` uses. Also early-return from the
  fetch effect so a non-admin issues no query (copy `Admin.jsx:111`).
- Nav item: `hidden desktop:flex`, shown when `isAdmin(memberships)`. Note
  `Nav.jsx` currently takes a `canManage` prop for Overview (admin **or**
  coach); Accounts needs a separate admin-only prop — do not reuse `canManage`.
- **Group rows by `profile_id`.** `memberships` has no unique constraint, so
  one person can legitimately have several rows. Render one block per person
  listing each membership, rather than the same name repeatedly.
- Guard: block removing or demoting the caller's **own last admin
  membership**. Compute from the full list; refuse with a clear message. There
  is no DB constraint for this and the failure mode is unrecoverable from the
  UI.
- Read-only email, with a one-line note that password resets are self-serve.

Tests → new `tests/accounts.test.jsx`. Cover: non-admin sees NotAuthorised and
issues no query; list renders name/email/role/age group; role change calls the
data fn with the right args; admin role forces `teamId` null; duplicate
memberships for one person render grouped; self-demotion of the last admin is
refused; revoke asks for confirmation.

---

## Task 5 — harness scenarios + browser verification

`harness/stubs/` must mirror any new `src/data/*` export or **every** scenario
breaks (this bit us in the Overview build — `harness/stubs/players.js` was
missing `insertPlayers` and took down all scenarios, not just the new one).

- Add the new `members.js` exports to the harness stub.
- Add `?scenario=accounts-admin` and `?scenario=view-as` .
- Extend `harness/shoot-*.mjs` and run at 1280×900. Assert zero console/page
  errors, the Accounts table renders, and the preview banner appears and
  clears.
