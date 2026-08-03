import { useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  deleteMembership,
  listClubMembers,
  updateMembershipRole,
  updateProfileName,
} from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'

// Admin Accounts screen (design spec 2026-08-03 §2): view and edit who has
// access to the club — display name, role, age group, and revoking access.
//
// Gated on the EFFECTIVE membership set from useMemberships(), exactly like
// every other screen, so an admin previewing as a coach ("view as", spec §1)
// correctly sees "not authorised" here. Only the view-as switcher itself
// gates on realMemberships; if this screen did too, the preview would be a
// lie. The gate is UI-only — RLS (`memb manage`, `profile update club admin`)
// is what actually decides whether the writes below succeed, so getting this
// wrong could hide the screen from an admin but could never grant anything.
//
// Three things this screen deliberately does NOT do (spec §2 "Not doing"):
//   - passwords: an admin cannot reset someone else's from the browser (that
//     needs the service-role key, which never touches this frontend), so the
//     screen says so rather than rendering a dead control;
//   - email: profiles.email mirrors auth.users.email; writing it here would
//     desync the address people actually sign in with. Read-only;
//   - creating accounts: that is the existing invite flow, untouched.

const MUTED_ON_PAPER = 'text-ink-muted'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'coach', label: 'Coach' },
  { value: 'parent', label: 'Parent' },
  { value: 'player', label: 'Player' },
]

// Same borderless-until-hover treatment RosterTable uses for its in-place
// selects, so a dense list of accounts doesn't read as a wall of form fields.
const INLINE_CONTROL =
  'rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink transition hover:border-line hover:bg-surface-card focus:border-brand focus:bg-surface-card focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

// The single guard with no database equivalent. `memberships` has no
// constraint keeping at least one admin row alive, and an admin who removes
// or demotes their own last admin membership locks the club out of this
// screen (and of /more) with no way back except raw SQL against Supabase.
// Checked against the full club-wide list, not just the rows on screen.
const LAST_ADMIN_REFUSAL =
  "You can't change your own last admin access — the club would be locked out of its own admin screens. Add another admin first, or ask a different admin to make this change."

function NotAuthorised() {
  return (
    <section>
      <h2 className="sr-only">Accounts</h2>
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">Not authorised</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          This page is for club admins only. If you think you should have access, ask a
          current admin to check your account.
        </p>
      </Card>
    </section>
  )
}

/**
 * One block per PERSON, not per membership row. memberships has no unique
 * constraint on (profile_id, club_id, role) — a duplicate admin row has
 * already happened once in this database (RESTORE.md) — so the same person
 * legitimately appears on several rows. Rendering them ungrouped would show
 * the same name repeatedly and hide the duplicate rather than surface it.
 *
 * Rows with a null profile_id (not possible in the current schema, but a
 * partial/failed join would produce one) fall back to a per-row key so they
 * still render as their own block instead of all collapsing into one.
 */
function groupByProfile(members) {
  const groups = new Map()

  members.forEach((member) => {
    const key = member.profile_id ?? `membership:${member.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.memberships.push(member)
      return
    }
    groups.set(key, {
      key,
      profileId: member.profile_id ?? null,
      name: member.profiles?.full_name ?? null,
      email: member.profiles?.email ?? null,
      memberships: [member],
    })
  })

  return [...groups.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}

function formatJoined(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Accounts() {
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()
  const admin = isAdmin(memberships)

  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Per-membership-row UI state, keyed by membership id: whether a write is
  // in flight, the last refusal to show inline, and whether the row is in its
  // "really revoke?" confirm step. The confirm is an inline state rather than
  // window.confirm — this project does not trigger browser modal dialogs.
  const [rowState, setRowState] = useState({})
  // Per-profile name editing, keyed by profile id.
  const [nameEdit, setNameEdit] = useState({})

  useEffect(() => {
    // A non-admin issues no query at all — same shape as Admin.jsx's effect.
    if (!admin) return undefined

    let mounted = true
    setLoading(true)
    setError(null)

    listClubMembers()
      .then((rows) => {
        if (!mounted) return
        setMembers(rows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setMembers([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [admin, reloadToken])

  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) => {
        const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
        if (orderDiff !== 0) return orderDiff
        return a.name.localeCompare(b.name)
      }),
    [teams],
  )
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])

  if (!admin) return <NotAuthorised />

  const groups = groupByProfile(members)
  const isFirstLoad = loading && members.length === 0

  // Counted from the full club-wide list, so the guard holds even if the
  // caller's other admin row is rendered in some block further down.
  const ownAdminCount = members.filter(
    (member) => member.profile_id === user?.id && member.role === 'admin',
  ).length

  function isOwnLastAdmin(member) {
    return member.profile_id === user?.id && member.role === 'admin' && ownAdminCount <= 1
  }

  function patchRow(id, patch) {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function patchMember(id, patch) {
    setMembers((prev) => prev.map((member) => (member.id === id ? { ...member, ...patch } : member)))
  }

  async function saveMembership(member, { role, teamId }) {
    if ((role === 'admin' ? null : teamId) === (member.role === 'admin' ? null : member.team_id) &&
      role === member.role) {
      return
    }

    if (isOwnLastAdmin(member) && role !== 'admin') {
      patchRow(member.id, { error: LAST_ADMIN_REFUSAL, confirming: false })
      return
    }

    patchRow(member.id, { saving: true, error: null })
    try {
      const updated = await updateMembershipRole({ membershipId: member.id, role, teamId })
      patchMember(member.id, {
        role: updated.role,
        team_id: updated.team_id,
        teams: updated.team_id ? teamsById.get(updated.team_id) ?? null : null,
      })
    } catch (err) {
      patchRow(member.id, { error: err?.message || "We couldn't save that change." })
    } finally {
      patchRow(member.id, { saving: false })
    }
  }

  async function revoke(member) {
    if (isOwnLastAdmin(member)) {
      patchRow(member.id, { error: LAST_ADMIN_REFUSAL, confirming: false })
      return
    }

    patchRow(member.id, { saving: true, error: null })
    try {
      await deleteMembership(member.id)
      setMembers((prev) => prev.filter((row) => row.id !== member.id))
      setRowState((prev) => {
        const next = { ...prev }
        delete next[member.id]
        return next
      })
    } catch (err) {
      patchRow(member.id, {
        error: err?.message || "We couldn't remove that access.",
        saving: false,
        confirming: false,
      })
    }
  }

  async function saveName(group) {
    const draft = nameEdit[group.key]
    if (!draft) return

    setNameEdit((prev) => ({ ...prev, [group.key]: { ...draft, saving: true, error: null } }))
    try {
      const updated = await updateProfileName({
        profileId: group.profileId,
        fullName: draft.value,
      })
      // One profile, potentially several membership rows — the new name has
      // to land on every one of them, which is exactly why the name lives on
      // profiles rather than on memberships.
      setMembers((prev) =>
        prev.map((member) =>
          member.profile_id === group.profileId
            ? { ...member, profiles: { ...member.profiles, full_name: updated.full_name } }
            : member,
        ),
      )
      setNameEdit((prev) => {
        const next = { ...prev }
        delete next[group.key]
        return next
      })
    } catch (err) {
      setNameEdit((prev) => ({
        ...prev,
        [group.key]: {
          ...prev[group.key],
          saving: false,
          error: err?.message || "We couldn't save that name.",
        },
      }))
    }
  }

  return (
    <section>
      <div className="mb-3.5 mt-1">
        <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Accounts</h2>
        <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>
          {groups.length} {groups.length === 1 ? 'person' : 'people'} · {members.length}{' '}
          {members.length === 1 ? 'access row' : 'access rows'}
        </p>
      </div>

      {/* Stated once, near the top, instead of a "reset password" button that
          could not work from the browser. */}
      <p className={`mb-3.5 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
        Email addresses come from each person&apos;s login and can&apos;t be changed here.
        Passwords are self-serve — members reset their own from the sign-in screen.
      </p>

      {isFirstLoad && (
        <Card className="flex justify-center py-10">
          <Spinner label="Loading accounts…" />
        </Card>
      )}

      {!isFirstLoad && error && (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load accounts</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-deep">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mt-4 rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </Card>
      )}

      {!isFirstLoad && !error && groups.length === 0 && (
        <Card>
          <Empty message="Nobody has access yet. Accounts appear here once someone accepts an invite." />
        </Card>
      )}

      {!isFirstLoad && !error && groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const draft = nameEdit[group.key]
            const displayName = group.name ?? 'Unnamed member'

            return (
              <Card key={group.key} data-testid="account-person" className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 border-b border-line px-[14px] py-3">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-[12px] font-extrabold tracking-[.5px] text-white"
                    aria-hidden="true"
                  >
                    {initials(displayName)}
                  </span>

                  <div className="min-w-0 flex-1">
                    {draft ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          aria-label={`Display name for ${displayName}`}
                          value={draft.value}
                          disabled={draft.saving}
                          onChange={(event) =>
                            setNameEdit((prev) => ({
                              ...prev,
                              [group.key]: { ...prev[group.key], value: event.target.value },
                            }))
                          }
                          className="rounded-[8px] border border-line bg-surface-card px-2 py-1 text-[14.5px] font-bold text-ink focus:border-brand focus-visible:outline-none"
                        />
                        <button
                          type="button"
                          disabled={draft.saving}
                          onClick={() => saveName(group)}
                          className="rounded-[8px] bg-brand px-3 py-1.5 text-[13px] font-bold text-white transition hover:bg-brand-deep disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                        >
                          {draft.saving ? 'Saving…' : 'Save name'}
                        </button>
                        <button
                          type="button"
                          disabled={draft.saving}
                          onClick={() =>
                            setNameEdit((prev) => {
                              const next = { ...prev }
                              delete next[group.key]
                              return next
                            })
                          }
                          className="rounded-[8px] px-2 py-1.5 text-[13px] font-bold text-brand transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <span data-testid="account-name" className="text-[15px] font-bold text-ink">
                          {displayName}
                        </span>
                        <button
                          type="button"
                          aria-label={`Edit name for ${displayName}`}
                          onClick={() =>
                            setNameEdit((prev) => ({
                              ...prev,
                              [group.key]: { value: group.name ?? '', saving: false, error: null },
                            }))
                          }
                          className="rounded-[8px] px-2 py-1 text-[13px] font-bold text-brand transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          Edit name
                        </button>
                      </div>
                    )}

                    {/* Read-only on purpose (see the header comment). */}
                    <span data-testid="account-email" className={`mt-0.5 block text-[12.5px] ${MUTED_ON_PAPER}`}>
                      {group.email ?? 'No email on file'}
                    </span>

                    {draft?.error && (
                      <span role="alert" className="mt-1 block text-[12.5px] font-semibold text-brand-deep">
                        {draft.error}
                      </span>
                    )}
                  </div>

                  {group.memberships.length > 1 && (
                    <span className={`text-[12px] font-semibold ${MUTED_ON_PAPER}`}>
                      {group.memberships.length} access rows
                    </span>
                  )}
                </div>

                {group.memberships.map((member) => {
                  const state = rowState[member.id] ?? {}
                  const teamName = member.team_id
                    ? teamsById.get(member.team_id)?.name ?? member.teams?.name ?? null
                    : null
                  const rowLabel = `${displayName} (${teamName ?? 'club-wide'})`
                  const joined = formatJoined(member.created_at)

                  return (
                    <div
                      key={member.id}
                      data-testid="account-membership"
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-[14px] py-2.5 last:border-b-0"
                    >
                      <Badge tone={member.role}>{member.role}</Badge>

                      <select
                        className={INLINE_CONTROL}
                        aria-label={`Role for ${rowLabel}`}
                        value={member.role}
                        disabled={Boolean(state.saving)}
                        onChange={(event) =>
                          saveMembership(member, { role: event.target.value, teamId: member.team_id })
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      {member.role === 'admin' ? (
                        <span className={`px-2 text-[13px] ${MUTED_ON_PAPER}`}>All age groups</span>
                      ) : (
                        <select
                          className={INLINE_CONTROL}
                          aria-label={`Age group for ${rowLabel}`}
                          value={member.team_id ?? ''}
                          disabled={Boolean(state.saving)}
                          onChange={(event) =>
                            saveMembership(member, { role: member.role, teamId: event.target.value })
                          }
                        >
                          <option value="">No age group</option>
                          {sortedTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Linked player (spec §2's column list). A membership
                          points at a players row only for the roles where it
                          means something — a parent's child, or a player's own
                          record — so a null player_id is the NORMAL case for
                          admin and coach rows, not missing data. Hence a plain
                          "—" placeholder rather than a warning: the column has
                          to stay legible at a glance for a club whose admins
                          and coaches will never have one. The name comes from
                          listClubMembers' players(full_name) embed; the raw
                          uuid is never shown, since it would mean nothing to
                          anyone reading this screen. */}
                      <span
                        data-testid="account-linked-player"
                        className={`text-[12.5px] ${MUTED_ON_PAPER}`}
                      >
                        {member.player_id ? (
                          <>
                            <span className="sr-only">Linked player: </span>
                            {member.players?.full_name ?? 'Unknown player'}
                          </>
                        ) : (
                          <>
                            <span className="sr-only">No linked player</span>
                            <span aria-hidden="true">—</span>
                          </>
                        )}
                      </span>

                      {joined && (
                        <span className={`text-[12.5px] ${MUTED_ON_PAPER}`}>Joined {joined}</span>
                      )}

                      <span className="flex-1" />

                      {state.confirming ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-brand-deep">
                            Remove this access?
                          </span>
                          <button
                            type="button"
                            disabled={Boolean(state.saving)}
                            onClick={() => revoke(member)}
                            className="rounded-[8px] bg-brand-deep px-3 py-1.5 text-[13px] font-bold text-white transition hover:bg-brand disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                          >
                            {state.saving ? 'Removing…' : `Yes, revoke ${displayName}`}
                          </button>
                          <button
                            type="button"
                            disabled={Boolean(state.saving)}
                            onClick={() => patchRow(member.id, { confirming: false })}
                            className="rounded-[8px] px-2 py-1.5 text-[13px] font-bold text-brand transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Revoke access for ${rowLabel}`}
                          disabled={Boolean(state.saving)}
                          onClick={() => patchRow(member.id, { confirming: true, error: null })}
                          className="rounded-[8px] px-2 py-1 text-[13px] font-bold text-brand transition hover:bg-surface-mute disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          Revoke access
                        </button>
                      )}

                      {state.error && (
                        <span
                          role="alert"
                          className="basis-full text-[12.5px] font-semibold text-brand-deep"
                        >
                          {state.error}
                        </span>
                      )}
                    </div>
                  )
                })}
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
