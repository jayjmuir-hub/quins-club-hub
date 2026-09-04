// Season stats for a SENIOR squad — the two database functions from
// db/migrations/20260906_senior_season_stats.sql, and nothing computed here.
//
// ⚠️ THE GATE IS IN THE DATABASE, not in these wrappers. A caller outside the
// section, or asking about a junior squad, gets [] — the same shape as "no
// games yet", on purpose: a screen must not be able to tell "refused" from
// "nothing", because that difference is the leak.
import { supabase } from '../lib/supabase'

/** Rows of { player_id, full_name, games, starts, bench, tries, conversions, penalties, drops, yellows, reds }. */
export async function seasonStats(teamId, season) {
  const { data, error } = await supabase.rpc('senior_season_stats', { _team: teamId, _season: season })
  if (error) throw error
  return data ?? []
}

/** { played, unnamed } — played games with a sheet, and those with more tries recorded than named. */
export async function seasonStatsGaps(teamId, season) {
  const { data, error } = await supabase.rpc('senior_season_stats_gaps', { _team: teamId, _season: season })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { played: row?.played ?? 0, unnamed: row?.unnamed ?? 0 }
}
