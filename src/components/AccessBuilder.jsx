import { useEffect, useMemo, useState } from 'react'
import PlayerPicker from './PlayerPicker.jsx'
import Button from './Button.jsx'
import { isSquadStaffRole } from '../lib/scope.js'
import { upsertPlayer } from '../data/players.js'
import { friendlyMessage } from '../lib/friendlyError.js'

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
//   - player, not on the roster yet → CREATES THE PLAYER, then grants against
//     it. ⚠️ NOT the parent's player_id-null fallback, and the difference is
//     not stylistic. `private.is_own_player` is
//     `m.player_id = _player AND role in ('parent','player')`, so a player
//     membership with a null player_id matches NOTHING: that account could
//     never set its own availability, its own photo or its own gender. It
//     would look granted and behave like a stranger. A player has to exist on
//     the roster to be a player at all.
//     Reported by Jay 10 Aug 2026, who created a login for his son and found
//     the only options were six unrelated Test Players. ⚠️ Per the 10 Aug
//     no-roster-import decision this is the NORMAL case, not an edge one:
//     parents self-onboard and the old roster most likely never goes in, so
//     almost every player granted access will not be on the roster yet.
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
export const NO_PLAYER_CHOSEN =
  "Choose which player this person is — or tick “not on the roster yet” and add them."
export const NEW_PLAYER_NEEDS_NAME = 'Give the new player a name.'
export const NEW_CHILD_NEEDS_NAME = "Type the child's name, so they can be added to the roster."
export const NEW_PLAYER_NEEDS_TEAM = 'Choose an age group for the new player.'
// ⚠️ SHOULD BE UNREACHABLE, AND EXISTS BECAUSE THE ALTERNATIVE WAS WORSE.
// players.club_id is NOT NULL, and every squad in the picker carries a club_id,
// so a team without one means the team list arrived malformed. Before 20 Aug
// 2026 this case sent the insert anyway and the admin was shown the raw
// database refusal — "null value in column \"club_id\" of relation \"players\"
// violates not-null constraint" — on the live Accounts screen, mid-approval.
export const NEW_PLAYER_NEEDS_CLUB =
  "That age group isn't attached to a club, so a new player can't be added to it. Reload the page, and tell an admin if it happens again."
export const CHILD_WITHOUT_TEAM =
  "That player isn't in an age group yet, so there's nothing to give access to. Put them in a squad on the roster first."
const DUPLICATE_ACCESS = 'They already have that access, so there is nothing to add.'

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
function membershipKey(member) {
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
  // The new-player form, for role 'player' with `noRoster` ticked.
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerTeam, setNewPlayerTeam] = useState('')
  // Separate from the parent's `saving`: that means "the grant is in flight",
  // this means "the player row is being created". They are two writes and the
  // first can fail on its own.
  const [creating, setCreating] = useState(false)

  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players])
  const existingKeys = useMemo(() => new Set(existing.map(membershipKey)), [existing])

  // Children mode is the default for a parent; the age-group fallback is the
  // exception, so it is opt-in rather than a mode switch of equal weight.
  const childMode = role === 'parent' && !noRoster
  // A player who is not on the roster yet gets the new-player form instead of
  // the picker — there is nothing to pick.
  // ⚠️ PARENT AS WELL AS PLAYER, 20 Aug 2026. Both roles need a real player
  // row before a membership can exist, so both take the same route when the
  // child is not on the roster yet.
  const newPlayerMode = (role === 'player' || role === 'parent') && noRoster
  const needsPlayers = childMode || (role === 'player' && !noRoster)
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
    setNewPlayerName('')
    setNewPlayerTeam('')
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

    // ⚠️ THE PARENT FALLBACK IS GONE, AND IT COULD NEVER HAVE WORKED. It built
    // a parent row with playerId: null, and the DATABASE refuses exactly that —
    // `memberships_family_role_needs_player`, CHECK (role not in ('parent',
    // 'player') OR player_id IS NOT NULL), Jay's ruling of 14 Aug 2026: "nobody
    // outside staff should be able to create an account without a player".
    //
    // ⚠️ SO THE TICKBOX WAS A CONTROL THAT ALWAYS FAILED, and the refusal came
    // from src/data/members.js — a layer the admin cannot see — which is why it
    // read as a mystery rather than as a rule. It reached production because
    // every test here mocks grantMemberships, so the guard never ran.
    //
    // It now does what the player path already did: ADD the child, then link the
    // parent to it. Same one ruling, honoured instead of contradicted.
    if (isSquadStaffRole(role)) {
      if (teamIds.length === 0) return { error: NO_TEAM_CHOSEN }
      return { rows: teamIds.map((teamId) => ({ role, teamId, playerId: null })) }
    }

    // A player who is not on the roster yet: the row cannot be built here
    // because the player does not exist. submit() creates it first and comes
    // back with a real id — see the note there for why this is not the
    // parent's player_id-null fallback.
    if (newPlayerMode) {
      if (!newPlayerName.trim()) {
        return { error: role === 'parent' ? NEW_CHILD_NEEDS_NAME : NEW_PLAYER_NEEDS_NAME }
      }
      if (!newPlayerTeam) return { error: NEW_PLAYER_NEEDS_TEAM }
      // ⚠️ club_id IS MANDATORY ON players AND WAS NOT BEING SENT. This path
      // built { full_name, team_id } only, so the insert hit a NOT NULL
      // constraint and the admin saw the raw Postgres message on the Accounts
      // screen while trying to approve somebody. src/screens/PlayerForm.jsx has
      // always sent it — `club_id: team.club_id` — which is why the same action
      // works from the roster and failed from here.
      // ⚠️ TAKEN FROM THE CHOSEN SQUAD, not from a club id threaded down as a
      // prop. The team is the thing the admin actually picked, and deriving it
      // from anything else would let the new player land in a different club
      // from the squad they were just assigned to.
      const newTeam = teamsById.get(newPlayerTeam)
      if (!newTeam?.club_id) return { error: NEW_PLAYER_NEEDS_CLUB }
      return {
        rows: [
          {
            // ⚠️ `role`, NOT 'player'. This branch now serves a parent too, and
            // hard-coding it here would silently grant the wrong kind of access —
            // a parent would land as a PLAYER on their own child's squad.
            role,
            teamId: newPlayerTeam,
            playerId: null,
            newPlayer: {
              full_name: newPlayerName.trim(),
              team_id: newPlayerTeam,
              club_id: newTeam.club_id,
            },
          },
        ],
      }
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

  async function submit() {
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

    // ⚠️ THE PLAYER IS CREATED LAST, AFTER EVERY REFUSAL ABOVE HAS PASSED.
    // Creating it first would leave a real child on the roster every time a
    // grant was then refused as a duplicate or rejected by RLS — an orphan
    // nobody asked for, in a table where a stray row is a stray CHILD.
    // Ordering the checks before the write is the whole reason this is not
    // simply done inside buildRows().
    const pending = unique.filter((row) => row.newPlayer)
    if (pending.length > 0) {
      setCreating(true)
      try {
        for (const row of pending) {
          const created = await upsertPlayer(row.newPlayer)
          row.playerId = created.id
          // Trust the row the database returned rather than the id posted to
          // it: a trigger or default could legitimately place the player
          // somewhere else, and the membership must follow the player.
          row.teamId = created.team_id ?? row.teamId
        }
      } catch (creationError) {
        setLocalError(creationError)
        return
      } finally {
        setCreating(false)
      }
    }

    onSubmit?.(unique.map(({ newPlayer, ...row }) => row))
  }

  const shownError = localError || error
  const busy = Boolean(saving) || creating

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

      {(role === 'parent' || role === 'player') && (
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
          <input
            type="checkbox"
            checked={noRoster}
            disabled={busy}
            onChange={(event) => {
              setNoRoster(event.target.checked)
              setTeamIds([])
              setPlayerIds([])
              setNewPlayerName('')
              setNewPlayerTeam('')
              setLocalError(null)
            }}
          />
          {/* ⚠️ The two roles read the same and do DIFFERENT things, which is
              why the wording differs rather than being shared.
              ⚠️ BOTH ROLES NOW ADD THE PERSON — corrected 20 Aug 2026. This note
              used to say a parent "falls back to age groups with no player row",
              and that fallback could never work: the database refuses a parent or
              player membership with a null player_id
              (`memberships_family_role_needs_player`), so the tickbox produced a
              refusal every single time, from a layer the admin cannot see.
              A player membership with a null player_id would also fail
              is_own_player, leaving an account unable to touch its own
              availability — the same rule, read from the other end. */}
          {role === 'parent'
            ? "Their child isn't on the roster yet — add them"
            : "They're not on the roster yet — add them"}
        </label>
      )}

      {newPlayerMode && (
        <fieldset
          data-testid="new-player-form"
          className="min-w-0 flex-1 basis-full rounded-[11px] border border-line bg-surface-card p-2.5"
        >
          <legend className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
            {role === 'parent' ? `New child for ${label}` : `New player for ${label}`}
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label={
                role === 'parent'
                  ? `Name of the new child for ${label}`
                  : `Name of the new player for ${label}`
              }
              placeholder="Full name"
              value={newPlayerName}
              disabled={busy}
              onChange={(domEvent) => {
                setNewPlayerName(domEvent.target.value)
                setLocalError(null)
              }}
              className="min-w-0 flex-1 rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand"
            />
            {/* A select, not the checkbox grid the other roles use: a player is
                in exactly one age group, and a multi-select would invite the
                contradiction the parent/child comment warns about. */}
            <select
              aria-label={
                role === 'parent'
                  ? `Age group for the new child for ${label}`
                  : `Age group for the new player for ${label}`
              }
              value={newPlayerTeam}
              disabled={busy}
              onChange={(domEvent) => {
                setNewPlayerTeam(domEvent.target.value)
                setLocalError(null)
              }}
              className="rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[14px] text-ink outline-none transition focus:border-brand"
            >
              <option value="">Choose an age group</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1.5 text-[12.5px] text-ink-muted">
            Adds them to the roster and links this login to them.
          </p>
        </fieldset>
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
        <span role="alert" className="basis-full text-[12.5px] font-semibold text-danger-ink">
          {typeof shownError === 'string' ? shownError : friendlyMessage(shownError, "That didn't work. Try again.")}
        </span>
      )}
    </div>
  )
}
