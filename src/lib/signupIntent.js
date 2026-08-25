// The payload a person fills in BEFORE supabase.auth.signUp runs.
//
// WHY. Confirming the email was reading as "finished". They closed the tab
// and landed on Waiting for access as Unnamed / hasn't said what they need.
// The answers now travel in auth.users.raw_user_meta_data and
// public.profiles.signup_intent so a confirm on a different device still
// has them. Players are NOT created until email_confirmed_at is set —
// register_my_player's rule, unchanged.
//
// ⚠️ THIS FILE IS THE ONE SHAPE. The wizard builds it, signUp sends it,
// private.handle_new_user stores it, private.apply_signup_intent reads it.
// Two copies of the keys would be two copies that drift.

export const SIGNUP_ANSWERS = [
  {
    key: 'child',
    label: 'I have a child playing here',
    hint: 'You’ll add them on the next screen.',
  },
  {
    key: 'self',
    label: 'I play here myself',
    hint: 'Senior and older youth squads only.',
  },
  {
    key: 'staff',
    label: 'I coach, manage or medic a squad',
    hint: 'A coach or admin approves this before you see the squad.',
  },
  {
    key: 'helper',
    label: 'I help the club another way',
    hint: 'Committee, volunteer, anything else.',
  },
]

export const SIGNUP_STAFF_ROLES = [
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Team manager' },
  { value: 'medic', label: 'Medic or physio' },
]

export const NOTHING_TICKED =
  'Tick at least one, so the club knows who you are. If none of them fit, tick “I help the club another way”.'

export const NO_SQUAD_CHOSEN =
  'Choose at least one squad — it is how the club knows who to send your request to.'

/**
 * One role for access_requests.requested_role (CHECK allows a single value).
 * Staff first: that is the claim a human has to approve. Parent/player next
 * because registering the child carries its own pending membership.
 */
export function claimedRole(answers = {}, staffRole = '') {
  if (answers.staff) return staffRole || null
  if (answers.child) return 'parent'
  if (answers.self) return 'player'
  if (answers.helper) return 'volunteer'
  return null
}

export function needsPlayers(answers = {}) {
  return Boolean(answers.child || answers.self)
}

function cleanIdList(ids) {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
}

function serialisePlayer(row) {
  return {
    first_name: String(row.firstName ?? '').trim(),
    last_name: String(row.lastName ?? '').trim(),
    dob: String(row.dob ?? '').trim() || null,
    team_id: row.teamId || null,
    gender: row.gender || null,
    self_register: row.selfRegister === true,
    play_up_consent: row.playUpConsent === true,
    confirm_duplicate: row.confirmDuplicate === true,
    confirm_self_name: row.confirmSelfName === true,
  }
}

/**
 * The object that goes in user_metadata.signup_intent.
 * Returns { error } when the who-step is incomplete, or { intent }.
 */
export function buildSignupIntent({
  firstName,
  lastName,
  answers,
  squadIds,
  staffRole,
  staffTeamId,
  players = [],
} = {}) {
  const first = String(firstName ?? '').trim()
  const last = String(lastName ?? '').trim()
  if (!first) {
    return { error: 'Enter your first name, so the club knows who is asking.' }
  }
  if (!last) {
    return {
      error:
        'Enter your family name too — a first name alone is not enough for a coach to know who you are.',
    }
  }

  const ticked = SIGNUP_ANSWERS.some((answer) => answers?.[answer.key])
  if (!ticked) return { error: NOTHING_TICKED }

  if (answers.staff && !staffRole) {
    return { error: 'Choose whether you coach, manage or medic.' }
  }

  const squads = cleanIdList(squadIds)
  if (squads.length === 0) return { error: NO_SQUAD_CHOSEN }

  const staffTeam = answers.staff ? staffTeamId || squads[0] : null
  if (answers.staff && !staffTeam) {
    return { error: 'Choose which squad you look after.' }
  }

  const role = claimedRole(answers, staffRole)
  if (!role) return { error: NOTHING_TICKED }

  const playerRows = needsPlayers(answers) ? players.map(serialisePlayer) : []

  return {
    intent: {
      v: 1,
      first_name: first,
      last_name: last,
      answers: {
        child: Boolean(answers.child),
        self: Boolean(answers.self),
        staff: Boolean(answers.staff),
        helper: Boolean(answers.helper),
      },
      squad_ids: squads,
      staff_role: answers.staff ? staffRole : null,
      staff_team_id: staffTeam,
      claimed_role: role,
      players: playerRows,
    },
  }
}
