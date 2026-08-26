# The person card — tap any name, contact the person

**Status: NOT SHIPPED — design approved by Jay 26 Aug 2026; implementation
not started.**

Jay, 25 Aug 2026: "click on any username … and have the option to chat with
them." That request shipped only inside chat threads (`ChatBubble`'s
`onAuthor`). On 26 Aug, looking at `/admin` → Staff, Jay named the gap: "this
screen is an example of the inability to click on a username, see their info
and start a chat, email, call, etc. i asked to be able to do that from
anywhere in the system."

## What ships

Tapping an adult's name — anywhere it appears — slides up a small card over
the current screen: photo, name, role/title, then action buttons
**Call · WhatsApp · Email · Chat**. One tap dismisses it; you never lose your
place. Tapping a **player's** name keeps doing what it does today (opens
Player Detail where allowed — children have no phone, email or chat in this
system). Your **own** name is not tappable.

## The visibility ruling (Jay, 26 Aug 2026 — option C)

**Taking a staff or admin role makes you contactable by anyone in the club,
full stop.** This extends the 13 Aug ruling ("the staff automatically opts in
when accepting the position") from squad-scoped to club-wide.

| Viewer taps… | Any signed-in member sees | Staff/admin who manage that person see |
|---|---|---|
| a coach / manager / admin | Call · WhatsApp · Email · Chat | same |
| a parent | **Chat only** | Call · WhatsApp · Email · Chat |
| a player (child) | Player Detail opens instead — never a contact card | same |
| themselves | name is not tappable | — |

"Manage" keeps its existing database meaning: squad staff for the parents of
players in their squads; club admins for everyone. **Parent privacy does not
change.** The only widening anywhere is staff/admin contacts becoming
club-visible.

### Options examined and not taken

- **A full profile page per person** — rejected: needs a back-journey, no
  adult profile page exists today, and the job is "contact them", not "read
  about them". The card is the WhatsApp/Teams shape.
- **Strict mirror of today's visibility** (staff contacts only within your
  own squads) — rejected by Jay: it would leave a U10 coach unable to ring
  the U16 coach about a shared pitch.
- **Staff-to-staff only** (staff contacts open to other staff, hidden from
  parents outside the squad) — offered as the recommendation; Jay chose the
  wider rule instead. If C ever proves too open, this is the fallback shape.

## How it works

### Data: one new RPC, `public.member_contact_card(_profile uuid)`

`SECURITY DEFINER`, in the house style of `my_squad_staff`. Returns one row:
name, photo path, role summary (best membership: title if set, else role
label, plus squad names), and `phone` / `email` — **nulled server-side unless
the viewer is entitled**:

- viewer is an active club member AND target holds an active staff or admin
  membership → phone and email returned (ruling C);
- OR viewer manages the target under the existing scopes (super admin, or
  staff of a squad where the target is a parent of a rostered player —
  reusing the same `private.*` helpers Player Detail's parent block relies
  on) → returned;
- otherwise → null. The number never reaches the browser of someone not
  entitled to it. **The card never grants access; the database decides.**

Chat eligibility stays where it lives today: the card's Chat button drives
the existing DM path, and `private.can_dm` remains the rule (minors, guardian
opt-in — untouched).

Photo signing follows the existing batch-sign pattern from
`src/data/staff.js` (private bucket, signed URL per open — one person per
card, so one sign).

### UI: two components

- **`PersonName`** — wraps a name and makes it tappable (dotted underline,
  same affordance `ChatBubble`'s author button already uses). Given a
  `playerId` instead of a `profileId` it navigates to Player Detail. Renders
  plain text for yourself, or when there is no profile behind the name (e.g.
  the rights log's "the system" / "an account since deleted").
- **`PersonCard`** — the bottom sheet itself: photo, name, role line, action
  buttons in the `ContactButton` visual family from `SquadStaffCard`. Buttons
  render only for the fields the RPC returned; a card with nothing but Chat
  is a normal, correct card. Load failure shows the sheet with an inline
  error, never a dead tap.

### Where names become tappable (the "anywhere" list, one pass per screen)

1. Admin → Accounts and Staff tabs — the member's name in each row
2. Admin → Rights log — subject and actor names
3. Player Detail — parent names
4. Squad Hub staff card — the name opens the card; the row's existing
   buttons stay
5. Notices — the author's name
6. Chat — authors already done; group member lists and chat headers join
7. Home — staff tile names

Anything found later renders through `PersonName` too — the component is the
contract, the list above is just the first sweep.

## Testing

- **Unit** (vitest, per touched screen): the name opens the card; the card
  shows Call/WhatsApp/Email for a staff target and Chat-only for a parent
  target when viewed as a parent; a player name navigates instead; own name
  is inert. Fixtures use invented names in the house `Zz Probe` pattern.
- **DB harness** (`db/tests/`, rolled back, per
  `claude/runbooks/db-harnesses.md`): `member_contact_card` hands a staff
  member's phone to an ordinary member (ruling C, proven against the injected
  fixture); refuses a parent's phone to another parent (returns the row with
  null contacts — the discriminating half); hands the parent's phone to their
  squad's coach. The negative case must fail because the RPC nulled it, not
  because the fixture was missing — the control is the same query run as the
  entitled coach.
- **Live, after deploy**: from a real parent account, tap a staff name from a
  notice and see the number; tap another parent and see Chat only.

## Out of scope

- Retiring or reshaping the Squad Hub contacts card (it stays; the card is
  additive).
- Any change to DM rules, minor protections, or parent-to-parent visibility.
- An adult profile page.
