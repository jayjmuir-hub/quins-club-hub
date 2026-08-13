# Plan — a parent registers more than one child

**STATUS: SHIPPED, 13 Aug 2026.** Written and built the same day, at Jay's
request, front-end only.

## The thing that was wrong

Jay, 13 Aug 2026: *"we need the ability for parents to add multiple children, up
to 5, i thought we built that in"*.

We had not. What existed was two adjacent things that made it look as though we
had:

1. **The cap.** `register_my_player` refuses a sixth pending registration
   (errcode 42901). The decision that specified it,
   `claude/decisions/2026-08-08-parent-self-registration.md`, describes it as
   *"refuse beyond a small number of pending rows per profile, so one account
   cannot fabricate a squad's worth of children"* — an **anti-abuse brake**,
   never a feature. The number 5 comes from there.
2. **Multi-child for admins.** The data model genuinely handles a parent of
   several children, and so does the admin grant path
   (`src/components/AccessBuilder.jsx`, `claude/specs/2026-08-03-multi-access-design.md`).
   *"A parent of two children"* is called out there as the ordinary case.

What never existed was any **parent-facing** route to a second child.
`src/components/AddYourPlayer.jsx` took one name and one age group, and
`src/components/AppShell.jsx` mounts it only while `memberships.length === 0` —
so it vanished the instant the first child was registered and never came back.
The only remaining route was an admin on the desktop-only Accounts screen.

⚠️ **The database never had this restriction.** The rate limit counts PENDING
rows only, and `db/migrations/20260808_register_my_player.sql` says why in as
many words: *"an approved parent adding a second child later is normal and must
not be blocked by their own history."* The form was the limit. That is the whole
diagnosis, and it is why the gap survived from 8 to 13 August — every check
anyone ran was against the database, which was right all along.

## What was decided, and by whom

All four settled by Jay on 13 Aug 2026, in the order asked:

| Question | Ruling |
|---|---|
| What does "up to 5" mean? | **5 awaiting approval at a time**, which is exactly what the database already does. Not a lifetime ceiling. **No migration.** |
| One child at a time, or several at once? | **Several at sign-up**, one at a time afterwards |
| What happens when 2 of 3 save and the third is refused? | **Keep the two, name the third** |
| Who sees the add button, and where? | **A card on More, rendered for everyone with a parent or player role** — including those with no linked child |
| How does a parent learn a second child is queued? | **A chip on that child's card.** The big banner is left alone |

## What was built

**No database change. Front-end only.**

### `src/components/PlayerRegistrationForm.jsx` — new

The fields, extracted out of `AddYourPlayer` so that both callers render the
same component. Holds a list of up to five rows; each row keeps its own
conditional gender and self-registration controls, because both answers are
about the individual child and a single-gender squad in row 2 must not make row
1 ask.

⚠️ **Saves sequentially, not concurrently.** `register_my_player` takes one
player per call, so three children are three round trips whatever happens.
Firing them together makes a partial failure unreportable — you get three
settled promises and no way to tell a parent which child is missing.
`src/screens/Register.jsx` made the same call first, for the same reason; its
`remaining.reduce` chain is the precedent.

⚠️ **A partial failure keeps what worked.** Each call is its own committed
transaction, so child one exists the moment it returns; "roll it all back" is
not available without a delete path that does not exist. The saved children are
named as good news, the failure is named with the server's own reason, and the
saved rows are **removed from the list** — leaving them would let a parent
resubmit a child who is already in, creating a duplicate the club has to spot.

⚠️ **`Continue without them` appears only after something has saved.** Two
children in and a third refused for a reason the parent cannot fix would
otherwise strand them on the form with real access waiting behind it. Offered on
a fresh form, the same button would read as "skip this" on the one screen whose
purpose is not to be skipped.

### `src/components/AddYourPlayer.jsx` — reduced

Keeps only what is specific to the zero-membership moment: the shell, the copy
about approval, and the way out to `RequestAccess`. Gains one sentence telling a
parent of several that one account covers the family — without it the obvious
guess is "an account each", which is the expensive thing to undo.

### `src/components/YourPlayers.jsx` — the parent-facing route

- An **Add another player** card, opening the same form in a `Sheet`.
- ⚠️ **The gate is the ROLE, not the list.** This used to return `null` when the
  player list came back empty. `src/screens/More.jsx` already recorded the bug
  that causes: a membership granted by hand by an admin has `player_id = null`,
  so the panel rendered nothing for that person. Gating the add button on the
  list would have kept it hidden from exactly the parent who has no child
  attached yet. A coach or admin with no parent/player row still sees nothing.
- A **Waiting for approval** chip per child. ⚠️ Deliberately not `isPendingOnly`,
  which is `every` and answers a different question — "does this account have
  any access at all", which is what AppShell's banner is for. A parent with one
  approved child and one waiting is a fully working member who needs to know
  about one row, not a banner across their whole app.

### `src/data/members.js` — one message reworded

The 42901 refusal read *"please wait rather than adding more"*. That was fair
when the only way to reach it was submitting the same form five times, and it is
a telling-off now that a parent of six is deliberately supported. It now states
that the limit is on players **awaiting approval** and that there is no limit on
how many children an account may have — otherwise the parent concludes the app
cannot hold their family.

## The arguments against, recorded because they will be made again

- **"Make it atomic — one RPC taking all the children in one transaction."**
  Rejected. It needs a second `SECURITY DEFINER` function that any signed-in
  stranger may call, with all six of `register_my_player`'s guards duplicated
  exactly. `db/schema/functions.sql` calls that surface *"the one function a
  person with NO membership may call"*; this would make it two, and the second
  one would be the one nobody re-reads. The sequential loop reuses the audited
  function untouched.
- **"Put the add button inside the Your players list."** Rejected — see the gate
  note above. It is invisible to the people who most need it.
- **"Show the big banner whenever any child is pending."** Rejected. The
  banner's text promises that *"the rest of the squad appears once approved"*,
  which is a lie to a parent who already has full access through their first
  child. Rewording it to name a specific child makes it a per-child notice with
  a page-wide presence, which is the chip's job done worse.
- **"Cap the rows at the server instead of at five on screen."** The server does
  cap it, and still does — this is the client mirroring a guard it can check
  cheaply, exactly as the name-length and blank-name checks already do. Building
  seven rows and losing the last two to a refusal is a worse experience than
  being told at five.

## What is NOT covered, and is worth knowing

⚠️ **THIS SECTION CLAIMED "nobody is emailed when a registration is waiting" AND
IT WAS WRONG — corrected 13 Aug 2026, same day, after Jay said he had received
the emails and so had the U18 team manager.** The claim was copied from
`PendingApprovalBanner`'s comment in `src/components/AppShell.jsx`, which had
been stale since **9 Aug**: `db/migrations/20260809_notify_pending_membership.sql`
puts a trigger on the membership row that emails every coach, team manager and
admin for that squad via the `notify-approval` function, confirmed ACTIVE on the
live project.

**So a parent registering several children does NOT fill a queue nobody watches**
— the club is told each time. ⚠️ **The lesson is the one this repo keeps paying
for: a code comment is not a measurement.** The banner's own user-facing text
was telling parents to go and chase a coach who had already been emailed; that
is fixed.

What IS still true: **nobody is emailed on APPROVAL** — being let in is
discovered by signing in.

⚠️ **"I'm the player" is still offered per row**, so a 16-year-old could in
theory register themselves and a sibling in one submit. The database does not
care, `private.is_own_player` accepts either role, and policing it costs more
than it saves. Jay was told and agreed, 13 Aug 2026.

## Verification

Every new assertion was checked against an injected fault — see the changelog
entry for what was broken and what failed as a result.

⚠️ **One of the five injections did NOT reproduce, and it is the interesting
one.** `blankRow`'s stable key was documented as preventing the classic
index-key bug — one row's typed name appearing in another's box after a removal.
Injecting `key={index}` left the removal test **green**, because every field in
this form is controlled from `rows` state, so React re-renders the reused DOM
node with the correct value regardless. The comment was describing a bug that
cannot happen here. The key is kept — the field `id`/`htmlFor` pairs are built
from it — but it is now labelled as a guard nothing tests, rather than as a fix.
**The lesson is the one this repo keeps relearning: a plausible reason written
next to correct code is still an unverified claim.**

The suite covers: rows
saved in order; gender asked only on the row whose squad demands it; the
incomplete row named rather than "your player"; a partial failure naming the
saved and the failed; a saved child never resubmitted on retry; the escape hatch
appearing only once earned and not before; the five-row ceiling; a removed row
not corrupting its neighbour's input; the add button reaching a parent with a
null `player_id`; and the pending chip appearing on one child and not the other.

⚠️ **NOT verified live by Claude.** Driving the real flow needs a parent sign-in,
which Claude does not do — no passwords, no account creation. Jay's live check is
the outstanding half.
