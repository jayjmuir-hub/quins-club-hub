import { supabase } from '../lib/supabase.js'

// Player grading (A/B/C), the positions a player can cover, and forward-or-back.
// Phase 2 of claude/plans/2026-08-14-tiers-and-game-time.md.
//
// ⚠️ ALL THREE TABLES ARE STAFF-ONLY, since 25 Aug 2026. player_positions was
// squad-readable ("the same information the roster shows everybody") until Jay
// reversed that ruling: "positions should only be viewable and editable by
// staff". player_units carries what players.unit used to — the columns on
// players could not be staff-only because RLS grants rows, not columns. See
// db/migrations/20260825_positions_staff_only.sql.
//
// ⚠️ A READ RETURNING NOTHING IS NORMAL, NOT A FAILURE — for a parent every
// policy here returns zero rows by design. Callers must render "not set" /
// "not graded" rather than an error.

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
 * ⚠️ THE FIRST POSITION IS THE PRIMARY. players.position is nulled (and later
 * dropped) by the 25 Aug staff-only migration; staff screens decorate their
 * player rows from this table's map instead.
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

/** Forward-or-back for these players, keyed by player id: 'forward' | 'back'. */
export async function listPlayerUnits(playerIds) {
  const ids = [...new Set((playerIds ?? []).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('player_units')
    .select('player_id, unit')
    .in('player_id', ids)

  if (error) throw error
  return new Map((data ?? []).map((row) => [row.player_id, row.unit]))
}

/**
 * Sets or clears one player's forward-or-back.
 *
 * ⚠️ A FALSY UNIT DELETES THE ROW rather than storing a null — "not set" is the
 * absence of a row, the same rule setPlayerGrade carries, and the table's CHECK
 * allows only 'forward' | 'back' anyway.
 */
export async function setPlayerUnit(playerId, unit) {
  if (!unit) {
    const { error } = await supabase.from('player_units').delete().eq('player_id', playerId)
    if (error) throw error
    return null
  }

  const { data, error } = await supabase
    .from('player_units')
    .upsert({ player_id: playerId, unit }, { onConflict: 'player_id' })
    .select('player_id, unit')

  if (error) throw error
  // Same zero-row check as setPlayerGrade: RLS refuses by matching nothing,
  // which PostgREST reports as success.
  if (!data || data.length === 0) {
    throw new Error("We couldn't save that. Ask a club admin if that looks wrong.")
  }
  return data[0]
}
