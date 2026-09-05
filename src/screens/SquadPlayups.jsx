import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { AccentTitle, BlockTitle, Kicker } from '../components/Editorial.jsx'
import Empty from '../components/Empty.jsx'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import SquadHubNav from '../components/SquadHubNav.jsx'
import { listPlayers } from '../data/players.js'
import { listPlayupRequests, nominateJuniorPlayups, playupSourcePlayers, requestJuniorPlayups } from '../data/playups.js'
import { playupSourceTeams, playupTargetTeams } from '../lib/ageGrade.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { useMemberships } from '../lib/memberships.jsx'
import { PLAYUP_CONSENT_APPROVED, PLAYUP_CONSENT_PENDING } from '../lib/playupConsent.js'
import { canRequestPlayup } from '../lib/scope.js'

// Junior Play-ups — host Request / home Nominate on the Squad Hub pill.
// RPCs are the write gate; this screen matches private.can_request_playup.
export default function SquadPlayups() {
  const { teamId } = useParams()
  const { memberships, teams, loading: membershipsLoading } = useMemberships()
  const team = teams?.find((candidate) => candidate.id === teamId)
  const mayAct = canRequestPlayup(memberships, teamId)

  const sources = useMemo(() => (team ? playupSourceTeams(team, teams ?? []) : []), [team, teams])
  const targets = useMemo(() => (team ? playupTargetTeams(team, teams ?? []) : []), [team, teams])
  const isHost = sources.length > 0
  const isHome = targets.length > 0

  const [younger, setYounger] = useState([])
  const [homePlayers, setHomePlayers] = useState([])
  const [guests, setGuests] = useState([])
  const [openRequests, setOpenRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [picked, setPicked] = useState(null)
  const [targetId, setTargetId] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!teamId || !mayAct || !team) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      const [playerRows, requestRows, sourceLists] = await Promise.all([
        listPlayers({ teamIds: [teamId] }).catch(() => []),
        listPlayupRequests().catch(() => []),
        isHost
          ? Promise.all(
              sources.map(async (source) => {
                const rows = await playupSourcePlayers(source.id, teamId).catch(() => [])
                return rows.map((row) => ({ ...row, home_team: source.name, home_team_id: source.id }))
              }),
            )
          : Promise.resolve([]),
      ])
      if (!mounted) return
      setGuests((playerRows ?? []).filter((p) => p.guest_of === teamId))
      setHomePlayers((playerRows ?? []).filter((p) => !p.guest_of && p.team_id === teamId))
      setOpenRequests(
        (requestRows ?? []).filter((row) => row.guest_team_id === teamId || row.home_team_id === teamId),
      )
      setYounger(sourceLists.flat())
    })()
      .catch((cause) => {
        if (mounted) setError(cause)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [teamId, mayAct, team, isHost, sources, reloadToken])

  if (membershipsLoading) return <Spinner label="Loading…" />
  if (!mayAct) {
    return (
      <Empty message="Only the head coach or age-group manager can request or nominate play-ups." />
    )
  }

  const awaiting = guests.filter((p) => p.playup_consent === PLAYUP_CONSENT_PENDING)
  const approved = guests.filter((p) => p.playup_consent === PLAYUP_CONSENT_APPROVED)
  const nominateMode = picked?.hubMode === 'nominate'
  const requestMode = picked?.hubMode === 'request'

  async function submit() {
    if (!picked) return
    if (nominateMode && !targetId) return
    setBusy(true)
    setError(null)
    try {
      if (requestMode) {
        await requestJuniorPlayups({ playerIds: [picked.player_id], guestTeamId: teamId, note })
      } else {
        await nominateJuniorPlayups({ playerIds: [picked.player_id ?? picked.id], guestTeamId: targetId, note })
      }
      setPicked(null)
      setTargetId(null)
      setNote('')
      setReloadToken((n) => n + 1)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-3.5 mt-1">
        <Kicker>{team?.name ?? 'Squad'} · Squad Hub</Kicker>
        <AccentTitle lead="Play-ups" accent="this squad." />
        <p className="text-[13px] font-medium text-ink-muted">
          {isHost
            ? 'Pick a younger player, add a short note, and request. A super admin still has to agree.'
            : 'Nominate a player up to an older group. A super admin still has to agree.'}
        </p>
      </div>
      <SquadHubNav teamId={teamId} />

      {error && (
        <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, 'That play-up could not be sent.')}
        </p>
      )}
      {loading && <Spinner label="Loading play-ups…" />}

      {!loading && isHost && (
        <section className="mb-4">
          <BlockTitle>Younger players</BlockTitle>
          <Card className="p-0">
            {younger.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">Nobody from a younger group is available to request.</p>
            ) : (
              <ul className="divide-y divide-line">
                {younger.map((row) => (
                  <li key={row.player_id}>
                    <button
                      type="button"
                      className="flex w-full min-h-[44px] items-center justify-between gap-3 px-4 py-2.5 text-left"
                      onClick={() => {
                        setPicked({ ...row, hubMode: 'request' })
                        setTargetId(null)
                        setNote('')
                      }}
                    >
                      <span>
                        <span className="block text-sm font-bold text-ink">{row.full_name}</span>
                        <span className="block text-xs text-ink-muted">{row.home_team}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {!loading && isHome && (
        <section className="mb-4">
          <BlockTitle>Nominate up</BlockTitle>
          <Card className="p-0">
            {homePlayers.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-muted">Nobody on this squad to nominate.</p>
            ) : (
              <ul className="divide-y divide-line">
                {homePlayers.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="flex w-full min-h-[44px] items-center justify-between gap-3 px-4 py-2.5 text-left"
                      onClick={() => {
                        setPicked({ ...row, hubMode: 'nominate' })
                        setTargetId(null)
                        setNote('')
                      }}
                    >
                      <span className="text-sm font-bold text-ink">{row.full_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}

      {!loading && (
        <>
          <section className="mb-4">
            <BlockTitle>Open requests</BlockTitle>
            <Card className="p-0">
              {openRequests.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-muted">None waiting on a super admin.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {openRequests.map((row) => (
                    <li key={row.id} data-testid="playup-open-request" className="px-4 py-2.5 text-sm">
                      <p className="font-bold text-ink">{row.players?.full_name}</p>
                      <p className="text-xs text-ink-muted">
                        {row.home?.name} → {row.guest?.name}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <section className="mb-4">
            <BlockTitle>Awaiting parent</BlockTitle>
            <Card className="p-0">
              {awaiting.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-muted">No pending parent consents on this squad.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {awaiting.map((row) => (
                    <li key={row.id} data-testid="playup-awaiting-parent" className="px-4 py-2.5 text-sm font-bold text-ink">
                      {row.full_name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
          <section className="mb-4">
            <BlockTitle>Approved guests</BlockTitle>
            <Card className="p-0">
              {approved.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-muted">No approved play-up guests yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {approved.map((row) => (
                    <li key={row.id} data-testid="playup-approved-guest" className="px-4 py-2.5 text-sm font-bold text-ink">
                      {row.full_name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </>
      )}

      <Sheet
        open={picked != null}
        onClose={() => !busy && setPicked(null)}
        title={requestMode ? 'Request play-up' : 'Nominate for play-up'}
      >
        <p className="mb-3 text-sm font-bold text-ink">{picked?.full_name}</p>
        {nominateMode && (
          <div className="mb-3 flex flex-wrap gap-2">
            {targets.map((target) => (
              <Button
                key={target.id}
                variant={targetId === target.id ? 'primary' : 'secondary'}
                onClick={() => setTargetId(target.id)}
              >
                {target.name}
              </Button>
            ))}
          </div>
        )}
        <label htmlFor="playup-note" className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
          Note
        </label>
        <textarea
          id="playup-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="mb-3 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink"
        />
        <Button
          disabled={busy || (nominateMode && !targetId)}
          onClick={submit}
        >
          {requestMode ? 'Request' : 'Nominate'}
        </Button>
      </Sheet>
    </div>
  )
}
