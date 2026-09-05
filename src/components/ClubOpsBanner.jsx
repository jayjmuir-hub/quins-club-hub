import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from './Card.jsx'
import { listPlayupRequests } from '../data/playups.js'
import { listPlayers } from '../data/players.js'
import { buildPlayupOpsItems, openPlayupOpsItems } from '../lib/clubOps.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canSeeClubOps, clubOpsTeamIds } from '../lib/scope.js'
import { PLAYUP_CONSENT_PENDING } from '../lib/playupConsent.js'

// Home Club Ops peek (hybrid C). Play-up rows first; access/pitch later.

function teamName(teams, id) {
  return (teams ?? []).find((row) => row.id === id)?.name ?? ''
}

export default function ClubOpsBanner() {
  const { memberships, teams } = useMemberships()
  const allowed = canSeeClubOps(memberships)
  const teamIds = useMemo(() => clubOpsTeamIds(memberships, teams), [memberships, teams])
  const [requests, setRequests] = useState([])
  const [guests, setGuests] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!allowed) {
      setReady(true)
      return undefined
    }
    let mounted = true
    Promise.all([
      listPlayupRequests({ statuses: ['requested'] }),
      teamIds.length ? listPlayers({ teamIds }).catch(() => []) : Promise.resolve([]),
    ])
      .then(([requestRows, playerRows]) => {
        if (!mounted) return
        setRequests(requestRows ?? [])
        setGuests(
          (playerRows ?? [])
            .filter((p) => p.guest_of && p.playup_consent === PLAYUP_CONSENT_PENDING)
            .map((p) => ({
              ...p,
              home_team_name: teamName(teams, p.team_id),
              guest_team_name: teamName(teams, p.guest_of),
            })),
        )
      })
      .catch(() => {
        if (!mounted) return
        setRequests([])
        setGuests([])
      })
      .finally(() => {
        if (mounted) setReady(true)
      })
    return () => {
      mounted = false
    }
  }, [allowed, teamIds, teams])

  const open = useMemo(
    () => openPlayupOpsItems(buildPlayupOpsItems({ requests, pendingGuests: guests })),
    [requests, guests],
  )

  if (!allowed || !ready || open.length === 0) return null

  const peek = open.slice(0, 3)
  const count = open.length

  return (
    <Card data-testid="club-ops-banner" className="mb-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold text-ink">
          Club Ops · {count} open
        </p>
        <Link
          to="/ops"
          className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline"
        >
          See all
        </Link>
      </div>
      <ul className="mt-3 space-y-1.5">
        {peek.map((item) => (
          <li key={item.id} className="text-sm text-ink">
            <span className="font-semibold">{item.playerName}</span>
            <span className="text-ink-muted">
              {' '}
              {item.homeTeamName} → {item.guestTeamName}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
