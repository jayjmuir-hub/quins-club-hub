import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Button from '../components/Button.jsx'
import Spinner from '../components/Spinner.jsx'
import { listEvents } from '../data/events.js'
import { listPitches, findPitchClashes, PITCH_TBD } from '../data/pitches.js'
import { listPitchRequests, allocatePitch, declinePitch } from '../data/pitchRequests.js'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight, visibleTeams } from '../lib/scope.js'
import { clubToday, eventDate, eventEndDate, eventTitle, formatTime } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { PitchMonth, PitchWeek } from '../components/PitchCalendar.jsx'
import {
  monthGrid,
  sameDay,
  shiftMonth,
  weekDays,
  windowFor,
  shiftDay as shiftDayParts,
} from '../lib/calendarGrid.js'

// The allocation grid — pitches down the side, the day across the top.
//
// Jay picked this ("option C") from three layouts drawn at browser width, and
// it is the screen the pitch work exists for: a Saturday morning fits on one
// view and a double booking reads as two amber cells without reading a word.
//
// ⚠️ IT OPENS ON TODAY, IN DAY VIEW — Jay, 11 Aug 2026, asked directly. Today
// is often empty midweek, which is why the empty state says what is happening
// rather than rendering a blank grid that reads as broken.
//
// ⚠️ THAT RULING SURVIVED THE CALENDAR AND WAS NOT QUIETLY OVERTURNED.
// Jay, 12 Aug 2026: "i still don't see a full calendar view in the pitch
// management dashboard". Week and Month were ADDED beside the day grid rather
// than replacing it as the landing view, because "opens on today" was an
// explicit instruction and this request did not withdraw it. If the month
// should be what opens, that is one line — and it is his call, not a guess
// dressed up as a default.
//
// ⚠️ THE THREE VIEWS ANSWER DIFFERENT QUESTIONS, which is why all three exist:
//   DAY    pitches × hours — "what is on this pitch at this hour", the grid you
//          allocate from. The only view that can show a double booking as two
//          cells side by side.
//   WEEK   seven columns — "what is coming this weekend", the planning horizon.
//   MONTH  the full calendar — "which days need me at all".
//
// ⚠️ THIS IS THE WEEKLY JOB. Setting the pitch list up is the rare one and
// lives on its own screen, so a destructive action (retire) is not sitting on
// the screen somebody uses every Saturday.

/** The three views, in the order they widen. */
const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

// ⚠️ dayWindow AND shiftDay USED TO LIVE HERE AND ARE NOW IN
// src/lib/calendarGrid.js, which the week and month views also need. They were
// byte-for-byte the same arithmetic — `windowFor([day])` and `dayWindow(day)`
// produced the identical pair of ISO strings — and two copies of a time-zone
// calculation is two places to get Abu Dhabi's +04:00 wrong in different ways.
// The offset reasoning now lives in one file, with its own tests.

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
  const [requests, setRequests] = useState([])
  const [deciding, setDeciding] = useState(null)
  const [chosenPitch, setChosenPitch] = useState('')
  const [reason, setReason] = useState('')
  const [decideBusy, setDecideBusy] = useState(false)
  const [decideError, setDecideError] = useState(null)
  const [day, setDay] = useState(() => clubToday())
  const [view, setView] = useState('day')
  const [events, setEvents] = useState([])
  const [pitches, setPitches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  const teamIds = useMemo(() => visibleTeams(memberships, teams).map((team) => team.id), [memberships, teams])
  const teamsById = useMemo(() => new Map((teams ?? []).map((team) => [team.id, team])), [teams])
  // ⚠️ THE FETCH FOLLOWS THE VIEW, AND THAT IS THE WHOLE COST OF THE CALENDAR.
  // A month of fifteen squads is the read that made listEvents page in the
  // first place (~1,690 rows over 18 months, so a month is ~90) — well inside
  // fetchAllPages, but it is the reason the window is derived from the visible
  // days rather than left at one day and filtered.
  const window = useMemo(() => {
    if (view === 'day') return windowFor([day])
    return windowFor(view === 'week' ? weekDays(day) : monthGrid(day))
  }, [view, day])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    Promise.all([
      listEvents({ teamIds, from: window.from, to: window.to }),
      listPitches({ includeRetired: true }),
      // ⚠️ THE QUEUE IS NOT FILTERED BY THE DAY ON SCREEN. A request is a job
      // waiting to be done, not a thing that happens on a date — filtering it
      // to the visible day would hide next Saturday's requests every weekday
      // and the queue would look empty precisely when there is work.
      listPitchRequests({ status: 'submitted' }).catch(() => []),
    ])
      .then(([eventRows, pitchRows, requestRows]) => {
        if (!mounted) return
        setEvents(eventRows)
        setPitches(pitchRows)
        setRequests(requestRows)
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
  }, [teamIds, window.from, window.to, reloadToken])

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

  async function decide(work) {
    setDecideBusy(true)
    setDecideError(null)
    try {
      await work()
      setDeciding(null)
      // Refetch both: allocating writes the FIXTURE, so the grid is stale too.
      setReloadToken((token) => token + 1)
    } catch (failure) {
      setDecideError(failure)
    } finally {
      setDecideBusy(false)
    }
  }

  if (!hasAdminRight(memberships, 'pitches')) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Allocation</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Pitch Management hasn&apos;t been added to your account. A super admin can add
          it on the Accounts screen.
        </p>
      </Card>
    )
  }

  // ⚠️ BUILT FROM UTC PARTS WITH timeZone: 'UTC', which looks wrong and is not.
  // `day` is already the CLUB's calendar date, so the Date below is a carrier
  // for those parts rather than an instant — formatting it in any other zone
  // would shift the label off the date it is labelling.
  const asDate = new Date(Date.UTC(day.year, day.month, day.day))
  const heading =
    view === 'month'
      ? asDate.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' })
      : view === 'week'
        ? (() => {
            const days = weekDays(day)
            // ⚠️ BOTH ENDS CARRY THE MONTH, EVEN WITHIN ONE MONTH. Omitting it
            // from the first date produced "10 – August 16" in a
            // month-before-day locale — measured in Chromium, not imagined —
            // which reads as a range between a number and a date. Formatting
            // both ends the same way is unambiguous in EVERY locale, which is
            // the point: the locale is the reader's and this code does not get
            // to assume its order.
            const format = (parts) =>
              new Date(Date.UTC(parts.year, parts.month, parts.day)).toLocaleDateString(undefined, {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'short',
              })
            return `${format(days[0])} – ${format(days[6])}`
          })()
        : asDate.toLocaleDateString(undefined, {
            timeZone: 'UTC',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })

  const today = clubToday()
  // "Today" means the visible RANGE contains today, not that the anchor is
  // today — otherwise the button would offer to move a week view that is
  // already showing this week.
  const isToday =
    view === 'day'
      ? sameDay(today, day)
      : view === 'week'
        ? weekDays(day).some((d) => sameDay(d, today))
        : day.year === today.year && day.month === today.month

  /** Paging moves by whatever the view is showing. */
  const step = (delta) =>
    setDay((current) =>
      view === 'month' ? shiftMonth(current, delta) : shiftDayParts(current, view === 'week' ? 7 * delta : delta),
    )

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
          <Button variant="secondary" size="sm" onClick={() => step(-1)} aria-label="Previous">
            Previous
          </Button>
          {!isToday && (
            <Button variant="secondary" size="sm" onClick={() => setDay(clubToday())}>
              Today
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => step(1)} aria-label="Next">
            Next
          </Button>
        </div>
      </div>

      {/* ⚠️ A ROW OF TABS, NOT the shared <Segmented>. Segmented is a
          fieldset/legend RADIO GROUP built for a form question ("what gender is
          this player") — it renders a visible legend and takes a full-width
          row. This is a VIEW SWITCH sitting in a page header, where a legend
          would be a label for something that is not a question. Same reason
          Schedule's own filter pills are not Segmented either. */}
      <div
        role="tablist"
        aria-label="Calendar view"
        data-testid="allocation-views"
        className="mb-3.5 inline-flex rounded-[11px] border-[1.5px] border-line p-0.5"
      >
        {VIEWS.map((option) => {
          const on = view === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(option.value)}
              className={[
                'rounded-[8px] px-3.5 py-1.5 text-[13px] font-bold transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
                on ? 'bg-brand text-ink-invert' : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
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
      ) : view === 'month' ? (
        /* ⚠️ THE MONTH GRID RENDERS EVEN WHEN THE MONTH IS EMPTY, unlike the
           day view below. An empty month is a legible answer — thirty quiet
           squares that say "nothing booked" — whereas fifteen empty PITCH rows
           say nothing and read as a failed load. The empty states differ
           because the grids differ, not by oversight. */
        <PitchMonth
          anchor={day}
          today={today}
          events={events}
          clashing={clashing}
          onPickDay={(picked) => {
            setDay({ year: picked.year, month: picked.month, day: picked.day })
            setView('day')
          }}
        />
      ) : view === 'week' ? (
        <PitchWeek
          anchor={day}
          today={today}
          events={events}
          clashing={clashing}
          teamsById={teamsById}
          onPickDay={(picked) => {
            setDay({ year: picked.year, month: picked.month, day: picked.day })
            setView('day')
          }}
        />
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
                            {/* ⚠️ LABELLED BY LEAGUE TEAM WHERE THERE IS ONE,
                                and this is the point of the change for
                                Pitch Management:
                                a Saturday of A and B fixtures used to read as
                                the same squad name twice in two rows, with
                                nothing to say which booking was which. */}
                            {fixtureLabel(
                              event,
                              event.league_team,
                              teamsById.get(event.team_id)?.name ?? eventTitle(event),
                            )}
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

      {/* ── The Pitch Management queue ───────────────────────────────────
          ⚠️ NOT FILTERED BY THE DAY ON SCREEN — see the fetch. A request is a
          job waiting, not an event on a date. */}
      {requests.length > 0 && (
        <Card className="mt-3.5 p-3.5">
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Requests waiting ({requests.length})
          </h3>

          <ul className="flex flex-col gap-2.5">
            {requests.map((request) => {
              const fixture = request.events
              const start = fixture ? eventDate(fixture) : null
              const open = deciding === request.id
              return (
                <li key={request.id} data-testid="pitch-request" className="rounded-[11px] border border-line p-2.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-sm font-bold text-ink">
                      {teamsById.get(fixture?.team_id)?.name ?? 'Squad'}
                    </span>
                    <span className="text-[12.5px] text-ink-muted">
                      {start
                        ? `${start.toLocaleDateString(undefined, { timeZone: 'Asia/Dubai', weekday: 'short', day: 'numeric', month: 'short' })} · ${formatTime(start)}`
                        : 'Date unknown'}
                    </span>
                    {request.needs_referee && (
                      <span className="rounded-pill bg-surface-mute px-2.5 py-0.5 text-[11.5px] font-bold text-ink-muted">
                        Referee
                      </span>
                    )}
                    <span className="flex-1" />
                    {!open && (
                      <Button size="sm" onClick={() => {
                        setDeciding(request.id)
                        setChosenPitch('')
                        setReason('')
                        setDecideError(null)
                      }}>
                        Answer
                      </Button>
                    )}
                  </div>

                  {request.note && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{request.note}</p>
                  )}

                  {open && (
                    <div className="mt-2.5 flex flex-wrap items-end gap-2">
                      <label className="min-w-0">
                        <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                          Give them
                        </span>
                        <select
                          aria-label={`Pitch for ${teamsById.get(fixture?.team_id)?.name ?? 'this request'}`}
                          value={chosenPitch}
                          disabled={decideBusy}
                          onChange={(domEvent) => setChosenPitch(domEvent.target.value)}
                          className="rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
                        >
                          <option value="">Choose a pitch</option>
                          {pitches.filter((pitch) => pitch.is_active).map((pitch) => (
                            <option key={pitch.id} value={pitch.name}>{pitch.name}</option>
                          ))}
                        </select>
                      </label>

                      <Button
                        size="sm"
                        disabled={decideBusy || !chosenPitch}
                        onClick={() => decide(() =>
                          allocatePitch({
                            requestId: request.id,
                            eventId: request.event_id,
                            pitch: chosenPitch,
                          }),
                        )}
                      >
                        {decideBusy ? 'Saving…' : 'Allocate'}
                      </Button>

                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                          Or say why not
                        </span>
                        <input
                          type="text"
                          aria-label="Reason for declining"
                          value={reason}
                          disabled={decideBusy}
                          onChange={(domEvent) => setReason(domEvent.target.value)}
                          placeholder="All pitches taken that morning"
                          className="w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand"
                        />
                      </label>

                      {/* ⚠️ A REASON IS REQUIRED TO DECLINE. "No pitch
                          available" with nothing after it leaves a coach with
                          nothing to act on — and because a decline never shows
                          on the fixture, this note is the only thing they get. */}
                      <Button
                        variant="dangerQuiet"
                        size="sm"
                        disabled={decideBusy || !reason.trim()}
                        onClick={() => decide(() =>
                          declinePitch({ requestId: request.id, reason }),
                        )}
                      >
                        Decline
                      </Button>

                      <Button variant="ghost" size="sm" disabled={decideBusy} onClick={() => setDeciding(null)}>
                        Cancel
                      </Button>
                    </div>
                  )}

                  {open && decideError && (
                    <p role="alert" className="mt-2 text-[12.5px] font-semibold text-brand-deep">
                      {decideError.message || "That didn't save. Try again."}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
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
                <span className="font-bold">
                  {fixtureLabel(event, event.league_team, teamsById.get(event.team_id)?.name ?? 'Squad')}
                </span>
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
