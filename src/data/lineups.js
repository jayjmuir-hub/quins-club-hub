import { supabase } from '../lib/supabase.js'

// Match lineups — the coach's team selection for a fixture.
// Phase 1 of claude/plans/2026-08-14-match-lineups.md.
//
// ⚠️ NOT THE RCM MATCH SHEET. See db/migrations/20260814_match_lineups.sql for
// why the two are separate tables and must stay so. In short: a match sheet is a
// document FILED after the match and must say what was filed; a lineup is a plan
// made before it and is disposable.
//
// ⚠️ EVERY WRITE READS ITS ROW BACK, and that is not defensive padding. RLS
// refuses a write by matching ZERO ROWS, which PostgREST reports as a SUCCESSFUL
// empty response — not an error. Without the read-back a coach editing a squad
// they do not run would see "Saved" and nothing would have been written. This
// module is the third in `src/data/` to carry that rule; upsertEvent and
// approveMembership carry it for the same reason.

/** Rows for one fixture, newest first, with their players. */
export async function listLineups(eventId) {
  if (!eventId) return []
  const { data, error } = await supabase
    .from('lineups')
    .select(
      'id, event_id, label, players_per_side, notes, created_at, updated_at,' +
        ' lineup_players(id, player_id, role, position, sort_order)',
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) throw error
  // ⚠️ NO withCap HERE, UNLIKE listEvents/listPlayers. Those read a whole club's
  // worth of rows and the cap exists because PostgREST silently truncates at
  // `db-max-rows`. A fixture has one lineup, or a handful for a tournament day;
  // there is no plausible path to 900 and a cap would be ceremony.
  return data ?? []
}

/**
 * Creates a lineup for a fixture and returns it.
 *
 * ⚠️ THERE IS NO "get or create". Deliberately: `lineups.event_id` carries NO
 * unique constraint (see the migration header — that is what lets a squad field
 * two teams at a tournament), so "the lineup for this event" is not a thing the
 * database can answer. The screen decides which one it is editing.
 */
export async function createLineup({ eventId, label = null, playersPerSide = null, notes = null }) {
  const { data: session } = await supabase.auth.getUser()
  const me = session?.user?.id ?? null

  const { data, error } = await supabase
    .from('lineups')
    .insert({
      event_id: eventId,
      label,
      players_per_side: playersPerSide,
      notes,
      created_by: me,
      updated_by: me,
    })
    .select('id, event_id, label, players_per_side, notes')
    .single()

  if (error) throw error
  return data
}

/** Updates the lineup's own fields (not its players). */
export async function updateLineup(lineupId, { label, playersPerSide, notes }) {
  const { data: session } = await supabase.auth.getUser()

  const patch = { updated_by: session?.user?.id ?? null }
  // Only send what the caller actually passed, so a screen editing the notes
  // cannot blank the label it never showed.
  if (label !== undefined) patch.label = label
  if (playersPerSide !== undefined) patch.players_per_side = playersPerSide
  if (notes !== undefined) patch.notes = notes

  const { data, error } = await supabase
    .from('lineups')
    .update(patch)
    .eq('id', lineupId)
    .select('id, label, players_per_side, notes')

  if (error) throw error
  // ⚠️ THE ZERO-ROW CHECK, NOT `.single()`. `.single()` throws its own opaque
  // PGRST116 for "no rows", which reaches a coach as a code. This says the thing
  // that is actually true.
  if (!data || data.length === 0) {
    throw new Error("We couldn't save that lineup. Ask a club admin if that looks wrong.")
  }
  return data[0]
}

/**
 * Replaces a lineup's players wholesale.
 *
 * ⚠️ DELETE-THEN-INSERT, NOT A DIFF, AND THE REASON IS THE UNIQUE CONSTRAINT.
 * `lineup_players` is UNIQUE (lineup_id, player_id), so moving a player from
 * starter to replacement is an UPDATE while adding one is an INSERT — a diff has
 * to work out which, in order, without ever colliding with a row it is about to
 * remove. A lineup is at most a few dozen rows and is saved by one coach at a
 * time; the whole-list replace is correct by construction and cheap.
 *
 * ⚠️ NOT ATOMIC, AND THAT IS A KNOWN LIMIT rather than an oversight. Two
 * statements, so a failure between them leaves the lineup empty and the screen
 * shows the error with the picks still on screen to re-save. Making it atomic
 * needs an RPC; that is worth doing the day two coaches edit one lineup at once,
 * and not before.
 */
export async function saveLineupPlayers(lineupId, players) {
  const { error: clearError } = await supabase
    .from('lineup_players')
    .delete()
    .eq('lineup_id', lineupId)
  if (clearError) throw clearError

  const rows = (players ?? []).map((player, index) => ({
    lineup_id: lineupId,
    player_id: player.player_id,
    role: player.role === 'replacement' ? 'replacement' : 'starter',
    position: player.position ?? null,
    // Sent explicitly rather than left to the default, so the order the coach
    // arranged is the order that comes back.
    sort_order: player.sort_order ?? index,
  }))

  if (rows.length === 0) return []

  const { data, error } = await supabase
    .from('lineup_players')
    .insert(rows)
    .select('id, player_id, role, position, sort_order')

  if (error) throw error
  // ⚠️ A SILENT REFUSAL HERE WOULD BE THE WORST OUTCOME IN THIS FILE: the delete
  // above has already run, so a refused insert leaves the lineup EMPTY while the
  // screen says nothing. RLS refuses by matching zero rows, so the length check
  // is the only thing that can tell the difference.
  if (!data || data.length !== rows.length) {
    throw new Error(
      "We couldn't save that lineup, and it may now be empty. Check it and try again.",
    )
  }
  return data
}

export async function deleteLineup(lineupId) {
  // lineup_players cascades, so this is one statement.
  const { error } = await supabase.from('lineups').delete().eq('id', lineupId)
  if (error) throw error
}
