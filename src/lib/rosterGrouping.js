import { positionGroup } from './rosterUnit.js'

// How the coach's roster is grouped — Jay, 14 Aug 2026, looking at the U16B
// coach view: "it would also help to be able to view players grouped by tier
// grade, then by back or forward".
//
// ⚠️ NESTED, AND HE CHOSE THAT OVER THE FLATTER ALTERNATIVE. Two shapes were
// mocked for him: nested headers (tier, then forward/back inside it) and a
// single level with a FWD/BCK chip on each row. He picked nested — "option A" —
// with no size fallback, so it nests however small the squad is.
//
// ⚠️ AN EMPTY SUB-GROUP MUST NOT RENDER ITS HEADING. "Tier A" containing only
// forwards should not show an empty "Backs" heading underneath it; that reads as
// a bug rather than as an absence. Enforced here rather than left to the screen,
// because a heading with nothing under it is the failure this file exists to
// avoid.
//
// ⚠️ UNGRADED PLAYERS GO LAST AND ARE NEVER DROPPED. They are the ones a coach
// most needs to see — the whole point of grading is to notice who has not been
// graded — so they get their own group at the foot rather than vanishing.

/** The order tiers are shown in. Ungraded is last, deliberately. */
const TIER_ORDER = ['A', 'B', 'C']
export const UNGRADED = '__ungraded__'

/** Forwards before backs before the ones with neither. */
export const UNIT_ORDER = ['Forwards', 'Backs', 'Other']

export const GROUP_BY = {
  TIER: 'tier',
  UNIT: 'unit',
  TEAM: 'team',
}

/**
 * Builds the grouped structure the roster renders.
 *
 * Returns `[{ key, label, count, sections: [{ key, label, players }] }]`.
 * ⚠️ ALWAYS THE SAME SHAPE, even for a single-level grouping — the screen then
 * has one render path rather than two, and a one-section group simply has its
 * section heading suppressed by the caller.
 *
 * @param {Array} players     already filtered and searched
 * @param {object} options
 * @param {string} options.groupBy   one of GROUP_BY
 * @param {Map} options.tierByPlayer player id -> 'A' | 'B' | 'C'
 * @param {Map} options.teamsById
 * @param {(a, b) => number} options.sortPlayers
 */
export function buildRosterGroups(
  players,
  { groupBy, tierByPlayer = new Map(), teamsById = new Map(), sortPlayers } = {},
) {
  const byName = sortPlayers ?? ((a, b) => a.full_name.localeCompare(b.full_name))

  if (groupBy === GROUP_BY.TEAM) {
    return single(players, (player) => player.team_id, {
      order: [...teamsById.keys()],
      label: (key) => teamsById.get(key)?.name ?? 'No age group',
      byName,
    })
  }

  if (groupBy === GROUP_BY.UNIT) {
    return single(players, (player) => positionGroup(player), {
      order: UNIT_ORDER,
      label: (key) => key,
      byName,
    })
  }

  // ══ TIER, NESTED BY UNIT — the shape Jay picked ═════════════════════════
  const byTier = new Map()
  for (const player of players) {
    const tier = tierByPlayer.get(player.id) ?? UNGRADED
    if (!byTier.has(tier)) byTier.set(tier, [])
    byTier.get(tier).push(player)
  }

  return [...TIER_ORDER, UNGRADED]
    .filter((tier) => byTier.has(tier))
    .map((tier) => {
      const inTier = byTier.get(tier)
      const byUnit = new Map()
      for (const player of inTier) {
        const unit = positionGroup(player)
        if (!byUnit.has(unit)) byUnit.set(unit, [])
        byUnit.get(unit).push(player)
      }
      return {
        key: tier,
        label: tier === UNGRADED ? 'Not graded' : `Tier ${tier}`,
        count: inTier.length,
        // ⚠️ FILTERED, so an empty sub-group never renders a heading.
        sections: UNIT_ORDER.filter((unit) => byUnit.has(unit)).map((unit) => ({
          key: unit,
          label: unit,
          players: [...byUnit.get(unit)].sort(byName),
        })),
      }
    })
}

/** One level of grouping, wrapped in the same shape as the nested case. */
function single(players, keyOf, { order, label, byName }) {
  const bucket = new Map()
  for (const player of players) {
    const key = keyOf(player)
    if (!bucket.has(key)) bucket.set(key, [])
    bucket.get(key).push(player)
  }
  return order
    .filter((key) => bucket.has(key))
    .map((key) => ({
      key,
      label: label(key),
      count: bucket.get(key).length,
      // ⚠️ ONE UNNAMED SECTION. The caller suppresses a section heading whose
      // label is null, so a flat grouping and a nested one render through the
      // same code.
      sections: [{ key: 'all', label: null, players: [...bucket.get(key)].sort(byName) }],
    }))
}

/**
 * Which columns carry no information for the rows on screen.
 *
 * ⚠️ ONE RULE INSTEAD OF A LIST OF SPECIAL CASES. Jay's complaint was two
 * columns — gender on a single-gender squad, age group when filtered to one —
 * and both are the same thing: a column whose value is identical on every
 * visible row tells the reader nothing. Deriving it means the rule also covers
 * cases nobody has thought of, and it reverses itself when the filter widens.
 *
 * ⚠️ A COLUMN IS ONLY CONSTANT IF THERE IS SOMETHING TO BE CONSTANT ABOUT: with
 * no rows at all, nothing is hidden. Hiding everything on an empty list would
 * make the table look broken at the exact moment a coach is wondering why it is
 * empty.
 */
export function constantColumns(players, valueOf) {
  const hidden = new Set()
  if (!players || players.length === 0) return hidden

  for (const [column, read] of Object.entries(valueOf)) {
    const first = read(players[0])
    if (players.every((player) => read(player) === first)) hidden.add(column)
  }
  return hidden
}
