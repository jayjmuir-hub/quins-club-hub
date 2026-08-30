import { useEffect, useState } from 'react'
import Card from './Card.jsx'
import Chip from './Chip.jsx'
import Button from './Button.jsx'
import {
  eventDate,
  eventTitle,
  formatTableDate,
  eventTimeLabel,
  hasResult,
  resultOutcome,
  resultScore,
  venueLine,
} from '../lib/eventFormat.js'
import {
  groupEventsByMonth,
  initialVisibleMonthCount,
  showMoreMonthsLabel,
} from '../lib/scheduleMonthGroups.js'

// The desktop schedule table (desktop-spec.md §5.2). Rendered at `wide`
// instead of the stacked FixtureRow list; below that the list is still the
// right shape and is untouched.
//
// Every date and time here goes through src/lib/eventFormat.js. That is not
// tidiness — the club's calendar is Abu Dhabi's, and every naive Date method
// silently reads the browser's zone instead. A coach opening this from the UK
// in August must see the same kick-off time as one standing on the pitch.
// This file therefore does no date arithmetic of its own.
//
// There is no availability column yet. It is in the spec, but listEvents does
// not fetch availability and adding it means either a second query per event
// or an aggregate view — a data change, not a layout one. Deferred rather
// than faked, and called out in the phase 2 notes.
//
// Rows are grouped by club-calendar month. The PAGE still scrolls (no inner
// 70vh scroller — that went 22 Aug 2026). Month and column headers are sticky
// BELOW the filter bar (`--schedule-filter-h` from Schedule.jsx) so they cannot
// cover the filters. `overflow-x-auto` / `overflow-hidden` on a wrapper would
// make `sticky` pin inside that wrapper instead of the page, so they stay off.

const HEAD =
  'sticky z-10 bg-surface-sunk px-3 py-2.5 text-left text-[11.5px] font-extrabold uppercase tracking-[.5px] text-ink-muted'
const CELL = 'border-t border-line px-3 py-2 text-[14px] text-ink align-middle'
const COL_STICKY_TOP = 'var(--schedule-filter-h, 0px)'
const MONTH_STICKY_TOP = 'calc(var(--schedule-filter-h, 0px) + var(--schedule-col-h, 2.75rem))'

const TYPE_TONE = { match: 'match', training: 'training', social: 'social' }
const TYPE_LABEL = { match: 'Match', training: 'Training', social: 'Social' }

const COLUMNS = [
  { key: 'starts_at', label: 'Date' },
  { key: 'type', label: 'Type' },
  { key: 'team', label: 'Age group' },
  { key: 'fixture', label: 'Fixture' },
  { key: 'venue', label: 'Venue' },
  { key: 'result', label: 'Result' },
]

function compare(a, b, key, teamsById) {
  switch (key) {
    case 'starts_at':
      return eventDate(a) - eventDate(b)
    case 'team': {
      const at = teamsById.get(a.team_id)
      const bt = teamsById.get(b.team_id)
      return (at?.sort_order ?? 0) - (bt?.sort_order ?? 0)
    }
    case 'fixture':
      return eventTitle(a).localeCompare(eventTitle(b))
    case 'result':
      // Played fixtures first; among them, most recent first. A column of
      // empty cells at the top is never what someone sorting by result wants.
      if (hasResult(a) !== hasResult(b)) return hasResult(a) ? -1 : 1
      return eventDate(b) - eventDate(a)
    default: {
      const av = a[key] ?? ''
      const bv = b[key] ?? ''
      if (av === '' && bv !== '') return 1
      if (bv === '' && av !== '') return -1
      return String(av).localeCompare(String(bv))
    }
  }
}

function EventRow({ event, teamsById, onSelect }) {
  const date = eventDate(event)
  const outcome = hasResult(event) ? resultOutcome(event) : null

  return (
    <tr
      data-testid="schedule-table-row"
      // ⚠️ NOT a <button> wrapper and not role="button" on the row.
      // A <tr> may only contain <td>, so wrapping is invalid HTML,
      // and role="button" on a row would strip its row semantics
      // from a screen reader — losing the column headers that make
      // the cells mean anything. The row is a convenience for a
      // mouse; the real, focusable, keyboard-reachable control is
      // the Open button in the last cell, which stays.
      onClick={() => onSelect(event.id)}
      className="cursor-pointer hover:bg-surface-mute"
    >
      <td className={`${CELL} whitespace-nowrap`}>
        <span data-testid="schedule-date" className="font-bold">
          {formatTableDate(date)}
        </span>
        <span className="ml-2 text-[13px] text-ink-faint">{eventTimeLabel(event)}</span>
      </td>

      <td className={CELL}>
        <Chip type={TYPE_TONE[event.type]}>{TYPE_LABEL[event.type] ?? event.type}</Chip>
      </td>

      <td className={`${CELL} whitespace-nowrap text-ink-muted`}>
        {event.team_id == null ? 'Whole club' : teamsById.get(event.team_id)?.name ?? 'No age group'}
      </td>

      <td className={`${CELL} font-semibold`}>
        <span data-testid="schedule-fixture">{eventTitle(event)}</span>
        {event.type === 'match' && (
          <span className="ml-2 rounded-[100px] bg-surface-sunk px-1.5 py-0.5 text-[11px] font-extrabold text-ink-muted">
            {event.home ? 'H' : 'A'}
          </span>
        )}
        {event.competition && (
          <span className="mt-0.5 block text-[12px] font-medium text-ink-faint">
            {event.competition}
          </span>
        )}
      </td>

      <td className={`${CELL} text-ink-muted`}>
        {venueLine(event) || <span className="text-ink-faint">—</span>}
      </td>

      <td className={`${CELL} whitespace-nowrap`}>
        {outcome
          ? <Chip type={outcome}>{resultScore(event)}</Chip>
          : <span className="text-ink-faint">—</span>}
      </td>

      <td className={`${CELL} text-right`}>
        <Button
          variant="ghost"
          size="sm"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation()
            onSelect(event.id)
          }}
        >
          Open
        </Button>
      </td>
    </tr>
  )
}

// Results render as a Chip with the outcome as its type. design-system.md
// §4.7 is explicit that win/loss/draw are variants of the SAME chip used on
// the Schedule's Results rows, not a second component — and those pairings
// carry measured AA ratios in Chip.jsx (the raw --good/--good-bg pair is only
// 3.06:1 and was deliberately darkened). Colouring the score text here with
// new classes would have re-invented that, badly, and skipped the contrast
// gate. An earlier draft of this file did exactly that with a `text-good-deep`
// class that does not exist, which would have silently rendered unstyled.
export default function ScheduleTable({ events, teamsById, onSelect, emptyMessage, revealKey }) {
  const [sort, setSort] = useState({ key: 'starts_at', dir: 'asc' })
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    setRevealed(false)
  }, [revealKey])

  if (events.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      </Card>
    )
  }

  const dateDir = sort.key === 'starts_at' ? sort.dir : 'asc'
  const byDate = [...events].sort((a, b) => {
    const result = (eventDate(a) ?? 0) - (eventDate(b) ?? 0)
    return dateDir === 'asc' ? result : -result
  })
  const groups = groupEventsByMonth(byDate).map((group) => {
    if (sort.key === 'starts_at') return group
    const sortedEvents = [...group.events].sort((a, b) => {
      const result = compare(a, b, sort.key, teamsById)
      const tie = result === 0 ? eventDate(a) - eventDate(b) : 0
      return (sort.dir === 'asc' ? result : -result) || tie
    })
    return { ...group, events: sortedEvents }
  })

  const visibleCount = revealed ? groups.length : initialVisibleMonthCount(groups)
  const visible = groups.slice(0, visibleCount)
  const remaining = groups.slice(visibleCount)
  const moreLabel = showMoreMonthsLabel(remaining)

  return (
    <>
      <Card className="bg-surface-card">
        <table
          className="w-full border-collapse"
          data-testid="schedule-table"
          style={{ ['--schedule-col-h']: '2.75rem' }}
        >
          <caption className="sr-only">
            Fixtures and training across every age group you can see.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  scope="col"
                  className={HEAD}
                  style={{ top: COL_STICKY_TOP }}
                  aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => setSort((p) => (p.key === key
                      ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' }
                      : { key, dir: 'asc' }))}
                    className="flex items-center gap-1 font-extrabold uppercase tracking-[.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {label}
                    <span aria-hidden="true" className="text-[9px]">
                      {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
              <th scope="col" className={`${HEAD} w-px`} style={{ top: COL_STICKY_TOP }}>
                <span className="sr-only">Open fixture</span>
              </th>
            </tr>
          </thead>

          {visible.map((group) => (
            <tbody key={group.key}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={COLUMNS.length + 1}
                  data-testid="schedule-month"
                  className="sticky z-[9] border-t border-line bg-surface-sunk px-3 py-2 text-left text-[12.5px] font-extrabold uppercase tracking-[.5px] text-ink"
                  style={{ top: MONTH_STICKY_TOP }}
                >
                  <span>{group.label}</span>
                  <span className="ml-2 rounded-[20px] bg-surface-card px-2 py-0.5 text-[11px] font-extrabold text-ink-muted">
                    {group.events.length}
                  </span>
                </th>
              </tr>
              {group.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  teamsById={teamsById}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          ))}
        </table>
      </Card>
      {moreLabel && (
        <div className="mt-3">
          <Button variant="secondary" full onClick={() => setRevealed(true)}>
            {moreLabel}
          </Button>
        </div>
      )}
    </>
  )
}
