import { supabase } from '../lib/supabase.js'

// Player grading (A/B/C) and the positions a player can cover.
// Phase 2 of claude/plans/2026-08-14-tiers-and-game-time.md.
//
// ⚠️ TWO TABLES WITH DELIBERATELY DIFFERENT VISIBILITY, AND THEY MUST NOT BE
// TIDIED INTO ONE SHAPE:
//   player_grades    coach-only on BOTH read and write. A judgement about a
//                    child's ability, in an app their parents use.
//   player_positions squad-readable, coach-writable — the same class of
//                    information as players.position, which the roster already
//                    shows everybody.
//
// ⚠️ A GRADE READ RETURNING NOTHING IS NORMAL, NOT A FAILURE. For a parent the
// policy returns zero rows by design, and for most players nobody has graded
// them. Callers must render "not graded" rather than an error.

export const TIERS = ['A', 'B', 'C']

/** Grades for a squad's players, keyed by player id. Coach-only by RLS. */
export async function listPlayerGrades(playerIds) {
  const ids = [...new Set((playerIds ?? []).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('player_grades')
    .select('player_id, tier, note')
    .in('player_id', ids)

  if (error) throw error
  return new Map((data ?? []).map((row) => [row.player_id, row]))
}

/**
 * Sets or clears one player's grade.
 *
 * ⚠️ A NULL TIER DELETES THE ROW rather than storing a null. `tier` is NOT NULL
 * on purpose: "ungraded" is the ABSENCE of a grade, not a grade whose value is
 * nothing — the same rule competition_type's NULL carries on events. Two ways to
 * say ungraded would mean every reader had to check both.
 */
export async function setPlayerGrade(playerId, tier, note = null) {
  const { data: session } = await supabase.auth.getUser()

  if (!tier) {
    const { error } = await supabase.from('player_grades').delete().eq('player_id', playerId)
    if (error) throw error
    return null
  }

  const { data, error } = await supabase
    .from('player_grades')
    .upsert(
      {
        player_id: playerId,
        tier,
        note,
        updated_by: session?.user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    )
    .select('player_id, tier, note')

  if (error) throw error
  // ⚠️ THE ZERO-ROW CHECK. RLS refuses a write by matching no rows, which
  // PostgREST reports as SUCCESS — so without this a coach grading a squad they
  // do not run would be told it saved.
  if (!data || data.length === 0) {
    throw new Error("We couldn't save that grade. Ask a club admin if that looks wrong.")
  }
  return data[0]
}

/** Every position each of these players can cover, keyed by player id. */
export async function listPlayerPositions(playerIds) {
  const ids = [...new Set((playerIds ?? []).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('player_positions')
    .select('player_id, position, sort_order')
    .in('player_id', ids)
    .order('sort_order', { ascending: true })

  if (error) throw error

  const byPlayer = new Map()
  for (const row of data ?? []) {
    const list = byPlayer.get(row.player_id) ?? []
    list.push(row.position)
    byPlayer.set(row.player_id, list)
  }
  return byPlayer
}

/**
 * Replaces the whole set of positions for one player.
 *
 * ⚠️ DELETE-THEN-INSERT, for the same reason saveLineupPlayers uses it: the
 * table is UNIQUE (player_id, position), so a diff would have to work out which
 * rows are moves and which are additions without ever colliding with one it is
 * about to remove. A player has at most a handful, edited by one coach at a time.
 *
 * ⚠️ THE CALLER MUST ALSO KEEP players.position IN STEP — it stays the PRIMARY
 * and six other screens read it. PlayerForm does that in the same submit; see the
 * migration's header for the full list of readers and why they were not rewritten.
 */
export async function savePlayerPositions(playerId, positions) {
  const { error: clearError } = await supabase
    .from('player_positions')
    .delete()
    .eq('player_id', playerId)
  if (clearError) throw clearError

  // Deduped and blank-stripped here rather than trusted from the caller: the
  // UNIQUE constraint would reject a repeat with a code the form would have to
  // translate, and an empty string is not a position.
  const clean = [...new Set((positions ?? []).map((p) => String(p ?? '').trim()).filter(Boolean))]
  if (clean.length === 0) return []

  const { data, error } = await supabase
    .from('player_positions')
    .insert(clean.map((position, index) => ({ player_id: playerId, position, sort_order: index })))
    .select('player_id, position, sort_order')

  if (error) throw error
  // ⚠️ The delete above has already run, so a silently-refused insert would leave
  // a player with NO positions and the form saying nothing. Length is the only
  // thing that distinguishes refusal from success here.
  if (!data || data.length !== clean.length) {
    throw new Error("We couldn't save those positions. Check them and try again.")
  }
  return data
}
