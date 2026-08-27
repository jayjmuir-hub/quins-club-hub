import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import Empty from '../components/Empty.jsx'
import SessionPlan from '../components/SessionPlan.jsx'
import TrainingDateStrip from '../components/TrainingDateStrip.jsx'
import TrainingShelf from '../components/TrainingShelf.jsx'
import { Sheet } from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import { listEvents } from '../data/events.js'
import { listSessionsForEvents } from '../data/trainingPlans.js'
import { clubToday, eventDate, eventTimeLabel, eventTitle } from '../lib/eventFormat.js'
import { defaultEventWindow } from '../lib/eventWindow.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam } from '../lib/scope.js'
import { resolveSelectedNight, trainingNightsInWindow } from '../lib/trainingDates.js'

// Training Plans, squad-level — the coach-facing READ of what the performance
// director published (option b of the 22 Aug ideas list). Until now a plan was
// only visible one event at a time, inside EventDetail's sheet; this page
// answers "what are my next sessions running" in one place. Opening a row
// shows the SAME SessionPlan component EventDetail uses — including a coach's
// adjust-and-save — so there is exactly one renderer of a session plan.
//
// ⚠️ THE GATE IS "NOT YOUR SQUAD", NOT SECURITY — same ruling as SquadHub and
// the match-roster picker. RLS on events and training_sessions decides the
// data; parents already read tonight's plan through EventDetail.

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

export default function SquadTraining() {
  const { teamId } = useParams()
  const { memberships, teams, loading: membershipsLoading } = useMemberships()

  const [sessions, setSessions] = useState([])
  const [nights, setNights] = useState([])
  const [plansByEvent, setPlansByEvent] = useState(() => new Map())
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [shelfNight, setShelfNight] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [planReload, setPlanReload] = useState(0)

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
      const { from, to } = defaultEventWindow(clubToday())
      const eventRows = await listEvents({ teamIds: [teamId], from, to })
      if (!mounted) return
      const now = Date.now()
      const trainingRows = eventRows
        .filter((event) => event.type === 'training' && eventDate(event))
        .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      const upcomingTraining = trainingRows.filter((event) => eventDate(event).getTime() >= now)
      const windowNights = trainingNightsInWindow(trainingRows, new Date(now))
      // A failed plan read costs the badges, never the session list — the
      // same degradation the match-roster picker gives its lineup badge.
      const planIds = [...new Set([...upcomingTraining, ...windowNights].map((event) => event.id))]
      const plans = await listSessionsForEvents(planIds).catch(() => new Map())
      if (!mounted) return
      setSessions(upcomingTraining)
      setNights(windowNights)
      setPlansByEvent(plans)
      setShelfNight((previous) => resolveSelectedNight(windowNights, previous, new Date(now)))
    })().catch((cause) => {
      if (mounted) setError(cause)
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [teamId, mayView, planReload])

  if (membershipsLoading) return <Spinner label="Loading…" />
  if (!mayView) {
    return <Empty message="This isn't one of your squads. The Squad Hub shows a squad to the staff who run it." />
  }

  const selectedPlan = selectedEvent ? plansByEvent.get(selectedEvent.id) : null

  return (
    <div>
      <div className="mb-3.5 mt-1">
        <Kicker>{team?.name ?? 'Squad'} · Squad Hub</Kicker>
        <AccentTitle lead="Training" accent="plans." />
        <p className="text-[13px] font-medium text-ink-muted">
          What each upcoming session runs. Open one to read or adjust it.{' '}
          <Link to={`/squad/${teamId}`} className="font-bold text-brand-ink underline-offset-2 hover:underline">
            Back to the hub
          </Link>
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-danger-ink">
          Something went wrong loading the sessions. Try again shortly.
        </p>
      )}
      {loading && <Spinner label="Loading sessions…" />}

      {!loading && mayView && (
        <>
          <TrainingDateStrip
            nights={nights}
            selected={shelfNight}
            plansByEvent={plansByEvent}
            onSelect={setShelfNight}
          />
          <TrainingShelf
            team={team}
            tonight={shelfNight}
            onOpenTonight={setSelectedEvent}
            onApplied={() => setPlanReload((n) => n + 1)}
          />
        </>
      )}

      {!loading && !error && sessions.length === 0 && (
        <Card>
          <Empty message="No upcoming training on the calendar for this squad. Plans hang off sessions — add training to the schedule first." />
        </Card>
      )}

      {!loading && !error && sessions.length > 0 && (
        <Card className="p-4">
          <ul className="flex flex-col divide-y divide-line/60" data-testid="squad-training-list">
            {sessions.map((event) => {
              const plan = plansByEvent.get(event.id)
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedEvent(event)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[9px] px-1 py-2.5 text-left hover:bg-surface-mute"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{eventTitle(event)}</span>
                      <span className="block text-[12.5px] font-medium text-ink-muted">
                        {shortDate(event)} · {eventTimeLabel(event)}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-bold">
                      {plan ? (
                        <span className="text-accent-ink">
                          Planned · {plan.blockCount} {plan.blockCount === 1 ? 'block' : 'blocks'} · {plan.minutes} min
                        </span>
                      ) : (
                        <span className="text-ink-muted">No plan yet</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {selectedEvent && (
        <Sheet open onClose={() => setSelectedEvent(null)} title={eventTitle(selectedEvent)}>
          <p className="mb-3 text-[13px] font-medium text-ink-muted">
            {shortDate(selectedEvent)} · {eventTimeLabel(selectedEvent)}
          </p>
          {/* SessionPlan renders nothing at all when there is no session AND
              no focus theme for the fortnight — this line is what the coach
              reads instead of an empty sheet. */}
          {!selectedPlan && (
            <p className="mb-3 text-[13px] font-medium text-ink-muted">
              No plan published for this session yet — plans appear here when one is published to
              this squad.
            </p>
          )}
          <SessionPlan event={selectedEvent} team={team} canEdit={mayView} />
        </Sheet>
      )}
    </div>
  )
}
