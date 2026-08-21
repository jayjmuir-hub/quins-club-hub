import Card from './Card.jsx'
import { dayKey, dayKeyOf, monthGrid, sameDay, weekDays } from '../lib/calendarGrid.js'
import { eventDate, eventTimeLabel, formatTime } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { PITCH_TBD } from '../data/pitches.js'

// The WEEK and MONTH views of the pitch calendar. The DAY view — pitches down
// the side, hours across the top — stays in src/screens/Allocation.jsx, because
// it answers a different question: "what is on this pitch at this hour", where
// these two answer "what is coming".
//
// Jay, 12 Aug 2026: "i still don't see a full calendar view in the pitch
// management dashboard". The day grid was the whole screen, so planning past
// tomorrow meant pressing Next repeatedly and holding the answer in your head.
//
// ⚠️ THE MONTH VIEW IS A PLANNING SURFACE, NOT A LIST. It deliberately does not
// try to name every fixture — at fifteen squads a Saturday cell would be a wall
// of 6px text nobody reads. It shows COUNT and STATE (clash, waiting for a
// pitch), which are the two things that decide whether a day needs attention,
// and clicking a day opens the grid that shows the detail.
//
// ⚠️ A DAY WITH A PROBLEM MUST NOT BE DISTINGUISHED BY COLOUR ALONE. Amber for
// a clash reads as nothing at all to the ~8% of men with a colour vision
// deficiency, and this club's volunteers are mostly men. Every state carries a
// word or a shape as well: the clash count is written out, and the
// waiting-for-a-pitch marker is a hollow ring against the clash's filled dot.

/** Groups events by their CLUB calendar day. See dayKeyOf for why that matters. */
function byDay(events) {
  const map = new Map()
  for (const event of events ?? []) {
    const start = eventDate(event)
    if (!start) continue
    const key = dayKeyOf(start)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(event)
  }
  for (const list of map.values()) {
    list.sort((a, b) => (eventDate(a)?.getTime() ?? 0) - (eventDate(b)?.getTime() ?? 0))
  }
  return map
}

const needsPitch = (event) => !(event.pitch ?? '').trim() || event.pitch === PITCH_TBD

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** One fixture, as it appears in the week column. */
function WeekEntry({ event, clash, label }) {
  const waiting = needsPitch(event)
  return (
    <li
      data-testid={clash ? 'week-entry-clash' : 'week-entry'}
      className={[
        'rounded-[8px] border-l-[3px] px-2 py-1.5',
        clash
          ? 'border-l-warn bg-warn-bg text-warn-ink'
          : waiting
            ? 'border-l-line bg-surface-mute text-ink-muted'
            : 'border-l-brand bg-danger-bg text-danger-ink',
      ].join(' ')}
    >
      <span className="block text-[12px] font-extrabold leading-tight">{label}</span>
      <span className="block text-[11.5px] font-semibold leading-tight opacity-90">
        {eventTimeLabel(event)}
        {/* The pitch is the point of this screen, so it is never omitted —
            "waiting for a pitch" is a state somebody has to act on, and a blank
            would read as "no pitch needed". */}
        {' · '}
        {waiting ? 'no pitch yet' : event.pitch}
        {clash ? ' · clash' : ''}
      </span>
    </li>
  )
}

export function PitchWeek({ anchor, today, events, clashing, teamsById, onPickDay }) {
  const days = weekDays(anchor)
  const grouped = byDay(events)

  return (
    <Card className="overflow-x-auto p-0">
      {/* min-w keeps the seven columns readable rather than crushing them on a
          phone; the Card scrolls, the DOCUMENT does not — which is what stops
          this widening the whole page (see the overflow gate). */}
      <div data-testid="pitch-week" className="grid min-w-[820px] grid-cols-7">
        {days.map((day) => {
          const list = grouped.get(dayKey(day)) ?? []
          const isToday = sameDay(day, today)
          return (
            <div
              key={dayKey(day)}
              className="min-w-0 border-b border-r border-line last:border-r-0"
            >
              <button
                type="button"
                onClick={() => onPickDay(day)}
                className={[
                  'flex w-full items-baseline justify-between gap-1 border-b border-line px-2.5 py-2 text-left transition',
                  'hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
                  isToday ? 'bg-surface-mute' : '',
                ].join(' ')}
                aria-label={`Open ${WEEKDAYS[days.indexOf(day)]} ${day.day}`}
              >
                <span className="text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted">
                  {WEEKDAYS[days.indexOf(day)]}
                </span>
                <span
                  className={[
                    'text-[15px] font-extrabold',
                    isToday ? 'text-danger-ink' : 'text-ink',
                  ].join(' ')}
                >
                  {day.day}
                </span>
              </button>

              {list.length === 0 ? (
                <p className="px-2.5 py-3 text-[11.5px] text-ink-faint">—</p>
              ) : (
                <ul className="flex flex-col gap-1.5 p-1.5">
                  {list.map((event) => (
                    <WeekEntry
                      key={event.id}
                      event={event}
                      clash={clashing.has(event.id)}
                      label={fixtureLabel(
                        event,
                        event.league_team,
                        teamsById.get(event.team_id)?.name ?? 'Fixture',
                      )}
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function PitchMonth({ anchor, today, events, clashing, onPickDay }) {
  const cells = monthGrid(anchor)
  const grouped = byDay(events)

  return (
    <Card className="p-0">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((name) => (
          <span
            key={name}
            className="px-2 py-2 text-center text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted"
          >
            {/* The initial on a phone, the short name from desktop up: seven
                three-letter headings do not fit at 320px and truncating them
                mid-word reads worse than one letter. */}
            <span className="desktop:hidden">{name[0]}</span>
            <span className="hidden desktop:inline">{name}</span>
          </span>
        ))}
      </div>

      <div data-testid="pitch-month" className="grid grid-cols-7">
        {cells.map((cell) => {
          const list = grouped.get(dayKey(cell)) ?? []
          const clashes = list.filter((event) => clashing.has(event.id)).length
          const waiting = list.filter(needsPitch).length
          const isToday = sameDay(cell, today)

          return (
            <button
              key={dayKey(cell)}
              type="button"
              data-testid="month-cell"
              onClick={() => onPickDay(cell)}
              // ⚠️ SAID OUT LOUD. The dot and the ring are invisible to a
              // screen reader, and "does this day need me" is the only question
              // this grid answers.
              aria-label={[
                `${cell.day}`,
                list.length === 0
                  ? 'nothing on'
                  : `${list.length} ${list.length === 1 ? 'fixture' : 'fixtures'}`,
                clashes > 0 ? `${clashes / 2} clash` : null,
                waiting > 0 ? `${waiting} waiting for a pitch` : null,
              ]
                .filter(Boolean)
                .join(', ')}
              className={[
                'group relative flex min-h-[76px] flex-col items-start gap-1 border-b border-r border-line p-1.5 text-left transition',
                'hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
                cell.inMonth ? '' : 'bg-surface-sunk',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-extrabold',
                  isToday ? 'bg-brand text-ink-invert' : cell.inMonth ? 'text-ink' : 'text-ink-faint',
                ].join(' ')}
              >
                {cell.day}
              </span>

              {list.length > 0 && (
                <span className="flex flex-wrap items-center gap-1">
                  <span className="rounded-pill bg-danger-bg px-1.5 py-0.5 text-[10.5px] font-extrabold text-danger-ink">
                    {list.length}
                  </span>
                  {/* ⚠️ A FILLED DOT FOR A CLASH, A HOLLOW RING FOR WAITING —
                      shape, not just colour. Amber against red reads as one
                      thing to a red-green colour blind eye, and this club's
                      volunteers are mostly men. */}
                  {clashes > 0 && (
                    <span
                      aria-hidden="true"
                      title="clash"
                      className="h-2 w-2 rounded-full bg-warn"
                    />
                  )}
                  {waiting > 0 && (
                    <span
                      aria-hidden="true"
                      title="waiting for a pitch"
                      className="h-2 w-2 rounded-full border-[1.5px] border-ink-muted"
                    />
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* The key. Two marks is few enough that hiding it behind a tooltip would
          be the only thing standing between a volunteer and the screen. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-3 py-2.5 text-[11.5px] font-semibold text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warn" /> clash
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-2 rounded-full border-[1.5px] border-ink-muted" />{' '}
          waiting for a pitch
        </span>
      </div>
    </Card>
  )
}
