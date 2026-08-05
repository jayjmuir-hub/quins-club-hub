import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listContactsForPlayers, listPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import InviteForm from './InviteForm.jsx'

// The Club tab of /admin (admin-dashboard plan, 2026-08-05). Assembled from
// the parts of the old Admin.jsx worth keeping — age groups with player
// counts, the Invite entry point, links to Roster and Schedule — plus the
// one part of the deleted Overview.jsx worth keeping: the per-squad
// missing-contact count ("roster gaps").
//
// ⚠️ NO CLUB-MEMBERS LIST HERE, deliberately. The old /more listed every
// club member read-only while /accounts listed the same rows with write
// controls — the duplication logged in state-of-play.md. The Accounts tab is
// now the ONLY place club members are listed or edited.
//
// Mounted only under AdminDashboard, which has already checked isAdmin() on
// the effective membership set, so this file does not re-gate. Its queries
// are club-wide (listPlayers() with no teamIds): an admin sees every squad,
// and passing an empty array would mean "no teams" and return nothing (see
// src/data/players.js). RLS is what actually decides what comes back.

function SectionTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
      {children}
    </h3>
  )
}

const LINK_CLASS =
  'flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-surface-card px-[15px] py-2.5 text-sm font-bold text-brand shadow-[inset_0_0_0_1.5px_theme(colors.line.DEFAULT)] transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

export default function AdminClub() {
  const { teams } = useMemberships()

  const [players, setPlayers] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  // Whether the invite Sheet is open. A plain boolean: InviteForm has no
  // "edit" mode and no row of its own to carry, only ever the "add" case.
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    listPlayers()
      .then((playerRows) => {
        if (!mounted) return null
        setPlayers(playerRows)
        // Same bulk contact-presence query Overview.jsx used, moved here
        // with it (src/data/players.js listContactsForPlayers) — one query
        // for the whole club rather than one per player.
        return listContactsForPlayers(playerRows.map((player) => player.id))
      })
      .then((contactRows) => {
        if (!mounted || !contactRows) return
        setContacts(contactRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setPlayers([])
        setContacts([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setSettled(true)
      })

    return () => {
      mounted = false
    }
  }, [reloadToken])

  const isFirstLoad = loading && !settled

  const sortedTeams = [...teams].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })

  const playersByTeam = new Map()
  players.forEach((player) => {
    if (!playersByTeam.has(player.team_id)) playersByTeam.set(player.team_id, [])
    playersByTeam.get(player.team_id).push(player)
  })

  // A player "has contact info" if listContactsForPlayers returned a row for
  // them. Anyone not in this set is a gap an admin can close.
  const contactedPlayerIds = new Set(contacts.map((row) => row.player_id))

  if (isFirstLoad) {
    return (
      <Card className="flex justify-center py-10">
        <Spinner label="Loading the club overview…" />
      </Card>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the club overview</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          {error.message || 'Something went wrong. Try again.'}
        </p>
        <button
          type="button"
          onClick={() => setReloadToken((token) => token + 1)}
          className="mx-auto mt-4 w-auto rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </Card>
    )
  }

  return (
    <div>
      <SectionTitle>Manage</SectionTitle>
      <Card className="p-[14px]">
        <div className="flex flex-col gap-2.5 desktop:flex-row">
          <Link to="/roster" className={LINK_CLASS}>
            Manage roster &amp; players
          </Link>
          <Link to="/schedule" className={LINK_CLASS}>
            Manage schedule &amp; fixtures
          </Link>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-brand px-[15px] py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Invite a member
          </button>
        </div>
      </Card>

      <SectionTitle>Age groups ({sortedTeams.length})</SectionTitle>
      {sortedTeams.length === 0 ? (
        <Card>
          <Empty message="No age groups yet." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {sortedTeams.map((team) => {
            const teamPlayers = playersByTeam.get(team.id) ?? []
            const missingContact = teamPlayers.filter(
              (player) => !contactedPlayerIds.has(player.id),
            ).length
            return (
              <div
                key={team.id}
                data-testid={`team-row-${team.id}`}
                className="flex items-center justify-between gap-3 border-b border-line px-[14px] py-[11px] last:border-b-0"
              >
                <span className="text-[15px] font-bold text-ink">{team.name}</span>
                <span className="text-[12.5px] font-semibold text-ink-muted">
                  {teamPlayers.length} {teamPlayers.length === 1 ? 'player' : 'players'}
                  {missingContact > 0 ? ` · ${missingContact} missing contact info` : ''}
                </span>
              </div>
            )
          })}
        </Card>
      )}

      {inviteOpen && <InviteForm onClose={() => setInviteOpen(false)} />}
    </div>
  )
}
