import { useEffect, useMemo, useState } from 'react'
import PlayerPicker from './PlayerPicker.jsx'
import Button from './Button.jsx'
import { isSquadStaffRole } from '../lib/scope.js'

// Builds a SET of access rows for one person, ready for grantMemberships().
//
// The model (design spec 2026-08-03, "The model, stated plainly"): one access
// row = one memberships row = (role, team_id, player_id). A person's access is
// the set of their rows — memberships has never had a unique constraint on
// (profile_id, club_id, role), so a coach of two squads, a parent of two
// children, or a coach who is also a parent are all legal and already handled
// correctly by scope.js. Only the grant UI ever assumed one row per person,
// which is the whole reason this component exists.
//
// Per role, what the targets are and why:
//   - parent  → CHILDREN. Each selected player is one row with player_id set
//     and team_id taken from THAT PLAYER'S OWN team. The age group is derived,
//     never asked for: the child determines it, and asking twice invites a
//     contradiction (a parent row pointing at an U10 child while carrying an
//     U14 team_id, which scope.js would then read as access to U14).
//   - parent, children not on the roster yet → falls back to a plain age-group
//     multi-select with player_id null. Jay asked for this explicitly; without
//     it a parent whose children have not been imported is ungrantable.
//   - coach   → AGE GROUPS, one row each.
//   - player  → one player. team_id is derived from that player exactly as in
//     the parent/child case.
//   - admin   → club-wide: exactly one row, team_id null, and NO target picker
//     at all (rendering one would imply an admin can be scoped, which the data
//     layer would silently overrule by coercing team_id to null).
//
// The duplicate guard lives here rather than in the data layer because it
// needs the rows the person ALREADY holds, which grantMemberships does not
// have. grantMemberships de-duplicates WITHIN one save; this refuses a row
// identical to an existing one. Both are needed: the database has no unique
// constraint to fall back on, and a duplicate admin row has been created by
// accident in this project before (RESTORE.md).

export const NO_ROLE_CHOSEN = 'Choose a role for this person.'
export const NO_TEAM_CHOSEN = 'Choose at least one age group for this role.'
export const NO_CHILD_CHOSEN =
  "Choose at least one child — or tick “not on the roster yet” and pick age groups instead."
export const NO_PLAYER_CHOSEN = 'Choose which player this person is.'
export const CHILD_WITHOUT_TEAM =
  "That player isn't in an age group yet, so there's nothing to give access to. Put them in a squad on the roster first."
export const DUPLICATE_ACCESS = 'They already have that access, so there is nothing to add.'

// 'manager' (Team Manager) and 'medic' sit next to 'coach' because they are
// the same kind of grant: pick the person, pick one or more age groups. They
// grant identical rights — see SQUAD_STAFF_ROLES in src/lib/scope.js.
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Team Manager' },
  { value: 'medic', label: 'Medic' },
  { value: 'parent', label: 'Parent' },
  { value: 'player', label: 'Player' },
]

const INLINE_CONTROL =
  'rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink transition hover:border-line hover:bg-surface-card focus:border-brand focus:bg-surface-card focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

/**
 * Stable identity for one access row, used by both halves of the duplicate
 * guard. Nulls are normalised so a row built here ({teamId: null}) compares
 * equal to one read back from the database ({team_id: null}).
 */
export function accessKey({ role, teamId, playerId }) {
  return JSON.stringify([role, teamId ?? null, playerId ?? null])
}

/** The same key, from a memberships row as the database returns it. */
export function membershipKey(member) {
  return accessKey({
    role: member.role,
    teamId: member.team_id ?? null,
    playerId: member.player_id ?? null,
  })
}

export default function AccessBuilder({
  label,
  teams = [],
  players = [],
  playersLoading = false,
  playersError = null,
  onNeedPlayers,
  existing = [],
  saving = false,
  error = null,
  submitLabel = 'Give access',
  onSubmit,
  onCancel,
}) {
  const [role, setRole] = useState('')
  const [teamIds, setTeamIds] = useState([])
  const [playerIds, setPlayerIds] = useState([])
  const [noRoster, setNoRoster] = useState(false)
  const [localError, setLocalError] = useState(null)

  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const existingKeys = useMemo(() => new Set(existing.map(membershipKey)), [existing])

  // Children mode is the default for a parent; the age-group fallback is the
  // exception, so it is opt-in rather than a mode switch of equal weight.
  const childMode = role === 'parent' && !noRoster
  const needsPlayers = childMode || role === 'player'
  const needsTeams = isSquadStaffRole(role) || (role === 'parent' && noRoster)

  // The player list is ~315 rows and most grants never look at it, so the
  // screen loads it lazily and only when a builder actually asks. Idempotent
  // on the screen's side.
  useEffect(() => {
    if (needsPlayers) onNeedPlayers?.()
  }, [needsPlayers, onNeedPlayers])

  function changeRole(nextRole) {
    setRole(nextRole)
    // Targets are per-role and do not survive a role change: a team chosen for
    // a coach row is not a team chosen for a parent row, and carrying the
    // selection over is how someone ends up granting an age group they only
    // ever looked at.
    setTeamIds([])
    setPlayerIds([])
    setNoRoster(false)
    setLocalError(null)
  }

  function toggleTeam(teamId) {
    setLocalError(null)
    setTeamIds((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId],
    )
  }

  /**
   * The role's current targets as access rows, or an error string. Returns
   * rows in selection order; de-duplication and the existing-row check happen
   * in submit() so this stays a pure translation of the form.
   */
  function buildRows() {
    if (!role) return { error: NO_ROLE_CHOSEN }

    if (role === 'admin') {
      return { rows: [{ role: 'admin', teamId: null, playerId: null }] }
    }

    if (isSquadStaffRole(role) || (role === 'parent' && noRoster)) {
      if (teamIds.length === 0) return { error: NO_TEAM_CHOSEN }
      return { rows: teamIds.map((teamId) => ({ role, teamId, playerId: null })) }
    }

    // parent (children) and player: the team comes from the player.
    if (playerIds.length === 0) {
      return { error: role === 'player' ? NO_PLAYER_CHOSEN : NO_CHILD_CHOSEN }
    }

    const rows = []
    for (const playerId of playerIds) {
      const player = playersById.get(playerId)
      if (!player?.team_id) return { error: CHILD_WITHOUT_TEAM }
      rows.push({ role, teamId: player.team_id, playerId })
    }
    return { rows }
  }

  function submit() {
    const { rows, error: refusal } = buildRows()
    if (refusal) {
      setLocalError(refusal)
      return
    }

    // Within-save de-duplication. grantMemberships does this too, but doing it
    // here means the person is never TOLD two rows were created when one was.
    const seen = new Set()
    const unique = rows.filter((row) => {
      const key = accessKey(row)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Against what they already hold. Refuses the whole submission rather than
    // silently dropping the duplicate part: "add U10 and U12" when they
    // already have U10 is more likely a misreading of the current access than
    // a deliberate request to add only U12, and a refusal that names the
    // problem costs one click to fix.
    if (unique.some((row) => existingKeys.has(accessKey(row)))) {
      setLocalError(DUPLICATE_ACCESS)
      return
    }

    setLocalError(null)
    onSubmit?.(unique)
  }

  const shownError = localError || error
  const busy = Boolean(saving)

  return (
    <div
      data-testid="access-builder"
      className="flex flex-1 basis-full flex-wrap items-center gap-x-3 gap-y-2"
    >
      <select
        className={INLINE_CONTROL}
        aria-label={`Role for ${label}`}
        value={role}
        disabled={busy}
        onChange={(event) => changeRole(event.target.value)}
      >
        <option value="">Choose a role</option>
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {role === 'admin' && (
        <span className="px-2 text-[13px] text-ink-muted">All age groups</span>
      )}

      {role === 'parent' && (
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
          <input
            type="checkbox"
            checked={noRoster}
            disabled={busy}
            onChange={(event) => {
              setNoRoster(event.target.checked)
              setTeamIds([])
              setPlayerIds([])
              setLocalError(null)
            }}
          />
          Their children aren&apos;t on the roster yet
        </label>
      )}

      {needsPlayers && (
        <PlayerPicker
          label={childMode ? `Children for ${label}` : `Player for ${label}`}
          players={players}
          teamsById={teamsById}
          multiple={childMode}
          selectedIds={playerIds}
          onChange={(ids) => {
            setPlayerIds(ids)
            setLocalError(null)
          }}
          loading={playersLoading}
          error={playersError}
          disabled={busy}
        />
      )}

      {needsTeams && (
        <fieldset
          data-testid="age-group-picker"
          className="min-w-0 flex-1 basis-full rounded-[11px] border border-line bg-surface-card p-2.5"
        >
          {/* A real <legend>, not an aria-labelledby'd span: the checkboxes
              are a genuine group and this is the one control here that reads
              correctly to a screen reader without ARIA. */}
          <legend className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
            {`Age groups for ${label}`}
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {teams.map((team) => (
              <label
                key={team.id}
                className="flex cursor-pointer items-center gap-1.5 text-[13.5px] text-ink"
              >
                <input
                  type="checkbox"
                  checked={teamIds.includes(team.id)}
                  disabled={busy}
                  onChange={() => toggleTeam(team.id)}
                />
                {team.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <span className="flex-1" />

      <Button
        size="sm"
        aria-label={`${submitLabel} for ${label}`}
        disabled={busy}
        onClick={submit}
      >
        {busy ? 'Saving…' : submitLabel}
      </Button>

      {onCancel && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      )}

      {shownError && (
        <span role="alert" className="basis-full text-[12.5px] font-semibold text-brand-deep">
          {shownError.message || shownError}
        </span>
      )}
    </div>
  )
}
