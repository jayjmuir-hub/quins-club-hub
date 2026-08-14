import { useState } from 'react'
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

const HEAD =
  'sticky top-0 z-10 bg-surface-sunk px-3 py-2.5 text-left text-[11.5px] font-extrabold uppercase tracking-[.5px] text-ink-muted'
const CELL = 'border-t border-line px-3 py-2 text-[14px] text-ink align-middle'

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

// Results render as a Chip with the outcome as its type. design-system.md
// §4.7 is explicit that win/loss/draw are variants of the SAME chip used on
// the Schedule's Results rows, not a second component — and those pairings
// carry measured AA ratios in Chip.jsx (the raw --good/--good-bg pair is only
// 3.06:1 and was deliberately darkened). Colouring the score text here with
// new classes would have re-invented that, badly, and skipped the contrast
// gate. An earlier draft of this file did exactly that with a `text-good-deep`
// class that does not exist, which would have silently rendered unstyled.
export default function ScheduleTable({ events, teamsById, onSelect, emptyMessage }) {
  const [sort, setSort] = useState({ key: 'starts_at', dir: 'asc' })

  const sorted = [...events].sort((a, b) => {
    const result = compare(a, b, sort.key, teamsById)
    // Date is the tiebreaker for every other column, so two U10 fixtures or
    // two trainings still come out in chronological order.
    const tie = result === 0 && sort.key !== 'starts_at' ? eventDate(a) - eventDate(b) : 0
    return (sort.dir === 'asc' ? result : -result) || tie
  })

  if (sorted.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-ink-muted">{emptyMessage}</p>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-collapse" data-testid="schedule-table">
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
              <th scope="col" className={`${HEAD} w-px`}><span className="sr-only">Open fixture</span></th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((event) => {
              const date = eventDate(event)
              const outcome = hasResult(event) ? resultOutcome(event) : null

              return (
                <tr
                  key={event.id}
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
                    {/* Was formatted inline here with a hardcoded 'Asia/Dubai'
                        — the one piece of date arithmetic in a file whose
                        header says it does none. Now formatTableDate, which
                        also adds the weekday. */}
                    <span data-testid="schedule-date" className="font-bold">
                      {formatTableDate(date)}
                    </span>
                    <span className="ml-2 text-[13px] text-ink-faint">{eventTimeLabel(event)}</span>
                  </td>

                  <td className={CELL}>
                    <Chip type={TYPE_TONE[event.type]}>{TYPE_LABEL[event.type] ?? event.type}</Chip>
                  </td>

                  <td className={`${CELL} whitespace-nowrap text-ink-muted`}>
                    {teamsById.get(event.team_id)?.name ?? 'No age group'}
                  </td>

                  <td className={`${CELL} font-semibold`}>
                    <span data-testid="schedule-fixture">{eventTitle(event)}</span>
                    {/* Home/away is only meaningful for a match — a training
                        session has no opponent to be away at. */}
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
                      // stopPropagation: without it the row handler fires too,
                      // calling onSelect twice for one click. Harmless today
                      // (it sets the same id) but it is the kind of thing that
                      // becomes a double-submit the moment the handler does
                      // anything but assign state.
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
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
