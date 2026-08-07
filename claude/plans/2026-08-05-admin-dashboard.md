# Plan: back-end dashboard for admins

Agreed with Jay 5 Aug 2026. **BUILT AND SHIPPED 5 Aug 2026 — commit `2e26d35` on
`build/v1-mvp`.** All six build steps done, all eight tests written and proved against an
injected fault. 978/978 passing, build clean. See "What shipped" at the bottom for the two
places the implementation deviated from this plan and why.

The plan body below is left as written, as the record of the decisions.

## The problem

There are three admin-ish pages and no building to put them in:

| Route | Screen | Gate | What it does |
|---|---|---|---|
| `/more` | `Admin.jsx` | `isAdmin` | Read-only club members, age-group counts, links to Roster/Schedule, Invite |
| `/accounts` | `Accounts.jsx` | `isAdmin` | The real thing — grant/revoke, role + age group, edit names, approve signups |
| `/overview` | `Overview.jsx` | `canManage` (admin **or** coach) | 14-day fixtures, RSVP rollup, roster gaps |

`/more`'s club-members list is a strict subset of `/accounts`'s — both call `listClubMembers()`
and render the same rows, one with write controls and one without. This is the duplication
logged in `state-of-play.md` as *"raised, not approved"*. Adding a fourth page without
absorbing these would make it worse.

## Decisions taken

| Question | Decision |
|---|---|
| Who is an "organizer"? | **Nobody.** There is no such role and none is being added. The dashboard is **admins only**, gated on `isAdmin(memberships)` |
| Shape | **One `/admin` route, tabbed**, absorbing `/more`'s admin content and `/accounts` |
| Tabs | **Accounts** and **Club**. Two, not three |
| `/overview` | **Deleted** — route, nav link, screen, tests. Its one working section moves to the Club tab |
| Mobile | `/admin` is **desktop-only**, like `/accounts` and `/overview` are today |
| Tab bar | Stays **four cells for everyone**. `/more` survives as a real "More" page |

### Why "organizer" was dropped

The role vocabulary is `admin` / `coach` / `parent` / `player` (`ROLE_PRECEDENCE`,
`src/lib/scope.js`). A new club-level organiser role would mean a migration, RLS policy
changes on every table, and `AccessBuilder` changes — days of work, and nobody has yet
named a person who needs it. **If "Managers" or "organizers" comes up again, this is the
decision to point at.** It was raised 4 Aug and again 5 Aug; it is deferred, not forgotten.

### Why `/overview` dies

It was specced as three sections and only one works.

- **Upcoming fixtures (14 days)** — a narrower duplicate of Schedule, which has the same
  list with squad filters and a calendar, and of Dashboard's next-fixture card.
- **RSVP rollup** — dark. `FEATURES.availability` is `false` (switched off club-wide
  2026-07-29). Overview doesn't just hide it, it skips `listAvailabilityForEvents`
  entirely. This was the actual reason to have a fixtures list separate from Schedule.
- **Roster gaps** — the only thing unique to the screen, and it is an *admin* concern:
  a coach cannot fix a missing phone number for a player whose parents have not been
  invited. An admin can.
- The activity feed was always *"Phase 2, gated on a not-yet-built audit-log table."*

Coaches lose nothing they are using, because the thing they would have used it for is
switched off. **If RSVP is switched back on, rebuild the rollup on Schedule, next to the
fixtures — not on a separate page nobody navigates to.**

## Target structure

### `/admin` — new, admin-only, desktop-only

Gate `isAdmin(memberships)` on the **effective** membership set from `useMemberships()`,
so an admin previewing as a coach correctly loses it — the same rule `Accounts.jsx`
already follows. Non-admin gets the existing `NotAuthorised` card, unchanged copy.

**Accounts tab** — all of today's `Accounts.jsx`, behaviour unchanged. It is the only
place club members are listed or edited.

**Club tab** — assembled from the parts of `Admin.jsx` worth keeping, plus the one part of
`Overview.jsx` worth keeping:

- Age groups, with player count **and** missing-contact count per squad
  (`TeamRow` from `Admin.jsx` + roster gaps from `Overview.jsx`)
- **Invite a member** → `InviteForm` in the shared Sheet (from `Admin.jsx`)
- Links to Roster and Schedule (from `Admin.jsx`)
- **NOT** the club-members list. That is the duplication being removed

### `/more` — becomes a genuine "More" page, for everyone

⚠️ **This is the part that breaks things if skipped.** `AppShell` renders the sign-out
control on `/more` only — it is not in `Admin.jsx`. If `/more` redirects into `/admin`,
**every parent, player and coach loses the only way to sign out.**

`/more` keeps its tab-bar cell and becomes:

- Your access — role label and the squads you can see (read-only, useful to everyone)
- **Admin** link, admins only, `hidden desktop:flex` like the other management links
- Sign out

It loses the club-members list and the age-group table entirely.

### Routing

- `/admin` — new. Tabs as real routes (`/admin/accounts`, `/admin/club`) so a tab is
  linkable and survives a refresh; bare `/admin` redirects to `/admin/accounts`
- `/accounts` → redirect to `/admin/accounts`. Jay has this bookmarked; do not just delete it
- `/overview` → falls through to the existing `*` → `/` redirect
- `/more` → stays, rewritten

### Nav

`NAV_ITEMS` stays four: Home / Schedule / Roster / More. The `canManage` Overview pill and
the `canManageAccounts` Accounts pill are both **removed** from `Nav.jsx`, replaced by one
desktop-only **Admin** pill gated on `isAdmin`. `canManage` in `AppShell.jsx` becomes
unused — delete it rather than leave it dangling.

Someone who bookmarked `/admin` and opens it on a phone gets a short note that managing the
club needs a bigger screen, not a broken table.

## Build order

1. **`/more` first, and prove sign-out survives.** It is the only regression that can lock
   people out. Rewrite `Admin.jsx` → a real More screen; move or keep `SignOutControl`
   deliberately, with a test that a *parent* can sign out.
2. **`/admin` shell + tab routing**, with the `isAdmin` gate and the desktop-only note.
3. **Accounts tab** — mount the existing `Accounts.jsx` body. No behaviour change; the
   existing `tests/accounts.test.jsx` (53 tests) must keep passing untouched.
4. **Club tab** — age groups + player counts + missing-contact counts + Invite + links.
   Adds one query (`listContactsForPlayers`), the same one `Overview.jsx` made.
5. **Delete `/overview`** — route, nav link, `src/screens/Overview.jsx`,
   `tests/overview.test.jsx`. Check nothing else imports it.
6. **Nav + AppShell** — one Admin pill, drop `canManage`.

## Tests, each proved against an injected fault

- a **parent** can sign out from `/more` ← the regression guard; write this one first
- a non-admin gets `NotAuthorised` at `/admin`, and no query is issued
- an admin previewing as a coach loses `/admin` (effective, not real, memberships)
- `/accounts` redirects to `/admin/accounts` and still renders the accounts UI
- `/admin/club` shows the missing-contact count, and it matches the contact data
- the Club tab does **not** render a club-members list (the duplication stays dead)
- `Nav` renders no Overview and no Accounts pill, and the Admin pill only for an admin
- `/overview` no longer resolves

## Out of scope, deliberately

- No new role, no migration, no RLS change. This is a pure frontend restructure
- The RSVP rollup is not rebuilt. See "Why `/overview` dies"
- The activity feed still waits on an audit-log table
- `CalendarSubscribe` stays on Schedule. Moving it to More was considered and rejected as
  scope creep — raise it separately if the Schedule header is felt to be crowded

---

# What shipped — 5 Aug 2026, `2e26d35`

## Files

| File | |
|---|---|
| `src/screens/More.jsx` | **new** — real More page for every role. No data fetch at all: everything shown is already in `useMemberships()` |
| `src/screens/AdminDashboard.jsx` | **new** — `/admin` shell: `isAdmin` gate, two tabs, desktop-only note, `<Outlet/>` |
| `src/screens/AdminClub.jsx` | **new** — Club tab |
| `src/screens/Admin.jsx` | **deleted** |
| `src/screens/Overview.jsx` | **deleted** |
| `src/App.jsx` | `/more`→`More`; `/admin` with `index`→`/admin/accounts`, `accounts`, `club` children; `/accounts`→redirect; `/overview` gone |
| `src/components/Nav.jsx` | `canManage` + `canManageAccounts` → one `canManageClub` prop, one Admin pill |
| `src/components/AppShell.jsx` | `canManage` deleted; `visibleTeams`/`canEditTeam` imports and the `teams` destructure went with it |
| `tests/more.test.jsx`, `tests/admin-dashboard.test.jsx` | **new** |
| `tests/admin.test.jsx`, `tests/overview.test.jsx` | **deleted** |
| `tests/app.test.jsx`, `tests/app-shell.test.jsx`, `tests/nav.test.jsx` | updated |

`tests/accounts.test.jsx` (53 tests) **untouched and passing** — it renders `<Accounts/>`
directly rather than through a route, so moving the mount point did not reach it.

## Two deviations from the plan, both deliberate

**1. Desktop-only is CSS, not `useMediaQuery`.** That hook's own header comment says to use
it ONLY when both branches would emit the same content into the DOM (it exists for Roster,
where the card list and the table render the same player names). The small-screen note and
the dashboard are different content, so the codebase-idiomatic choice is
`desktop:hidden` / `hidden desktop:block`.

⚠️ **Consequence worth knowing:** on a phone the dashboard is still mounted behind the
hidden wrapper and still issues its queries. That is exactly what `/accounts` did before,
so it is not a regression — but it is not a real guard either. If `/admin` ever needs to
genuinely not query on mobile, that is a `useMediaQuery` change, not a CSS one.

**2. The Admin link on `/more` sits inside a `hidden desktop:block` wrapper**, rather than
`hidden desktop:flex` on the link itself as the plan said. Putting it on the link alone
left a mobile admin looking at a "Manage" heading over an empty card.

## The one test that was rot before it ever ran

The first draft proved the `/admin` gate by asserting the ABSENCE of a heading named
"Admin". `NotAuthorised` carries its own `sr-only <h2>Admin</h2>` for screen readers, so
that query matched in the refused case **and** the allowed case and proved nothing. It is
repointed at the tab links (`Accounts` / `Club`), which only exist when the gate opens.

**The general shape of that mistake: an `sr-only` heading makes "is this screen showing?"
untestable by heading name.** `Accounts.jsx` and the old `Overview.jsx` both do this too.

## Fault injection — what was broken, and what caught it

Two batches, each reverted after. Every fault fired exactly the intended tests, no more:

| Injected fault | Tests that failed |
|---|---|
| `AppShell`'s `isMoreRoute` → `'/admin'` | parent sign-out, in **both** `app.test.jsx` and `app-shell.test.jsx` |
| `/accounts` redirect target → `/` | "redirects the old /accounts URL to /admin/accounts" |
| `/overview` route added back | "no longer resolves /overview" |
| Overview pill restored in `Nav.jsx` | `nav.test.jsx` + `app-shell.test.jsx` pill guards |
| `/admin` gate short-circuited | refuses coach / parent / no-memberships / **previewing-as-coach** |
| missing-contact suffix deleted from `AdminClub` | "player count and missing-contact count" |
| `listClubMembers()` called in `AdminClub` | "does not render **or fetch** a club-members list" |
| `admin &&` guard removed from `More.jsx` | "no Admin link for a coach", "…for a parent" |

## Still unproven — jsdom cannot reach these

- **The phone-width note has never been seen.** jsdom applies no CSS, so the tests assert
  the class tokens, not visibility. Nobody has loaded `/admin` on a real narrow viewport.
- **The `/accounts` bookmark redirect has never been clicked in a real browser.** It is
  proved through `BrowserRouter` in jsdom, which is genuine routing, but not the same as
  Jay's actual bookmark against production.
- **Nobody has signed out as a real parent in a real browser.** The guard is strong at the
  unit level (real `App`, real `AppShell`, real router, mocked `signOut`), but the thing it
  protects — a parent not being locked in — has only ever been proved in jsdom.
