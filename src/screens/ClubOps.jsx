import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { decidePlayupRequest, listPlayupRequests } from '../data/playups.js'
import { listPlayers } from '../data/players.js'
import {
  buildPlayupOpsItems,
  donePlayupOpsItems,
  openPlayupOpsItems,
  PLAYUP_BOARD_AWAITING_PARENT,
  PLAYUP_BOARD_REQUESTED,
} from '../lib/clubOps.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canSeeClubOps, clubOpsTeamIds, isSuperAdmin } from '../lib/scope.js'
import { PLAYUP_CONSENT_PENDING } from '../lib/playupConsent.js'

const PLAYUP_STATUSES = ['requested', 'approved', 'declined']

function teamName(teams, id) {
  return (teams ?? []).find((row) => row.id === id)?.name ?? ''
}

function pendingGuestsFromPlayers(players, teams) {
  return (players ?? [])
    .filter((p) => p.guest_of && p.playup_consent === PLAYUP_CONSENT_PENDING)
    .map((p) => ({
      ...p,
      home_team_name: teamName(teams, p.team_id),
      guest_team_name: teamName(teams, p.guest_of),
    }))
}

function boardLabel(board) {
  if (board === PLAYUP_BOARD_REQUESTED) return 'Requested'
  if (board === PLAYUP_BOARD_AWAITING_PARENT) return 'Awaiting parent'
  if (board === 'approved') return 'Approved'
  if (board === 'declined') return 'Declined'
  return board
}

function PlayupOpsCard({ item, superAdmin, busy, note, onNote, onDecide }) {
  const canDecide = superAdmin && item.board === PLAYUP_BOARD_REQUESTED && item.requestId
  return (
    <Card
      className="flex flex-col gap-2 p-4 desktop:flex-row desktop:items-center desktop:gap-4 desktop:py-2.5"
      data-testid="ops-playup-row"
      data-board={item.board}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{item.playerName}</p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {item.homeTeamName} → {item.guestTeamName}
          {item.kind === 'home_nominate' ? ' · Nominated' : item.kind === 'host_request' ? ' · Requested' : ''}
          {' · '}
          {boardLabel(item.board)}
        </p>
        {item.note && <p className="mt-2 text-sm text-ink desktop:mt-1">{item.note}</p>}
      </div>
      <div className="flex shrink-0 flex-col gap-2 desktop:w-[280px]">
        {canDecide && (
          <label className="block text-sm">
            <span className="mb-1 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
              Note to the requester
            </span>
            <textarea
              aria-label="Note to the requester"
              value={note}
              onChange={(e) => onNote(e.target.value)}
              rows={2}
              className="w-full rounded-[10px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink"
            />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          {canDecide && (
            <>
              <Button size="sm" disabled={busy} onClick={() => onDecide(item.requestId, true)}>
                Approve
              </Button>
              <Button
                size="sm"
                variant="dangerQuiet"
                disabled={busy}
                onClick={() => onDecide(item.requestId, false)}
              >
                Decline
              </Button>
            </>
          )}
          <Link
            to={item.viewTo}
            className="inline-flex h-9 items-center rounded-[11px] px-3 text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline"
          >
            View
          </Link>
        </div>
      </div>
    </Card>
  )
}

export default function ClubOps() {
  const { memberships, teams } = useMemberships()
  const allowed = canSeeClubOps(memberships)
  const superAdmin = isSuperAdmin(memberships)
  const teamIds = useMemo(() => clubOpsTeamIds(memberships, teams), [memberships, teams])
  const [filter, setFilter] = useState('open')
  const [rows, setRows] = useState([])
  const [guests, setGuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [notes, setNotes] = useState({})
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!allowed) {
      setLoading(false)
      setRows([])
      setGuests([])
      return undefined
    }
    let mounted = true
    setLoading(true)
    Promise.all([
      listPlayupRequests({ statuses: PLAYUP_STATUSES }),
      teamIds.length ? listPlayers({ teamIds }).catch(() => []) : Promise.resolve([]),
    ])
      .then(([requestRows, playerRows]) => {
        if (!mounted) return
        setRows(requestRows ?? [])
        setGuests(pendingGuestsFromPlayers(playerRows, teams))
      })
      .catch((err) => mounted && setError(err))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [allowed, reloadToken, teamIds, teams])

  const items = useMemo(
    () => buildPlayupOpsItems({ requests: rows, pendingGuests: guests }),
    [rows, guests],
  )
  const visible = filter === 'done' ? donePlayupOpsItems(items) : openPlayupOpsItems(items)

  async function decide(id, yes) {
    setBusyId(id)
    setError(null)
    try {
      await decidePlayupRequest(id, yes, notes[id] ?? '')
      setReloadToken((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusyId(null)
    }
  }

  if (!allowed) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-danger-ink">Not authorised</h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
          Club Ops is for a super admin, or the head coach or age-group manager
          of a squad.
        </p>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading Club Ops…" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="mb-1 text-lg font-extrabold text-ink">Club Ops</h2>
      <p className="mb-4 text-sm text-ink-muted">
        Play-up decisions first. Access and pitch queues will sit here later.
      </p>
      <div role="tablist" aria-label="Club Ops filters" className="mb-4 flex gap-2">
        {['open', 'done'].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={[
              'rounded-pill px-3 py-1.5 text-[13px] font-bold capitalize',
              filter === key ? 'bg-brand text-white' : 'bg-surface-mute text-ink-muted',
            ].join(' ')}
          >
            {key === 'open' ? 'Open' : 'Done'}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-3 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, 'Those requests could not be updated.')}
        </p>
      )}
      {visible.length === 0 ? (
        <Card>
          <Empty message={filter === 'done' ? 'Nothing in Done yet.' : 'No open play-up items.'} />
        </Card>
      ) : (
        <ul className="space-y-3 desktop:space-y-2">
          {visible.map((item) => (
            <li key={item.id}>
              <PlayupOpsCard
                item={item}
                superAdmin={superAdmin}
                busy={busyId === item.requestId}
                note={notes[item.requestId] ?? ''}
                onNote={(value) => setNotes((prev) => ({ ...prev, [item.requestId]: value }))}
                onDecide={decide}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
