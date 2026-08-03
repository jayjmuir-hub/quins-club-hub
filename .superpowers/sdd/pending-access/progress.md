# Pending access + first-login name prompt — build ledger

Plan: docs/superpowers/plans/2026-08-03-pending-access.md

Triggered by a real report: Jay signed up with a second email via magic link and
the account appeared nowhere in the app, with nothing offering to approve it.

## Diagnosis (not a bug in the Accounts screen)

Magic-link signup creates an `auth.users` row and, via the `on_auth_user_created`
trigger, a `profiles` row — but **no membership**. Access is written only by
`accept_invite`. The Accounts screen lists memberships, so a self-signed-up user
is invisible. There had never been an approval or request-access flow.

Confirmed live: `janice.muir@yahoo.com`, signed up 2026-08-03 11:37, 0 memberships,
no invite record.

**Related finding, not caused by this work**: public signup is open, so anyone with
the URL can create a login. They read zero rows from every table (every SELECT
policy requires a membership), so it is contained — but it is invisible. Decision:
leave open while committee-only on an unlisted link; **revisit before pointing
abudhabiquins.com at it**.

**Second finding, flagged to Jay, not changed**: `jayjmuir@yahoo.com` holds an
`admin` membership with `team_id` null, but its invite was for `coach` on a
specific team. `accept_invite` was read in full and is correct — it inserts
`inv.role`/`inv.team_id` verbatim — so that row was altered afterwards, almost
certainly by running the `docs/first-admin.md` bootstrap SQL against that email.
Net effect: **the club currently has two full admins**, one of which was probably
meant to be a coach test account. Left alone pending Jay's call.

## Migration `admin_can_see_pending_profiles`

`private.can_admin_see_pending(_profile uuid)` + policy `profile read pending`.
`security definer` on both lookups — the not-exists check especially, because under
the caller's own RLS an admin only sees memberships in their own club, so a profile
belonging solely to another club would read as "unattached" and leak.

Verified by simulating real JWTs inside rolled-back transactions rather than
trusting the service-role view (which has a null `auth.uid()` and returns false for
everything, a result that looks like a working negative test but proves nothing):

| Caller | Profiles visible |
| --- | --- |
| admin | 3 (own + club members + pending) |
| genuine coach | 1 (own only) |
| unattached signup | 1 (own only) |

The "coach" case initially read 3 — because the account under test turned out to be
a second admin, not a coach. Re-run by temporarily demoting it to coach inside a
transaction and rolling back. Worth remembering: **verify what a test account
actually is before trusting a negative RLS result.**

## Tasks

**Task A (data layer)**: two real plan errors. (1) `getMyProfile()` was written
argument-less in prose but `.eq('id', userId)` in the body. That mattered: once
`profile read club admin` and `profile read pending` landed, an admin's unfiltered
`profiles` select returns many rows, and `.maybeSingle()` over many rows is a
PostgREST error — so it takes an explicit `userId`. (2) The plan omitted `playerId`
from `grantMembership`, which would have created rows the Accounts screen's
"Linked player" column could never populate. Commit `8bc50b9`, 737 tests.

**Task B (waiting-for-access UI)**: the highest-risk bug in the feature is that
`listPendingProfiles()` returns *all* readable profiles, not just unattached ones —
the screen must subtract the member ids or every existing member appears as
"waiting". Implemented and tested. Also: the two reads run under `Promise.allSettled`
so a failed profiles read costs only this section, while a failed member read hides
the section entirely (without the member list there is nothing to subtract, so
showing it would list everyone). One existing test legitimately changed: revoking
someone's only membership now makes them reappear under "Waiting for access", which
is truthful — a reload shows the same. Commit `06e902e`, 761 tests.

**Task C (name prompt)**: all three real users have `full_name = ''`; magic-link
signup collects no name. Prompt gated on the `ready` branch only, so zero-membership
users still get `NoMembershipState` alone. Skip flag is localStorage keyed by user
id (so a different account on the same device is still prompted) and cleared on a
successful save. Found a real hazard class: `tests/app.test.jsx` mocks
`src/data/members.js` with a partial factory, so a newly-imported export becomes a
*synchronous* throw inside the effect that no `.catch()` can absorb. Commit
`4324b65`.

**Task D (harness + verification)**: `harness/stubs/members.js` was missing two
exports, which blanks *every* scenario because `harness/main.jsx` statically imports
every screen — the third time this failure mode has appeared (`insertPlayers`, then
`members` twice). Fixed, then **made structural**: `tests/harness-stubs.test.js` now
diffs every stub against the module `harness/vite.config.js` aliases it to, and
asserts the alias count so a new alias cannot go unchecked. Drift now fails
`vitest run` instead of the browser.

Measured browser output, 1280×900: stub returned 11 profiles → **3 listed as
waiting**, 8 member blocks below, **overlap 0** (checked two independent ways).
Granting coach + U14 Boys to the *middle* card (so an index-keyed splice could not
pass) moved waiting 3→2 and members 8→9 with a page marker surviving, proving a
state update rather than a reload. Name prompt: opens on blank, closes on save,
stays shut after skip across a real reload *with the stub still returning a blank
name* — so the flag is what suppressed it. Four pre-existing scenarios re-run clean.
Zero console/page errors across 11 loads.

Two things that agent did that are worth copying: it **mutation-tested** its own
subtraction assertion (deleting the filter made waiting go 3→10 with seven member
addresses leaking, so the test genuinely fails when the bug exists), and it caught
its own DOM extraction silently mangling addresses via concatenated spans — which
would have made the overlap check read green even while members leaked. Commit
`f5f711a`, 774 tests.

## Known follow-up, not done

`clubId` is derived opportunistically in three places (`InviteForm.jsx` uses
`teams[0]?.club_id`, `PlayerImport.jsx` and now `Accounts.jsx` use the memberships
list). Correct only because this database has exactly one club. If a second club is
ever seeded, `InviteForm` can silently invite into the wrong one. A real club
context — or `clubId` on the memberships context — would fix all three call sites at
once.
