import { supabase } from '../lib/supabase'

// Data access for public.player_parents — the parent/carer rows behind a
// player. Same conventions as src/data/players.js: throws an Error rather
// than returning a {data, error} tuple, and returns [] not null for empty.
//
// SAFEGUARDING, and the reason this is not just another table: player_parents
// carries adults' names, emails and phone numbers attached to named children.
// Its two RLS policies are copied verbatim from player_contacts —
//   read : can_edit_team(player's team) OR is_own_player(player_id)
//   edit : can_edit_team(player's team)
// — so a parent reads their own child's rows and nobody else's, and an empty
// result is the NORMAL outcome for a parent looking at a team-mate, not an
// error. Nothing in this module tries to interpret that: it reports what came
// back and lets the screen decide, which for PlayerDetail means rendering
// nothing at all rather than a "hidden" note.
//
// Rows are ordered primary-first, then by sort_order, then name, so a
// player's main contact is always the first row on screen.

/** Lists one player's parent rows. [] is a legitimate answer, not a failure. */
export async function listParents(playerId) {
  if (!playerId) return []

  const { data, error } = await supabase
    .from('player_parents')
    .select('*')
    .eq('player_id', playerId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('full_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Lists parent rows for many players in one query. Used to flag which players
 * in a squad have no parent on file — the "warn, never block" half of Jay's
 * ruling needs to know that across a whole roster without N round trips.
 *
 * Selects only the columns that answer that question. Emails and phone
 * numbers are not needed to count rows, and a bulk query that drags every
 * parent's contact details into a roster screen's memory is a wider blast
 * radius than the feature requires.
 */
export async function listParentsForPlayers(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) return []

  const { data, error } = await supabase
    .from('player_parents')
    .select('id, player_id, full_name, relationship, is_primary')
    .in('player_id', playerIds)

  if (error) throw error
  return data ?? []
}

const REFUSED_PARENT =
  "We couldn't save the parent details. You may not have permission to change them."
const REFUSED_PARENT_DELETE =
  "We couldn't remove that parent. You may not have permission to change them."

/**
 * Normalises one form row into a database row. Blank strings become null so
 * that "cleared the email box" and "never had an email" are the same state in
 * the database rather than one being '' and the other NULL — the app has no
 * use for the distinction and every query would have to handle both.
 */
function toRow(parent, playerId, index) {
  return {
    player_id: playerId,
    full_name: String(parent.full_name ?? '').trim(),
    relationship: String(parent.relationship ?? '').trim() || null,
    email: String(parent.email ?? '').trim() || null,
    phone: String(parent.phone ?? '').trim() || null,
    is_primary: Boolean(parent.is_primary),
    sort_order: Number.isFinite(parent.sort_order) ? parent.sort_order : index,
  }
}

/**
 * Replaces a player's whole set of parent rows with the given list.
 *
 * WHY A WHOLE-SET REPLACE AND NOT PER-ROW SAVES: the form edits a list — a
 * coach adds a step-father, fixes a typo in a mother's number and deletes a
 * stale row in one sitting, then presses Save once. Emitting those as three
 * independent calls means three independent failure modes and a form that can
 * end up half-saved with no coherent thing to tell the user.
 *
 * The order is delete-then-write, and that order matters: doing it the other
 * way round leaves a window where a row the user deleted is still readable
 * alongside its replacement.
 *
 * This is NOT atomic — PostgREST has no client-side transaction, so a failure
 * after the delete leaves the removals applied and the writes not. The caller
 * therefore gets a thrown error naming the stage, and the form keeps the
 * user's typed rows on screen so Save can simply be pressed again. Making it
 * genuinely atomic needs a Postgres function; noted as a follow-up rather than
 * pretended at here.
 *
 * Rows arriving with an `id` are existing rows and are updated in place, so a
 * parent's row keeps its identity (and its created_at) across an edit.
 */
export async function saveParents(playerId, parents) {
  if (!playerId) throw new Error('saveParents needs a player_id.')
  const list = Array.isArray(parents) ? parents : []

  // A row whose name is blank is a row the user started and abandoned; the
  // CHECK constraint would reject it anyway, with a far worse message.
  const kept = list.filter((p) => String(p?.full_name ?? '').trim() !== '')

  const keptIds = kept.map((p) => p.id).filter(Boolean)

  // Delete anything currently stored for this player that is not in the
  // submitted set. Scoped by player_id as well as by id so a malformed id
  // can never reach another player's row — RLS would refuse it too, but this
  // is one `.eq` and removes the need to rely on that.
  let removeQuery = supabase.from('player_parents').delete().eq('player_id', playerId)
  if (keptIds.length > 0) {
    // PostgREST's `not.in` filter takes a bracketed list, not an array.
    removeQuery = removeQuery.not('id', 'in', `(${keptIds.join(',')})`)
  }
  const { error: deleteError } = await removeQuery
  if (deleteError) throw deleteError

  if (kept.length === 0) return []

  const updates = kept.filter((p) => p.id)
  const inserts = kept.filter((p) => !p.id)
  const saved = []

  for (const [index, parent] of updates.entries()) {
    const { data, error } = await supabase
      .from('player_parents')
      .update(toRow(parent, playerId, index))
      .eq('id', parent.id)
      .eq('player_id', playerId)
      .select()
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(REFUSED_PARENT)
    saved.push(data)
  }

  if (inserts.length > 0) {
    const rows = inserts.map((parent, i) => toRow(parent, playerId, updates.length + i))
    const { data, error } = await supabase.from('player_parents').insert(rows).select()
    if (error) throw error
    if (!data || data.length === 0) throw new Error(REFUSED_PARENT)
    saved.push(...data)
  }

  return saved
}

/** Deletes one parent row by id. Throws when the database removed nothing. */
export async function deleteParent(id) {
  if (!id) throw new Error('deleteParent needs an id.')

  const { data, error } = await supabase
    .from('player_parents')
    .delete()
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_PARENT_DELETE)
}
