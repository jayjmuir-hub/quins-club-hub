import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import ScopeNote from '../components/ScopeNote.jsx'
import Spinner from '../components/Spinner.jsx'
import EventDetail from './EventDetail.jsx'
import { listEvents, subscribeEvents } from '../data/events.js'
import { listPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'
import {
  eventDate,
  eventTitle,
  formatLongDate,
  formatTime,
  hasResult,
  sortByStart,
} from '../lib/eventFormat.js'

// Home / dashboard (design-system.md §5.1): scope note, next-fixture hero,
// stat tiles, then the two-column block — upcoming fixtures on the left,
// quick actions + last result on the right (a single stacked column below
// 820px, in that same DOM order).
//
// This screen introduces no data access of its own: it reads exactly the
// same scoped listEvents/listPlayers that Schedule and Roster read, and
// derives everything it shows from those two arrays. Access control is not
// enforced here — RLS decides which rows come back; visibleTeams() only tells
// the UI which team ids to ask for, so a mistake here can narrow what a user
// sees but can never widen it. An empty teamIds array means "no teams, show
// nothing" (see src/data/events.js), never "no filter, show everything".
//
// Deliberately NOT here (Task 16 owns availability RSVPs): the prototype's
// fourth stat tile ("Available for the next event") and the hero's fourth
// countdown box, which is an RSVP "in" count rather than a countdown value.
// Both would need availability data this screen has no business fetching yet,
// so the stat grid is three tiles and the countdown three boxes until Task 16
// adds the fourth of each.

// design-system.md's --muted (#77726e) is specified against a card, where it
// measures 4.755:1 on white and clears AA. The block titles sit OUTSIDE any
// card, on --paper (#f5f4f3), where the same pair measures 4.329:1 and fails
// the 4.5:1 threshold. Darkened to #5c5854 (6.417:1 on paper) — the same
// value Schedule.jsx and Roster.jsx use for the same reason.
const MUTED_ON_PAPER = 'text-[#5c5854]'

// design-system.md §3: .btn{padding:10px 15px;border-radius:11px}, 14px/700.
// `flex items-center justify-center` is load-bearing rather than decorative:
// these are full-width buttons and links used as layout boxes, and a
// <button>'s content is centred by Chromium's UA stylesheet but an <a>'s is
// not — so without an explicit layout the two variants would sit differently
// on the same stack. Declared once here so they cannot drift.
const BUTTON_BASE =
  'flex w-full items-center justify-center gap-2 rounded-[11px] px-[15px] py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2'
// Ghost: --maroon text on white, 5.93:1, clears AA.
const BUTTON_GHOST = `${BUTTON_BASE} bg-white text-quinsRed shadow-[inset_0_0_0_1.5px_#e6e3e1] hover:bg-[#faf8fb]`

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Whole days/hours/minutes between two instants, floored and never negative.
 *
 * A pure instant subtraction, and correctly zone-agnostic — "how long until
 * kick-off" is the same answer in Abu Dhabi and in London, unlike the
 * *displayed* date and time, which always render in club time via
 * eventFormat.js. Local to this screen because only the hero needs it; the
 * shared lib is for things two screens genuinely share.
 */
function countdownParts(target, now) {
  const remaining = Math.max(0, target - now)
  return {
    days: Math.floor(remaining / DAY),
    hours: Math.floor((remaining % DAY) / HOUR),
    minutes: Math.floor((remaining % HOUR) / MINUTE),
  }
}

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

function ClockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function PinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

function BlockTitle({ children }) {
  return (
    <h3 className={`mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] first:mt-0 ${MUTED_ON_PAPER}`}>
      {children}
    </h3>
  )
}

function StatTile({ testId, value, label, tone = 'text-[#221f1d]', className = '' }) {
  return (
    <Card data-testid={testId} className={`px-4 py-[15px] ${className}`}>
      <div className={`text-[27px] font-extrabold leading-none tracking-[-0.5px] ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[12.5px] font-semibold text-[#77726e]">{label}</div>
    </Card>
  )
}

function CountdownBox({ testId, value, label }) {
  return (
    <div className="flex-1 rounded-[10px] bg-white/[.14] py-2 text-center">
      <b data-testid={testId} className="block text-[22px] font-extrabold leading-none">
        {value}
      </b>
      <span className="mt-1 block text-[10px] uppercase tracking-[1px] opacity-80">{label}</span>
    </div>
  )
}

// design-system.md §4.11. Two-stop plum -> maroon gradient, white text
// throughout (>= 5.9:1 against the lighter maroon end).
function NextFixtureHero({ event, teamName, now }) {
  const date = eventDate(event)
  const { days, hours, minutes } = countdownParts(date.getTime(), now)

  return (
    <div
      data-testid="next-fixture"
      className="mb-4 overflow-hidden rounded-[16px] bg-[image:linear-gradient(135deg,theme(colors.quinsRedDark),theme(colors.quinsRed))] p-[18px] text-white shadow-[0_6px_24px_rgba(20,20,20,0.10)]"
    >
      <div className="text-[11px] font-bold uppercase tracking-[1.6px] opacity-80">
        Next fixture{teamName ? ` · ${teamName}` : ''}
      </div>

      <div className="mt-1.5 text-[23px] font-extrabold leading-tight desktop:text-[27px]">
        {eventTitle(event)}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] font-semibold">
        <span className="flex items-center gap-1.5">
          <CalendarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {formatLongDate(date)}
        </span>
        <span className="flex items-center gap-1.5">
          <ClockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {formatTime(date)}
        </span>
        {event.venue && (
          <span className="flex items-center gap-1.5">
            <PinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {event.venue}
          </span>
        )}
        {/* The prototype's hero carries a .chip.home / .chip.away badge here
            (design-system.md §4.11). Rendered as a translucent white pill
            rather than through <Chip>, because Chip's home/away variants are
            pale fills meant for a white card — on this maroon gradient they
            read as a smudge, while the same white/.18 fill the countdown
            boxes use sits on it cleanly. `home` is the events column's real
            name (boolean, defaults true); it is nullable, so a null stays
            silent rather than claiming "Away". */}
        {event.type === 'match' && event.home != null && (
          <span className="rounded-[20px] bg-white/[.18] px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[.5px]">
            {event.home ? 'Home' : 'Away'}
          </span>
        )}
      </div>

      {/* Times shown are Abu Dhabi time, stated once here rather than on
          every line — the club has one home ground, so a parent reading from
          abroad needs to know which clock these are on. */}
      <p className="mt-2 text-[11.5px] opacity-80">All times are Abu Dhabi time.</p>

      <div data-testid="countdown" className="mt-3.5 flex gap-2.5">
        <CountdownBox testId="countdown-days" value={days} label="Days" />
        <CountdownBox testId="countdown-hours" value={hours} label="Hrs" />
        <CountdownBox testId="countdown-minutes" value={minutes} label="Min" />
      </div>
    </div>
  )
}

// Quick actions (design-system.md §5.1). Every role gets the same two
// navigation actions; a read-only role additionally gets a line saying why
// there is nothing else here.
//
// The prototype's admin/coach variant also lists "Add fixture or training"
// and "Add a player". Those are absent, not disabled, and deliberately so:
// Tasks 14 and 15 own event and player writes, and there is no route for
// either form to open yet. src/screens/EventDetail.jsx already settled this
// question for the identical Task 14 gap — "adding a disabled or read-only
// affordance now would promise a control that doesn't exist yet" — and it
// matters more here than there, because this is the landing screen and so
// the first thing a coach sees. The card gains the two buttons when the
// forms land, whichever way it renders today.
function QuickActions({ canEdit, readOnlyRole }) {
  return (
    <Card data-testid="quick-actions" className="p-[14px]">
      <div className="flex flex-col gap-2.5">
        <Link to="/schedule" className={BUTTON_GHOST}>
          {canEdit ? 'View full schedule' : 'View schedule'}
        </Link>
        <Link to="/roster" className={BUTTON_GHOST}>
          View team list
        </Link>

        {/* The role noun comes from roleLabel(), the same source as the scope
            note at the top of this screen. Hardcoding "parent" here told a
            player they were a parent, twelve lines below a scope note that
            said "Player view". */}
        {readOnlyRole && (
          <p className="text-center text-[12.5px] leading-relaxed text-[#77726e]">
            You&apos;re signed in as a {readOnlyRole}, so you can read fixtures and squads but not
            change them.
          </p>
        )}
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { memberships, teams } = useMemberships()

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  const [events, setEvents] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedEventId, setSelectedEventId] = useState(null)

  // The countdown is recomputed on render, and re-rendered once a minute so
  // that a phone left on this screen doesn't sit showing a stale "3 Min" for
  // an hour. The timer itself is started further down, once we know whether
  // there is a hero to tick for.
  const [now, setNow] = useState(() => Date.now())

  // Both reads go out together and land together: the stat tiles mix counts
  // from each, so settling them independently would show a half-filled grid.
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    Promise.all([listEvents({ teamIds }), listPlayers({ teamIds })])
      .then(([eventRows, playerRows]) => {
        if (!mounted) return
        setEvents(eventRows)
        setPlayers(playerRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setEvents([])
        setPlayers([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setSettled(true)
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

  // Only a load with nothing on screen replaces the content with a spinner. A
  // realtime refresh fires on every insert/update/delete anywhere in scope,
  // from any user — spinning on those would tear the dashboard out of the DOM
  // and collapse the page height each time somebody else touched a fixture.
  const isFirstLoad = loading && !settled

  const admin = isAdmin(memberships)
  // Asked through canEditTeam rather than by looking for a 'coach' row, so
  // this agrees with the helper that will gate the actual writes in Tasks
  // 14/15: canEditTeam deliberately refuses a coach row with a null team_id,
  // and a raw role check would grant on one — enabling an action that opens a
  // form with no squad to pick. Same shape as Schedule.jsx's precedent.
  const canEdit = admin || scopedTeams.some((team) => canEditTeam(memberships, team.id))
  // Null for anyone who can edit; otherwise the role noun for the read-only
  // explanation, from the same roleLabel() the scope note uses.
  const readOnlyRole = canEdit ? null : roleLabel(memberships).toLowerCase()
  const teamNames = scopedTeams.map((team) => team.name).join(', ')

  // "To play" is the project's result rule: a fixture is a result when a
  // score is recorded, not when its date has passed (see hasResult). A match
  // played last week whose score nobody has entered is still to play, and
  // still listed — which is the point, it stays visible until someone records
  // the score.
  const toPlay = sortByStart(events.filter((event) => !hasResult(event)), 'asc')
  const results = sortByStart(events.filter(hasResult), 'desc')
  const lastResult = results[0] ?? null

  // The hero is the one place that also needs the fixture to be in the
  // FUTURE: a countdown to an instant that has passed is meaningless, so an
  // unscored fixture from last week is legitimately "to play" in the list
  // above but can never be the next fixture. Matches come first, falling back
  // to the next event of any type (design-system.md §4.11).
  const future = toPlay.filter((event) => {
    const date = eventDate(event)
    return date != null && date.getTime() > now
  })
  const nextFixture = future.find((event) => event.type === 'match') ?? future[0] ?? null

  // Gated on the hero existing: with nothing to count down to there is
  // nothing for a tick to change, and an ungated timer re-renders the whole
  // dashboard every 60s for no visible effect. The dependency is a boolean,
  // not the event, so a realtime refetch that returns the same next fixture
  // doesn't restart the interval.
  const hasCountdown = nextFixture != null
  useEffect(() => {
    if (!hasCountdown) return undefined
    const id = setInterval(() => setNow(Date.now()), MINUTE)
    return () => clearInterval(id)
  }, [hasCountdown])

  const upcoming = toPlay.slice(0, 5)

  // Derive the open event from the live list rather than storing the row
  // itself, so a realtime update keeps the sheet's contents fresh and a
  // deleted fixture closes it instead of stranding a stale copy on screen.
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  if (isFirstLoad) {
    return (
      <section>
        <h2 className="sr-only">Dashboard</h2>
        <Card className="flex justify-center py-10">
          <Spinner label="Loading your dashboard…" />
        </Card>
      </section>
    )
  }

  if (error) {
    return (
      <section>
        <h2 className="sr-only">Dashboard</h2>
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-quinsRedDark">We couldn&apos;t load your dashboard</h3>
          <p className="mt-2 text-sm leading-relaxed text-quinsRedDark">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mx-auto mt-4 w-auto rounded-[11px] bg-quinsRed px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#D62A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </Card>
      </section>
    )
  }

  return (
    <section>
      {/* The prototype's home view has no visible title (design-system.md
          §5.1) — the hero is the page's opening statement. This heading keeps
          the document outline intact for screen readers without changing the
          approved design. */}
      <h2 className="sr-only">Dashboard</h2>

      {!admin && (
        <ScopeNote tone={canEdit ? 'coach' : 'parent'}>
          <b>
            {roleLabel(memberships)} view{canEdit ? '' : ' · read-only'}.
          </b>{' '}
          You&apos;re seeing {teamNames || 'no squads'} — every other age group is hidden.
        </ScopeNote>
      )}

      {nextFixture && (
        <NextFixtureHero
          event={nextFixture}
          teamName={teamsById.get(nextFixture.team_id)?.name}
          now={now}
        />
      )}

      <div className="grid grid-cols-2 gap-3 desktop:grid-cols-3">
        <StatTile
          testId="stat-players"
          value={players.length}
          label={admin ? 'Registered players' : 'Players in view'}
          tone="text-quinsRed"
        />
        <StatTile testId="stat-fixtures" value={toPlay.length} label="Fixtures to play" />
        {/* Third of three tiles: fills the row on mobile's 2-up grid rather
            than leaving a ragged half-width tile. */}
        <StatTile
          testId="stat-groups"
          value={scopedTeams.length}
          label={admin ? 'Age groups' : 'Your groups'}
          className="col-span-2 desktop:col-span-1"
        />
      </div>

      {/* Mobile: one column, stacked in DOM order (upcoming, quick actions,
          last result). Desktop: 1.15fr / .85fr two-column grid
          (design-system.md §5.1). The two wrappers give both layouts from the
          same DOM order. */}
      <div className="mt-[18px] desktop:grid desktop:grid-cols-[1.15fr_0.85fr] desktop:gap-[18px]">
        <div>
          <BlockTitle>Upcoming</BlockTitle>
          {upcoming.length === 0 ? (
            <Card data-testid="upcoming-list">
              <Empty message="No upcoming fixtures yet." />
            </Card>
          ) : (
            <Card data-testid="upcoming-list" className="overflow-hidden">
              {upcoming.map((event) => (
                <FixtureRow
                  key={event.id}
                  event={event}
                  teamName={teamsById.get(event.team_id)?.name}
                  onSelect={setSelectedEventId}
                />
              ))}
            </Card>
          )}
        </div>

        <div>
          <BlockTitle>Quick actions</BlockTitle>
          <QuickActions canEdit={canEdit} readOnlyRole={readOnlyRole} />

          <BlockTitle>Last result</BlockTitle>
          <Card data-testid="last-result" className="overflow-hidden">
            {lastResult ? (
              <FixtureRow
                event={lastResult}
                teamName={teamsById.get(lastResult.team_id)?.name}
                onSelect={setSelectedEventId}
              />
            ) : (
              <Empty message="No results yet. Scores show here once someone adds them." />
            )}
          </Card>
        </div>
      </div>

      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setSelectedEventId(null)}
        />
      )}
    </section>
  )
}
