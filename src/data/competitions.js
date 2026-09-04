import { supabase } from '../lib/supabase'
import { wrapDbError } from '../lib/dbError.js'

// Competitions, results and standings —
// claude/plans/2026-09-02-standings-and-results.md, and
// db/migrations/20260905_competitions_and_standings.sql.
//
// ⚠️ STANDINGS ARE COMPUTED IN THE DATABASE (competition_standings) and only
// ever READ here. Nothing in this module adds up a table; a corrected result
// changes the table by itself.
//
// ⚠️ A RESULT IS INSERTED, NEVER UPDATED OR DELETED. A correction is a new row
// whose `supersedes` names the old one; the old one gets `superseded_at`. The
// insert policy requires confirmed_by = created_by = auth.uid(), so both are
// passed explicitly — the database refuses a row that claims otherwise.

const REFUSED = 'Only a club admin can change competitions.'

export async function listCompetitions({ season } = {}) {
  let query = supabase
    .from('competitions')
    .select('id, club_id, name, season, division, is_senior, age_band, results_url, points_win, points_draw, points_loss, bonus_try_threshold, bonus_losing_margin')
    .order('season', { ascending: false })
    .order('is_senior', { ascending: false })
    .order('name')
  if (season) query = query.eq('season', season)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getCompetition(id) {
  const { data, error } = await supabase
    .from('competitions')
    .select('id, club_id, name, season, division, is_senior, age_band, results_url, points_win, points_draw, points_loss, bonus_try_threshold, bonus_losing_margin')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/** Insert or update a competition. Admin only (RLS). */
export async function upsertCompetition(competition) {
  const { data, error } = await supabase
    .from('competitions')
    .upsert(competition, { onConflict: 'id' })
    .select()
    .single()
  if (error) throw wrapDbError(error, REFUSED)
  return data
}

export async function listSides(competitionId) {
  const { data, error } = await supabase
    .from('competition_sides')
    .select('id, competition_id, name, code, league_team_id, sort_order')
    .eq('competition_id', competitionId)
    .order('sort_order')
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function listFixtures(competitionId) {
  const { data, error } = await supabase
    .from('competition_fixtures')
    .select('id, competition_id, round, played_on, home_side_id, away_side_id, event_id')
    .eq('competition_id', competitionId)
    .order('round')
    .order('played_on')
  if (error) throw error
  return data ?? []
}

/** Every result, superseded ones included — the chain is the audit trail. */
export async function listResults(competitionId) {
  const { data, error } = await supabase
    .from('competition_results')
    .select('id, competition_id, fixture_id, round, played_on, home_side_id, away_side_id, home_score, away_score, home_tries, away_tries, source, source_note, confirmed_by, confirmed_at, supersedes, superseded_at, created_by, created_at')
    .eq('competition_id', competitionId)
    .order('round')
    .order('created_at')
  if (error) throw error
  return data ?? []
}

export async function standings(competitionId) {
  const { data, error } = await supabase.rpc('competition_standings', { _competition: competitionId })
  if (error) throw error
  return data ?? []
}

/**
 * Route 1 — type it. `rows` are `{ fixture_id?, round, played_on?, home_side_id,
 * away_side_id, home_score, away_score, home_tries?, away_tries?, supersedes? }`.
 * Written in one insert as confirmed `typed` results by the caller.
 */
export async function recordResults(competitionId, rows, { profileId, note = null } = {}) {
  if (!profileId) throw new Error('Sign in to record results.')
  if (!rows?.length) return []
  const now = new Date().toISOString()
  const payload = rows.map((row) => ({
    competition_id: competitionId,
    fixture_id: row.fixture_id ?? null,
    round: row.round ?? null,
    played_on: row.played_on ?? null,
    home_side_id: row.home_side_id,
    away_side_id: row.away_side_id,
    home_score: Number(row.home_score),
    away_score: Number(row.away_score),
    home_tries: row.home_tries == null || row.home_tries === '' ? null : Number(row.home_tries),
    away_tries: row.away_tries == null || row.away_tries === '' ? null : Number(row.away_tries),
    source: 'typed',
    source_note: row.source_note ?? note,
    supersedes: row.supersedes ?? null,
    confirmed_by: profileId,
    confirmed_at: now,
    created_by: profileId,
  }))
  const { data, error } = await supabase.from('competition_results').insert(payload).select()
  if (error) throw wrapDbError(error, 'Only the results keeper or an admin can record results.')
  // Mark what these rows correct. Done after the insert so a refused insert
  // never orphans a supersede.
  const superseded = payload.map((row) => row.supersedes).filter(Boolean)
  if (superseded.length) {
    const { error: markError } = await supabase
      .from('competition_results')
      .update({ superseded_at: now })
      .in('id', superseded)
    if (markError) throw wrapDbError(markError, 'The correction was saved but the old result could not be marked.')
  }
  return data ?? []
}

/** The season import — sides and fixtures from the parsed grid, atomically. */
export async function importSeason(competitionId, { sides, fixtures }) {
  const { data, error } = await supabase.rpc('import_season', {
    _competition: competitionId,
    _sides: sides,
    _fixtures: fixtures,
  })
  if (error) {
    if (error.code === '42501') throw new Error('Only a club admin can import a season.')
    throw new Error(error.message)
  }
  return data
}

export async function listKeepers(competitionId) {
  const { data, error } = await supabase
    .from('competition_keepers')
    // The name rides along for the Leagues screen; an admin can read profiles.
    .select('competition_id, profile_id, profiles(full_name)')
    .eq('competition_id', competitionId)
  if (error) throw error
  return data ?? []
}

export async function setKeeper(competitionId, profileId, isKeeper) {
  const query = isKeeper
    ? supabase.from('competition_keepers').upsert({ competition_id: competitionId, profile_id: profileId })
    : supabase.from('competition_keepers').delete().match({ competition_id: competitionId, profile_id: profileId })
  const { error } = await query
  if (error) throw wrapDbError(error, REFUSED)
}

/** Point a league team at its division. Admin only (RLS on league_teams). */
export async function setLeagueTeamCompetition(leagueTeamId, competitionId) {
  const { error } = await supabase
    .from('league_teams')
    .update({ competition_id: competitionId })
    .eq('id', leagueTeamId)
  if (error) throw wrapDbError(error, REFUSED)
}
