import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Button from '../components/Button.jsx'
import Spinner from '../components/Spinner.jsx'
import { listEvents } from '../data/events.js'
import { listPitches, findPitchClashes, PITCH_TBD } from '../data/pitches.js'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight, visibleTeams } from '../lib/scope.js'
import { clubToday, eventDate, eventEndDate, eventTitle, formatTime } from '../lib/eventFormat.js'

// The allocation grid — pitches down the side, the day across the top.
//
// Jay picked this ("option C") from three layouts drawn at browser width, and
// it is the screen the pitch work exists for: a Saturday morning fits on one
// view and a double booking reads as two amber cells without reading a word.
//
// ⚠️ IT OPENS ON TODAY — Jay, 11 Aug 2026, asked directly. Today is often
// empty midweek, which is why the empty state says what is happening rather
// than rendering a blank grid that reads as broken.
//
// ⚠️ THIS IS THE WEEKLY JOB. Setting the pitch list up is the rare one and
// lives on its own screen, so a destructive action (retire) is not sitting on
// the screen somebody uses every Saturday.

const MS_DAY = 24 * 60 * 60 * 1000

/** Club-time midnight-to-midnight for a { year, month, day }. */
function dayWindow({ year, month, day }) {
  // ⚠️ Built from UTC parts against the CLUB's date, not the reader's. The
  // whole app treats Abu Dhabi as the calendar (CLUB_TIME_ZONE), and a window
  // derived from the browser's midnight would put a 6pm training on the wrong
  // day for anyone outside the UAE.
  const start = new Date(Date.UTC(year, month, day, 0, 0, 0) - 4 * 60 * 60 * 1000)
  return { from: start.toISOString(), to: new Date(start.getTime() + MS_DAY - 1).toISOString() }
}

function shiftDay({ year, month, day }, delta) {
  const moved = new Date(Date.UTC(year, month, day + delta))
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth(), day: moved.getUTCDate() }
}

/**
 * The hour columns the grid needs.
 *
 * ⚠️ DERIVED FROM THE DAY'S FIXTURES, NOT FIXED. A fixed 08:00-20:00 grid
 * would silently drop a 07:00 kick-off — the fixture would exist, be
 * allocated, and simply not appear. Deriving means the grid always contains
 * everything it is showing.
 */
export function hourRange(events) {
  const starts = []
  const ends = []
  for (const event of events ?? []) {
    const start = eventDate(event)
    if (!start) continue
    starts.push(start.getTime())
    ends.push((eventEndDate(event) ?? start).getTime())
  }
  if (starts.length === 0) return []

  const hourOf = (ms) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Dubai',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms))
    return Number(parts.find((part) => part.type === 'hour').value)
  }

  const first = Math.min(...starts.map(hourOf))
  // The last column has to CONTAIN the finish, so an event ending at 11:30
  // needs the 11:00 column.
  const last = Math.max(...ends.map(hourOf), first)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

function hourOfEvent(event) {
  const start = eventDate(event)
  if (!start) return null
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dubai', hour: '2-digit', hour12: false })
      .formatToParts(start)
      .find((part) => part.type === 'hour').value,
  )
}

/**
 * The rows: every ACTIVE pitch, plus any pitch a fixture that day names even
 * if it is retired or was never in the list.
 *
 * ⚠️ THE SECOND HALF IS THE POINT. Showing only active pitches would make a
 * booking on a retired pitch vanish from the one screen whose job is to show
 * what is booked — the fixture would still exist, still clash, and be
 * invisible. A retired pitch that has something on it is exactly what somebody
 * needs to see.
 */
export function rowsFor(pitches, events) {
  const active = (pitches ?? []).filter((pitch) => pitch.is_active)
  const known = new Set(active.map((pitch) => pitch.name))
  const extra = []

  for (const event of events ?? []) {
    const name = (event?.pitch ?? '').trim()
    if (!name || name === PITCH_TBD || known.has(name)) continue
    known.add(name)
    const retired = (pitches ?? []).find((pitch) => pitch.name === name)
    extra.push({
      id: retired?.id ?? `unlisted:${name}`,
      name,
      is_active: false,
      unlisted: !retired,
    })
  }

  return [...active, ...extra]
}

export default function Allocation() {
  const { memberships, teams } = useMemberships()
  const [day, setDay] = useState(() => clubToday())
  const [events, setEvents] = useState([])
  const [pitches, setPitches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const teamIds = useMemo(() => visibleTeams(memberships, teams).map((team) => team.id), [memberships, teams])
  const teamsById = useMemo(() => new Map((teams ?? []).map((team) => [team.id, team])), [teams])
  const window = useMemo(() => dayWindow(day), [day])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    Promise.all([
      listEvents({ teamIds, from: window.from, to: window.to }),
      listPitches({ includeRetired: true }),
    ])
      .then(([eventRows, pitchRows]) => {
        if (!mounted) return
        setEvents(eventRows)
        setPitches(pitchRows)
      })
      .catch((failure) => {
        if (!mounted) return
        setError(failure)
        setEvents([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [teamIds, window.from, window.to])

  const hours = useMemo(() => hourRange(events), [events])
  const rows = useMemo(() => rowsFor(pitches, events), [pitches, events])

  // ⚠️ Clashes are computed over the DAY'S events, and the exemptions live in
  // findPitchClashes — a multi-squad fan-out sharing a group_id is not a
  // clash, touching is not overlapping, and Pitch TBD never clashes.
  const clashing = useMemo(() => {
    const ids = new Set()
    for (const clash of findPitchClashes(events)) {
      ids.add(clash.a.id)
      ids.add(clash.b.id)
    }
    return ids
  }, [events])

  const unallocated = useMemo(
    () => events.filter((event) => !(event.pitch ?? '').trim() || event.pitch === PITCH_TBD),
    [events],
  )

  if (!hasAdminRight(memberships, 'pitches')) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Allocation</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          You haven&apos;t been given the Pitch Manager job. A super admin can add it on
          the Accounts screen.
        </p>
      </Card>
    )
  }

  const heading = new Date(Date.UTC(day.year, day.month, day.day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const isToday = (() => {
    const t = clubToday()
    return t.year === day.year && t.month === day.month && t.day === day.day
  })()

  return (
    <section>
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">{heading}</h2>
          <p className="text-[13px] font-medium text-ink-muted">
            {events.length} {events.length === 1 ? 'fixture' : 'fixtures'}
            {unallocated.length > 0 ? ` · ${unallocated.length} without a pitch` : ''}
            {clashing.size > 0 ? ` · ${clashing.size / 2} clash` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDay((d) => shiftDay(d, -1))}>
            Previous
          </Button>
          {!isToday && (
            <Button variant="secondary" size="sm" onClick={() => setDay(clubToday())}>
              Today
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setDay((d) => shiftDay(d, 1))}>
            Next
          </Button>
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div role="status" className="flex flex-1 items-center justify-center py-20">
          <Spinner />
        </div>
      ) : error ? (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the day</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-deep">
            {error.message || 'Something went wrong. Try again.'}
          </p>
        </Card>
      ) : events.length === 0 ? (
        /* ⚠️ A SENTENCE, NOT AN EMPTY GRID. The screen opens on today (Jay's
           call) and today is often a quiet Tuesday — fifteen empty rows would
           read as the app failing to load rather than as a quiet day. */
        <Card className="px-5 py-11 text-center">
          <p className="text-sm text-ink-faint">
            Nothing on {isToday ? 'today' : 'this day'}. Use Next to look ahead.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <div
            data-testid="allocation-grid"
            className="min-w-[640px] grid border-t border-line"
            style={{ gridTemplateColumns: `120px repeat(${hours.length}, minmax(96px, 1fr))` }}
          >
            <div className="border-b border-r border-line px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted">
              Pitch
            </div>
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-r border-line px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted last:border-r-0"
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}

            {rows.map((pitch) => {
              const onThisPitch = events.filter((event) => (event.pitch ?? '').trim() === pitch.name)
              return [
                <div
                  key={`${pitch.id}-name`}
                  className="flex items-center gap-2 border-b border-r border-line px-2.5 py-2 text-sm font-bold text-ink"
                >
                  {pitch.name}
                  {!pitch.is_active && (
                    <span className="rounded-pill bg-surface-mute px-2 py-0.5 text-[10.5px] font-bold text-ink-muted">
                      {pitch.unlisted ? 'not listed' : 'retired'}
                    </span>
                  )}
                </div>,
                ...hours.map((hour) => {
                  const here = onThisPitch.filter((event) => hourOfEvent(event) === hour)
                  return (
                    <div
                      key={`${pitch.id}-${hour}`}
                      className="min-h-[44px] border-b border-r border-line p-1.5 last:border-r-0"
                    >
                      {here.map((event) => {
                        const clash = clashing.has(event.id)
                        return (
                          <span
                            key={event.id}
                            data-testid={clash ? 'booking-clash' : 'booking'}
                            className={[
                              'block rounded-[6px] px-2 py-1 text-[12px] font-bold leading-tight',
                              clash ? 'bg-warn-bg text-warn-ink' : 'bg-danger-bg text-brand-deep',
                            ].join(' ')}
                          >
                            {teamsById.get(event.team_id)?.name ?? eventTitle(event)}
                            <span className="block text-[11px] font-semibold opacity-90">
                              {formatTime(eventDate(event))}
                              {clash ? ' · clash' : ''}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  )
                }),
              ]
            })}
          </div>
        </Card>
      )}

      {unallocated.length > 0 && (
        /* ⚠️ THE WHOLE REASON THE GRID EXISTS. A fixture with no pitch appears
           in no row, so without this it would be invisible on the one screen
           whose job is to allocate it — the emptier the grid looks, the more
           work there actually is. */
        <Card className="mt-3.5 p-3.5">
          <h3 className="mb-2 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Waiting for a pitch
          </h3>
          <ul className="flex flex-col gap-1.5">
            {unallocated.map((event) => (
              <li key={event.id} data-testid="unallocated" className="text-sm text-ink">
                <span className="font-bold">{teamsById.get(event.team_id)?.name ?? 'Squad'}</span>
                <span className="text-ink-muted">
                  {' · '}
                  {formatTime(eventDate(event))} · {eventTitle(event)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
