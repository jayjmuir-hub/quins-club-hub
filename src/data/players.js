import { supabase } from '../lib/supabase'

// Data access for the players and player_contacts tables. RLS already
// restricts rows to what the calling user's memberships allow. player_contacts
// exists as a separate table precisely so RLS can hide it (safeguarding) —
// a parent's query legitimately returns zero rows, which is not an error.
// Follows the throw-on-error convention set by src/data/members.js: callers
// get a thrown Error, never a {data, error} tuple, and [] rather than null
// for empty results.

/**
 * Lists players, optionally scoped to a set of team ids, ordered by
 * full_name ascending.
 *
 * teamIds semantics matter: an empty array means "no teams" and returns []
 * without querying at all. undefined/omitted means "no team filter" and
 * queries normally, letting RLS decide what comes back.
 */
export async function listPlayers({ teamIds } = {}) {
  if (Array.isArray(teamIds) && teamIds.length === 0) return []

  let query = supabase.from('players').select('*')
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    query = query.in('team_id', teamIds)
  }
  query = query.order('full_name', { ascending: true })

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Loads one player's contact row, or null when RLS returns nothing (the
 * expected outcome for a parent who isn't a coach/admin of that player's
 * team and isn't the player themselves — not an error). Uses maybeSingle()
 * rather than single(), which would throw on zero rows.
 */
export async function getPlayerContact(playerId) {
  const { data, error } = await supabase
    .from('player_contacts')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/**
 * Lists contact rows for many players in one query — used by the Overview
 * screen to compute, per team, how many players have no contact record at
 * all (a player id with no row in the returned set). Selects only the three
 * columns the caller needs (not '*') since this is an aggregate-presence
 * check, not a form load — src/screens/PlayerForm.jsx's per-player load via
 * getPlayerContact still uses '*' for its own different purpose.
 *
 * An empty playerIds array returns [] without querying, matching the same
 * convention as listPlayers({teamIds})/listEvents({teamIds}).
 */
export async function listContactsForPlayers(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) return []

  const { data, error } = await supabase
    .from('player_contacts')
    .select('player_id, phone, email')
    .in('player_id', playerIds)
  if (error) throw error
  return data ?? []
}

// A write the database refused is not an error as far as PostgREST is
// concerned: RLS filters the row out, the statement affects zero rows, and
// the response is a perfectly successful "nothing". Every writer below asks
// for the affected row back and treats "no row" as a refusal, so the form
// shows a real message instead of a false "Saved" — the same mechanism
// src/data/events.js uses, and for the same reason. It is a *reporting*
// mechanism, not access control: the players table's "player edit" policy
// and player_contacts' "contact edit" policy (both ALL, USING and WITH CHECK
// `can_edit_team(...)`) are what actually decide, server-side.
//
// The two messages are deliberately different. players and player_contacts
// are separate tables behind separate policies, and the whole reason this
// module keeps them separate is that a contact refusal must never be
// reported as — or silently folded into — a player save.
const REFUSED_PLAYER =
  "We couldn't save that player. You may not have permission to change this squad."
const REFUSED_PLAYER_DELETE =
  "We couldn't delete that player. You may not have permission to change this squad."
// Says nothing about the player write: this module does not know whether one
// happened. Framing the failure ("the player saved, the contact didn't") is
// PlayerForm's job, because only the form knows what it did first.
const REFUSED_CONTACT =
  "We couldn't save the contact details. You may not have permission to change them."

/**
 * Creates or updates one player. Inserts when `player` has no id, updates the
 * matching row when it has one — the id is used only as the filter and is
 * never sent as a column either way. Returns the saved row, which is how a
 * caller learns a newly-inserted player's id (upsertContact needs it).
 *
 * There is deliberately no jersey_num here: the club does not use squad
 * numbers (see src/lib/playerFormat.js). The column stays in the schema and
 * nothing writes it.
 */
export async function upsertPlayer(player) {
  const { id, ...fields } = player ?? {}

  const query = id
    ? supabase.from('players').update(fields).eq('id', id).select().maybeSingle()
    : supabase.from('players').insert(fields).select().maybeSingle()

  const { data, error } = await query
  if (error) throw error
  if (!data) throw new Error(REFUSED_PLAYER)
  return data
}

/**
 * Records a gender against a player the CALLER OWNS (their own child, or
 * themselves), via the set_own_player_gender RPC.
 *
 * ⚠️ NOT `upsertPlayer({ id, gender })`. A parent holds no write on
 * public.players at all — the only write policy is `player edit`, gated on
 * can_edit_team — so that call would come back with zero rows and surface as
 * REFUSED_PLAYER. Adding an owner-update policy to fix that is the trap:
 * RLS grants access to ROWS, not COLUMNS, so it would hand the parent
 * team_id as well and make "move my child into another squad" a legitimate
 * write. The RPC has a hard-coded column list, so gender is the only thing
 * it can touch whatever this function sends. Exactly the same shape and
 * reasoning as setOwnPlayerPhoto in src/data/photos.js.
 *
 * Coaches and admins never come through here: they have a normal row-level
 * update and use upsertPlayer.
 */
export async function setOwnPlayerGender(playerId, gender) {
  if (!playerId) throw new Error('setOwnPlayerGender needs a player_id.')

  const { data, error } = await supabase.rpc('set_own_player_gender', {
    _player: playerId,
    _gender: gender ?? null,
  })

  if (error) throw error
  return data ?? null
}

const REFUSED_BULK =
  "We couldn't add those players. You may not have permission to change one of those squads."

/**
 * Inserts many players in one statement and returns the inserted rows.
 *
 * This is NOT upsertPlayer in a loop, and the difference is worth stating
 * because it changes what failure means. PostgREST sends a multi-row insert as
 * a single statement, so an RLS WITH CHECK violation on ANY row aborts the
 * whole thing — Postgres raises, rather than filtering the offending row out
 * the way a SELECT policy would. There is therefore no such thing as a partial
 * success here: either every row lands or none do.
 *
 * That is the honest behaviour to build on, so the caller's job is to make
 * refusals impossible before calling — src/lib/playerImport.js checks every
 * pasted row's team against canEditTeam and marks the bad ones invalid in the
 * preview. This message is the backstop for the case that check missed, and it
 * says "nothing was added" rather than implying some players got through.
 *
 * A row-at-a-time loop would give genuinely per-row outcomes, at the cost of N
 * round trips and a half-imported squad to reconcile when the tenth of forty
 * fails. Rejected deliberately: a clean all-or-nothing failure the user can
 * retry after fixing the preview is easier to reason about than a partial
 * write they have to diff by hand.
 */
export async function insertPlayers(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  const { data, error } = await supabase.from('players').insert(rows).select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_BULK)
  return data
}

/**
 * Deletes one player by id. Resolves with nothing on success and throws when
 * the delete failed or removed nothing.
 *
 * Only the players row is deleted: player_contacts.player_id is a foreign key
 * declared ON DELETE CASCADE, so the contact row goes with it, atomically and
 * server-side. Issuing a second client-side delete would add a failure mode
 * the database does not have (contact deleted, player left behind).
 */
export async function deletePlayer(id) {
  const { data, error } = await supabase.from('players').delete().eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_PLAYER_DELETE)
}

/**
 * Creates or updates one player's contact row. Returns the saved row.
 *
 * player_id is player_contacts' PRIMARY KEY, so this is a genuine ON CONFLICT
 * upsert rather than the id-present/id-absent branch upsertPlayer uses: a
 * single statement, with no select-then-insert-or-update window in which two
 * coaches editing the same player could both decide "no row exists" and race
 * to insert. The conflict target is named explicitly rather than left to
 * PostgREST's primary-key inference, so this keeps updating in place if the
 * table ever gains a second unique constraint.
 *
 * Nulls are written through, not skipped — clearing a wrong phone number has
 * to actually clear it. Deciding whether there is anything worth writing at
 * all is the caller's job (see src/screens/PlayerForm.jsx), not this
 * function's.
 */
export async function upsertContact(contact) {
  const { player_id: playerId, phone = null, email = null } = contact ?? {}
  // Without a key this would insert an orphan row (or fail obscurely at the
  // NOT NULL constraint); refuse before touching the network.
  if (!playerId) throw new Error('upsertContact needs a player_id.')

  const { data, error } = await supabase
    .from('player_contacts')
    .upsert({ player_id: playerId, phone, email }, { onConflict: 'player_id' })
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_CONTACT)
  return data
}
