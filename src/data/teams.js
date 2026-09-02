import { supabase } from '../lib/supabase'
import { isFormat } from '../lib/fixtureFormat.js'

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

// ⚠️ ITS OWN MESSAGE, not the scoring one above. Both refusals come from the
// same `team manage` policy, but a coach told "you can't change how a squad
// scores" after flipping a contact switch would go looking for the wrong bug.
const REFUSED_CONTACT =
  "We couldn't save that. Only a club admin can change whether a squad plays contact."

/**
 * Marks a squad as contact (true) or tag (false).
 *
 * ⚠️ A COLUMN, NEVER THE NAME AND NEVER THE AGE — the same rule
 * setTeamScoringKinds carries above, and here it is load-bearing rather than
 * tidy. Several squad names say nothing either way ("U12G QR"), some say the
 * opposite of what the squad does, and this club runs TAG sides above the age
 * at which contact normally begins. Deriving the flag from either would be a
 * guess, and the thing being guessed at is whether a tackling drill may be
 * published to a group of children.
 *
 * ⚠️ THE DEFAULT (false) FAILS SAFE. Every squad is tag until an admin says
 * otherwise, so a contact drill can never reach a squad nobody has marked. The
 * cost of the default being wrong is a coach opening this panel; the cost of
 * the opposite default being wrong is a contact session published to a tag
 * squad.
 *
 * ⚠️ THROWS WHEN RLS FILTERS THE WRITE TO ZERO ROWS — the same trap as
 * setTeamScoringKinds: a non-admin's update arrives as `data === null` with
 * `error === null`, a perfectly successful nothing.
 */
export async function setTeamRequiresContact(teamId, value) {
  if (!teamId) throw new Error(REFUSED_CONTACT)

  const { data, error } = await supabase
    .from('teams')
    // ⚠️ `=== true`, not the raw argument. The column is NOT NULL, so an
    // undefined or absent value must land as false rather than as a null the
    // database would reject.
    .update({ requires_contact: value === true })
    .eq('id', teamId)
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message || REFUSED_CONTACT)
  if (!data) throw new Error(REFUSED_CONTACT)
  return data
}

// ⚠️ ITS OWN MESSAGE, like the two above and for the same reason.
const REFUSED_FORMAT =
  "We couldn't save that. Only a club admin can change a squad's usual tournament format."

/**
 * Sets what a NEW tournament or friendly for this squad pre-selects — 7, 10,
 * 12 or 15 — or clears it with null (which the form reads as 15).
 *
 * ⚠️ A COLUMN, NEVER THE SQUAD'S NAME, the same rule scoring_kinds and
 * requires_contact carry above. Never read for a league match: those are
 * always 15 and the database enforces it (events_league_is_fifteen).
 *
 * ⚠️ THROWS WHEN RLS FILTERS THE WRITE TO ZERO ROWS — see setTeamScoringKinds.
 */
export async function setTeamDefaultFormat(teamId, format) {
  if (!teamId) throw new Error(REFUSED_FORMAT)
  if (format !== null && !isFormat(format)) {
    throw new Error('A squad plays 7s, 10s, 12s or 15s — nothing else can be saved.')
  }

  const { data, error } = await supabase
    .from('teams')
    .update({ default_format: format })
    .eq('id', teamId)
    .select()
    .maybeSingle()

  if (error) throw new Error(error.message || REFUSED_FORMAT)
  if (!data) throw new Error(REFUSED_FORMAT)
  return data
}
