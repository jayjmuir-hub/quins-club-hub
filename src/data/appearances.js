import { supabase } from '../lib/supabase.js'

// "Who hasn't had a chance to play?" — phase 1 of
// claude/plans/2026-08-14-tiers-and-game-time.md.
//
// ⚠️ AN APPEARANCE IS A SELECTION IN A LINEUP, NOT ATTENDANCE AND NOT MINUTES.
// The reasoning is in the plan and is worth repeating where the query lives:
//   - `lineup_players` is what coaches actually fill in, and its `role` column
//     gives starts vs bench for nothing.
//   - `attendance` exists but had ZERO rows in use when this was written
//     (measured 14 Aug 2026), so counting from it would report every player in
//     the club as having played nothing — a confident, wrong answer.
//   - Minutes would need live on/off capture pitch-side. Out of scope until Jay
//     says fair game time means minutes rather than appearances.
//
// ⚠️ COACH-ONLY BY CONSTRUCTION, NOT BY A CHECK IN THIS FILE. `lineup_players`
// carries the `lineup player manage` policy (private.can_edit_team), so a parent
// running this query reads zero rows. Nothing here needs to gate it, and nothing
// here could be trusted to.
//
// ⚠️ HISTORY STARTS WHEN LINEUPS DID. There is no back-history to count, so a
// zero here means "not picked since the club started using team sheets", NOT
// "never played for the club". The screen must say so; a bare 0 next to a
// long-serving player's name is a lie of omission.

/**
 * Appearance counts per player for one squad.
 *
 * @param {{ teamId: string, from?: string }} options
 * @returns {Promise<Map<string, {starts: number, bench: number, total: number}>>}
 */
export async function listAppearances({ teamId, from } = {}) {
  // ⚠️ An empty teamId must return NOTHING, never "no filter, everything" — the
  // same rule listEvents and listPlayers carry, and the same reason: a missing
  // scope has to fail closed.
  if (!teamId) return new Map()

  // ⚠️ `!inner` ON BOTH JOINS IS LOAD-BEARING. Without it PostgREST returns the
  // lineup_players row with a NULL nested object when the filter does not match,
  // rather than dropping the row — so every filter below would silently do
  // nothing and the counts would include every squad in the club.
  let query = supabase
    .from('lineup_players')
    .select('player_id, role, lineups!inner(id, events!inner(id, team_id, type, starts_at))')
    .eq('lineups.events.team_id', teamId)
    // ⚠️ MATCHES ONLY. "Matches played" is about matches; counting training
    // would make a player who never plays but always trains look well served,
    // which is the exact question this is meant to answer.
    .eq('lineups.events.type', 'match')

  if (from) query = query.gte('lineups.events.starts_at', from)

  const { data, error } = await query
  if (error) throw error

  const counts = new Map()
  for (const row of data ?? []) {
    const current = counts.get(row.player_id) ?? { starts: 0, bench: 0, total: 0 }
    if (row.role === 'replacement') current.bench += 1
    else current.starts += 1
    current.total += 1
    counts.set(row.player_id, current)
  }
  // ⚠️ TWO LINEUPS FOR ONE EVENT COUNT TWICE, DELIBERATELY. A tournament day
  // where a squad plays several games is several appearances — that is the whole
  // reason lineups.event_id has no unique constraint, and collapsing them here
  // would undo it.
  return counts
}
