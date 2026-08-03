# Design spec — "View as" switcher + admin Accounts screen

Date: 2026-08-03
Status: approved by Jay (all four options chosen as recommended)

Covers two of the four desktop requests raised on 2026-08-03. The other two
("Add fixture" → "Add event", age-group pill wrapping) were label/CSS fixes,
shipped in `e4fd7da` without a spec.

---

## 1. "View as" switcher

### The request
> admin and organizers need the ability to view as an age group coach or
> manager along with all

### The hard constraint — this is cosmetic, and must be labelled as such

Row-level security decides what rows Supabase returns, based on the real
`auth.uid()` of the signed-in user. A "view as" implemented in the browser
**cannot** narrow that. An admin viewing as a U12 coach still *receives*
club-wide rows; the app simply declines to display them.

That is fine for the actual purpose — working inside one age group's context,
and previewing what a coach sees — but it has two consequences we must design
around, not paper over:

- **It is not a security boundary.** It must never be used to demonstrate to
  the committee that coaches cannot see other teams' data. That claim is true
  (RLS enforces it), but this feature is not the evidence for it.
- **The UI must never imply otherwise.** No wording like "restricted to" or
  "you now have coach permissions". The banner says *preview*.

Anything stronger needs server-side impersonation (a service-role edge
function minting a scoped token). Out of scope; noted for the AWS migration.

### Design

`MembershipProvider` (`src/lib/memberships.jsx`) gains a `viewAs` state. Its
returned `memberships` becomes the **effective** set: the real one normally,
or a synthetic one while previewing. Every one of the 12 consuming screens
already reads scope exclusively through `useMemberships()` + `scope.js`, so
they re-scope with zero changes each.

Returned value grows from `{ memberships, teams, loading, error, reload }` to:

| Key | Meaning |
| --- | --- |
| `memberships` | **Effective** — synthetic while previewing. What screens use. |
| `realMemberships` | Always the true set. Drives the switcher's own gate. |
| `viewAs` | `null`, or `{ role, teamId }`. |
| `setViewAs` | Setter. `null` exits. |
| `teams`, `loading`, `error`, `reload` | Unchanged. |

Synthetic membership shape, matching a real row's fields used by `scope.js`:

```js
[{ id: 'view-as', role, team_id: teamId, player_id: null, club_id }]
```

### Who gets it
Real admins only (`isAdmin(realMemberships)`). A coach previewing another
coach's team has no legitimate use and muddies the audit story.

### Personas offered
- **All age groups (Admin)** — exits preview.
- **Coach of \<age group\>** — one per visible team. "Age group manager" is the
  same `coach` role (locked in earlier: no new role, no schema change).
- **Parent in \<age group\>** — same list, parent role. Cheap to add and the
  genuinely useful one: it is how you check the safeguarding rules hold
  (contact details hidden from parents).

### Anti-soft-lock rule
Previewing as parent makes `isAdmin(memberships)` false, so `/more` and
`/accounts` correctly show "not authorised" — that is the point. **The
switcher itself and its exit control must therefore be driven by
`realMemberships`, never by `memberships`.** Otherwise the admin previews as a
parent and can never get back without clearing localStorage.

### Banner
Persistent, unmissable, sticky at the top of `AppShell`, above the header.
Club dark red (`#8E1526`) so it cannot be mistaken for normal chrome.
Text: `Preview — viewing as Coach, U12 Boys. Data shown is filtered in your
browser only.` Plus an always-visible **Exit preview** button.

### Persistence
`localStorage` (`quins.viewAs`), same try/catch convention as the existing
team filters. Self-heals: on load, if the stored `teamId` is not in the
current `visibleTeams`, drop the preview rather than render an empty app.

### Not doing
- No preview for non-admins.
- No preview of a *specific named person* (that needs the Accounts list and
  invites an impersonation-shaped feature we explicitly don't want).
- No effect on writes. An admin previewing as a parent who somehow reaches a
  write path will still succeed at the database. The UI hides the affordance;
  RLS is unchanged. Documented, not defended against.

---

## 2. Admin Accounts screen

### The request
> we need an accounts section for admin access to view, edit, modify accounts,
> usernames, access, etc

### Live bug found while scoping this

`profiles` RLS was **own-row only** — `profile read own` = `id = auth.uid()`,
with no admin policy at all. `listClubMembers()` embeds `profiles(full_name)`,
so for an admin that embed returned `null` for every member except themselves.
`Admin.jsx:69` falls back to `?? 'Unnamed member'`, which disguised it
completely: the existing member list has been showing "Unnamed member" for
everybody. Fixed by migration `profiles_email_and_admin_access` (below), not
by the app.

### Schema change (applied 2026-08-03, migration `profiles_email_and_admin_access`)

- `profiles.email text` added; backfilled from `auth.users` (2/2 rows).
- `private.handle_new_user()` now populates `email` on signup
  (`on conflict (id) do update set email = excluded.email`).
- New `private.handle_user_email_change()` + `on_auth_user_email_updated`
  trigger on `auth.users`, so a later email change does not leave `profiles`
  stale.
- New `private.shares_admin_club(_profile uuid)` — `security definer`,
  `search_path = public`, execute granted to `authenticated` only. Security
  definer specifically so its `memberships` lookup is not itself subject to
  `memberships` RLS, which would recurse.
- New permissive policies `profile read club admin` (SELECT) and
  `profile update club admin` (UPDATE), both `using
  private.shares_admin_club(id)`. They OR with the existing own-row policies.

Why a column rather than an edge function: `auth.users` is unreachable from
the browser by design, and this is the standard Supabase pattern. It also
means no service-role key ever touches the frontend — a hard project rule.

### Screen
Route `/accounts`, desktop-only nav item next to Overview, **admin only**
(gated on `realMemberships` so it stays reachable while previewing… no —
see below).

Correction: `/accounts` gates on **effective** `memberships`, like every other
screen, so that previewing as a coach correctly hides it. Only the *view-as
switcher* uses `realMemberships`. This keeps the preview honest.

Table columns: Name · Email · Role · Age group · Linked player · Joined.

### Actions
- **Change role** — admin / coach / parent / player.
- **Reassign age group** — required for non-admin roles, must be `null` for
  admin (mirrors the `invites_team_required_unless_admin` constraint).
- **Edit display name** — writes `profiles.full_name`.
- **Revoke access** — deletes the membership row. Confirmation required.

All permitted by the existing `memb manage` policy (`FOR ALL` under
`private.is_admin(club_id)`). No new membership policies needed.

### Guards
- **Never let an admin remove or demote their own last admin membership.**
  Client-side check plus a clear refusal; there is no DB constraint for this
  and locking the club out of its own admin panel is unrecoverable without
  SQL access.
- **`memberships` has no unique constraint on `(profile_id, club_id, role)`** —
  only a PK on a fresh uuid. A duplicate-admin row was already caused once by
  an `ON CONFLICT DO NOTHING` (RESTORE.md:255-262). The screen must group rows
  by person and surface duplicates rather than silently rendering one person
  twice.
- Follow the module's silent-refusal convention: `.select().maybeSingle()` and
  throw a friendly message on a zero-row result, as `createInvite` does — an
  RLS refusal returns success with no rows, not an error.

### Not doing
- **Passwords.** An admin cannot reset another user's password from the client
  (needs service role), and this project forbids Claude handling credentials.
  Users self-serve via password reset. The screen will say so rather than
  offering a dead control.
- **Changing someone's email.** `profiles.email` is a mirror of `auth.users`;
  writing it would desync the thing they actually log in with. Read-only.
- **Creating accounts.** That is the existing invite flow, unchanged.

---

## Open question deferred
An audit trail of who changed whose access is genuinely wanted here (same
Phase 2 audit-log table the Overview activity feed needs). Still deferred —
but the Accounts screen is the strongest argument yet for building it.
