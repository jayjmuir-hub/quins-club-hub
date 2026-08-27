import { supabase } from '../lib/supabase'
import { upsertById } from './upsertById.js'

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

// ⚠️ ONE MESSAGE NAMING TWO CAUSES IS NOT A MESSAGE, AND THIS FILE SHIPPED
// WITH ONE. It read "you may not have permission, or the name may already be
// in use" — so when Jay hit the unique constraint on 12 Aug 2026 the app told
// him it might be either, and he could not tell which. He reported it as a
// permission problem. It was not. The repo's own rule is to read the RESPONSE
// rather than the coloured box; a hedged message denies the person using the
// app the same thing.
//
// So the codes are distinguished. `error.code` is PostgREST's passthrough of
// the SQLSTATE.
const DUPLICATE_NAME = '23505' // unique_violation
const NOT_PERMITTED = '42501' // insufficient_privilege

const REFUSED_PERMISSION =
  "We couldn't save that league team — you may not have permission to change this club's teams."

/**
 * ⚠️ SAYS WHICH SQUAD, AND SAYS THE SCOPE OF THE RULE. "That name is taken" is
 * true and useless here, because the obvious next thought — "taken by whom?" —
 * has a surprising answer: names only have to differ WITHIN a squad, so the
 * clash is always with a team in this same age group and never with another.
 */
function duplicateNameMessage(name) {
  return `This squad already has a league team called ${name}. Names only need to be different within one squad, so another age group can still use it.`
}

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
 * Every league team in the club, for the ONE screen that manages them.
 *
 * ⚠️ THIS IS NOT A PICKER SOURCE, AND THAT IS THE WHOLE REASON THE OTHER
 * FUNCTION EXISTS. `listLeagueTeams` is scoped to one squad so an event form
 * cannot offer a U16 team for a U14 fixture; if that guard is ever wanted here
 * too, the answer is to keep using it, not to widen it. The management screen
 * is safe because it never files a fixture — it groups by `team_id` and shows
 * each squad only its own.
 *
 * Club-wide because the alternative is one round trip per squad on a screen
 * that lists all fifteen. `listPitches` has the same shape for the same reason.
 */
export async function listAllLeagueTeams({ includeRetired = false } = {}) {
  let query = supabase.from('league_teams').select('*')
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
  // ⚠️ THE `!data` REFUSAL IS GENUINELY ONLY EVER PERMISSION here. A unique
  // violation raises (23505 → DUPLICATE_NAME) and is caught in mapError, so the
  // refusedMessage is not hedging — there is exactly one way to reach it: RLS
  // filtered a non-admin's rename to zero rows, which arrives as data === null
  // with no error at all and would otherwise report success while changing
  // nothing.
  return upsertById('league_teams', leagueTeam, {
    refusedMessage: REFUSED_PERMISSION,
    mapError: (error) => {
      if (error.code === DUPLICATE_NAME) return new Error(duplicateNameMessage(leagueTeam?.rcm_name))
      if (error.code === NOT_PERMITTED) return new Error(REFUSED_PERMISSION)
      // ⚠️ THE REAL MESSAGE FOR ANYTHING ELSE, rather than a third guess: an
      // unrecognised failure that says what the database said is debuggable,
      // one that says "something went wrong" is not.
      return new Error(error.message || REFUSED_PERMISSION)
    },
  })
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

  // No name is being written, so a duplicate cannot arise here — permission is
  // the only thing this can be.
  if (error) throw new Error(REFUSED_PERMISSION)
}
