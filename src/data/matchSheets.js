import { supabase } from '../lib/supabase'

// RCM match sheets — read and write. claude/plans/2026-08-11-match-sheets.md.
//
// ⚠️ A SHEET IS A FILED RECORD, NOT A VIEW OF THE ROSTER. Every name on it is
// stored as text, even where a player is linked, because the form demands "full
// name as per registration" and because a submitted sheet must still say what
// was submitted after a player is renamed, moved or removed. See the migration.

/** The 22 positions on the form. Not shirt numbers — the club holds none. */
export const SLOT_COUNT = 22

const REFUSED =
  "We couldn't save that match sheet — you may not have permission to edit this squad's fixtures."

/**
 * The sheet for one fixture, with its slots and cards, or null if none exists.
 *
 * ⚠️ RETURNS null RATHER THAN CREATING ONE. A sheet is created when somebody
 * opens the editor and saves, not when a screen happens to look at a fixture —
 * otherwise every fixture anybody browsed would acquire an empty draft and the
 * dashboard's "not started" count would become meaningless.
 */
export async function getMatchSheet(eventId) {
  if (!eventId) return null

  // ⚠️ THE SHEET'S OWN LEAGUE TEAM IS EMBEDDED, NOT THE FIXTURE'S, and that is
  // the whole point of the column. `league_team_id` is stamped onto the sheet at
  // save time so a filed record is FROZEN — the same reasoning that stores
  // `full_name` as text beside a live `player_id`. Until 12 Aug 2026 the screen
  // rendered `event.league_team` instead and this column was decorative, which
  // meant correcting a fixture's league team next month would silently rewrite
  // the TEAM line on a sheet already sent to RCM.
  const { data, error } = await supabase
    .from('match_sheets')
    .select(
      '*, league_team:league_teams(id, rcm_name, division), slots:match_sheet_slots(*), cards:match_sheet_cards(*)',
    )
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  // Ordered here rather than in the query: PostgREST cannot order an embedded
  // resource independently of the parent, and a 22-row sort in memory is free.
  return {
    ...data,
    slots: [...(data.slots ?? [])].sort((a, b) => a.slot - b.slot),
    cards: [...(data.cards ?? [])].sort(
      (a, b) => (a.half ?? 0) - (b.half ?? 0) || (a.minute ?? 0) - (b.minute ?? 0),
    ),
  }
}

/**
 * Every sheet for a set of fixtures, for the dashboard's status column.
 *
 * ⚠️ ONE QUERY FOR THE WHOLE LIST, not one per fixture. The dashboard is built
 * for a loaded club — a full season across fifteen squads — where a per-row
 * fetch would be hundreds of round trips. Returns a Map keyed by event_id.
 */
export async function listMatchSheetsFor(eventIds) {
  const ids = (eventIds ?? []).filter(Boolean)
  if (ids.length === 0) return new Map()

  const { data, error } = await supabase
    .from('match_sheets')
    .select('id, event_id, status, submitted_at, manager_name')
    .in('event_id', ids)

  if (error) throw error
  return new Map((data ?? []).map((row) => [row.event_id, row]))
}

/**
 * Creates or updates the sheet's own fields. Returns the saved row.
 *
 * ⚠️ THROWS WHEN RLS FILTERS THE WRITE TO ZERO ROWS. That refusal arrives as
 * `data === null` with `error === null` — no exception, no message — so without
 * the explicit check a coach outside the squad would be told their sheet saved
 * while nothing changed. The same trap upsertLeagueTeam documents.
 */
export async function saveMatchSheet(sheet) {
  const { id, slots, cards, ...fields } = sheet ?? {}

  // ⚠️ THE EMBED IS ON THE WRITE'S `select()` TOO, not only on getMatchSheet.
  // The screen renders the TEAM line from the SHEET's league team; a saved row
  // returned without the embed reads as "this sheet has no league team", so
  // hitting Save draft would blank a box that was correct a second earlier.
  const embed = '*, league_team:league_teams(id, rcm_name, division)'
  const query = id
    ? supabase.from('match_sheets').update(fields).eq('id', id).select(embed).maybeSingle()
    : supabase.from('match_sheets').insert(fields).select(embed).maybeSingle()

  const { data, error } = await query
  if (error) throw new Error(error.message || REFUSED)
  if (!data) throw new Error(REFUSED)
  return data
}

/**
 * Replaces the 22 squad rows for a sheet.
 *
 * ⚠️ DELETE-THEN-WRITE, AND NOT ATOMIC — the same shape as saveParents, and
 * worth saying out loud rather than discovering. A failure between the two
 * leaves the sheet with no squad rather than a half-written one, which is the
 * recoverable direction: the coach still has the form open and can save again.
 *
 * ⚠️ EMPTY SLOTS ARE NOT WRITTEN. A sheet with gaps is legitimate — the form is
 * filled by hand from a squad that may be short — and storing blank rows would
 * make "22 filled" indistinguishable from "22 rows exist".
 */
export async function saveMatchSheetSlots(matchSheetId, slots) {
  if (!matchSheetId) throw new Error(REFUSED)

  const rows = (slots ?? [])
    .filter((row) => String(row?.full_name ?? '').trim() !== '')
    .map((row) => ({
      match_sheet_id: matchSheetId,
      slot: row.slot,
      player_id: row.player_id ?? null,
      full_name: String(row.full_name).trim(),
      front_row: Boolean(row.front_row),
    }))

  const { error: clearError } = await supabase
    .from('match_sheet_slots')
    .delete()
    .eq('match_sheet_id', matchSheetId)
  if (clearError) throw new Error(clearError.message || REFUSED)

  if (rows.length === 0) return []

  const { data, error } = await supabase.from('match_sheet_slots').insert(rows).select()
  if (error) throw new Error(error.message || REFUSED)
  return data ?? []
}

/** Replaces the card rows. Same delete-then-write shape, same caveat. */
export async function saveMatchSheetCards(matchSheetId, cards) {
  if (!matchSheetId) throw new Error(REFUSED)

  const rows = (cards ?? [])
    .filter((row) => row?.colour === 'yellow' || row?.colour === 'red')
    .map((row) => ({
      match_sheet_id: matchSheetId,
      half: row.half ?? null,
      minute: row.minute ?? null,
      colour: row.colour,
      slot: row.slot ?? null,
      full_name: row.full_name ? String(row.full_name).trim() : null,
      reason: row.reason ? String(row.reason).trim() : null,
    }))

  const { error: clearError } = await supabase
    .from('match_sheet_cards')
    .delete()
    .eq('match_sheet_id', matchSheetId)
  if (clearError) throw new Error(clearError.message || REFUSED)

  if (rows.length === 0) return []

  const { data, error } = await supabase.from('match_sheet_cards').insert(rows).select()
  if (error) throw new Error(error.message || REFUSED)
  return data ?? []
}

/**
 * Marks a sheet complete, or puts it back to draft.
 *
 * ⚠️ `complete` MEANS "READY TO SEND", NEVER "SENT". Nothing in this app can
 * know whether RCM received anything — submission is a human dropping a file
 * into a WhatsApp group. Every screen must word it that way.
 */
export async function setMatchSheetStatus(id, status) {
  if (!id) throw new Error(REFUSED)

  const { data, error } = await supabase
    .from('match_sheets')
    .update({
      status,
      submitted_at: status === 'complete' ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message || REFUSED)
  if (!data) throw new Error(REFUSED)
  return data
}
