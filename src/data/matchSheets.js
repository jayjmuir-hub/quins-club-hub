import { supabase } from '../lib/supabase'
import { upsertById } from './upsertById.js'
import { fetchByIds } from './limits.js'
import { wrapDbError } from '../lib/dbError.js'

// RCM match sheets — read and write. claude/plans/2026-08-11-match-sheets.md.
//
// ⚠️ A SHEET IS A FILED RECORD, NOT A VIEW OF THE ROSTER. Every name on it is
// stored as text, even where a player is linked, because the form demands "full
// name as per registration" and because a submitted sheet must still say what
// was submitted after a player is renamed, moved or removed. See the migration.
//
// ⚠️ A SHEET DOES NOT HOLD THE SCORE — Jay ruled ONE score, on the FIXTURE,
// 12 Aug 2026. `public.events` carries the eight components and derives
// result_us / result_them from them in a trigger; match_sheets.score_us,
// score_them, tries_us and tries_them are DROPPED. Do not re-add them: the
// score would then exist in two places, and the day they disagreed both numbers
// would look plausible. See claude/plans/2026-08-12-scoring-model.md.

/**
 * The MOST slots a stored sheet may hold — the 15s sheet's 22. Not the size
 * of any particular sheet: since 2 Sep 2026 that comes from the fixture's
 * format through src/lib/fixtureFormat.js (7s 12, 10s 15, 12s 18, 15s 22).
 * Kept as the storage bound so a row with slot 23 is still refused.
 */
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
      '*, league_team:league_teams(id, rcm_name, division), slots:match_sheet_slots(*), cards:match_sheet_cards(*), scores:match_sheet_scores(*)',
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
    scores: [...(data.scores ?? [])].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
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
  // ⚠️ CHUNKED SINCE 12 Aug 2026, AND THE COMMENT ABOVE IS WHY IT HAD TO BE.
  // "one query for the whole list" was the right instinct and it had a ceiling
  // nobody had measured: PostgREST takes `.in()` as a query STRING, ~37 bytes
  // per uuid, and a full season across fifteen squads is well past the point
  // where the URL stops working. Measured on this project — 300 ids is fine,
  // 400 makes the fetch THROW a connection error rather than return a status.
  // Still one query per 200 fixtures, not one per fixture. See MAX_IN_LIST in
  // ./limits.js.
  const rows = await fetchByIds(eventIds, async (chunk) => {
    const { data, error } = await supabase
      .from('match_sheets')
      .select('id, event_id, status, submitted_at, manager_name')
      .in('event_id', chunk)
    if (error) throw error
    return data ?? []
  })

  return new Map(rows.map((row) => [row.event_id, row]))
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
  // slots and cards live in sibling tables, never as columns on match_sheets —
  // strip them so they are not sent as fields (upsertById passes the rest
  // straight through, and treats `id` as the update/insert switch).
  const { slots, cards, ...row } = sheet ?? {}

  // ⚠️ THE EMBED IS ON THE WRITE'S `select()` TOO, not only on getMatchSheet.
  // The screen renders the TEAM line from the SHEET's league team; a saved row
  // returned without the embed reads as "this sheet has no league team", so
  // hitting Save draft would blank a box that was correct a second earlier.
  return upsertById('match_sheets', row, {
    embed: '*, league_team:league_teams(id, rcm_name, division)',
    refusedMessage: REFUSED,
    mapError: (error) => wrapDbError(error, REFUSED),
  })
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
  if (clearError) throw wrapDbError(clearError, REFUSED)

  if (rows.length === 0) return []

  const { data, error } = await supabase.from('match_sheet_slots').insert(rows).select()
  if (error) throw wrapDbError(error, REFUSED)
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
  if (clearError) throw wrapDbError(clearError, REFUSED)

  if (rows.length === 0) return []

  const { data, error } = await supabase.from('match_sheet_cards').insert(rows).select()
  if (error) throw wrapDbError(error, REFUSED)
  return data ?? []
}

/**
 * Replaces the scorer rows for a match sheet — the cards pattern, verbatim.
 *
 * A row with no kind or no numeric slot is not a scorer; it is an empty box on
 * the editor, and is dropped rather than refused. `qty` blank means one.
 * ⚠️ NO player_id IS WRITTEN. The slot is the link (see match_sheet_scores in
 * db/schema/tables.sql); full_name is the name as filed, beside it.
 */
export async function saveMatchSheetScores(matchSheetId, rows) {
  if (!matchSheetId) throw new Error(REFUSED)

  // ⚠️ REJECT NULLISH SLOTS EXPLICITLY, DO NOT `Number.isFinite(Number(row.slot))`.
  // MatchSheet.jsx's numeric() returns null for a blank picker, and
  // Number(null) === 0 is FINITE while String(null).trim() is the string
  // 'null' — so the old filter let a kind-but-no-player row through and it
  // was inserted as slot 0, failing match_sheet_scores_slot_check (1..22)
  // AFTER the sheet, slots and cards had already been written. See
  // tests/season-stats-data.test.js.
  const kept = (rows ?? [])
    .filter((row) => {
      if (!row?.kind) return false
      if (row.slot == null || String(row.slot).trim() === '') return false
      const slot = Number(row.slot)
      return Number.isInteger(slot) && slot >= 1 && slot <= 22
    })
    .map((row) => {
      const qty = Number(row.qty)
      return {
        match_sheet_id: matchSheetId,
        kind: row.kind,
        slot: Number(row.slot),
        full_name: row.full_name ? String(row.full_name).trim() : null,
        qty: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1,
      }
    })

  const { error: clearError } = await supabase
    .from('match_sheet_scores')
    .delete()
    .eq('match_sheet_id', matchSheetId)
  if (clearError) throw wrapDbError(clearError, REFUSED)

  if (kept.length === 0) return []

  const { data, error } = await supabase.from('match_sheet_scores').insert(kept).select()
  if (error) throw wrapDbError(error, REFUSED)
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

  if (error) throw wrapDbError(error, REFUSED)
  if (!data) throw new Error(REFUSED)
  return data
}
