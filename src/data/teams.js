import { supabase } from '../lib/supabase'

// Writes against public.teams. Reads live in src/lib/memberships.jsx, which
// loads the club's squads once per session with `select('*')` and hands them to
// every screen — so there is deliberately no list function here.
//
// ⚠️ A SQUAD IS NOT A LEAGUE TEAM. `teams` is the training group ("U14B
// Contact"); `league_teams` is what plays in a division ("ADHQ2") and has its
// own module. See the header in src/screens/AdminClub.jsx.

const REFUSED =
  "We couldn't save that. Only a club admin can change how a squad scores."

/**
 * Sets — or clears — a squad's scoring override.
 *
 * ⚠️ NULL CLEARS IT BACK TO THE AGE-BAND DEFAULT, and null is a real answer
 * rather than a failure to choose. `teams.scoring_kinds` is null on every squad
 * until somebody opens this screen, and scoringForTeam() reads null as "use the
 * band", never as "this squad cannot score anything". Passing `[]` would be the
 * dangerous version of the same intent, which is why cleanScoringKinds refuses
 * an empty array — see src/lib/scoring.js.
 *
 * ⚠️ THE OVERRIDE IS A COLUMN, NEVER THE SQUAD'S NAME — the same rule
 * teams.is_senior and teams.self_registration_allowed carry, and for the same
 * reason: renaming a squad must not silently change what may be recorded
 * against it.
 *
 * ⚠️ THROWS WHEN RLS FILTERS THE WRITE TO ZERO ROWS. `team manage` is
 * is_admin(club_id), and a non-admin's update arrives as `data === null` with
 * `error === null` — a perfectly successful nothing. Without the explicit check
 * the screen would report a save that never happened, which is the trap
 * upsertLeagueTeam and saveMatchSheet both already document.
 */
export async function setTeamScoringKinds(teamId, kinds) {
  if (!teamId) throw new Error(REFUSED)

  const { data, error } = await supabase
    .from('teams')
    .update({ scoring_kinds: kinds ?? null })
    .eq('id', teamId)
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message || REFUSED)
  if (!data) throw new Error(REFUSED)
  return data
}
