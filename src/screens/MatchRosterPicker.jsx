import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAvailabilityForEvents } from '../data/availability.js'
import { listEvents } from '../data/events.js'
import { listLineupCounts } from '../data/lineups.js'
import { clubToday, eventDate, eventTimeLabel, eventTitle } from '../lib/eventFormat.js'
import { defaultEventWindow } from '../lib/eventWindow.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam } from '../lib/scope.js'

// Build a Match Roster — the picker, not the builder. The builder is the
// existing Lineup screen (/lineup/:eventId); until now it was only reachable
// through a match's EventDetail sheet, which made the feature invisible. This
// page lists the squad's upcoming matches with the two facts a coach wants
// before picking a team — how many have replied, and whether a lineup is
// already started — and every row lands in Lineup.
//
// ⚠️ THE GATE IS "NOT YOUR SQUAD", NOT SECURITY — same ruling as SquadHub and
// every role dashboard (claude/decisions/2026-08-10-role-dashboards.md). RLS
// on events, availability and lineups decides what actually comes back.

function shortDate(event) {
  const date = eventDate(event)
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'Asia/Dubai',
  })
}

export default function MatchRosterPicker() {
  const { teamId } = useParams()
  const { memberships, teams, loading: membershipsLoading } = useMemberships()

  const [matches, setMatches] = useState([])
  const [rsvpByEvent, setRsvpByEvent] = useState(() => new Map())
  const [lineupCounts, setLineupCounts] = useState(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const team = teams?.find((candidate) => candidate.id === teamId)
  const mayView = canEditTeam(memberships, teamId)

  useEffect(() => {
    if (!teamId || !mayView) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      // The same rolling window every calendar surface uses; only its future
      // half matters here — a roster is built for a match not yet played.
      const { from, to } = defaultEventWindow(clubToday())
      const eventRows = await listEvents({ teamIds: [teamId], from, to })
      if (!mounted) return
      const now = Date.now()
      const upcomingMatches = eventRows
        .filter((event) => {
          if (event.type !== 'match') return false
          const date = eventDate(event)
          return date && date.getTime() >= now
        })
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      const matchIds = upcomingMatches.map((event) => event.id)
      const [availabilityRows, counts] = await Promise.all([
        listAvailabilityForEvents(matchIds),
        // A missing badge must not take the page with it — the list of
        // matches is the job, "already started" is decoration on top.
        listLineupCounts(matchIds).catch(() => new Map()),
      ])
      if (!mounted) return
      const tallies = new Map()
      for (const row of availabilityRows) {
        const tally = tallies.get(row.event_id) ?? { in: 0, maybe: 0, out: 0 }
        if (tally[row.status] !== undefined) tally[row.status] += 1
        tallies.set(row.event_id, tally)
      }
      setMatches(upcomingMatches)
      setRsvpByEvent(tallies)
      setLineupCounts(counts)
    })().catch((cause) => {
      if (mounted) setError(cause)
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [teamId, mayView])

  if (membershipsLoading) return <Spinner label="Loading…" />
  if (!mayView) {
    return <Empty message="This isn't one of your squads. The Squad Hub shows a squad to the staff who run it." />
  }

  return (
    <div>
      <div className="mb-3.5 mt-1">
        <Kicker>{team?.name ?? 'Squad'} · Squad Hub</Kicker>
        <AccentTitle lead="Build a" accent="match roster." />
        <p className="text-[13px] font-medium text-ink-muted">
          Pick the fixture, then choose the team on the next screen.{' '}
          <Link to={`/squad/${teamId}`} className="font-bold text-brand-ink underline-offset-2 hover:underline">
            Back to the hub
          </Link>
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-danger-ink">
          Something went wrong loading the fixtures. Try again shortly.
        </p>
      )}
      {loading && <Spinner label="Loading fixtures…" />}

      {!loading && !error && matches.length === 0 && (
        <Card>
          <Empty message="No upcoming matches on the calendar for this squad. Rosters are built per fixture — add the match to the schedule first." />
        </Card>
      )}

      {!loading && !error && matches.length > 0 && (
        <Card className="p-4">
          <ul className="flex flex-col divide-y divide-line/60" data-testid="match-roster-picker">
            {matches.map((event) => {
              const tally = rsvpByEvent.get(event.id)
              const replies = tally ? tally.in + tally.maybe + tally.out : 0
              const started = (lineupCounts.get(event.id) ?? 0) > 0
              return (
                <li key={event.id}>
                  <Link
                    to={`/lineup/${event.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[9px] px-1 py-2.5 hover:bg-surface-mute"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{eventTitle(event)}</span>
                      <span className="block text-[12.5px] font-medium text-ink-muted">
                        {shortDate(event)} · {eventTimeLabel(event)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-[12.5px] font-bold">
                      {replies === 0 ? (
                        <span className="text-ink-muted">No replies yet</span>
                      ) : (
                        <span>
                          <span className="text-accent-ink">{tally.in} in</span>
                          <span className="text-ink-muted"> · {tally.maybe} maybe · {tally.out} out</span>
                        </span>
                      )}
                      {started && (
                        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-bold uppercase tracking-[.4px] text-ink-muted">
                          Lineup started
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
