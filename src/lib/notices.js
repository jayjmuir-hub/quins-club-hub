import { isSquadStaffRole } from './scope.js'

// Pure helpers for the noticeboard. The only import is scope.js, which is
// itself import-free — no data module and no React, so this stays mountable in
// a jsdom test.
//
// ⚠️ THE SQUAD-STAFF ROLES COME FROM scope.js AND MUST NOT BE SPELLED OUT HERE.
// tests/staff-roles.test.jsx fails the build on a raw `=== 'coach'` anywhere in
// src/ outside the four files that define or label the set — it caught this
// file on 14 Aug 2026, which is exactly the hunt-across-the-tree that guard
// exists to prevent. A future role must stay a one-line change to
// SQUAD_STAFF_ROLES.
//
// ⚠️ EXPIRY IS DECIDED HERE, NOT IN THE DATABASE, AND THAT IS DELIBERATE.
// db/migrations/20260814_announcements.sql keeps expired notices READABLE on
// purpose: the author and every admin need to see what was sent, and a read
// receipt on a row nobody can select renders nothing. So the policy returns
// everything and this module decides what a member is shown. If expiry ever
// moves into the read policy, the receipts screen breaks and it will look like
// data loss rather than a policy change.

// How many pinned notices the Home card will draw. Beyond this the card links
// to the full list rather than growing without limit — the dashboard is the
// screen everyone opens and a noticeboard must not push the fixture off it.
export const MAX_PINNED_ON_HOME = 3

/**
 * Has this notice passed its expiry?
 *
 * ⚠️ A NULL `expires_at` MEANS FOREVER, never "expired". The nullable column is
 * the normal case and reading null as 0 would hide every notice ever posted.
 */
export function isExpired(notice, now = Date.now()) {
  if (!notice?.expires_at) return false
  const at = Date.parse(notice.expires_at)
  // An unparseable date is treated as no expiry. The safe failure for a
  // noticeboard is showing something too long, not silently hiding it.
  if (Number.isNaN(at)) return false
  return at <= now
}

/** Everything a member should currently be shown, newest first. */
export function currentNotices(notices, now = Date.now()) {
  if (!notices) return []
  return notices.filter((notice) => !isExpired(notice, now))
}

/**
 * The pinned ones, for the Home card.
 *
 * ⚠️ SORTED BY DATE WITHIN THE PIN, not by pin state — everything here is
 * pinned, so a secondary sort is the only one that means anything.
 */
export function pinnedNotices(notices, now = Date.now(), limit = MAX_PINNED_ON_HOME) {
  return currentNotices(notices, now)
    .filter((notice) => notice.pinned)
    .slice(0, limit)
}

/**
 * How many current notices this person has not read.
 *
 * `readIds` is a Set of announcement ids. ⚠️ EXPIRED NOTICES ARE NOT COUNTED:
 * a badge offering to show something the list will not display is a badge that
 * cannot be cleared, and the person tapping it has no way to learn why.
 */
export function unreadCount(notices, readIds, now = Date.now()) {
  if (!notices || !readIds) return 0
  return currentNotices(notices, now).filter((notice) => !readIds.has(notice.id)).length
}

/**
 * Who a notice went to, in words.
 *
 * ⚠️ THE SCOPE IS `team_id`, NEVER THE SQUAD'S NAME — the same rule
 * `teams.is_senior` and `teams.self_registration_allowed` carry. This function
 * only translates the id into something readable; nothing may branch on what it
 * returns.
 *
 * ⚠️ A TEAM ID THAT RESOLVES TO NOTHING FALLS BACK TO "Your squad", NOT TO
 * "Whole club". `teamsById` is built from the squads THIS PERSON can see, so a
 * miss is a scope gap rather than a club-wide notice — and labelling a squad
 * message as club-wide is the one wrong answer that would mislead the reader
 * about who else has it.
 */
export function audienceLabel(notice, teamsById) {
  if (!notice?.team_id) return 'Whole club'
  return teamsById?.get?.(notice.team_id)?.name ?? 'Your squad'
}

/**
 * The line under a notice: who wrote it, and in what capacity.
 *
 * ⚠️ THE TITLE REPLACES THE ROLE LABEL RATHER THAN JOINING IT, the same ruling
 * SquadStaffCard carries — "Head Coach" beside a "Coach" chip is the same word
 * twice. A title is never permission; it is a label an admin typed.
 */
export function authorLine(notice) {
  const name = notice?.author?.full_name?.trim()
  if (!name) return null
  const title = notice?.author?.title?.trim()
  return title ? `${name} · ${title}` : name
}

/**
 * The squads this person may post a notice to, and whether they may post
 * club-wide.
 *
 * ⚠️ THIS IS THE UI'S COPY OF THE POLICY AND IT IS NOT THE ENFORCEMENT.
 * "announcement create" in the migration is. This exists so the composer can
 * offer the right options rather than letting somebody write three paragraphs
 * and then be refused — which is what an unfiltered picker would do.
 *
 * ⚠️ IT MIRRORS `private.can_edit_team`, INCLUDING `status === 'active'` AND
 * INCLUDING MEDIC. If the two ever disagree, the database wins and the symptom
 * is a refusal at save time. Do not "simplify" this to a role check.
 */
export function postableScopes(memberships) {
  const clubWide = (memberships ?? []).some(
    (m) => m.role === 'admin' && m.status === 'active',
  )

  const teamIds = new Set()
  for (const m of memberships ?? []) {
    if (m.status !== 'active') continue
    // An admin may post to any squad, which the caller resolves against the
    // full team list — an admin's own membership carries team_id = null.
    if (m.role === 'admin') continue
    if (isSquadStaffRole(m.role) && m.team_id) teamIds.add(m.team_id)
  }

  return { clubWide, teamIds, anyAdmin: clubWide }
}

/**
 * True when this person may post anything at all — the gate on the "Post a
 * notice" button.
 */
export function canPostNotice(memberships) {
  const { clubWide, teamIds } = postableScopes(memberships)
  return clubWide || teamIds.size > 0
}

/**
 * The squads to offer in the composer's picker.
 *
 * An admin gets every squad in `allTeams`; anyone else gets only the ones they
 * staff. Returned in the order `allTeams` arrived in, which is the club's
 * `sort_order`, so the picker cannot reshuffle itself between reloads.
 */
export function postableTeams(memberships, allTeams) {
  if (!allTeams) return []
  const { clubWide, teamIds } = postableScopes(memberships)
  if (clubWide) return [...allTeams]
  return allTeams.filter((team) => teamIds.has(team.id))
}

/**
 * "18 of 24 seen", or null when there is nothing meaningful to say.
 *
 * ⚠️ AN AUDIENCE OF ZERO RETURNS null RATHER THAN "0 of 0". A squad with no
 * active members is a real state (twelve of fifteen squads had no staff in
 * August 2026), and "0 of 0 seen" reads as a broken counter.
 */
export function seenSummary(stat) {
  if (!stat) return null
  const audience = stat.audience_count ?? 0
  if (audience <= 0) return null
  return `${stat.seen_count ?? 0} of ${audience} seen`
}
