# Staff and admin contacts are club-visible — ruling C

**26 Aug 2026, Jay.** Settled while designing the person card
(`claude/plans/2026-08-26-person-card.md`): tapping any adult's name opens a
contact card, and the question was who sees the phone number and address on it.

## The ruling

**Taking a staff or admin role makes you contactable by ANYONE in the club,
full stop.** Any active member who taps a coach, manager, medic or admin gets
Call · WhatsApp · Email · Chat. This extends the 13 Aug ruling — "the staff
automatically opts in when accepting the position" — from squad-scoped to
club-wide. The face follows the card: `private.can_see_staff_photo` gained the
same arm.

**Parents did not move.** A parent's contacts go only to the people who manage
them (super admins, or staff of a squad the parent belongs to). Parent-to-parent
is chat-only. Children never have a contact card at all — a player's name keeps
opening Player Detail under its existing rules.

Enforcement is server-side in `public.member_contact_card`
(`db/migrations/20260826_member_contact_card.sql`): the contact columns are
nulled in the database, so a screen cannot leak what it never receives.

## The options examined and not taken

- **A — strict mirror of the pre-existing visibility** (staff contacts only
  within your own squads). Rejected by Jay: it leaves a U10 coach unable to
  ring the U16 coach about a shared pitch, a transfer, a festival day.
- **B — staff-to-staff open, parents squad-scoped as before.** The
  recommendation in the design discussion; Jay chose wider. **B is the named
  fallback if C ever proves too open** — the migration's `entitled` CTE is the
  single place the arm lives, so narrowing is one function replace.

## The argument AGAINST what was built (record it so it isn't remade blind)

C is the widest exposure of a volunteer's personal mobile the app has ever
had: every signed-in member — which after self-registration means any approved
parent — can pull any coach's number from any screen their name appears on.
The counterweights that carried the day: the club is a membership-gated
community of a few hundred approved people, not the public internet; the squad
contacts card had already established "taking the role means being reachable"
on 13 Aug and no one objected in the fortnight it was live; and a coach who
needs another squad's coach at a pitch gate on Saturday morning is the real,
recurring case the narrower rules kept failing.
