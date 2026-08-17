import { squadRequiresGender } from './gender.js'

// What the club is still missing about a person, in one place.
//
// Item 6 of claude/plans/2026-08-16-account-creation-redesign.md. Jay's original
// complaint had two halves: *"i have coaches signing up without adding their
// kids"* — fixed by the roll-call — and *"i can't have people signing up without
// complete information"*, which is this.
//
// Pure, no imports beyond the gender rule, no React, no supabase — the same
// reasoning as src/lib/scope.js and src/lib/ageGrade.js: it must be trivially
// testable with plain objects, because three surfaces will read it and they must
// agree. A second implementation is a second answer, and the wrong one would be
// the one nobody tested.
//
// ══ ⚠️ WHAT IS DELIBERATELY *NOT* CHASED, AND WHY THE LIST IS SHORT ═══════
//
// The whole contract is that the card DISAPPEARS when the list is empty. A chase
// with no visible end is ignored by about the third sign-in, and once ignored it
// is worse than nothing — it trains people to skip the one place the club asks
// them for something.
//
// So a thing only belongs here if it passes both tests:
//
//   1. THE PERSON READING IT CAN FIX IT THEMSELVES. Otherwise it is a complaint,
//      not a prompt.
//   2. IT IS EXCEPTIONAL, not the normal state of the club.
//
// ⚠️ MEASURED BEFORE ANY OF THIS WAS WRITTEN, 17 Aug 2026, and the numbers
// decided the list rather than the other way round:
//
//   no position       23 of 26 players    <- EXCLUDED
//   no date of birth  26 of 26            <- included, see below
//   no parent on file  9 of 26            <- included
//   no gender          5 of 26            <- included, only where the squad asks
//   adults, no phone  11                  <- included
//   adults, no family name  0             <- nothing to chase
//
// ⚠️ POSITION IS EXCLUDED AND MUST STAY EXCLUDED. It fails BOTH tests: it is a
// coach's judgement, not a parent's to set, and at 23 of 26 it is the normal
// state of a youth club rather than a gap. Listing it would put a card on almost
// every screen in the app, permanently, which is exactly the failure this
// design exists to avoid.
//
// ⚠️ DATE OF BIRTH FIRES FOR EVERY CHILD TODAY, AND THAT IS ACCEPTED RATHER THAN
// OVERLOOKED. `player_private` is empty — the field only became required on
// 16 Aug, so every child registered before that has none. It still belongs here
// because it passes both tests in the way that matters: a family can fix it in
// one go, and once they have, it never comes back. That is a chase with an end,
// which a permanent banner is not.

/**
 * One thing the club is missing. `id` is stable for React keys and test
 * assertions; `label` is written as something the reader can act on.
 *
 * ⚠️ `label` IS ADDRESSED TO WHOEVER IS BEING SHOWN IT. These are the parent's
 * and the member's own words — "we don't have a birthday for Ada" — not an
 * admin's. The admin-facing surface can re-word from `id`; the reverse (writing
 * them for an admin and softening them later) is how a chase starts sounding
 * like a telling-off.
 */
function gap(id, label) {
  return { id, label }
}

/**
 * What is missing about ONE CHILD, from the point of view of their family.
 *
 * Takes what it needs rather than fetching: `player` (the row), `team` (for the
 * gender rule, which is squad-dependent), `dateOfBirth` (from player_private,
 * which is a separate table by design) and `parentCount`.
 *
 * ⚠️ AN UNKNOWN IS NOT A GAP. `dateOfBirth: undefined` means "we did not look" —
 * a parent reading a team-mate's record gets null from RLS, and treating that as
 * "no birthday on file" would put a card in front of somebody about a child that
 * is not theirs and that they cannot fix. Pass `null` for "we looked and there
 * is none"; leave it out to say nothing.
 */
export function missingForPlayer({ player, team, dateOfBirth, parentCount } = {}) {
  const gaps = []
  if (!player) return gaps

  const name = String(player.first_name ?? player.full_name ?? 'your player').trim() || 'your player'

  if (dateOfBirth === null) {
    gaps.push(gap('dob', `${name}’s date of birth`))
  }

  // ⚠️ ZERO IS A GAP; UNDEFINED IS NOT. Same rule as the birthday above.
  if (parentCount === 0) {
    gaps.push(gap('parent', `a parent or carer’s phone number for ${name}`))
  }

  // ⚠️ ONLY WHERE THE SQUAD ASKS. Gender is required on a single-gender squad
  // and optional everywhere else (Jay, 9 Aug 2026) — chasing it on a mixed
  // squad would be the app demanding something it does not itself require.
  if (team && squadRequiresGender(team.name) && !player.gender) {
    gaps.push(gap('gender', `whether ${name} plays in the boys’ or girls’ squad`))
  }

  return gaps
}

/**
 * What is missing about the SIGNED-IN ADULT themselves.
 *
 * ⚠️ THE PHONE IS THE ONLY ONE, AND THE FAMILY NAME IS DELIBERATELY ABSENT.
 * Zero adults are missing one (measured), and the sign-in gate and the roll-call
 * both already require it — so a rule here would be a third place enforcing a
 * fact that cannot be missing, and the first thing to go stale when one of the
 * other two changes.
 */
export function missingForMe({ profile } = {}) {
  const gaps = []
  if (!profile) return gaps

  if (!String(profile.phone ?? '').trim()) {
    gaps.push(gap('phone', 'your phone number, so a coach can reach you about a fixture'))
  }

  return gaps
}

/**
 * Everything missing across a family — the adult and each of their children.
 *
 * ⚠️ RETURNS A FLAT LIST, AND AN EMPTY ONE IS THE POINT. The card that reads
 * this must render NOTHING when it is empty. That is the whole contract: a
 * prompt that can be finished is a prompt people finish, and one that cannot is
 * one they learn to skip.
 */
export function missingForFamily({ profile, children = [] } = {}) {
  return [
    ...missingForMe({ profile }),
    ...children.flatMap((child) =>
      missingForPlayer(child).map((item) => ({ ...item, id: `${child.player?.id ?? 'p'}:${item.id}` })),
    ),
  ]
}
