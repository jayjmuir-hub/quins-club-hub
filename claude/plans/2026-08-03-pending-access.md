# Plan — pending access requests + first-login name prompt

**STATUS: SHIPPED.** `src/components/RequestAccess.jsx` plus the `access_requests`
migration. ⚠️ **The code is authoritative — this plan is why, not what.**

Follows on from `2026-08-03-view-as-and-accounts.md`. Raised when Jay signed up
with a second email and found the account nowhere in the app.

## The problem

Signing up with a magic link creates an `auth.users` row and (via the
`on_auth_user_created` trigger) a `profiles` row, but **no membership**. The
app grants access only through the invite flow, and the Accounts screen lists
*memberships*, so a self-signed-up user is completely invisible to admins.
There has never been an approval or request-access flow.

Confirmed live: `janice.muir@yahoo.com` signed up 2026-08-03 11:37 with 0
memberships and no invite record.

Decision (Jay, 2026-08-03): show them and allow granting. Leave public signup
open for now — a user with no membership reads zero rows from every table, so
it is contained while the app is committee-only on an unlisted link. **Revisit
before pointing abudhabiquins.com at it.**

## Migration `admin_can_see_pending_profiles` (APPLIED 2026-08-03)

Already applied and verified — do not re-apply.

- `private.can_admin_see_pending(_profile uuid)` — true when the caller has any
  `admin` membership AND the target profile has **zero** memberships.
  `security definer` so neither lookup is subject to `memberships` RLS. The
  not-exists check especially: under the caller's own RLS an admin only sees
  memberships in their own club, so a profile belonging solely to another club
  would look "unattached" and leak. Definer counts all rows — the honest test.
- Policy `profile read pending` on `public.profiles` (SELECT).

Verified by simulating real JWTs in a rolled-back transaction:
admin → 3 profiles visible; genuine coach → 1 (own only); unattached signup →
1 (own only).

No membership-policy change needed for granting: `memb manage` is already
`FOR ALL` under `private.is_admin(club_id)`, so an admin can INSERT.

---

## Task A — data layer (`src/data/members.js`)

- `listPendingProfiles()` — the admin can now read own + club members' +
  unattached profiles. There is no server-side "has no membership" filter
  available through PostgREST here, so: select all readable profiles, and have
  the **caller** subtract the ids already present in `listClubMembers()`.
  Return the raw list; do the subtraction in the screen, not here, so the
  function stays a thin data accessor like every other one in this module.
  Document that clearly — a future reader will otherwise assume it returns only
  pending rows.
- `grantMembership({ profileId, clubId, role, teamId })` — INSERT into
  `memberships`. Same rule as `updateMembershipRole`: role `admin` coerces
  `team_id` to null; any other role with a null teamId throws before the
  network call.
- `getMyProfile()` — `.eq('id', userId).maybeSingle()`; returns null when
  absent rather than throwing (a profile can lag the trigger by a moment).

All writes use `.select().maybeSingle()` and throw the module's friendly
refusal message on a null result (RLS refusals return success + zero rows).
Tests extend `tests/data.test.js` using its existing `createQueryBuilder()`.

## Task B — "Waiting for access" section on Accounts

Top of `src/screens/Accounts.jsx`, above the existing member list.

- Shows each unattached profile: email, name if any, signed-up date.
- Grant: role select + age group select (age group required unless role is
  admin, mirroring the existing rule) → `grantMembership` → the person moves
  into the main list on success.
- Empty state when there are none — do not render a bare heading.
- Copy must not overstate: these people have signed up but have no access.
  They are not "requests" — nobody asked for anything. Heading "Waiting for
  access", with a line explaining that anyone can create a login but sees
  nothing until granted.
- No "dismiss/reject" action for now: there is nothing to reject, and deleting
  someone's `auth.users` row is not something this screen should do. If they
  are a stranger, leaving them with zero access is already the correct
  outcome. Say so in the UI rather than offering a control that does nothing.

## Task C — first-login name prompt

All three existing users have `full_name = ''` — magic-link signup collects no
name and nothing else sets it.

- On sign-in, if the user's own profile `full_name` is blank, prompt for it
  once. Use the existing `Sheet`, not a browser dialog.
- Writes via the existing `updateProfileName` (the `profile update own` policy
  already permits this — no migration needed).
- Skippable, and must not block the app or reappear in a loop within a
  session. Do not persist a "dismissed" flag in the database; localStorage is
  fine and self-corrects once a name is set.
- Admins can still edit any member's name from Accounts, which already works.

## Task D — verify + push

Full suite, build, harness scenarios for the pending section and the name
prompt (mirror every new `src/data/members.js` export into
`harness/stubs/members.js` — a missing stub export breaks *every* scenario).
Then confirm live that the real unattached account appears.
