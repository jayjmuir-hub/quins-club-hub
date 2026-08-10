import { useEffect, useMemo, useState } from 'react'
import Button from '../components/Button.jsx'
import CalendarSubscribe from '../components/CalendarSubscribe.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import TeamFilter, { ALL_TEAMS_ID, PillButton } from '../components/TeamFilter.jsx'
import Availability from './Availability.jsx'
import Register from './Register.jsx'
import EventDetail from './EventDetail.jsx'
import EventForm from './EventForm.jsx'
import { listEvents, subscribeEvents } from '../data/events.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin, isSquadStaffRole, roleLabel, visibleTeams } from '../lib/scope.js'
import { clubDayParts, clubToday, eventDate, hasResult, sortByStart } from '../lib/eventFormat.js'
import ScheduleTable from '../components/ScheduleTable.jsx'
import { useMediaQuery, WIDE_QUERY } from '../lib/useMediaQuery.js'

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
  return events.filter((event) => event?.type === typeFilter)
}

// Schedule (design-system.md §5.2 calls it "Schedule & fixtures"; renamed on
// screen 9 Aug 2026 — the head said the same thing twice): scope note, section
// head, Upcoming/Results/Calendar sub-tabs, a team filter, an event-type
// filter on Upcoming, then the list or the month grid. Reads events once for the whole visible scope and filters in
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

// Every calendar day cell carries these, whether it renders as a <div> (no
// events) or a <button> (has events). The flex + start-alignment tokens are
// load-bearing, not decorative — see the comment at the cell markup.
const CELL_LAYOUT =
  'relative flex aspect-square items-start justify-start rounded-[9px] border p-[5px] text-left text-[12.5px] font-semibold text-ink'

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

function FixtureList({ events, teamsById, onSelect, emptyMessage }) {
  if (events.length === 0) {
    return (
      <Card>
        <Empty message={emptyMessage} />
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      {events.map((event) => (
        <FixtureRow
          key={event.id}
          event={event}
          teamName={teamsById.get(event.team_id)?.name}
          onSelect={onSelect}
        />
      ))}
    </Card>
  )
}

// `onSelect` (an event id) is still needed for the fixture list rendered under
// the grid; `onSelectDay` (a day number) is the grid's own handler. They are
// separate because tapping a cell no longer means "open an event" — it means
// "open that day".
function CalendarMonth({ month, onMonthChange, events, teamsById, onSelect, onSelectDay }) {
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

  return (
    <>
      <Card className="p-[14px]">
        <div className="mb-3 flex items-center justify-between">
          <b className="text-base font-extrabold text-ink">
            {firstOfMonth.toLocaleDateString(undefined, {
              timeZone: 'UTC',
              month: 'long',
              year: 'numeric',
            })}
          </b>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => goToMonth(-1)}
              className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-surface-mute text-ink transition hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ChevronIcon direction="left" className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => goToMonth(1)}
              className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-surface-mute text-ink transition hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ChevronIcon direction="right" className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

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
            // CELL_LAYOUT is shared verbatim by both variants, and it is what
            // keeps them aligned. A day with events must be a <button> for
            // keyboard access, and Chromium's UA stylesheet lays a button's
            // content out centred inside its box — so with only `p-[5px]` the
            // number floated in the middle of a populated cell while its empty
            // <div> neighbours sat top-left (measured 66px vs 8px from the top
            // at 1280px, where the cells are 147px tall: the grid read as
            // broken). Making every cell an explicit flex container with
            // start alignment overrides that UA layout, so both variants place
            // the number identically at any cell size. Do not move any of
            // these tokens onto one branch only — tests/schedule.test.jsx
            // asserts both variants carry all of them.
            const cellClasses = [
              CELL_LAYOUT,
              isToday ? 'border-brand shadow-[inset_0_0_0_1px_theme(colors.brand.DEFAULT)]' : 'border-line',
            ].join(' ')

            // EVERY cell is a <button> as of Task 23, not just populated
            // ones. Two reasons, and the second is the one that mattered:
            //
            //  1. A day with no events still has an action now — open the
            //     day and add one — so an inert <div> would be a lie.
            //  2. It collapses the two variants into one. The CELL_LAYOUT
            //     note above exists because a <button> and a <div> lay their
            //     content out differently under Chromium's UA stylesheet,
            //     and the two had to be kept in lockstep by hand. With a
            //     single variant there is nothing left to drift.
            const monthName = firstOfMonth.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long' })
            const eventCount = dayEvents.length
            const label =
              eventCount === 0
                ? `${dayNumber} ${monthName}, no events`
                : `${dayNumber} ${monthName}, ${eventCount} ${eventCount === 1 ? 'event' : 'events'}`

            return (
              <button
                key={dayNumber}
                type="button"
                data-testid="calendar-day"
                onClick={() => onSelectDay(dayNumber)}
                aria-label={label}
                className={`${cellClasses} transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
              >
                {dayNumber}
                <span className="absolute bottom-1 left-1 flex gap-0.5" aria-hidden="true">
                  {dayEvents.slice(0, 4).map((event) => (
                    <span
                      key={event.id}
                      className={['h-1.5 w-1.5 rounded-full', DOT_COLOURS[event.type] ?? 'bg-ink-faint'].join(' ')}
                    />
                  ))}
                </span>
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

// Formats { year, month, day } as the ISO yyyy-mm-dd the event form's date
// input expects. Built by hand from the numbers rather than via a Date, so it
// cannot be dragged into the reader's zone on the way through.
function isoDay({ year, month, day }) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

// Opened by tapping any calendar cell (Task 23). Replaces the old behaviour,
// which opened dayEvents[0] directly — that silently swallowed every event
// after the first, so a Saturday with three age groups playing showed three
// dots, opened one fixture, and gave you no route to the other two.
//
// Deliberately shown for empty days too. "Nothing on, add something" is the
// answer to the question the tap asked, and it is the only place in the app
// where the date is already known when the form opens.
function DaySheet({ day, events, teamsById, canManage, onClose, onSelectEvent, onAddEvent }) {
  const title = monthAnchor(day.year, day.month, day.day).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <Sheet open onClose={onClose} title={title}>
      {events.length === 0 ? (
        <Empty message="Nothing on this day." />
      ) : (
        <div className="overflow-hidden rounded-[11px] border border-line">
          {events.map((event) => (
            <FixtureRow
              key={event.id}
              event={event}
              teamName={teamsById.get(event.team_id)?.name}
              onSelect={onSelectEvent}
            />
          ))}
        </div>
      )}

      {/* ⚠️ This carried `hover:bg-brand-dark` until 10 Aug 2026. There is no
          `brand.dark` in tailwind.config.js — only `DEFAULT`, `deep`, `ink` and
          `onDark` — so Tailwind emitted nothing and this button, alone in the
          app, had NO hover state. It was the single use of that name anywhere
          in src, which is exactly how a typo in a class string survives:
          nothing fails, the button just quietly does less. */}
      {canManage && (
        <Button size="lg" full onClick={onAddEvent} className="mt-3.5">
          Add event
        </Button>
      )}
    </Sheet>
  )
}

export default function Schedule() {
  const { memberships, teams } = useMemberships()

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  // The table is a `wide` feature, not a `desktop` one. At 820-1279px — a
  // landscape tablet or a small laptop — the stacked FixtureRow list is still
  // the better shape; seven columns there would be cramped rather than dense.
  const isWide = useMediaQuery(WIDE_QUERY)

  const [tab, setTab] = useState('upcoming')
  const [teamFilter, setTeamFilter] = useState(readStoredFilter)
  const [typeFilter, setTypeFilter] = useState(readStoredTypeFilter)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [month, setMonth] = useState(currentClubMonth)
  // null = no day sheet. Otherwise { year, month, day } for the tapped cell.
  // Carries its own year/month rather than just the day number so that paging
  // the calendar behind an open sheet cannot silently repoint it at a
  // different month's 8th.
  const [selectedDay, setSelectedDay] = useState(null)
  // null = the form is closed. { event: null } = adding; { event } = editing.
  // A wrapper object rather than the event itself, so "add" is distinguishable
  // from "closed" without a second boolean that could drift out of sync.
  const [formState, setFormState] = useState(null)
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

    listEvents({ teamIds })
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
  }, [teamIds, reloadToken])
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
  const canEditAnything = admin || memberships.some((membership) => isSquadStaffRole(membership.role))
  const teamNames = scopedTeams.map((team) => team.name).join(', ')

  // A stored team filter can outlive the team it names: memberships reload,
  // the user's scope shrinks, and `teamFilter` still points at a squad that is
  // no longer in it — leaving an empty list with no pill selected. Worse, if
  // the scope shrinks to a single team the whole pill row is hidden (below),
  // so there is no "All" pill left to click and the list stays empty until the
  // user navigates away and back. Reconciling against the live scope on every
  // render, rather than trusting the stored value, prevents that.
  // Roster.jsx does the same, for the same reason.
  const activeFilter = teamIds.includes(teamFilter) ? teamFilter : ALL_TEAMS_ID

  const visible =
    activeFilter === ALL_TEAMS_ID ? events : events.filter((event) => event.team_id === activeFilter)
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
  const canEditSelected = selectedEvent ? canEditTeam(memberships, selectedEvent.team_id) : false
  const refresh = () => setReloadToken((token) => token + 1)

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

  return (
    <section>
      {/* design-system.md §5.2: the section head carries an "Add" button on
          the right for admin/coach. It is absent, not disabled, for everyone
          else — and it only exists at all now that Task 14's form does. */}
      <div className="mb-3.5 mt-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Schedule</h2>
          <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>{admin ? 'All squads' : teamNames || 'No squads yet'}</p>
        </div>
        {/* "Add to calendar" sits beside "Add event" and is for EVERYONE — a
            parent subscribing to their child's fixtures is the main case, not
            an organiser one. */}
        <div className="flex shrink-0 items-center gap-2">
          <CalendarSubscribe />
          {canEditAnything && (
            <Button onClick={() => setFormState({ event: null })} className="shrink-0">
              Add event
            </Button>
          )}
        </div>
      </div>

      <div className="mb-3 flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        <div className="mb-4">
          <TeamFilter teams={scopedTeams} selected={activeFilter} onChange={persistFilter} />
        </div>
      )}

      {/* Event-type filter: Upcoming only, and for EVERYONE — a parent asking
          "when is the next training?" is the main case, not an organiser one.
          Same PillButton as the sub-tabs above, labelled so the two rows can't
          be confused with each other by a screen reader. */}
      {tab === 'upcoming' && (
        <div
          role="group"
          aria-label="Filter by event type"
          className="mb-4 flex gap-2 overflow-x-auto desktop:flex-wrap desktop:overflow-x-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {TYPE_FILTERS.map(({ id, label }) => (
            <PillButton key={id} active={typeFilter === id} onClick={() => persistTypeFilter(id)}>
              {label}
            </PillButton>
          ))}
        </div>
      )}

      {isFirstLoad && (
        <Card className="flex justify-center py-10">
          <Spinner />
        </Card>
      )}

      {!isFirstLoad && error && (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the schedule</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-deep">
            {error.message || 'Something went wrong. Try again.'}
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
          />
        ) : (
          <FixtureList
            events={upcoming}
            teamsById={teamsById}
            onSelect={setSelectedEventId}
            emptyMessage={upcomingEmpty}
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
          />
        ) : (
          <FixtureList
            events={results}
            teamsById={teamsById}
            onSelect={setSelectedEventId}
            emptyMessage="No results yet. Scores show here once someone adds them."
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
            setFormState({ event: null, date: isoDay(selectedDay) })
            setSelectedDay(null)
          }}
        />
      )}

      {selectedEvent && !formState && !availabilityOpen && !registerOpen && (
        <EventDetail
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setSelectedEventId(null)}
          canEdit={canEditSelected}
          onEdit={(event) => setFormState({ event })}
          onOpenAvailability={() => setAvailabilityOpen(true)}
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
      {formState && (
        <EventForm
          event={formState.event}
          initialDate={formState.date ?? null}
          onClose={() => {
            setFormState(null)
            setSelectedEventId(null)
          }}
          onSaved={refresh}
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
