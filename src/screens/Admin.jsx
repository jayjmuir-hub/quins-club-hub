import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Badge from '../components/Badge.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listClubMembers } from '../data/members.js'
import { listPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin, roleLabel } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'

// Admin overview (Task 17, Phase F): a club-wide landing page for admins —
// every team, every player, everyone with a membership row — with entry
// points into managing the roster/schedule and (Task 18) inviting new
// members. Admin-only: a non-admin gets a plain "not authorised" message and
// none of the data below is ever fetched for them (see the early return
// before either query runs).
//
// This screen deliberately does not re-fetch teams: useMemberships() already
// loads every team an admin can see (all 15, via visibleTeams' admin
// special-case) once per session, and re-querying the same table here would
// just be a second network round trip for data already in hand.
//
// Access control is not enforced here — RLS decides what listPlayers() and
// listClubMembers() actually return. isAdmin() only decides whether this
// screen's own UI is shown at all; getting it wrong could hide the screen
// from an admin, but could never show club-wide data to someone RLS would
// refuse it to.

const MUTED_ON_PAPER = 'text-[#5c5854]'

function NotAuthorised() {
  return (
    <section>
      <h2 className="sr-only">Admin</h2>
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-quinsRedDark">Not authorised</h3>
        <p className="mt-2 text-sm leading-relaxed text-quinsRedDark">
          This page is for club admins only. If you think you should have access, ask a
          current admin to check your account.
        </p>
      </Card>
    </section>
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className={`mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] first:mt-0 ${MUTED_ON_PAPER}`}>
      {children}
    </h3>
  )
}

function TeamRow({ team, playerCount }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e6e3e1] px-[14px] py-[11px] last:border-b-0">
      <span className="text-[15px] font-bold text-[#221f1d]">{team.name}</span>
      <span className={`text-[12.5px] font-semibold ${MUTED_ON_PAPER}`}>
        {playerCount} {playerCount === 1 ? 'player' : 'players'}
      </span>
    </div>
  )
}

function MemberRow({ member }) {
  const name = member.profiles?.full_name ?? 'Unnamed member'
  const teamName = member.teams?.name ?? null

  return (
    <div
      data-testid="member-row"
      className="flex items-center gap-3 border-b border-[#e6e3e1] px-[14px] py-[11px] last:border-b-0"
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[image:linear-gradient(135deg,theme(colors.quinsRedDark),theme(colors.quinsRed))] text-[12px] font-extrabold tracking-[.5px] text-white"
        aria-hidden="true"
      >
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span data-testid="member-name" className="text-[14.5px] font-bold text-[#221f1d]">
            {name}
          </span>
          <Badge tone={member.role}>{member.role}</Badge>
        </span>
        {teamName && <span className={`mt-0.5 block text-[12.5px] ${MUTED_ON_PAPER}`}>{teamName}</span>}
      </span>
    </div>
  )
}

export default function Admin() {
  const { memberships, teams } = useMemberships()
  const admin = isAdmin(memberships)

  const [players, setPlayers] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!admin) return undefined

    let mounted = true
    setLoading(true)
    setError(null)

    // No teamIds argument: an admin sees every player club-wide, and passing
    // an empty array here would mean "no teams" and return nothing (see
    // src/data/players.js) — the opposite of what this screen needs.
    Promise.all([listPlayers(), listClubMembers()])
      .then(([playerRows, memberRows]) => {
        if (!mounted) return
        setPlayers(playerRows)
        setMembers(memberRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setPlayers([])
        setMembers([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [admin, reloadToken])

  if (!admin) return <NotAuthorised />

  const isFirstLoad = loading && players.length === 0 && members.length === 0

  const sortedTeams = [...teams].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })

  const playerCountByTeam = new Map()
  players.forEach((player) => {
    playerCountByTeam.set(player.team_id, (playerCountByTeam.get(player.team_id) ?? 0) + 1)
  })

  const sortedMembers = [...members].sort((a, b) => {
    const nameA = a.profiles?.full_name ?? ''
    const nameB = b.profiles?.full_name ?? ''
    return nameA.localeCompare(nameB)
  })

  return (
    <section>
      <div className="mb-3.5 mt-1">
        <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-[#221f1d]">Admin overview</h2>
        <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>
          {roleLabel(memberships)} · {teams.length} age groups · {players.length} players ·{' '}
          {members.length} {members.length === 1 ? 'member' : 'members'}
        </p>
      </div>

      {isFirstLoad && (
        <Card className="flex justify-center py-10">
          <Spinner label="Loading the admin overview…" />
        </Card>
      )}

      {!isFirstLoad && error && (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-quinsRedDark">We couldn&apos;t load the overview</h3>
          <p className="mt-2 text-sm leading-relaxed text-quinsRedDark">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mt-4 rounded-[11px] bg-quinsRed px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#D62A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </Card>
      )}

      {!isFirstLoad && !error && (
        <>
          {/* Manage actions: these are real, functional entry points — not
              placeholders — because Roster and Schedule already own the
              actual add/edit/delete flows for players and events. There is
              no separate "manage" screen to build for Task 17; the useful
              thing this overview can do is point an admin straight at them.
              An "Invite a member" entry point is deliberately absent rather
              than a disabled or dead stub: Task 18 owns that flow and it does
              not exist yet, and Roster.jsx / Dashboard.jsx already settled
              this exact question for events/players — a control that
              promises something not yet built is worse than no control. */}
          <SectionTitle>Manage</SectionTitle>
          <Card className="p-[14px]">
            <div className="flex flex-col gap-2.5 desktop:flex-row">
              <Link
                to="/roster"
                className="flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-white px-[15px] py-2.5 text-sm font-bold text-quinsRed shadow-[inset_0_0_0_1.5px_#e6e3e1] transition hover:bg-[#faf8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
              >
                Manage roster &amp; players
              </Link>
              <Link
                to="/schedule"
                className="flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-white px-[15px] py-2.5 text-sm font-bold text-quinsRed shadow-[inset_0_0_0_1.5px_#e6e3e1] transition hover:bg-[#faf8fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
              >
                Manage schedule &amp; fixtures
              </Link>
            </div>
          </Card>

          <SectionTitle>Age groups ({sortedTeams.length})</SectionTitle>
          {sortedTeams.length === 0 ? (
            <Card>
              <Empty message="No age groups yet." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {sortedTeams.map((team) => (
                <TeamRow key={team.id} team={team} playerCount={playerCountByTeam.get(team.id) ?? 0} />
              ))}
            </Card>
          )}

          <SectionTitle>Club members ({sortedMembers.length})</SectionTitle>
          {sortedMembers.length === 0 ? (
            <Card>
              <Empty message="No club members yet. They show here once someone accepts an invite." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {sortedMembers.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </Card>
          )}
        </>
      )}
    </section>
  )
}
