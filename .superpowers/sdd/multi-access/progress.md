# Multiple age groups / children per person — build ledger

Spec: docs/superpowers/specs/2026-08-03-multi-access-design.md

Raised when Jay tried to grant Janice access and could only pick one age group.
Follow-up mid-build: *"remember there are also parents who have 3, 4, or even 5 kids"*.

## Not a schema change to `memberships`

`memberships` never had a unique constraint — one person holding several rows was
already legal, and `scope.js` already handled it correctly (`visibleTeams` unions
team ids, `canEditTeam` matches any coach row, `childPlayerIds` collects every
parent/player row's `player_id`). **Mixed roles already worked; they were just never
grantable.** Only the UI and the invite path assumed one row per person.

Jay's *"they might also have kids"* is why the grant UI builds a LIST of access rows
each with its own role, rather than "one role, many age groups". A coach of U14 who
is also a parent in U10 is two rows with two different roles.

Known consequence, correct but worth knowing before someone reports it as a bug:
`roleLabel` shows the highest-precedence role, so a coach-who-is-also-a-parent reads
"Coach".

## Database

**`invite_targets`** child table rather than `team_ids[]`/`player_ids[]` on invites,
because the data is genuinely *pairs* (child A in U10, child B in U14) and two
index-aligned arrays is a correctness trap with no upside.

**`accept_invite` rewritten** to return `SETOF memberships`, inserting one per
target, with a legacy fallback to the invite's own `team_id`/`player_id` so the old
columns and new table coexist during rollout.

**The `invites_team_required_unless_admin` CHECK had to be dropped** — not planned.
It requires `invites.team_id NOT NULL` for non-admin roles, but a multi-target
invite has a null `team_id`, so it rejected exactly the case being built. A CHECK
cannot reference another table. The rule moved into `accept_invite`. That opened a
window where an admin could create a dud invite that only failed later in the
invitee's hands, so it is now guarded at three points: the form, `createInvite`
(before any network call), and `accept_invite`. The invitee pays for a bad invite
and can do nothing about it — hence guarding early, not only at the end.

**Verified against simulated JWTs in rolled-back transactions**, not the MCP service
role (whose `auth.uid()` is null, making every negative test look green while
proving nothing):

| Case | Result |
| --- | --- |
| multi-target invite | 2 memberships — `parent \| U6 \| David Suvorov`, `parent \| U7 \| Adam O'Connor` |
| legacy invite, no targets | 1 membership via fallback |
| wrong-email caller | rejected |
| already-accepted | rejected |
| incomplete (non-admin, no targets, no team) | rejected by the replacement guard |

Confirmed clean afterwards: 2 memberships, 1 invite, 1 invite_target — nothing
persisted. The `for update` concurrency lock is unchanged from the original function
and was **not** independently re-proven; claiming otherwise would be false.

## Frontend

`AccessBuilder.jsx` + `PlayerPicker.jsx` (both reusable, shared by Accounts and
InviteForm): role → targets → rows. Parent picks **children** and the age group is
*derived* from each player's own team, never asked for separately — asking twice
invites contradiction. Opt-in fallback to age-group multi-select for children not yet
on the roster (Jay asked for this explicitly). Coach picks age groups. Admin gets no
picker at all.

"Add access" on every existing person block, so a second squad or a second role is
added without revoke-and-re-grant — the thing that prompted the request.

Duplicate guard lives in the builder (it needs the person's existing rows, which
`grantMemberships` doesn't have): an identical row refuses the whole submission, and
within-save duplicates collapse before the call. Dedup runs *after* admin coercion,
so `{admin}` + `{admin, teamId}` collapse to one — the duplicate-admin failure in
RESTORE.md:255-262.

Legacy `invites.team_id`/`player_id` are mirrored **only** when there is exactly one
target; with several, any single value would be a lie, and a leftover invite from a
failed cleanup would hit the legacy fallback and silently grant one age group. Null
makes it fail loudly.

## The 3-5 children case

Raised mid-build, and proven rather than assumed. `PlayerPicker`'s `MAX_RESULTS = 25`
caps what is **drawn**, never what can be selected; selection is caller-held so a
child stays selected once the search text no longer matches them.

Tests use a **45-player roster** so the cap is genuinely active, with five siblings at
indexes 3/12/26/33/44 — two of them past the cap and provably not rendered until
searched for — across five age groups, each surfaced by a different search term. The
test clears and retypes between each pick and asserts the pinned selection grows
correctly, ending with a search matching nobody and all five still standing.

**No bug found — and the claim was mutation-tested.** Three plausible bugs were
injected into the real source and each confirmed to fail the tests: selection
filtered by the current query (state loss on retype), `toggle` capped at 4, and
`buildRows` truncating to 3. Source restored after each.

## Follow-ups, deliberately not done

- Drop `invites.team_id`/`player_id` once no deployed frontend writes them.
- `clubId` is still derived opportunistically (`teams[0]?.club_id`) in InviteForm,
  PlayerImport and Accounts. Correct only because there is exactly one club; a second
  would let InviteForm silently invite into the wrong one.
- The audit trail (who changed whose access) — still the strongest argument for the
  Phase 2 audit-log table.
