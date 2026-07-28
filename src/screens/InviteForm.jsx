import { useEffect, useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import { createInvite } from '../data/members.js'
import { listPlayers } from '../data/players.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { visibleTeams } from '../lib/scope.js'

// The admin-only invite creation form (Task 18), opened in the shared Sheet
// from Admin.jsx's "Invite a member" entry point. Fields: email, role, age
// group (required unless the role is admin — the invites table's own check
// constraint, `invites_team_required_unless_admin`, is the real enforcement;
// this form validates the same rule client-side purely so a bad submission
// never reaches the database as a raw constraint-violation message), and an
// optional player link (most commonly a parent invite naming their child).
//
// Access control is NOT enforced here: the invites table's "invites manage"
// RLS policy (ALL, USING+WITH CHECK is_admin(club_id)) is the real boundary.
// This form is only ever opened from Admin.jsx, which already gates on
// isAdmin() before rendering an "Invite a member" button at all — but
// createInvite() still turns a hypothetical non-admin refusal into a thrown,
// visible error rather than a silent no-op, the same as every other write in
// this codebase.
//
// There is no email-sending infrastructure in this build (no constraint here
// authorises adding a third-party email service), so on success this shows
// the generated accept link for the admin to copy and send manually, rather
// than closing the sheet as every other add/edit form does.

const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-[#5c5854]'
const FIELD = 'mb-3.5'
const INPUT_BASE =
  'w-full rounded-[11px] border-[1.5px] bg-white px-3 py-[11px] text-[16px] text-[#221f1d] outline-none transition placeholder:text-[#a29d99] focus:border-quinsRed'

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'coach', label: 'Coach' },
  { value: 'parent', label: 'Parent' },
  { value: 'player', label: 'Player' },
]

// A deliberately simple check, matching the input's own type="email" intent:
// this is a friendly-typo catch, not the source of truth on validity — the
// database has no email-format constraint either, and Supabase Auth is what
// actually verifies an address by requiring the invitee to click a real
// magic link sent to it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function inputClasses(invalid) {
  return [INPUT_BASE, invalid ? 'border-quinsRedDark' : 'border-[#e6e3e1]'].join(' ')
}

export default function InviteForm({ onClose, onSaved }) {
  const { user } = useAuth()
  const { memberships, teams } = useMemberships()

  // Every team in the club, in the club's own sort order — an admin invites
  // club-wide, unlike PlayerForm/EventForm's canEditTeam-filtered lists,
  // which narrow to what the *current* user may edit. visibleTeams' admin
  // special-case already returns every team sorted; this form is admin-only
  // regardless of the signed-in admin's own team_id (which is null anyway).
  const allTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('coach')
  const [teamId, setTeamId] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [invalid, setInvalid] = useState({})
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [invite, setInvite] = useState(null)

  const [players, setPlayers] = useState([])
  const [playersLoading, setPlayersLoading] = useState(false)

  // Guards against a double submit landing two invites: `saving` state is
  // async, this is not.
  const inFlight = useRef(false)

  const needsTeam = role !== 'admin'

  // The optional player picker only makes sense once a team is chosen (a
  // parent's child must belong to that team) — listPlayers() is scoped to
  // it, the same team-scoping every other player picker in this codebase
  // uses. Switching role/team clears any previously chosen player rather
  // than silently keeping a selection that may no longer be visible.
  useEffect(() => {
    setPlayerId('')

    if (!needsTeam || !teamId) {
      setPlayers([])
      return undefined
    }

    let mounted = true
    setPlayersLoading(true)

    listPlayers({ teamIds: [teamId] })
      .then((rows) => {
        if (!mounted) return
        setPlayers(rows)
      })
      .catch(() => {
        // A failed player-list read should not block sending the invite —
        // it only narrows an optional convenience field. Leave the picker
        // empty rather than surfacing a second alert alongside the form's
        // own.
        if (!mounted) return
        setPlayers([])
      })
      .finally(() => {
        if (mounted) setPlayersLoading(false)
      })

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- needsTeam is
    // derived from role, listed via teamId/role directly below.
  }, [teamId, needsTeam])

  function handleRoleChange(nextRole) {
    setRole(nextRole)
    setTeamId('')
    setInvalid((current) => ({ ...current, teamId: false }))
  }

  function handleSubmit(domEvent) {
    domEvent.preventDefault()
    if (inFlight.current) return

    const trimmedEmail = email.trim()
    const nextInvalid = {
      email: !trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail),
      teamId: needsTeam && !teamId,
    }
    setInvalid(nextInvalid)

    if (Object.values(nextInvalid).some(Boolean)) {
      setError(
        new Error(
          nextInvalid.email && !nextInvalid.teamId
            ? 'Enter a valid email address before sending.'
            : 'Fill in the highlighted fields before sending.',
        ),
      )
      return
    }

    const clubId = teams[0]?.club_id ?? null

    inFlight.current = true
    setSaving(true)
    setError(null)

    createInvite({
      clubId,
      email: trimmedEmail,
      role,
      teamId: needsTeam ? teamId : null,
      playerId: playerId || null,
      createdBy: user?.id ?? null,
    })
      .then((saved) => {
        setInvite(saved)
        onSaved?.(saved)
      })
      .catch((err) => {
        setError(err)
      })
      .finally(() => {
        inFlight.current = false
        setSaving(false)
      })
  }

  const acceptLink = invite?.token ? `${window.location.origin}/accept-invite/${invite.token}` : ''

  return (
    <Sheet open onClose={onClose} title="Invite a member">
      {invite ? (
        <div>
          <p className="mb-3 text-sm leading-relaxed text-[#221f1d]">
            Invite created for <strong>{invite.email}</strong>. There&apos;s no automatic email
            for this yet — copy the link below and send it to them directly.
          </p>
          <div className={FIELD}>
            <label className={LABEL} htmlFor="invite-link">
              Accept link
            </label>
            <input
              id="invite-link"
              type="text"
              readOnly
              value={acceptLink}
              onFocus={(domEvent) => domEvent.target.select()}
              className={inputClasses(false)}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-[11px] bg-quinsRed px-4 py-3 text-[15px] font-bold text-white transition hover:bg-[#D62A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
          >
            Done
          </button>
        </div>
      ) : (
        // noValidate: this form does its own validation and reports it in a
        // role="alert" region, which a screen reader announces — the native
        // bubble is neither announced reliably nor visible to the browser
        // check.
        <form onSubmit={handleSubmit} noValidate>
          <div className={FIELD}>
            <label className={LABEL} htmlFor="invite-email">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(domEvent) => {
                setEmail(domEvent.target.value)
                setInvalid((current) => (current.email ? { ...current, email: false } : current))
              }}
              aria-invalid={invalid.email ? 'true' : undefined}
              placeholder="e.g. coach@example.com"
              className={inputClasses(invalid.email)}
            />
          </div>

          <div className={FIELD}>
            <label className={LABEL} htmlFor="invite-role">
              Role
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(domEvent) => handleRoleChange(domEvent.target.value)}
              className={inputClasses(false)}
            >
              {ROLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {needsTeam && (
            <div className={FIELD}>
              <label className={LABEL} htmlFor="invite-team">
                Age group
              </label>
              <select
                id="invite-team"
                value={teamId}
                onChange={(domEvent) => {
                  setTeamId(domEvent.target.value)
                  setInvalid((current) => (current.teamId ? { ...current, teamId: false } : current))
                }}
                aria-invalid={invalid.teamId ? 'true' : undefined}
                className={inputClasses(invalid.teamId)}
              >
                <option value="">Choose an age group</option>
                {allTeams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsTeam && teamId && !playersLoading && players.length > 0 && (
            <div className={FIELD}>
              <label className={LABEL} htmlFor="invite-player">
                Player (optional)
              </label>
              <select
                id="invite-player"
                value={playerId}
                onChange={(domEvent) => setPlayerId(domEvent.target.value)}
                className={inputClasses(false)}
              >
                <option value="">Not linked to a player</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.full_name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12.5px] text-[#5c5854]">
                For a parent invite, link the child this account is for.
              </p>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mb-3.5 rounded-[11px] bg-[#fbeae8] px-3 py-2.5 text-sm font-semibold text-quinsRedDark"
            >
              {error.message || "We couldn't send that invite. Try again."}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-[11px] bg-quinsRed px-4 py-3 text-[15px] font-bold text-white transition hover:bg-[#D62A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Sending…' : 'Send invite'}
          </button>
        </form>
      )}
    </Sheet>
  )
}
