import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import ScopeNote from '../components/ScopeNote.jsx'
import Spinner from '../components/Spinner.jsx'
import TeamPills, { ALL_TEAMS_ID, PillButton } from '../components/TeamPills.jsx'
import Availability from './Availability.jsx'
import EventDetail from './EventDetail.jsx'
import EventForm from './EventForm.jsx'
import { listEvents, subscribeEvents } from '../data/events.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'
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

// Schedule & fixtures (design-system.md §5.2): scope note, section head,
// Upcoming/Results/Calendar sub-tabs, a team filter, then the list or the
// month grid. Reads events once for the whole visible scope and filters in
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

function CalendarMonth({ month, onMonthChange, events, teamsById, onSelect }) {
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

            if (dayEvents.length === 0) {
              return (
                <div key={dayNumber} data-testid="calendar-day" className={cellClasses}>
                  {dayNumber}
                </div>
              )
            }

            return (
              <button
                key={dayNumber}
                type="button"
                data-testid="calendar-day"
                onClick={() => onSelect(dayEvents[0].id)}
                aria-label={`${dayNumber} ${firstOfMonth.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long' })}, ${dayEvents.length} ${dayEvents.length === 1 ? 'event' : 'events'}`}
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
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [month, setMonth] = useState(currentClubMonth)
  // null = the form is closed. { event: null } = adding; { event } = editing.
  // A wrapper object rather than the event itself, so "add" is distinguishable
  // from "closed" without a second boolean that could drift out of sync.
  const [formState, setFormState] = useState(null)
  // Whether the RSVP/team-sheet sheet is open for the currently selected
  // event (Task 16). Tied to selectedEventId rather than carrying its own
  // event id: Availability only ever opens from within the open detail
  // sheet, for that same fixture, so there is nothing else for it to name.
  const [availabilityOpen, setAvailabilityOpen] = useState(false)

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
  const canEditAnything = admin || memberships.some((membership) => membership.role === 'coach')
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
  const upcoming = sortByStart(visible.filter((event) => !hasResult(event)), 'asc')
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

  return (
    <section>
      {!admin && (
        <ScopeNote tone={canEditAnything ? 'coach' : 'parent'}>
          <b>
            {roleLabel(memberships)} view{canEditAnything ? '' : ' · read-only'}.
          </b>{' '}
          You&apos;re seeing {teamNames || 'no squads'} — every other age group is hidden.
        </ScopeNote>
      )}

      {/* design-system.md §5.2: the section head carries an "Add" button on
          the right for admin/coach. It is absent, not disabled, for everyone
          else — and it only exists at all now that Task 14's form does. */}
      <div className="mb-3.5 mt-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Schedule &amp; fixtures</h2>
          <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>{admin ? 'All squads' : teamNames || 'No squads yet'}</p>
        </div>
        {canEditAnything && (
          <button
            type="button"
            onClick={() => setFormState({ event: null })}
            className="shrink-0 rounded-[11px] bg-brand px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Add event
          </button>
        )}
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
          teams there is nothing to filter between, and TeamPills already
          renders nothing for an empty list. */}
      {tab !== 'calendar' && scopedTeams.length > 1 && (
        <div className="mb-4">
          <TeamPills teams={scopedTeams} selected={activeFilter} onChange={persistFilter} />
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
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mt-4 rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Try again
          </button>
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
            emptyMessage="No upcoming fixtures yet."
          />
        ) : (
          <FixtureList
            events={upcoming}
            teamsById={teamsById}
            onSelect={setSelectedEventId}
            emptyMessage="No upcoming fixtures yet."
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
        />
      )}

      {selectedEvent && !formState && !availabilityOpen && (
        <EventDetail
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setSelectedEventId(null)}
          canEdit={canEditSelected}
          onEdit={(event) => setFormState({ event })}
          onOpenAvailability={() => setAvailabilityOpen(true)}
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
    </section>
  )
}
