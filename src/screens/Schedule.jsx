import { useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button.jsx'
import CalendarSubscribe from '../components/CalendarSubscribe.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import DaySheet from '../components/DaySheet.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import TeamFilter, { ALL_TEAMS_ID, PillButton } from '../components/TeamFilter.jsx'
import { sectionGroups, teamIdsForFilter } from '../lib/section.js'
import Availability from './Availability.jsx'
import Register from './Register.jsx'
import EventDetail from './EventDetail.jsx'
import EventForm from './EventForm.jsx'
import EventKindChooser from '../components/EventKindChooser.jsx'
import TournamentDetail, { isTournamentEvent } from './TournamentDetail.jsx'
import { listEvents, subscribeEvents } from '../data/events.js'
import { useMemberships } from '../lib/memberships.jsx'
import { adminTeamReach, canEditEvent, canEditTeam, isAdmin, isSquadStaffRole, visibleTeams } from '../lib/scope.js'
import {
  clubDayParts,
  clubToday,
  eventDate,
  eventTimeLabel,
  eventTitle,
  hasResult,
  isTimeTbd,
  sortByStart,
} from '../lib/eventFormat.js'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import { defaultEventWindow, isMonthOutsideWindow, windowCovering } from '../lib/eventWindow.js'
import ScheduleTable from '../components/ScheduleTable.jsx'
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMediaQuery.js'
import {
  groupEventsByMonth,
  initialVisibleMonthCount,
  showMoreMonthsLabel,
} from '../lib/scheduleMonthGroups.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { ListSkeleton } from '../components/Skeleton.jsx'
import { useToast } from '../components/Toast.jsx'

// Same reasoning as Roster's: the filter has to outlive a reload, or a coach
// who runs one age group re-filters on every visit. Separate key from the
// roster's — filtering the schedule to U12 says nothing about which squad you
// want to see the players of.
const TEAM_FILTER_KEY = 'quins.schedule.teamFilter'

function readStoredFilter() {
  try {
    return window.localStorage.getItem(TEAM_FILTER_KEY) || ALL_TEAMS_ID
  } catch {
    return ALL_TEAMS_ID
  }
}

// ══ THE EVENT-TYPE FILTER (Upcoming only) ═══════════════════════════════
// "Everything" plus one pill per event type, so a parent can ask "when is
// training?" without reading past six fixtures. Its own storage key, and
// deliberately NOT folded into the team filter's: which squad you want to see
// and which kind of event you want to see are independent questions, and one
// key holding both would make clearing either one clear the other.
export const ALL_TYPES_ID = 'all'

// `empty` matters as much as `label`. With one message for all four pills, a
// parent who filters to Training and reads "No upcoming fixtures yet" is being
// told the club has nothing on — when in fact there are six matches sitting
// behind the filter they just set.
const TYPE_FILTERS = [
  { id: ALL_TYPES_ID, label: 'Everything', empty: 'No upcoming fixtures yet.' },
  { id: 'match', label: 'Matches', empty: 'No upcoming matches. Try Everything to see what else is on.' },
  { id: 'training', label: 'Training', empty: 'No upcoming training. Try Everything to see what else is on.' },
  { id: 'social', label: 'Socials', empty: 'No upcoming socials. Try Everything to see what else is on.' },
  // ⚠️ 'diary' IS NOT AN events.type — it is type='social' with info_only set.
  // It gets its own pill rather than living under Socials because a kit
  // collection is not a social, and the filter below narrows Socials to match.
  // claude/plans/2026-08-31-club-diary.md.
  { id: 'diary', label: 'Diary', empty: 'Nothing in the club diary. Try Everything to see what else is on.' },
]

const TYPE_FILTER_KEY = 'quins.schedule.typeFilter'

// Valid ids only. A stored value is attacker-free but not trustworthy — an old
// build, a hand-edited localStorage, or a type we later rename all leave a
// string in there that matches no event, and the screen would show an empty
// list with no pill selected and no way back to "Everything".
const TYPE_IDS = TYPE_FILTERS.map((filter) => filter.id)

function readStoredTypeFilter() {
  try {
    const stored = window.localStorage.getItem(TYPE_FILTER_KEY)
    return TYPE_IDS.includes(stored) ? stored : ALL_TYPES_ID
  } catch {
    return ALL_TYPES_ID
  }
}

/**
 * Narrow a list of events to one type.
 *
 * Exported for tests: this is the whole behaviour of the filter, and testing
 * it here is what makes the screen test a check on the wiring rather than on
 * the logic. An unrecognised filter returns everything — never an empty list,
 * which would read to the user as "there is no training" rather than "this
 * filter is broken".
 */
export function filterByType(events, typeFilter) {
  if (!Array.isArray(events)) return []
  if (!typeFilter || !TYPE_IDS.includes(typeFilter) || typeFilter === ALL_TYPES_ID) return events
  // ⚠️ TWO SPECIAL CASES, AND THE SECOND IS THE ONE THAT MATTERS. 'diary' is
  // not an events.type — a Club Diary entry is type='social' with info_only
  // set. Adding the Diary pill WITHOUT narrowing Socials would have left kit
  // collections showing under Socials exactly as before, which is the thing
  // this kind exists to stop, and it would have looked finished.
  //
  // ⚠️ STRICT === true / !== true, so a row written before the migration (or
  // read through a path that does not select the column) stays an ordinary
  // social rather than vanishing from both pills.
  // claude/plans/2026-08-31-club-diary.md.
  if (typeFilter === 'diary') return events.filter((event) => event?.info_only === true)
  if (typeFilter === 'social') {
    return events.filter((event) => event?.type === 'social' && event?.info_only !== true)
  }
  return events.filter((event) => event?.type === typeFilter)
}

// Schedule (design-system.md §5.2 calls it "Schedule & fixtures"; renamed on
// screen 9 Aug 2026 — the head said the same thing twice): scope note, section
// head, then ONE filter bar holding Upcoming/Results/Calendar, the age-group
// dropdown, and the event-type pills. The list is grouped by club-calendar
// month. Reads events once for the whole visible scope and filters in
// memory — the scope is at most 15 teams' worth of fixtures, so refetching
// on every pill tap would add latency and flicker for nothing.
//
// Access control is not enforced here. RLS decides which rows come back;
// visibleTeams() only tells the UI which pills to draw and which team ids
// to ask for, so a mistake here can narrow what a user sees but can never
// widen it.

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'results', label: 'Results' },
  { id: 'calendar', label: 'Calendar' },
]

// The calendar's dot legend only. The fixture rows' own type chips live in
// src/components/FixtureRow.jsx, which carries its own copy of these labels.
const TYPE_LABELS = { match: 'Match', training: 'Training', social: 'Social' }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// How many events a wide calendar cell shows in full before the rest collapse
// into a "+N more" line. Tapping the cell opens the day sheet, which always
// lists every one — so this is a density cap, not a limit on what is reachable.
// Three keeps the busiest day from stretching its whole grid-row taller than
// the month can afford while still showing more than a bare count.
const MAX_CELL_EVENTS = 3

// design-system.md §4.14: match = maroon, training = --sky, social = --warn.
// design-system.md's --muted (#77726e) is specified against a card, where it
// measures 4.755:1 on white and clears AA. This screen's section-head
// sub-line sits OUTSIDE any card, on --paper (#f5f4f3), where the same pair
// measures 4.329:1 and fails the 4.5:1 threshold. Darkened to #5c5854
// (6.417:1 on paper) — the same value Roster.jsx uses for the same reason,
// and the one Chip/Badge already use for --muted on a light fill. --muted
// inside a card (the fixture rows, the calendar weekday headers) is
// untouched.
const MUTED_ON_PAPER = 'text-ink-muted'

const DOT_COLOURS = {
  match: 'bg-brand',
  training: 'bg-accent-mid',
  social: 'bg-warn',
}

function ChevronIcon({ direction = 'left', ...props }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}

// The calendar carries its displayed month as plain { year, month } numbers
// rather than a Date. That is deliberate: a Date is always an instant, and
// every arithmetic path on one (new Date(y, m, d), getDay(), getDate())
// silently reads the *browser's* zone. The club's calendar is Abu Dhabi's,
// so the grid is built from numbers and the only Dates involved are
// UTC-anchored throwaways used purely to ask "what weekday is the 1st?" and
// "how many days has this month got?" — questions about a calendar, not
// about an instant. See CLUB_TIME_ZONE in src/lib/eventFormat.js.
function monthAnchor(year, month, day = 1) {
  return new Date(Date.UTC(year, month, day))
}

function shiftMonth({ year, month }, delta) {
  const anchor = monthAnchor(year, month + delta)
  return { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() }
}

function currentClubMonth() {
  const { year, month } = clubToday()
  return { year, month }
}

function FixtureList({ events, teamsById, onSelect, emptyMessage, revealKey }) {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    setRevealed(false)
  }, [revealKey])

  if (events.length === 0) {
    return (
      <Card>
        <Empty message={emptyMessage} />
      </Card>
    )
  }

  const groups = groupEventsByMonth(events)
  const visibleCount = revealed ? groups.length : initialVisibleMonthCount(groups)
  const visible = groups.slice(0, visibleCount)
  const remaining = groups.slice(visibleCount)
  const moreLabel = showMoreMonthsLabel(remaining)

  // Events without a parseable start are skipped by the grouper (same as the
  // calendar). If that emptied the list, keep the original rows so nothing
  // silently vanishes.
  const sections = visible.length > 0 ? visible : [{ key: 'undated', label: null, events }]

  return (
    <>
      {sections.map((group) => (
        <div key={group.key} className="mb-4 last:mb-0">
          {group.label && (
            <h3
              data-testid="schedule-month"
              className="sticky z-10 mb-2 flex items-center gap-2 bg-surface py-1.5 text-[12.5px] font-extrabold uppercase tracking-[.5px] text-ink"
              style={{ top: 'var(--schedule-filter-h, 0px)' }}
            >
              <span>{group.label}</span>
              <span className="rounded-[20px] bg-surface-sunk px-2 py-0.5 text-[11px] font-extrabold text-ink-muted">
                {group.events.length}
              </span>
            </h3>
          )}
          <Card className="overflow-hidden">
            {group.events.map((event) => (
              <FixtureRow
                key={event.id}
                event={event}
                teamName={event.team_id == null ? 'Whole club' : teamsById.get(event.team_id)?.name}
                onSelect={onSelect}
              />
            ))}
          </Card>
        </div>
      ))}
      {moreLabel && (
        <Button variant="secondary" full onClick={() => setRevealed(true)}>
          {moreLabel}
        </Button>
      )}
    </>
  )
}

// `onSelect` (an event id) is still needed for the fixture list rendered under
// the grid; `onSelectDay` (a day number) is the grid's own handler. They are
// separate because tapping a cell no longer means "open an event" — it means
// "open that day".
// The month heading and its prev/next arrows. Shared by both the wide grid and
// the narrow agenda so month navigation is identical whatever the layout —
// there is no "today" jump, no year picker and no swipe (design-system.md §4.14).
function CalendarNav({ label, onPrev, onNext }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <b className="text-base font-extrabold text-ink">{label}</b>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={onPrev}
          className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-surface-mute text-ink transition hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronIcon direction="left" className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          onClick={onNext}
          className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-surface-mute text-ink transition hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ChevronIcon direction="right" className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

// One event, as it reads inside a wide calendar cell: a type-coloured dot, the
// kick-off time, then the name — the same three facts the old grid buried in a
// bare dot, now legible at a glance (Jay, 29 Aug 2026: "tiny dots on days …
// isn't a premium design"). The time is dropped for a TBD fixture rather than
// printing a placeholder midnight, and the name truncates so a long title can
// never break the seven-column grid. Non-interactive on purpose: the whole
// cell is the button, so this stays a <span> and avoids a button nested in a
// button. Full detail (venue, team, range) is one tap away in the day sheet.
function CalendarCellEvent({ event }) {
  return (
    <span className="flex items-center gap-1 leading-tight" title={eventTitle(event)}>
      <span
        className={['h-1.5 w-1.5 shrink-0 rounded-full', DOT_COLOURS[event.type] ?? 'bg-ink-faint'].join(' ')}
        aria-hidden="true"
      />
      {!isTimeTbd(event) && (
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-ink-muted">{eventTimeLabel(event)}</span>
      )}
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">{eventTitle(event)}</span>
    </span>
  )
}

function CalendarMonth({ month, onMonthChange, events, teamsById, onSelect, onSelectDay, isWide }) {
  const { year, month: monthIndex } = month
  const firstOfMonth = monthAnchor(year, monthIndex)
  const leadingBlanks = firstOfMonth.getUTCDay()
  const dayCount = monthAnchor(year, monthIndex + 1, 0).getUTCDate()
  const today = clubToday()

  // Bucketed by the event's ABU DHABI day, not the reader's. A 01:00 Dubai
  // kick-off is 21:00 the previous day in UTC and 22:00 the previous
  // evening in London, so bucketing on the browser's local day would drop
  // that fixture into the cell before the one it belongs in — and for a
  // fixture on the 1st, into the previous month entirely.
  // The prototype renders leading blanks only, no trailing ones
  // (design-system.md §4.14).
  const byDay = new Map()
  const monthEvents = []
  events.forEach((event) => {
    const date = eventDate(event)
    if (!date) return
    const parts = clubDayParts(date)
    if (parts.year !== year || parts.month !== monthIndex) return
    monthEvents.push(event)
    const bucket = byDay.get(parts.day) ?? []
    bucket.push(event)
    byDay.set(parts.day, bucket)
  })

  const goToMonth = (delta) => onMonthChange(shiftMonth(month, delta))
  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' })
  const monthName = firstOfMonth.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long' })
  const nav = <CalendarNav label={monthLabel} onPrev={() => goToMonth(-1)} onNext={() => goToMonth(1)} />

  // ── Narrow screens: an agenda, not a grid ────────────────────────────────
  // A seven-column month at phone width gives ~45px cells — too small to hold a
  // fixture's name, which is the whole point of the redesign. So on a phone the
  // month collapses to the same rich fixture rows the Upcoming and Results tabs
  // use: the month's events, sorted, under the month nav. Tapping a row opens
  // that event directly; there is no day sheet to reach because there are no
  // cells to tap. The empty state is the fixture list's own.
  if (!isWide) {
    return (
      <>
        <Card className="p-[14px]">{nav}</Card>
        <div className="mt-4">
          <FixtureList
            events={sortByStart(monthEvents, 'asc')}
            teamsById={teamsById}
            onSelect={onSelect}
            emptyMessage="Nothing is scheduled this month."
          />
        </div>
      </>
    )
  }

  // ── Wide screens: a month grid whose cells show the events themselves ─────
  // No fixture list underneath: the grid now carries the names and times, so a
  // second full copy of the month below it would be the exact redundancy this
  // redesign removed.
  return (
    <Card className="p-[14px]">
      {nav}

      <div className="grid grid-cols-7 gap-[5px]">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="text-center text-[10.5px] font-extrabold uppercase text-ink-faint">
            {weekday}
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, index) => (
          <div key={`blank-${index}`} aria-hidden="true" />
        ))}

        {Array.from({ length: dayCount }, (_, index) => {
          const dayNumber = index + 1
          const dayEvents = byDay.get(dayNumber) ?? []
          const isToday = today.year === year && today.month === monthIndex && today.day === dayNumber
          const eventCount = dayEvents.length
          const label =
            eventCount === 0
              ? `${dayNumber} ${monthName}, no events`
              : `${dayNumber} ${monthName}, ${eventCount} ${eventCount === 1 ? 'event' : 'events'}`
          const visible = dayEvents.slice(0, MAX_CELL_EVENTS)
          const overflow = eventCount - visible.length

          // Every cell is a <button> (since Task 23): a day with no events is
          // still actionable — open it and add one — and a single tag means the
          // two visual states can never drift apart under a UA stylesheet the
          // way a <button>/<div> split once did. `overflow-hidden` guarantees a
          // busy day's events can never spill past the square onto its
          // neighbours; anything past MAX_CELL_EVENTS shows as "+N more".
          return (
            <button
              key={dayNumber}
              type="button"
              data-testid="calendar-day"
              onClick={() => onSelectDay(dayNumber)}
              aria-label={label}
              className={[
                'flex aspect-square flex-col items-stretch overflow-hidden rounded-[9px] border p-[5px] text-left transition',
                isToday
                  ? 'border-brand shadow-[inset_0_0_0_1px_theme(colors.brand.DEFAULT)]'
                  : 'border-line',
                'hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              ].join(' ')}
            >
              <span
                className={[
                  'text-[12.5px] font-semibold leading-none',
                  isToday ? 'text-brand-ink' : 'text-ink',
                ].join(' ')}
              >
                {dayNumber}
              </span>
              {eventCount > 0 && (
                <span className="mt-1 flex min-h-0 flex-col gap-[3px]">
                  {visible.map((event) => (
                    <CalendarCellEvent key={event.id} event={event} />
                  ))}
                  {overflow > 0 && (
                    <span className="text-[10px] font-bold text-ink-faint">+{overflow} more</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <span key={type} className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
            <span className={['h-1.5 w-1.5 rounded-full', DOT_COLOURS[type]].join(' ')} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </Card>
  )
}

// Formats { year, month, day } as the ISO yyyy-mm-dd the event form's date
// input expects. Built by hand from the numbers rather than via a Date, so it
// cannot be dragged into the reader's zone on the way through.
function isoDay({ year, month, day }) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

// The day sheet (Task 23) moved to src/components/DaySheet.jsx when the
// Dashboard's fortnight strip turned out to need the same chooser — its
// history and reasoning travelled with it.

export default function Schedule() {
  // Routing out to the full-page match sheet. See onOpenMatchSheet below.
  const navigate = useNavigate()
  const { memberships, teams, loading: membershipsLoading } = useMemberships()

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  // The table is a `wide` feature, not a `desktop` one. At 820-1279px — a
  // landscape tablet or a small laptop — the stacked FixtureRow list is still
  // the better shape; seven columns there would be cramped rather than dense.
  // ⚠️ DESKTOP (820px), NOT `wide` (1280px), SINCE 26 Aug 2026 — Jay: "why
  // can't we have things fill the entire width of the screen?". The shell's
  // main is max-w-none from 820px up, so between 820 and 1280 the phone's
  // stacked list sat in a sea of empty surface. The table is the layout that
  // actually uses the width, and its six columns fit at 820.
  const isWide = useMediaQuery(DESKTOP_QUERY)
  const filterBarRef = useRef(null)
  const [filterH, setFilterH] = useState(0)

  const [tab, setTab] = useState('upcoming')
  const [teamFilter, setTeamFilter] = useState(readStoredFilter)
  const [typeFilter, setTypeFilter] = useState(readStoredTypeFilter)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [month, setMonth] = useState(currentClubMonth)
  // The date range actually fetched. Starts at the default window (12 months
  // back, 6 forward — see src/lib/eventWindow.js) and only ever WIDENS, when
  // the calendar is paged past its edge.
  //
  // ⚠️ NOT named `window`: that shadows the global, and this file reads
  // `window.localStorage` twice at module scope.
  //
  // ⚠️ Anchored ONCE, on mount, rather than recomputed each render. Deriving
  // it inline would mint a new object every render and, through the fetch
  // effect's dependencies, refetch forever.
  const [eventWindow, setEventWindow] = useState(() => defaultEventWindow(currentClubMonth()))
  // null = no day sheet. Otherwise { year, month, day } for the tapped cell.
  // Carries its own year/month rather than just the day number so that paging
  // the calendar behind an open sheet cannot silently repoint it at a
  // different month's 8th.
  const [selectedDay, setSelectedDay] = useState(null)
  // null = the form is closed. { event: null } = adding; { event } = editing.
  // A wrapper object rather than the event itself, so "add" is distinguishable
  // from "closed" without a second boolean that could drift out of sync.
  const [formState, setFormState] = useState(null)
  // The "What are you adding?" chooser (Jay, 29 Aug 2026) sits in FRONT of the
  // form for a NEW event only — editing and duplicating open the form directly,
  // their kind already fixed by the row. Holds the pending context ({ date? })
  // until a kind is picked, then hands off to formState with that kind. See
  // src/components/EventKindChooser.jsx and
  // claude/plans/2026-08-29-tournaments-as-containers.md.
  const [choosingKind, setChoosingKind] = useState(null)
  // Whether the RSVP/team-sheet sheet is open for the currently selected
  // event (Task 16). Tied to selectedEventId rather than carrying its own
  // event id: Availability only ever opens from within the open detail
  // sheet, for that same fixture, so there is nothing else for it to name.
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  // The register (attendance), separate from availability above: the fact
  // rather than the intent, and coach-only. Same parent-holds-the-state
  // wiring, so EventDetail never opens a second sheet of its own.
  const [registerOpen, setRegisterOpen] = useState(false)

  // A stored "availability open" flag can outlive the fixture it was opened
  // for: picking a different row from the list underneath sets
  // selectedEventId directly, bypassing the "close, then open" round trip
  // that would otherwise reset this. Without this effect, selecting a new
  // fixture while the sheet was open would show ITS availability screen
  // rather than its detail sheet — an unrequested screen for the wrong
  // event. Closing the current selection entirely (selectedEventId → null)
  // also passes through here and leaves availabilityOpen false, which is
  // what the "one sheet at a time" comment below relies on.
  useEffect(() => {
    setAvailabilityOpen(false)
    setRegisterOpen(false)
  }, [selectedEventId])

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // `loading` means "a fetch is in flight", which is true of a background
  // realtime refresh as much as of the first load. What must NOT be true of
  // a refresh is blanking the screen — see isFirstLoad below.
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    listEvents({ teamIds, from: eventWindow.from, to: eventWindow.to })
      .then((rows) => {
        if (mounted) setEvents(rows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setEvents([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [teamIds, reloadToken, eventWindow.from, eventWindow.to])

  // ⚠️ PAGING THE CALENDAR PAST THE WINDOW MUST REFETCH, NOT RENDER EMPTY.
  // The calendar can walk to any month; the fetch covers 18. Without this, a
  // month outside the window draws as a month with no fixtures —
  // indistinguishable from a quiet one, and exactly the "short answer that
  // looks complete" failure src/data/limits.js exists to prevent.
  //
  // Widening rather than moving means paging back three years and forward
  // again refetches once, not twice, and never pulls what is already loaded
  // out from under the Upcoming and Results tabs.
  useEffect(() => {
    if (!isMonthOutsideWindow(month, eventWindow)) return
    setEventWindow((current) =>
      isMonthOutsideWindow(month, current) ? windowCovering(month, current) : current,
    )
  }, [month, eventWindow])
  // Realtime: bump the token and let the effect above refetch. The callback
  // closes over nothing but setReloadToken (a stable state setter), so this
  // subscribes exactly once for the life of the screen, and its cleanup only
  // unsubscribes — it never touches focus.
  useEffect(() => subscribeEvents(() => setReloadToken((token) => token + 1)), [])

  // Only the first load (or a load with nothing to show, e.g. retrying after
  // an error) replaces the content with a spinner. A realtime refresh fires
  // on every insert/update/delete anywhere in scope — from any user, on any
  // team — so spinning on those would tear the list out of the DOM and
  // collapse the page height each time somebody else touched a fixture. A
  // refresh keeps the current rows on screen and swaps them in place when
  // the new data lands.
  const isFirstLoad = loading && events.length === 0

  const admin = isAdmin(memberships)
  // Squad staff, not just coaches: team managers and medics hold the same
  // rights (SQUAD_STAFF_ROLES in src/lib/scope.js, mirrored by
  // private.can_edit_team). Asking the helper rather than testing the string
  // is what stops the next role needing an edit here.
  // The admin split (3 Sep 2026): the admin's RIGHT decides, not the row.
  const canEditAnything =
    adminTeamReach(memberships, 'edit') ||
    adminTeamReach(memberships, 'events') ||
    memberships.some((membership) => isSquadStaffRole(membership.role))
  const teamNames = scopedTeams.map((team) => team.name).join(', ')

  // The sidebar's Schedule sub-menu deep-links: /schedule?open=subscribe and
  // /schedule?open=add-event (22 Aug 2026). Consumed here and CLEARED, so the
  // sheet does not reopen on refresh or ride along when the URL is shared.
  // An effect rather than a mount-time read because clicking the sub-item
  // while already ON /schedule changes only the search string — the screen
  // does not remount. subscribeRequest is a counter, not a boolean, so a
  // second click after closing the sheet opens it again.
  const [searchParams, setSearchParams] = useSearchParams()
  const [subscribeRequest, setSubscribeRequest] = useState(0)
  const openParam = searchParams.get('open')
  // /schedule?event=<id> opens that fixture's detail (the chat's fixture
  // card links here, 23 Aug 2026). Consumed and cleared like ?open=.
  const eventParam = searchParams.get('event')
  useEffect(() => {
    if (!eventParam) return
    if (membershipsLoading) return
    setSelectedEventId(eventParam)
    setSearchParams({}, { replace: true })
  }, [eventParam, membershipsLoading, setSearchParams])
  useEffect(() => {
    if (!openParam) return
    // Not consumed until memberships have loaded: on a full-page load of
    // /schedule?open=add-event, canEditAnything is false for a moment simply
    // because the rows have not arrived, and clearing the param then would
    // swallow a legitimate click.
    if (membershipsLoading) return
    if (openParam === 'subscribe') {
      setSubscribeRequest((n) => n + 1)
    } else if (openParam === 'add-event' && canEditAnything) {
      setChoosingKind({})
    }
    // Unknown values (and add-event for people who cannot add) just clear:
    // the gate is the UI's, RLS is the real one, and a stale param must not
    // sit in the address bar waiting to fire.
    setSearchParams({}, { replace: true })
  }, [openParam, canEditAnything, membershipsLoading, setSearchParams])

  // A stored team filter can outlive the team it names: memberships reload,
  // the user's scope shrinks, and `teamFilter` still points at a squad that is
  // no longer in it — leaving an empty list with no pill selected. Worse, if
  // the scope shrinks to a single team the whole pill row is hidden (below),
  // so there is no "All" pill left to click and the list stays empty until the
  // user navigates away and back. Reconciling against the live scope on every
  // render, rather than trusting the stored value, prevents that.
  // Roster.jsx does the same, for the same reason.
  // A section choice ("Senior men") is valid while any of its squads is in
  // scope — src/lib/section.js, phase 2 of the senior section.
  const filterGroups = sectionGroups(scopedTeams)
  const activeFilter =
    teamIds.includes(teamFilter) || filterGroups.some((group) => group.id === teamFilter)
      ? teamFilter
      : ALL_TEAMS_ID
  const filterTeamIds = teamIdsForFilter(activeFilter, scopedTeams, ALL_TEAMS_ID)

  const visible =
    filterTeamIds == null ? events : events.filter((event) => filterTeamIds.includes(event.team_id))
  // The type filter applies to Upcoming ONLY, which is what was asked for and
  // is also the only place it means anything: Results is by definition the
  // fixtures that have a score on them, so filtering it to "Training" would
  // always be empty.
  const upcoming = sortByStart(
    filterByType(visible.filter((event) => !hasResult(event)), typeFilter),
    'asc',
  )
  const upcomingEmpty =
    TYPE_FILTERS.find((filter) => filter.id === typeFilter)?.empty ?? TYPE_FILTERS[0].empty
  const results = sortByStart(visible.filter(hasResult), 'desc')

  // Derive the open event from the live list rather than storing the row
  // itself, so a realtime update keeps the sheet's contents fresh and a
  // deleted fixture closes it instead of stranding a stale copy on screen.
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  // Whether the signed-in user may write to the OPEN event's squad. Asked per
  // team through canEditTeam rather than inferred from the role, so its
  // deliberate refusal of a null/unresolvable team_id applies here too. RLS
  // is what actually enforces this; getting it wrong here can only hide a
  // control, never authorise a write.
  const canEditSelected = selectedEvent ? canEditEvent(memberships, selectedEvent) : false
  const refresh = () => setReloadToken((token) => token + 1)
  // "Added 14 events", for a few seconds after a multi-row save. The Toast
  // the design system specifies (§4.24) does not exist yet; this is the
  // one-line status the review asked for in its place.
  const toast = useToast()

  const persistFilter = (next) => {
    setTeamFilter(next)
    try {
      window.localStorage.setItem(TEAM_FILTER_KEY, next)
    } catch {
      // A filter that can't be persisted still has to work for this session.
    }
  }

  const persistTypeFilter = (next) => {
    setTypeFilter(next)
    try {
      window.localStorage.setItem(TYPE_FILTER_KEY, next)
    } catch {
      // Same as above: Safari private mode throws on setItem, and a filter
      // that can't be remembered still has to work right now.
    }
  }

  const revealKey = `${tab}:${activeFilter}:${typeFilter}`

  useEffect(() => {
    const el = filterBarRef.current
    if (!el) return undefined
    const measure = () => setFilterH(Math.ceil(el.getBoundingClientRect().height))
    measure()
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tab, scopedTeams.length, typeFilter])

  return (
    <section style={{ ['--schedule-filter-h']: `${filterH}px` }}>
      {/* design-system.md §5.2: the section head carries an "Add" button on
          the right for admin/coach. It is absent, not disabled, for everyone
          else — and it only exists at all now that Task 14's form does. */}
      {/* ⚠️ `flex-wrap` IS LOAD-BEARING — WITHOUT IT THIS ROW OVERFLOWS A PHONE
          AND TAKES THE WHOLE DOCUMENT WITH IT. The action group on the right is
          `shrink-0` and cannot give way, and "Add to calendar" alone measures
          150px; at 375px the row wanted 368px inside a 339px content box.
          ⚠️ The damage is NOT confined to this row: once the document is wider
          than the viewport, every element sized to the viewport renders short or
          clipped — the masthead stops reaching the right edge and an open Sheet
          has its close button and every field value cut off, which reads as four
          separate bugs on four screens. Measured 10 Aug 2026 against the built
          stylesheet: 25px of overflow BEFORE the button routing and 29px after,
          so the routing exposed this rather than caused it.
          Wrapping costs a taller header on a phone (54px -> 113px) and nothing at
          all on desktop, where there is room and no wrap occurs.
          AdminDashboard.jsx and Register.jsx already carry `flex-wrap` on this
          same row shape — this is the house pattern, not a new idea. */}
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div>
            <Kicker>Schedule</Kicker>
            {/* The member portal's own events line, word for word. */}
            {/* "Club life, calendared." until 23 Aug 2026 — Jay: "not sure
                calendared makes any sense". It is a word, but a lawyer's one. */}
            <AccentTitle lead="What's on," accent="when." />
          </div>
          <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>{admin && adminTeamReach(memberships, 'see') ? 'All squads' : teamNames || 'No squads yet'}</p>
        </div>
        {/* "Add to calendar" sits beside "Add event" and is for EVERYONE — a
            parent subscribing to their child's fixtures is the main case, not
            an organiser one. */}
        <div className="flex shrink-0 items-center gap-2">
          <CalendarSubscribe openRequest={subscribeRequest} />
          {canEditAnything && (
            <Button onClick={() => setChoosingKind({})} className="shrink-0">
              Add event
            </Button>
          )}
        </div>
      </div>

      <div
        ref={filterBarRef}
        data-testid="schedule-filter-bar"
        className="sticky top-0 z-20 mb-4 rounded-card border border-line bg-surface-card px-3 py-2.5 shadow-card"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div
            role="group"
            aria-label="Schedule view"
            className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map(({ id, label }) => (
              <PillButton key={id} active={tab === id} onClick={() => setTab(id)}>
                {label}
              </PillButton>
            ))}
          </div>

          {/* The calendar always shows the user's whole visible scope, so the
              team filter is hidden there (design-system.md §5.2). Below two
              teams there is nothing to filter between, and TeamFilter already
              renders nothing for an empty list. */}
          {tab !== 'calendar' && scopedTeams.length > 1 && (
            <TeamFilter teams={scopedTeams} groups={filterGroups} selected={activeFilter} onChange={persistFilter} />
          )}

          {/* Event-type filter: Upcoming only, and for EVERYONE — a parent
              asking "when is the next training?" is the main case, not an
              organiser one. Same PillButton as the view tabs, labelled so the
              two groups can't be confused with each other by a screen reader. */}
          {tab === 'upcoming' && (
            <div
              role="group"
              aria-label="Filter by event type"
              className="flex gap-2 overflow-x-auto desktop:flex-wrap desktop:overflow-x-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {TYPE_FILTERS.map(({ id, label }) => (
                <PillButton key={id} active={typeFilter === id} onClick={() => persistTypeFilter(id)}>
                  {label}
                </PillButton>
              ))}
            </div>
          )}
        </div>
      </div>

      {isFirstLoad && (
        // Five fixture rows at the measured 104px (2 Sep 2026 UX review, item 6).
        <div role="status" aria-live="polite" aria-label="Loading the schedule…">
          <ListSkeleton rows={5} rowHeight={104} lead="square" />
        </div>
      )}

      {!isFirstLoad && error && (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load the schedule</h3>
          <p className="mt-2 text-sm leading-relaxed text-danger-ink">
            {friendlyMessage(error, 'Something went wrong. Try again.')}
          </p>
          <Button onClick={() => setReloadToken((token) => token + 1)} className="mt-4">
            Try again
          </Button>
        </Card>
      )}

      {/* Table at `wide`, the stacked list everywhere else. One or the other
          renders, never both: they emit the same fixture titles, so having
          both in the DOM makes every by-text query ambiguous — the same
          reason Roster switches in JS (src/lib/useMediaQuery.js). */}
      {!isFirstLoad && !error && tab === 'upcoming' && (
        isWide ? (
          <ScheduleTable
            events={upcoming}
            teamsById={teamsById}
            onSelect={setSelectedEventId}
            emptyMessage={upcomingEmpty}
            revealKey={revealKey}
          />
        ) : (
          <FixtureList
            events={upcoming}
            teamsById={teamsById}
            onSelect={setSelectedEventId}
            emptyMessage={upcomingEmpty}
            revealKey={revealKey}
          />
        )
      )}

      {!isFirstLoad && !error && tab === 'results' && (
        isWide ? (
          <ScheduleTable
            events={results}
            teamsById={teamsById}
            onSelect={setSelectedEventId}
            emptyMessage="No results yet. Scores show here once someone adds them."
            revealKey={revealKey}
          />
        ) : (
          <FixtureList
            events={results}
            teamsById={teamsById}
            onSelect={setSelectedEventId}
            emptyMessage="No results yet. Scores show here once someone adds them."
            revealKey={revealKey}
          />
        )
      )}

      {!isFirstLoad && !error && tab === 'calendar' && (
        <CalendarMonth
          month={month}
          onMonthChange={setMonth}
          events={events}
          teamsById={teamsById}
          onSelect={setSelectedEventId}
          onSelectDay={(dayNumber) => setSelectedDay({ ...month, day: dayNumber })}
          isWide={isWide}
        />
      )}

      {/* The day sheet sits below the detail and form sheets in precedence:
          opening a fixture from it replaces it rather than stacking. */}
      {selectedDay && !selectedEvent && !formState && (
        <DaySheet
          day={selectedDay}
          events={sortByStart(
            events.filter((event) => {
              const parts = clubDayParts(eventDate(event))
              return (
                parts.year === selectedDay.year &&
                parts.month === selectedDay.month &&
                parts.day === selectedDay.day
              )
            }),
            'asc',
          )}
          teamsById={teamsById}
          canManage={canEditAnything}
          onClose={() => setSelectedDay(null)}
          onSelectEvent={(id) => {
            setSelectedEventId(id)
            setSelectedDay(null)
          }}
          onAddEvent={() => {
            setChoosingKind({ date: isoDay(selectedDay) })
            setSelectedDay(null)
          }}
        />
      )}

      {/* A tournament CONTAINER opens its own detail screen — a games list,
          the placing, add-game — rather than the single-fixture EventDetail.
          isTournamentEvent is the one test of "is this a container", shared so
          the two screens cannot disagree. */}
      {selectedEvent && isTournamentEvent(selectedEvent) && !formState && !availabilityOpen && !registerOpen && (
        <TournamentDetail
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setSelectedEventId(null)}
          canEdit={canEditSelected}
          onEdit={(event) => setFormState({ event })}
          onChanged={refresh}
          onOpenAvailability={() => setAvailabilityOpen(true)}
          onOpenGame={(game) => navigate(`/match-sheet/${game.id}`)}
          onDeleted={() => {
            setSelectedEventId(null)
            refresh()
          }}
        />
      )}

      {selectedEvent && !isTournamentEvent(selectedEvent) && !formState && !availabilityOpen && !registerOpen && (
        <EventDetail
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setSelectedEventId(null)}
          canEdit={canEditSelected}
          onEdit={(event) => setFormState({ event })}
          // ⚠️ THE DASHBOARD PASSES THIS TOO, and it must. EventDetail renders
          // the Duplicate button only when a handler exists, precisely because
          // this component once shipped a dead availability button on the
          // Dashboard for weeks — Schedule passed the handler, the Dashboard
          // did not, and `onOpenAvailability?.()` swallowed every tap in
          // silence. tests/duplicate-event.test.jsx fails if either screen
          // stops passing it.
          onDuplicate={(event) => setFormState({ event, duplicate: true })}
          onOpenAvailability={() => setAvailabilityOpen(true)}
          onOpenMatchSheet={(fixture) => navigate(`/match-sheet/${fixture.id}`)}
          // Squad chat (phase 2): the fixture's thread. Same handler rule.
          onOpenChat={(fixture) => navigate(`/chat/${fixture.team_id}?event=${fixture.id}`)}
          onOpenLineup={(fixture) => navigate(`/lineup/${fixture.id}`)}
          onOpenRegister={() => setRegisterOpen(true)}
          onDeleted={() => {
            setSelectedEventId(null)
            refresh()
          }}
        />
      )}

      {/* One sheet at a time: opening the form closes the detail sheet
          above rather than stacking two dialogs. Closing the form drops
          back to the schedule, not to the detail sheet, which is where a
          coach who just saved wants to be. */}
      {/* The kind chooser, in front of the form for a NEW event. Picking a kind
          hands off to formState carrying that kind (and any date the user was
          adding from); closing drops back to the schedule. */}
      {choosingKind && !formState && (
        <EventKindChooser
          onPick={(kind) =>
            setFormState({ event: null, initialKind: kind, date: choosingKind.date })
          }
          onClose={() => setChoosingKind(null)}
        />
      )}

      {formState && (
        <EventForm
          event={formState.event}
          duplicate={formState.duplicate ?? false}
          initialDate={formState.date ?? null}
          initialKind={formState.initialKind ?? null}
          onClose={() => {
            setFormState(null)
            setChoosingKind(null)
            setSelectedEventId(null)
          }}
          onSaved={(saved, meta) => {
            refresh()
            toast(meta?.count > 1 ? `Added ${meta.count} events.` : 'Saved.')
          }}
        />
      )}

      {/* The RSVP/team-sheet sheet (Task 16). Unlike the form above, closing
          it returns to the event's detail sheet rather than dropping all
          the way back to the schedule: this is a "drill in and back" flow,
          not a save-and-return-to-the-list one — someone who just set their
          RSVP, or a coach who just overrode a player, is most likely to want
          to glance at the fixture they were looking at, not lose their place
          in the list. */}
      {selectedEvent && availabilityOpen && !formState && (
        <Availability
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}

      {selectedEvent && registerOpen && !formState && (
        <Register
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setRegisterOpen(false)}
        />
      )}
    </section>
  )
}
