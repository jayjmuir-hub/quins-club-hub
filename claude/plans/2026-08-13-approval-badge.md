# Plan — a count on the approvals entry point

**Status: NOT SHIPPED.** Designed 13 Aug 2026 with Jay. No code written.

⚠️ **`npm run docs:check` SAYS NOTHING ABOUT THE PATHS IN THIS FILE.**
`scripts/docs-check.mjs:81` deliberately excludes `claude/plans/` from the
broken-path check, because a plan describes a moment and may name files that do
not exist yet — as this one does. **Verified by injecting a fake path and
watching the check stay green.** Every `src/…`, `db/…` and `claude/…` path below
was therefore checked BY HAND on 13 Aug, with a control that had to be reported
missing. All resolved except `db/migrations/20260813_pending_approvals_count.sql`,
which is the file this plan asks someone to create.

---

## The problem, measured

A parent registers a player. Today two things happen, and **only one of them
works without the person going looking**:

1. **An email**, via the `notify-approval` trigger → edge function. Recipients
   are every active admin in the club plus the coaches and team managers of
   *that squad*. ⚠️ **This is doing all the work.**
2. **A card on the More tab**, for non-admins who can approve something:
   *"Players waiting to be approved"*, linking to `/approvals`.

⚠️ **There is no count, no badge and no indicator anywhere.** Verified 13 Aug:
`More.jsx` imports no data module that could fetch one, and `Nav.jsx` has no
pending logic at all. The card reads identically whether five are waiting or
none — so it is on screen permanently, which trains people to skip it, and a
coach who misses the email has no way to know without tapping in to look.

⚠️ **And nobody has ever received one of these emails in anger.** No coach or
parent has been onboarded; the whole registration-to-approval path is
unexercised by a real second person. This plan makes the in-app half work so
the email is not the only route.

---

## Jay's rulings, 13 Aug 2026

| Question | Ruling |
|---|---|
| How loud? | **A badge on the tab itself**, visible from every screen. Not just a number on the card — the point is that one cannot be missed. |
| When does it update? | **On app open, and after approving or declining.** Not realtime. |
| A coach registers their own child in the squad they coach? | **Count it. It's fine.** Coaches are trusted volunteers — the same ruling as "every admin sees every child's data". |
| Do admins get it? | **Yes — everyone who can approve.** Two placements. |

⚠️ **THE SELF-APPROVAL RULING NEEDS RECORDING NEXT TO THE CODE THAT LOOKS LIKE
IT CONTRADICTS IT.** `canApproveAnything` in `src/lib/scope.js` says a parent
approving their own child *"would turn the whole pending design into
theatre"* — which reads as covering this case and does not. That comment is
about ROLE (a parent is never an approver). Jay's ruling is about a PERSON who
holds both roles. **Measured the same day: `public.approve_membership` checks
`can_approve_team` and nothing else — there is no self-check, so this is
already possible today.** Not introduced here; surfaced here.

---

## ⚠️ The trap that shaped the design

The obvious implementation is a count of `memberships where status = 'pending'`,
letting RLS scope it. **That is subtly wrong**, and it only became visible when
the design was written out.

Two different policies return pending rows to a coach:

- `memb read squad staff pending` — `status = 'pending' AND can_approve_team(team_id)`
- `memb read` — `profile_id = auth.uid() OR is_admin(club_id)`

The second returns **their own registrations, in any squad, approvable or not**.

**The failing case: a U12 coach registers their own 8-year-old in U8.** That row
is theirs, so they can read it. `can_approve_team('U8')` is false, so they
cannot approve it. The badge would show **1**, they would tap through to an
empty queue, and **it would never clear**.

⚠️ **A permanently wrong badge is worse than no badge** — it is the exact
mechanism that teaches people to ignore the thing Jay chose the loudest option
to avoid. This case is the headline test.

### Two ways out, and why one was chosen

**CHOSEN — a `SECURITY DEFINER` counting function.**

```sql
create or replace function public.pending_approvals_count()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int
  from public.memberships m
  where m.status = 'pending'
    and private.can_approve_team(m.team_id)
$$;
```

- One authority. The predicate is `can_approve_team`, the same function the
  approval RPC and the read policy already use — it cannot drift from them.
- Jay's self-approval ruling still holds automatically: a coach's own child in
  their **own** squad passes `can_approve_team`, so it is counted, exactly as
  ruled.
- One round trip, no rows returned.

⚠️ **`SECURITY DEFINER` on a new public function is a decision, not a
formality** — `db/schema/functions.sql` carries the rules. This one is `STABLE`,
reads one table, takes **no arguments** (so there is nothing to inject), and
returns a single integer. It leaks a *number* and never a row. **It must pin
`search_path`** (three-way test, `db/schema/functions.sql` header: DEFINER →
always pin). ⚠️ **And `EXECUTE` must be granted to `authenticated` only —
Supabase's default privileges grant new public functions to `anon` as well, so
the migration must `REVOKE ... FROM anon` explicitly and the capture must show
it.** Anon would get 0 anyway (`can_approve_team` cannot match a null uid), but
"it fails safe" is not a reason to leave it callable.

**REJECTED — filter in the app.** Fetch pending rows' `team_id`s and filter with
`canApproveTeam` from `scope.js`. No migration. Rejected because it copies a
database rule into JavaScript, and this repo already carries two of those under
"change one, change both" warnings (`SQUAD_STAFF_ROLES`, `APPROVER_ROLES`). A
third, on a count a person acts on, is a drift risk for no saving.

---

## What changes

| File | Change |
|---|---|
| `db/migrations/20260813_pending_approvals_count.sql` | New — **does not exist yet**. The function above, plus grants. |
| `db/schema/functions.sql` | Re-capture from the catalogue after applying. |
| `src/data/members.js` | `getPendingApprovalsCount()` — one RPC call. Throws on error, per the module's convention. |
| `src/lib/memberships.jsx` | Provider gains `pendingApprovalCount`, refetched by the existing `reload()`. |
| `src/components/AppShell.jsx` | Badge on the **More** nav tab (coaches/managers) and on the **Admin** pill (admins). |
| `src/screens/Accounts.jsx` | Call the shared `reload()` after approve/decline, alongside its existing local `reloadToken`. |

### ⚠️ Re-verified after `231b660` (PR #88) landed mid-design

That PR shipped multi-child registration and **touched `src/screens/More.jsx`**,
which this plan describes. Re-read rather than assumed:

- ✅ **The approvals card is unchanged** — still `More.jsx:389`,
  `!admin && canApproveAnything(memberships)`. Everything above still holds.
- ✅ **It independently confirms the chosen approach.** `More.jsx` now
  destructures `reload` from `useMemberships()` for exactly this kind of
  "something changed server-side, re-read it" problem. The plumbing this plan
  leans on is live and in use, not theoretical.
- ⚠️ **AND IT SETS A CONVENTION THIS PLAN MUST FOLLOW.** `More.jsx` passes
  `reload` DOWN AS A PROP rather than letting the child call
  `useMemberships()` itself, and says why: *"so it stays a pure props component
  and its tests stay free of the provider."* **The badge component therefore
  takes its count as a prop.** `AppShell` already consumes the provider and can
  read the count there; the badge itself must stay dumb, or its tests need a
  provider wrapper for a component whose entire job is to render a number.

### Why the count lives in `MembershipProvider`

The badge is in `AppShell`; approving happens in `Accounts`, a routed child. The
child has to be able to tell the badge to recount.

`MembershipProvider` already exposes `reload()`, and **`Accounts` already imports
`useMemberships`** — so this is one extra line at the call site and no new
plumbing.

⚠️ **The argument against, recorded because someone will make it:** it puts two
slightly different things in one provider, and every membership reload (roughly
hourly on token refresh) now costs a second query. Accepted — they are both
membership state, the query returns no rows, and the alternatives were a private
`window` event between two files with nothing tying them together, or a second
provider that `Accounts` would have to remember to refresh as well.

---

## Behaviour

- **No badge at all when zero.** Never a "0".
- A coach with two squads sees **one combined number**.
- Accessible name: *"More, 3 waiting to be approved"* — not a bare digit.
  ⚠️ The digit alone is meaningless to a screen reader and this app has an
  accessibility contract (`claude/specs/accessibility.md`).
- ⚠️ **If the count query fails, render no badge.** Never a zero, never an error
  state in the navigation. A nav that shows an error is worse than a nav that
  shows nothing.
- The badge is a **count of what you can act on**, not a notification history.
  Nothing is "marked read"; it clears when the queue does.

---

## Testing

1. **The failing case is the headline test.** A U12 coach with their own child
   pending in U8 counts **0**, not 1.
2. A coach's own child pending in **their own** squad counts **1** — Jay's
   ruling, pinned so a later "tidy-up" cannot silently reverse it.
3. A coach with two squads gets the combined total.
4. A plain parent with a pending registration gets **no badge** — they are not
   an approver. ⚠️ Their own row IS readable, so this is not free.
5. Zero pending renders nothing at all.
6. **Wiring**: the badge renders in `AppShell` and clears after approving.
   ⚠️ Same split as the error boundary — a badge component nothing mounts is
   worth nothing, and a component test stays green while that is true.
7. **RLS harness** (`db/tests/`): the function returns the right number for a
   coach, an admin and a stranger, in a transaction that rolls back.

⚠️ **PROVE IT AGAINST AN INJECTED FAULT.** Drop `can_approve_team` from the
function's `where` clause; test 1 must go red. An injection that fails to go red
is data about the check, not a clean bill of health.

---

## Explicitly not in this plan

- **Realtime.** Ruled out by Jay. The app's existing realtime subscription is
  already flagged in the 13 Aug audit as unfiltered and wasteful; a second one
  is not the place to start.
- **Blocking self-approval.** Jay ruled the other way. The gap in
  `approve_membership` is recorded in `claude/state-of-play.md`, not closed here.
- **A badge anywhere else** — no home-screen count, no email digest.
