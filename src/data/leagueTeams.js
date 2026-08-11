import { supabase } from '../lib/supabase'

// The club's LEAGUE TEAMS — the entities that play in a division, as distinct
// from the SQUADS they are drawn from.
//
// ⚠️ `teams` IS THE SQUAD ("U14B Contact", a training group). THIS IS THE
// COMPETING TEAM ("ADHQ2"). One squad can enter three of them, one per
// division — Jay, 11 Aug 2026: "each age group has 3 divisions in the league,
// a, b, and c, clubs can have multiple teams at an age group".
//
// ⚠️ THE LETTER IN A SQUAD NAME IS GENDER, NOT DIVISION. "U14B Contact" is U14
// BOYS. Never derive a division from a squad name; read `division` here.

const REFUSED =
  "We couldn't save that league team. You may not have permission, or the name may already be in use."

/**
 * Every league team for one squad, in display order.
 *
 * `includeRetired` exists for the management screen, which has to show a
 * retired team in order to bring it back. Everywhere else — the event form
 * especially — wants the pickable ones only.
 *
 * ⚠️ ALWAYS SCOPED TO ONE SQUAD. A club-wide list offered on an event form
 * would let a U14 fixture be filed under a U16 team, and the governing body
 * would receive that as a wrong result rather than as an obvious mistake.
 */
export async function listLeagueTeams({ teamId, includeRetired = false } = {}) {
  if (!teamId) return []

  let query = supabase.from('league_teams').select('*').eq('team_id', teamId)
  if (!includeRetired) query = query.eq('is_active', true)

  const { data, error } = await query
    .order('sort_order', { ascending: true })
    .order('rcm_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Creates or renames a league team.
 *
 * ⚠️ RENAMING IS SAFE HERE, UNLIKE A PITCH. `events.league_team_id` is a real
 * foreign key, so a rename follows every fixture that points at it. Compare
 * `upsertPitch`, where `events.pitch` is text and a rename silently orphans
 * every existing event — the difference is worth knowing before copying either
 * function's shape onto something new.
 */
export async function upsertLeagueTeam(leagueTeam) {
  const { id, ...fields } = leagueTeam ?? {}

  const query = id
    ? supabase.from('league_teams').update(fields).eq('id', id).select().maybeSingle()
    : supabase.from('league_teams').insert(fields).select().maybeSingle()

  const { data, error } = await query
  if (error) throw new Error(REFUSED)
  // ⚠️ RLS FILTERS AN UPDATE TO ZERO ROWS RATHER THAN RAISING, so a refusal
  // arrives here as `data === null` with no error at all. Without this branch a
  // non-admin's rename would report success and change nothing.
  if (!data) throw new Error(REFUSED)
  return data
}

/**
 * Retires or restores a league team.
 *
 * ⚠️ NEVER DELETE. `events.league_team_id` is ON DELETE SET NULL, so deleting a
 * team would strip the league identity off every fixture it ever played —
 * silently, and with no way to tell those fixtures from friendlies afterwards.
 */
export async function setLeagueTeamActive(id, isActive) {
  const { error } = await supabase
    .from('league_teams')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) throw new Error(REFUSED)
}
