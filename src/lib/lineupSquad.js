// Turning a coach's LINEUP into the RCM match sheet's list of 22.
//
// ⚠️ THE TWO ARE DIFFERENT DOCUMENTS AND STAY DIFFERENT TABLES — see
// db/migrations/20260814_match_lineups.sql and the "What this is NOT" section
// of claude/plans/2026-08-14-match-lineups.md. A lineup is a PLAN, disposable,
// with live names read from `players`; a match sheet is a record FILED with the
// governing body, with `full_name` frozen as text. This file is the one-way
// bridge between them: it reads a lineup and produces names to SEED a sheet.
// Nothing here writes, and nothing reads a sheet back into a lineup.
//
// ⚠️ THE NAME COMES FROM `players`, NOT FROM THE LINEUP. `lineup_players` holds
// no name at all — deliberately, so a rename is reflected rather than frozen —
// so a lineup row whose player is not in the squad list handed in has no name to
// contribute and is SKIPPED. That is the right answer rather than an empty box:
// a blank row on the form is indistinguishable from "we were short", and the
// governing body reads it as the latter.

/**
 * The lineup's players in the order they should fill slots 1…22.
 *
 * @param {{ lineup_players?: Array<{player_id: string, role?: string, sort_order?: number}> }|null|undefined} lineup
 * @param {Array<{id: string, full_name?: string}>} players  the squad, for names
 * @returns {Array<{player_id: string, full_name: string}>}
 *
 * ⚠️ STARTERS FIRST, THEN REPLACEMENTS, THEN SEQUENTIAL — NOT 1-15 AND 16-22.
 * The obvious mapping is the rugby one: starters take 1-15 and replacements
 * start at 16. It is wrong here, because `players_per_side` is the COACH'S
 * CHOICE per lineup (10s at one tournament, 7s at the next). A squad playing
 * 10s would leave slots 11-15 blank and the replacements stranded at 16, which
 * photographs as a form somebody gave up on halfway.
 *
 * ⚠️ AND THE SLOT IS NOT A SHIRT NUMBER — `match_sheet_slots.slot` carries that
 * note already, because the club holds no squad numbers. Filling sequentially
 * costs nothing that the form actually means.
 */
export function namesFromLineup(lineup, players) {
  if (!lineup) return []

  const byId = new Map((players ?? []).map((player) => [player.id, player]))

  // ⚠️ COPIED BEFORE SORTING. `lineup.lineup_players` is the array PostgREST
  // handed back and is held in the screen's state; sorting it in place would
  // reorder the caller's data as a side effect of reading it.
  const rows = [...(lineup.lineup_players ?? [])]
  const starterFirst = (row) => (row?.role === 'replacement' ? 1 : 0)
  rows.sort(
    (a, b) => starterFirst(a) - starterFirst(b) || (a?.sort_order ?? 0) - (b?.sort_order ?? 0),
  )

  const out = []
  const seen = new Set()
  for (const row of rows) {
    const player = byId.get(row?.player_id)
    const name = String(player?.full_name ?? '').trim()
    if (!name || seen.has(player.id)) continue
    seen.add(player.id)
    out.push({ player_id: player.id, full_name: name })
  }
  return out
}
