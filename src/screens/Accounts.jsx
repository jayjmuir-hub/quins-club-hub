import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AccessBuilder from '../components/AccessBuilder.jsx'
import Badge from '../components/Badge.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  deleteMembership,
  grantMemberships,
  listClubMembers,
  listPendingProfiles,
  updateMembershipRole,
  updateProfileName,
} from '../data/members.js'
import { listPlayers } from '../data/players.js'
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

// "Waiting for access" (plan 2026-08-03 §Task B). Signing up with a magic
// link creates an auth user and a profiles row but NO membership, and every
// other list on this screen is a list of memberships — so before this section
// existed a self-signed-up person was invisible to admins.
//
// Two things about this section are deliberate and easy to undo by accident:
//
//   1. listPendingProfiles() does NOT return only pending profiles. It
//      returns every profile the caller can read, which for an admin is the
//      union of three RLS policies: their own row, everyone with a membership
//      in their club, and everyone anywhere with zero memberships. The
//      subtraction below (against the profile_ids in the member list) is what
//      makes this the pending set. Drop it and every existing member reappears
//      here as if they were waiting.
//   2. There is no reject/dismiss control, on purpose. Nobody has asked for
//      anything — there is nothing to reject — and leaving a stranger with no
//      membership is already the correct outcome: they read zero rows from
//      every table. Deleting the underlying auth user needs the service-role
//      key, which never touches this frontend. The UI says that instead of
//      offering a button that could not do it.
//
// Choosing WHAT access to give is src/components/AccessBuilder.jsx's job, not
// this file's: a person's access is a set of rows (a parent of two children,
// a coach of two squads, a coach who is also a parent), and the same builder
// is used both here and on each existing person's block below.
const NO_CLUB_KNOWN =
  "We couldn't work out which club to add them to. Reload the page and try again."

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
  // Every profile the admin can read (see the "Waiting for access" block
  // above) —
  // NOT the pending set. `waiting` below is the pending set.
  const [profiles, setProfiles] = useState([])
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
  // Per-grant-form state, keyed by profile id for a waiting person and by
  // `add:<profile id>` for the "Add access" builder on an existing person:
  // whether the insert is in flight, and the last refusal. WHAT is being
  // granted lives inside AccessBuilder — the screen only learns it on submit.
  const [grantState, setGrantState] = useState({})
  // Which existing people have their "Add access" builder open.
  const [adding, setAdding] = useState({})

  // The roster, loaded ONCE and only when a builder actually needs it (a
  // parent's children or a player's own record). ~315 rows that most grants
  // never look at, so loading it with the member list would put a third query
  // on every visit to this screen to serve a minority of them. listPlayers()
  // with no teamIds is deliberate: an admin picking a child needs the whole
  // club, not the teams they happen to be scoped to, and RLS is what narrows
  // it for anyone else.
  const [players, setPlayers] = useState([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [playersError, setPlayersError] = useState(null)
  const playersRequested = useRef(false)

  // Stable across renders: AccessBuilder calls this from an effect, so a new
  // identity every render would re-fire it every render.
  const loadPlayers = useCallback(() => {
    if (playersRequested.current) return
    playersRequested.current = true
    setPlayersLoading(true)
    listPlayers()
      .then((rows) => {
        setPlayers(rows)
        setPlayersError(null)
      })
      .catch((err) => {
        setPlayersError(err)
        // Re-loadable: a failed roster read must not permanently disable the
        // child picker for the rest of the session.
        playersRequested.current = false
      })
      .finally(() => setPlayersLoading(false))
  }, [])

  useEffect(() => {
    // A non-admin issues no query at all — same shape as Admin.jsx's effect.
    if (!admin) return undefined

    let mounted = true
    setLoading(true)
    setError(null)

    // allSettled, not all: the member list is the screen, the profile list is
    // one section of it. A failed profiles read must not blank the accounts an
    // admin came here to manage — it just costs the "waiting for access"
    // section, which then correctly shows nobody rather than a wrong list. The
    // reverse is not true: without the member list there is nothing to
    // subtract, so a failed member read hides the waiting section entirely
    // (handled at the render site) rather than showing every member as
    // "waiting".
    Promise.allSettled([listClubMembers(), listPendingProfiles()])
      .then(([membersResult, profilesResult]) => {
        if (!mounted) return
        if (membersResult.status === 'fulfilled') {
          setMembers(membersResult.value)
        } else {
          setError(membersResult.reason)
          setMembers([])
        }
        setProfiles(profilesResult.status === 'fulfilled' ? profilesResult.value : [])
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

  // The club to grant into. There is no club context in this app — every
  // screen that needs a club id digs it out of data it already holds
  // (InviteForm reads teams[0]?.club_id, PlayerImport reads it off the
  // caller's own memberships). Both are read here, memberships first: the
  // admin's own membership row names the club they actually administer,
  // whereas teams[0] is only right because this database has exactly one
  // club. It is opportunistic either way — see the report note.
  const clubId = useMemo(
    () =>
      memberships.find((row) => row.club_id)?.club_id ??
      teams.find((team) => team.club_id)?.club_id ??
      null,
    [memberships, teams],
  )

  if (!admin) return <NotAuthorised />

  const groups = groupByProfile(members)
  const isFirstLoad = loading && members.length === 0

  // THE subtraction. listPendingProfiles() returns everyone the admin can
  // read; only the ids with no membership row are actually waiting. The
  // caller's own id is excluded belt-and-braces — an admin always has a
  // membership, so the first filter already removes them, but not if the
  // member list came back short.
  const memberProfileIds = new Set(members.map((member) => member.profile_id).filter(Boolean))
  const waiting = profiles.filter(
    (profile) => !memberProfileIds.has(profile.id) && profile.id !== user?.id,
  )

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

  function patchGrant(profileId, patch) {
    setGrantState((prev) => ({ ...prev, [profileId]: { ...prev[profileId], ...patch } }))
  }

  /**
   * Rebuilds the embeds listClubMembers would have supplied for a freshly
   * inserted membership row, so a new row renders identically to every other
   * one without re-querying. The profile, the team and (for a parent/player
   * row) the linked player are all already in hand.
   */
  function decorate(row, profileEmbed) {
    return {
      ...row,
      profiles: profileEmbed,
      teams: row.team_id ? teamsById.get(row.team_id) ?? null : null,
      players: row.player_id
        ? { full_name: players.find((player) => player.id === row.player_id)?.full_name ?? null }
        : null,
    }
  }

  /**
   * Saves a set of access rows for one person, in ONE call — a parent of two
   * children is two rows and must be two rows, not two round trips that can
   * half-fail. grantMemberships validates the whole array before touching the
   * network, so one bad row means nothing is written.
   *
   * `key` scopes the in-flight/error state: a waiting person's builder is
   * keyed by their profile id, an existing person's "Add access" builder by
   * `add:<profile id>`, so the two can never overwrite each other's message.
   */
  async function saveAccess({ key, profileId, clubId: rowClubId, rows, profileEmbed, onDone }) {
    const club = rowClubId ?? clubId
    if (!club) {
      patchGrant(key, { error: NO_CLUB_KNOWN })
      return
    }

    patchGrant(key, { saving: true, error: null })
    try {
      const created = await grantMemberships(
        rows.map((row) => ({
          profileId,
          clubId: club,
          role: row.role,
          teamId: row.teamId ?? null,
          playerId: row.playerId ?? null,
        })),
      )

      setMembers((prev) => [...prev, ...created.map((row) => decorate(row, profileEmbed))])
      setGrantState((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      onDone?.()
    } catch (err) {
      patchGrant(key, {
        saving: false,
        error: err?.message || "We couldn't give that person access.",
      })
    }
  }

  // A waiting person: the new rows move them out of the waiting list and into
  // the main one in place. A blank full_name becomes null, not '', because the
  // list falls back on nullish only — an empty string would render as a
  // nameless block that looks like a bug.
  function grant(profile, rows) {
    return saveAccess({
      key: profile.id,
      profileId: profile.id,
      rows,
      profileEmbed: {
        full_name: profile.full_name?.trim() ? profile.full_name : null,
        email: profile.email ?? null,
      },
      onDone: () => setProfiles((prev) => prev.filter((row) => row.id !== profile.id)),
    })
  }

  // An existing person: their club id comes off a row they already hold, which
  // is better evidence than the screen-wide guess.
  function addAccess(group, rows) {
    return saveAccess({
      key: `add:${group.key}`,
      profileId: group.profileId,
      clubId: group.memberships.find((member) => member.club_id)?.club_id ?? null,
      rows,
      profileEmbed: { full_name: group.name, email: group.email },
      onDone: () =>
        setAdding((prev) => {
          const next = { ...prev }
          delete next[group.key]
          return next
        }),
    })
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

      {/* Hidden while the member list is missing: without it there is nothing
          to subtract, and every existing member would show up as "waiting". */}
      {!isFirstLoad && !error && (
        <section data-testid="waiting-for-access" className="mb-5">
          <h3 className="text-[16px] font-extrabold tracking-[-0.2px] text-ink">
            Waiting for access
          </h3>
          <p className={`mt-1 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
            Anyone can create a login with their email address, but they see nothing at all in
            the app until an admin gives them access. These people have signed up and have no
            access yet — they haven&apos;t asked for anything, and nothing is waiting on you
            unless you recognise them.
          </p>

          {waiting.length === 0 ? (
            <Card className="mt-2.5">
              <Empty message="Nobody is waiting for access. Anyone who signs up without an invite will appear here." />
            </Card>
          ) : (
            <>
              <div className="mt-2.5 flex flex-col gap-3">
                {waiting.map((profile) => {
                  const state = grantState[profile.id] ?? {}
                  const displayName = profile.full_name?.trim() || 'No name yet'
                  const label = profile.email || displayName
                  const signedUp = formatJoined(profile.created_at)

                  return (
                    <Card
                      key={profile.id}
                      data-testid="waiting-person"
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-[14px] py-3"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-surface-mute text-[12px] font-extrabold tracking-[.5px] text-ink-muted"
                        aria-hidden="true"
                      >
                        {initials(profile.full_name?.trim() || profile.email || '?')}
                      </span>

                      <div className="min-w-0">
                        <span className="block text-[15px] font-bold text-ink">{displayName}</span>
                        <span className={`block text-[12.5px] ${MUTED_ON_PAPER}`}>
                          {profile.email ?? 'No email on file'}
                          {signedUp ? ` · signed up ${signedUp}` : ''}
                        </span>
                      </div>

                      <span className="flex-1" />

                      {/* One builder per waiting person. A person waiting for
                          access can legitimately need several rows on the way
                          in — a parent of two children is the ordinary case,
                          not an edge one — so this is the same component the
                          existing-person blocks use, with no existing rows to
                          guard against. */}
                      <AccessBuilder
                        label={label}
                        teams={sortedTeams}
                        players={players}
                        playersLoading={playersLoading}
                        playersError={playersError}
                        onNeedPlayers={loadPlayers}
                        saving={Boolean(state.saving)}
                        error={state.error}
                        submitLabel="Give access"
                        onSubmit={(rows) => grant(profile, rows)}
                      />
                    </Card>
                  )
                })}
              </div>

              {/* Said rather than offered as a control — see the comment on
                  the "Waiting for access" block at the top of this file. */}
              <p className={`mt-2 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
                There&apos;s nothing to turn down here. If you don&apos;t recognise someone,
                leave them alone — with no access they can already see nothing, and they stay on
                this list. Closing an account itself isn&apos;t something this screen can do.
              </p>
            </>
          )}
        </section>
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

                  {/* THE control this whole change exists for. Without it,
                      giving a parent a second child's age group — or giving a
                      coach a parent row for their own kid — means revoking
                      what they have and granting it again from scratch.
                      Hidden for a group with no profile id: a row whose join
                      came back partial has nobody to add access for. */}
                  {group.profileId && !adding[group.key] && (
                    <button
                      type="button"
                      aria-label={`Add access for ${displayName}`}
                      onClick={() => setAdding((prev) => ({ ...prev, [group.key]: true }))}
                      className="rounded-[8px] px-2 py-1 text-[13px] font-bold text-brand transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      Add access
                    </button>
                  )}
                </div>

                {adding[group.key] && (
                  <div
                    data-testid="add-access"
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-mute px-[14px] py-2.5"
                  >
                    {/* `existing` is what makes the duplicate guard possible:
                        the rows this person already holds. The database has no
                        unique constraint to fall back on. */}
                    <AccessBuilder
                      label={displayName}
                      teams={sortedTeams}
                      players={players}
                      playersLoading={playersLoading}
                      playersError={playersError}
                      onNeedPlayers={loadPlayers}
                      existing={group.memberships}
                      saving={Boolean(grantState[`add:${group.key}`]?.saving)}
                      error={grantState[`add:${group.key}`]?.error}
                      submitLabel="Add access"
                      onSubmit={(rows) => addAccess(group, rows)}
                      onCancel={() =>
                        setAdding((prev) => {
                          const next = { ...prev }
                          delete next[group.key]
                          return next
                        })
                      }
                    />
                  </div>
                )}

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
