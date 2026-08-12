# Admin portals — the plan

**STATUS: NOT SHIPPED.** Written 12 Aug 2026, for Jay to review.

⚠️ **Set this line to SHIPPED in the commit that ships it**, not as a promise
about that commit.

The ruling is in `claude/decisions/2026-08-12-admin-portals.md`. This file is
the work.

⚠️ **DEPENDS ON `claude/plans/2026-08-12-jobs-not-people.md`.** The portals are
named with the new job labels, so the naming change lands first or this one
ships the old words.

## The shape

| Portal | Right | Tabs | Card state for a holder |
|---|---|---|---|
| Club Admin | none — any admin | Accounts, Club | open |
| Pitch Management | `pitches` | Allocation, Pitches | open |
| Club Youth Manager | `youth` | Match sheets | open |
| Social Media Management | `media` | — none yet | **greyed, even for a holder** |

Every card renders for every admin. Not holding the right greys it. Holding a
right whose portal has no screen also greys it.

## 1. One list drives everything

New `src/lib/portals.js`, exporting `PORTALS` and two helpers — which portal a
pathname belongs to, and whether a portal is open to a given membership set.

⚠️ **The chooser and the tab row must read the SAME list.** Two hand-maintained
lists drift, and the drift here is a portal that is enterable from one place and
invisible from the other. The list is also the only place a tab's URL is
written down.

⚠️ **A portal with an empty `tabs` array is greyed regardless of the right.**
That is what makes Social Media Management honest today and makes it open by
itself the moment a screen is added to its list — no second edit, nothing to
forget.

⚠️ **`hasAdminRight` already returns true for a super admin without the right
being listed**, deliberately. So a super admin sees three open cards and one
greyed, which is correct: the greyed one has no screen, not a missing right.

## 2. The routes

Only bare `/admin` changes. Nothing bookmarked breaks.

- `/admin` — was `<Navigate to="/admin/accounts" replace />`, becomes the
  chooser.
- `/admin/accounts`, `/admin/club`, `/admin/allocation`, `/admin/pitches`,
  `/admin/youth` — all unchanged.

⚠️ `tests/app.test.jsx` asserts the redirect today ("redirects bare /admin to
the Accounts tab"). **Rewrite that test to assert the chooser, do not delete
it** — it is the only thing standing between a future refactor and a bare
`/admin` that renders nothing.

## 3. `src/screens/AdminDashboard.jsx`

Everything load-bearing stays exactly as it is, and the reasons are in its own
header comments — do not re-derive them:

- the `isAdmin` gate on the **effective** membership set,
- the previewing branch that keeps a real admin out of "Not authorised",
- the CSS-only desktop-only wrapper (a phone still mounts and queries behind it;
  that is the documented, accepted behaviour),
- the View-as switcher, which lives here and nowhere else.

What changes: the tab row stops being *every tab you are entitled to* and
becomes *the tabs of the portal you are standing in*, derived from the pathname
via `portals.js`. Above it, a way back to the chooser.

⚠️ **Render no tab row at all for a one-tab portal.** A row of one tab is
chrome that says nothing. The portal heading already names where you are.

## 4. The chooser

Heading, View-as switcher, and the four cards.

- **Open card** — a link to its first tab.
- **Greyed card** — ⚠️ **not a link, in the markup, not merely in the styling.**
  See the ruling for why. `aria-disabled` is not enough on its own; render a
  non-interactive element.
- ⚠️ **The state is said in words, not carried by colour** —
  `claude/specs/accessibility.md`. "You haven't been given this job" and "No
  screen yet" are different sentences and should stay different, because they
  are different situations and the fix for each is different.

## Testing

⚠️ **Rule 6 applies to each new assertion.** Every test below gets its fault
injected and confirmed red before it counts, and **an injection that fails to go
red is data about the check** — this repo has been caught by exactly that twice,
once while proving the overflow gate.

- The chooser renders all four cards for an admin with no extra rights, with
  exactly one of them a link.
- A `pitches` holder gets Pitch Management as a link to `/admin/allocation` —
  ⚠️ **allocation, not pitches.** Allocating is the weekly job and setup is done
  twice a season; the existing tab order already says so and the card must agree.
- The greyed cards are not links and not focusable.
- The tab row inside a portal shows that portal's tabs and no others.
- A super admin sees Social Media Management greyed, **not** open.

⚠️ **Then the real-browser gate**, because the chooser is a new card grid and a
header row has taken this app's whole layout down before:
`npm run harness`, then `npm run check:overflow` at 320/360/375/390/414.
⚠️ **It is layout-only and blind to anything inside a `Sheet`** — nothing here
is in a sheet, so that limit does not bite, but do not quote a green run as
proof the cards LOOK right. Nobody has looked at them.

⚠️ **A green run says nothing about the desktop-only path either** — the gate
measures phone widths, and this whole tree is hidden below `desktop`. Open it on
a laptop and look.

## Out of scope

- Building the social-media screen. Later the same day, per Jay — and when it
  lands, its only required change here is adding its tab to `PORTALS`.
- Any change to what a right permits. Navigation only; see the ruling.
- Narrowing an admin's sight of children's data.
