import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { AccentTitle, BlockTitle, Kicker } from '../components/Editorial.jsx'
import Empty from '../components/Empty.jsx'
import Segmented from '../components/Segmented.jsx'
import { Sheet } from '../components/Sheet.jsx'
import { SquadHubPickerSkeleton, SquadHubSkeleton } from '../components/Skeleton.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAttendanceForEvents } from '../data/attendance.js'
import { listAvailabilityForEvents } from '../data/availability.js'
import { listEvents } from '../data/events.js'
import { listMatchSheetsFor } from '../data/matchSheets.js'
import { listPlayers } from '../data/players.js'
import { clubToday, eventDate, eventTimeLabel, eventTitle } from '../lib/eventFormat.js'
import { defaultEventWindow } from '../lib/eventWindow.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isMinisTeam } from '../lib/minis.js'
import { canEditTeam } from '../lib/scope.js'
import { groupHubTeams, hubTeamLine, squadMark } from '../lib/squadHub.js'
import { buildTracking, squadSummary } from '../lib/tracking.js'
import Availability from './Availability.jsx'
import EventDetail from './EventDetail.jsx'
import Register from './Register.jsx'

// The Squad Hub — the coach/manager dashboard, one squad at a time.
// claude/plans/2026-08-21-squad-hub.md.
//
// ⚠️ THE GATE IS "NOT YOUR SQUAD", NOT SECURITY — the same ruling as every
// role dashboard (claude/decisions/2026-08-10-role-dashboards.md). RLS on
// availability, attendance, players and events decides what actually comes
// back; canEditTeam here only decides whether this PAGE is somebody's job.
//
// ⚠️ DELIBERATELY NOT UNDER /admin, for the reason /notices is not:
// AdminDashboard gates on isAdmin() before rendering its Outlet, and the
// audience here is coaches and team managers, most of whom are not admins.
//
// ⚠️ MOVING THINGS IN MEANS RELOCATING THE FRONT DOOR, NOT THE SCREENS.
// Roster, Schedule and the noticeboard all still exist at their own routes —
// parents use them. The hub links into them; deleting or squad-locking those
// screens was considered and refused in the plan.

// Availability marks — the same tones as Availability.jsx's STATUS_ON and
// EventDetail's summary bar (design-system.md §4.23), so a status reads the
// same colour everywhere it appears.
const RSVP_MARK = {
  in: { label: 'In', className: 'bg-accent-bg text-accent-ink' },
  maybe: { label: '?', className: 'bg-warn-bg text-warn-ink' },
  out: { label: 'Out', className: 'bg-danger-bg text-danger-ink' },
}
const ATTEND_MARK = {
  present: { label: 'P', className: 'bg-accent-bg text-accent-ink' },
  absent: { label: 'A', className: 'bg-danger-bg text-danger-ink' },
  excused: { label: 'E', className: 'bg-surface-mute text-ink-muted' },
}

const TRACKING_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'training', label: 'Training' },
  { value: 'match', label: 'Matches' },
]

/** How many event COLUMNS the desktop matrix draws — a legibility cap on the
 * marks, and nothing else. Since 22 Aug 2026 (Jay: "track all training the
 * entire season") every NUMBER on this section — the %, the no-shows, the
 * squad summary, the phone drill-in — counts the whole season's past events,
 * however many the columns show. */
const GRID_EVENT_LIMIT = 15
// Jay, 21 Aug 2026: the section "should not be too big vertically and take
// the entire page" — five rows, then the list scrolls inside itself.
const UPCOMING_LIMIT = 5

/**
 * One squad in the picker — Chat/Home contact language: circular mark, ink
 * on paper, a muted line, hairline dividers inside a Card. Not a bordered
 * text button. The TILE is the thing #407 retired.
 */
function HubTeamRow({ team, line, yours }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        to={`/squad/${team.id}`}
        data-testid="squad-hub-row"
        data-yours={yours ? 'true' : 'false'}
        className="flex min-w-0 items-center gap-3 px-3.5 py-3 hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span
          aria-hidden="true"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-extrabold ${
            yours ? 'bg-brand text-ink-invert' : 'bg-surface-mute text-ink'
          }`}
        >
          {squadMark(team.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold text-ink">{team.name}</span>
          {line && (
            <span className="mt-0.5 block truncate font-condensed text-[11px] font-bold uppercase tracking-[.1em] text-ink-muted">
              {line}
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}

function HubTeamSection({ testId, title, teams, memberships, yours }) {
  if (teams.length === 0) return null
  return (
    <section data-testid={testId} className="mt-[18px] first:mt-0">
      <BlockTitle>{title}</BlockTitle>
      <Card className="overflow-hidden">
        <ul>
          {teams.map((team) => (
            <HubTeamRow
              key={team.id}
              team={team}
              line={hubTeamLine(memberships, team)}
              yours={yours}
            />
          ))}
        </ul>
      </Card>
    </section>
  )
}

function shortDate(event) {
  const date = eventDate(event)
  if (!date) return '—'
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Dubai' })
}

/** One cell of the grid: what they said beside what happened. Both halves are
 * always drawn — "no reply" and "not recorded" are facts, not blanks. */
function TrackingCell({ cell }) {
  const rsvp = RSVP_MARK[cell?.availability]
  const attend = ATTEND_MARK[cell?.attendance]
  const noShow = cell?.availability === 'in' && cell?.attendance === 'absent'
  return (
    <td className={`px-1 py-1.5 text-center ${noShow ? 'bg-danger-bg/60' : ''}`}>
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold">
        <span
          className={`inline-block min-w-[22px] rounded px-1 py-0.5 ${rsvp ? rsvp.className : 'text-ink-muted/60'}`}
          title={cell?.availability ? `Said: ${cell.availability}` : 'No reply'}
        >
          {rsvp ? rsvp.label : '·'}
        </span>
        <span
          className={`inline-block min-w-[18px] rounded px-1 py-0.5 ${attend ? attend.className : 'text-ink-muted/60'}`}
          title={cell?.attendance ? `Register: ${cell.attendance}` : 'Not recorded'}
        >
          {attend ? attend.label : '·'}
        </span>
      </span>
    </td>
  )
}

export default function SquadHub() {
  const { teamId } = useParams()
  const { memberships, teams, loading: membershipsLoading } = useMemberships()

  const [events, setEvents] = useState([])
  const [players, setPlayers] = useState([])
  const [availability, setAvailability] = useState([])
  const [attendance, setAttendance] = useState([])
  const [sheets, setSheets] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  // The phone's tracking drill-in: which player's history sheet is open.
  const [trackingPlayerId, setTrackingPlayerId] = useState(null)
  // The drill-in, borrowed from Dashboard wholesale: tapping a Coming-up row
  // opens the same EventDetail sheet, which in turn opens the same
  // Availability and Register sheets. One flow everywhere, on purpose —
  // Dashboard's comment about availabilityOpen being screen-level state and
  // silently going stale applies here unchanged, so every open/close path
  // goes through openEvent/closeEvent below.
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [registerOpen, setRegisterOpen] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const navigate = useNavigate()

  const team = teams?.find((candidate) => candidate.id === teamId)
  const mayView = canEditTeam(memberships, teamId)

  // The squads this person could open a hub FOR — drives the no-:teamId
  // redirect/picker and the switcher shown to multi-squad staff and admins.
  // Split into "yours" (a team-scoped membership) and the rest of the club
  // an admin can still open, so the picker is not a settings dump of names.
  const { yours: yourHubTeams, rest: restHubTeams, all: myHubTeams } = useMemo(
    () => groupHubTeams(memberships, teams),
    [memberships, teams],
  )

  const openEvent = (id) => {
    setAvailabilityOpen(false)
    setRegisterOpen(false)
    setSelectedEventId(id)
  }
  const closeEvent = () => {
    setAvailabilityOpen(false)
    setRegisterOpen(false)
    setSelectedEventId(null)
    // An RSVP set or a register taken in the sheets must show up in the
    // tracking grid and the chips the moment the sheet closes — re-fetch
    // rather than trusting a stale in-memory copy.
    setReloadToken((token) => token + 1)
  }

  useEffect(() => {
    if (!teamId || !mayView) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      // One rolling window for everything: upcoming comes from its future
      // half, the tracking grid from its past half. Same window the Dashboard
      // and calendar already use, so nothing here invents a second calendar.
      const { from, to } = defaultEventWindow(clubToday())
      const [eventRows, playerRows] = await Promise.all([
        listEvents({ teamIds: [teamId], from, to }),
        listPlayers({ teamIds: [teamId] }),
      ])
      if (!mounted) return
      const eventIds = eventRows.map((event) => event.id)
      const [availabilityRows, attendanceRows, sheetMap] = await Promise.all([
        listAvailabilityForEvents(eventIds),
        // Attendance only ever exists for events that have happened, but the
        // ids are not split here: a register taken early (a training cut
        // short) is still a register, and RLS returns nothing for the rest.
        listAttendanceForEvents(eventIds),
        listMatchSheetsFor(
          isMinisTeam(team?.name)
            ? [] // U10 and below are not on the RCM form at all — src/lib/minis.js.
            : eventRows.filter((event) => event.type === 'match').map((event) => event.id),
        ),
      ])
      if (!mounted) return
      setEvents(eventRows)
      setPlayers(playerRows)
      setAvailability(availabilityRows)
      setAttendance(attendanceRows)
      setSheets(sheetMap)
    })().catch((cause) => {
      if (mounted) setError(cause)
    }).finally(() => {
      if (mounted) setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [teamId, mayView, team?.name, reloadToken])

  // ---- No :teamId — land the single-squad coach, offer everyone else a pick.
  if (!teamId) {
    if (membershipsLoading) {
      return (
        <div>
          <div className="mb-3.5 mt-1">
            <Kicker>Squad Hub</Kicker>
            <AccentTitle lead="Your squads," accent="pick one." />
          </div>
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading your squads…</span>
            <SquadHubPickerSkeleton />
          </div>
        </div>
      )
    }
    if (myHubTeams.length === 1) return <Navigate to={`/squad/${myHubTeams[0].id}`} replace />
    if (myHubTeams.length === 0) {
      return (
        <Empty message="The Squad Hub is for squad staff. You don't look after a squad yet — if you should, ask an admin to add you." />
      )
    }
    return (
      <div>
        <div className="mb-3.5 mt-1">
          <Kicker>Squad Hub</Kicker>
          <AccentTitle lead="Your squads," accent="pick one." />
        </div>
        <HubTeamSection
          testId="section-your-squads"
          title="Your squads"
          teams={yourHubTeams}
          memberships={memberships}
          yours
        />
        <HubTeamSection
          testId="section-club-squads"
          title={yourHubTeams.length > 0 ? 'The rest of the club' : 'The club'}
          teams={restHubTeams}
          memberships={memberships}
          yours={false}
        />
      </div>
    )
  }

  if (membershipsLoading) return <Spinner label="Loading…" />
  if (!mayView) {
    // "Not your squad", never "no permission" — the data gate is RLS, and an
    // admin or this squad's own staff are the only people whose job this is.
    return <Empty message="This isn't one of your squads. The Squad Hub shows a squad to the staff who run it." />
  }

  const now = Date.now()
  const upcoming = events
    .filter((event) => {
      const date = eventDate(event)
      return date && date.getTime() >= now
    })
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    .slice(0, UPCOMING_LIMIT)
  const past = events.filter((event) => {
    const date = eventDate(event)
    return date && date.getTime() < now
  })

  const filteredPast = past.filter((event) => (filter === 'all' ? true : event.type === filter))
  // The WHOLE season's past events — the fetch window (12 months back, see
  // src/lib/eventWindow.js) always covers the season, and the availability
  // and attendance rows were fetched for every one of them all along. The
  // old `.slice(-GRID_EVENT_LIMIT * 2)` pre-trim made the percentages
  // silently mean "the last month or so"; only the matrix COLUMNS are capped
  // now, below.
  const { events: gridEvents, rows } = buildTracking({
    players,
    events: filteredPast,
    availabilityRows: availability,
    attendanceRows: attendance,
  })
  const shownEvents = gridEvents.slice(0, GRID_EVENT_LIMIT)
  const summary = squadSummary(rows)
  const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) : null

  // RSVP counts per upcoming event, for the chips.
  const rsvpByEvent = new Map()
  for (const row of availability) {
    const tally = rsvpByEvent.get(row.event_id) ?? { in: 0, maybe: 0, out: 0 }
    if (tally[row.status] !== undefined) tally[row.status] += 1
    rsvpByEvent.set(row.event_id, tally)
  }

  // Recent matches whose RCM sheet is missing — non-minis only; for minis the
  // sheet list was never fetched, so this stays empty by construction.
  const sheetsDue = past
    .filter((event) => event.type === 'match' && !sheets.get(event.id))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
    .slice(0, isMinisTeam(team?.name) ? 0 : 3)

  return (
    <div>
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The portal's headline formula — "The Muirs, *on paper.*" — worn
              by a squad: "U12 Mixed, *tracked.*" */}
          <Kicker>Squad Hub</Kicker>
          <AccentTitle lead={`${team?.name ?? 'Squad'},`} accent="tracked." />
          <p className="mt-0.5 text-[13px] font-medium text-ink-muted">
            {players.length} {players.length === 1 ? 'player' : 'players'} · availability, register and the season at a glance
          </p>
        </div>
        {/* ⚠️ min-w-0, NEVER shrink-0 — found live on Jay's phone, 22 Aug
            2026, named by the paint-debug box: with fifteen squads this
            row's max-content width is ~1127px, and shrink-0 forbade it
            from ever being narrower, so the DOCUMENT blew out to 1142px on
            a 360px phone and opening the sheet re-fit the view to 32%.
            The repo's own bolded lesson ("a row that overruns does not
            clip") reintroduced by the hand that had just read it. The
            harness overflow gate now runs the admin squad hub so this
            class of regression fails a build instead of a coach. */}
        {myHubTeams.length > 1 && (
          <div className="flex min-w-0 flex-wrap justify-end gap-1.5">
            {myHubTeams.map((candidate) => (
              <Link
                key={candidate.id}
                to={`/squad/${candidate.id}`}
                aria-current={candidate.id === teamId ? 'page' : undefined}
                className={`rounded-full border-[1.5px] px-2.5 py-1 text-[12.5px] font-bold ${
                  candidate.id === teamId
                    ? 'border-brand bg-surface-mute text-danger-ink'
                    : 'border-line text-ink hover:bg-surface-mute'
                }`}
              >
                {candidate.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-danger-ink">
          Something went wrong loading this squad. Pull to refresh or try again shortly.
        </p>
      )}
      {loading && (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading squad…</span>
          <SquadHubSkeleton />
        </div>
      )}

      {!loading && !error && (
        <>
          {/* The NoticeBoard that opened this screen went 22 Aug 2026 (Jay):
              notices live on Home, and the same pinned notice appearing on
              both screens read as a bug, not reinforcement. */}
          {/* Phase 3 desktop density: schedule and the front doors sit side
              by side, the tracking grid takes the full width beneath them.
              Grid PLACEMENT classes, not DOM order, so the phone keeps
              tracking directly under the calendar — its headline position. */}
          <div className="desktop:grid desktop:grid-cols-[1.15fr_.85fr] desktop:gap-x-4">

          {/* ---- Upcoming -------------------------------------------------- */}
          {/* BlockTitle sits OUTSIDE the card, same as Home and Chat. Putting
              it inside made Squad Hub the one screen whose section titles
              lived on the paper rather than above it. */}
          <div className="mb-4 desktop:col-start-1 desktop:row-start-1">
            <div className="mb-2 flex items-center justify-between gap-3">
              <BlockTitle>On the calendar</BlockTitle>
              <Link to="/schedule" className="shrink-0 text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                Full schedule
              </Link>
            </div>
            <Card className="overflow-hidden p-4">
            {upcoming.length === 0 ? (
              <p className="text-[13px] font-medium text-ink-muted">Nothing scheduled yet.</p>
            ) : (
              <ul className="flex max-h-72 flex-col divide-y divide-line/60 overflow-y-auto">
                {upcoming.map((event) => {
                  const tally = rsvpByEvent.get(event.id)
                  const replies = tally ? tally.in + tally.maybe + tally.out : 0
                  return (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => openEvent(event.id)}
                        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-[9px] px-1 py-2 text-left hover:bg-surface-mute"
                      >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{eventTitle(event)}</p>
                        <p className="text-[12.5px] font-medium text-ink-muted">
                          {shortDate(event)} · {eventTimeLabel(event)}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12.5px] font-bold">
                        {replies === 0 ? (
                          <span className="text-ink-muted">No replies yet</span>
                        ) : (
                          <>
                            <span className="text-accent-ink">{tally.in} in</span>
                            <span className="text-ink-muted"> · {tally.maybe} maybe · {tally.out} out</span>
                          </>
                        )}
                      </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {sheetsDue.length > 0 && (
              <div className="mt-3 border-t border-line/60 pt-2.5">
                <p className="mb-1.5 text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                  Match sheets outstanding
                </p>
                <ul className="flex flex-col gap-1">
                  {sheetsDue.map((event) => (
                    <li key={event.id}>
                      <Link
                        to={`/match-sheet/${event.id}`}
                        className="text-[13px] font-semibold text-brand-ink underline-offset-2 hover:underline"
                      >
                        {eventTitle(event)} — {shortDate(event)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </Card>
          </div>

          {/* ---- Tracking -------------------------------------------------- */}
          <div className="mb-4 desktop:col-span-2 desktop:row-start-2">
            <BlockTitle>Who said, who showed</BlockTitle>
            <Card className="overflow-hidden p-4">
            <p className="mb-3 text-[12.5px] font-medium text-ink-muted">
              What they said, then what the register says — side by side per event,
              across the whole season. % is present / (present + absent); excused
              doesn&apos;t count either way.
            </p>
            <Segmented
              legend="Show"
              name="tracking-filter"
              options={TRACKING_FILTERS}
              value={filter}
              onChange={setFilter}
            />
            {shownEvents.length === 0 ? (
              <Empty message="No past events to track yet — the grid fills in as the season happens." />
            ) : (
              <>
                <p className="mb-2 text-[12.5px] font-semibold text-ink-muted">
                  Squad: {summary.percent ?? '—'}% attendance across {gridEvents.length}{' '}
                  {filter === 'all' ? 'events' : filter === 'match' ? 'matches' : 'training sessions'} this season
                  {summary.noShows > 0 && (
                    <span className="text-danger-ink"> · {summary.noShows} said-in-but-absent</span>
                  )}
                </p>
                {/* ⚠️ THE MATRIX IS DESKTOP-ONLY — Jay, from his phone,
                    21 Aug 2026: "this isn't going to work". On a 375px
                    screen the event columns and the % lived off the right
                    edge behind an undiscoverable sideways scroll. The phone
                    gets the two numbers a coach acts on — % and no-shows —
                    as a tappable list, and the per-event marks move into a
                    sheet per player, vertical like everything else on a
                    phone. */}
                <ul className="desktop:hidden">
                  {rows.map((row) => (
                    <li key={row.player.id} className="border-b border-line/50 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setTrackingPlayerId(row.player.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-[9px] px-1 py-2.5 text-left hover:bg-surface-mute"
                      >
                        <span className="min-w-0 truncate text-sm font-semibold text-ink">
                          {row.player.full_name}
                        </span>
                        <span className="flex shrink-0 items-center gap-2.5 text-[13px] font-bold">
                          <span className="text-ink">{row.percent ?? '—'}%</span>
                          <span
                            className={row.noShows > 0 ? 'text-danger-ink' : 'text-ink-muted'}
                            title="Said in, marked absent"
                          >
                            {row.noShows} no-show{row.noShows === 1 ? '' : 's'}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* No max-height: the whole squad's grid renders and the page
                    scrolls (22 Aug 2026, same treatment as RosterTable and
                    ScheduleTable). overflow-x-auto stays — the table has a
                    real min-width and the sticky Player column exists for
                    exactly that sideways case. */}
                <div className="hidden overflow-x-auto desktop:block">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead>
                      {/* Not sticky top — with no inner vertical scroller it
                          would pin under the masthead. left-0 stickiness on
                          the Player column below survives; that one is for
                          the horizontal escape hatch. */}
                      <tr className="border-b-[1.5px] border-line bg-surface-card text-[11.5px] font-bold uppercase tracking-[.3px] text-ink-muted">
                        <th scope="col" className="sticky left-0 bg-surface-card py-1.5 pr-2">Player</th>
                        {shownEvents.map((event) => (
                          <th key={event.id} scope="col" className="px-1 py-1.5 text-center" title={eventTitle(event)}>
                            {shortDate(event)}
                          </th>
                        ))}
                        <th scope="col" className="px-1.5 py-1.5 text-right">%</th>
                        <th scope="col" className="px-1.5 py-1.5 text-right" title="Said in, marked absent">
                          No-shows
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.player.id} className="border-b border-line/50">
                          <th scope="row" className="sticky left-0 max-w-[140px] truncate bg-surface-card py-1.5 pr-2 text-[13px] font-semibold text-ink">
                            {row.player.full_name}
                          </th>
                          {shownEvents.map((event) => (
                            <TrackingCell key={event.id} cell={row.cells.get(event.id)} />
                          ))}
                          <td className="px-1.5 py-1.5 text-right text-[13px] font-bold text-ink">
                            {row.percent ?? '—'}
                          </td>
                          <td className={`px-1.5 py-1.5 text-right text-[13px] font-bold ${row.noShows > 0 ? 'text-danger-ink' : 'text-ink-muted'}`}>
                            {row.noShows}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 hidden text-[11.5px] font-medium text-ink-muted desktop:block">
                  Left mark: RSVP (In / ? / Out, · no reply). Right mark: register (P present, A absent,
                  E excused, · not taken). Shaded cell = said in, didn&apos;t show.
                  {gridEvents.length > shownEvents.length
                    ? ` Columns show the newest ${shownEvents.length} of ${gridEvents.length} events; % and no-shows count all ${gridEvents.length}.`
                    : ' Newest first.'}
                </p>
                <p className="mt-2 text-[11.5px] font-medium text-ink-muted desktop:hidden">
                  Tap a player for their event-by-event history.
                </p>
              </>
            )}
            </Card>
          </div>

          {/* ---- Front doors ---------------------------------------------- */}
          <div className="grid grid-cols-1 gap-3 desktop:col-start-2 desktop:row-start-1 desktop:content-start desktop:grid-cols-1">
            <Card className="p-4">
              <h3 className="text-[15px] font-extrabold text-ink">Roster</h3>
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                {players.length} {players.length === 1 ? 'player' : 'players'} in this squad.
              </p>
              <Link to="/roster" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                Open the roster
              </Link>
            </Card>
            {/* The picker's mobile front door — the sidebar sub-menu that
                carries it on desktop does not exist on a phone. */}
            <Card className="p-4">
              <h3 className="text-[15px] font-extrabold text-ink">Match rosters</h3>
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                Pick an upcoming match and build the team for it.
              </p>
              <Link to={`/squad/${teamId}/match-roster`} className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                Build a match roster
              </Link>
            </Card>
            {/* Cross-squad like Game time below, so the link carries no
                teamId. The sidebar's Schedule section holds this on desktop;
                this card is the phone's only route in. */}
            <Card className="p-4">
              <h3 className="text-[15px] font-extrabold text-ink">Pitches</h3>
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                Every squad&apos;s bookings — see what&apos;s free before you ask.
              </p>
              <Link to="/pitch-calendar" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                Open the pitch calendar
              </Link>
            </Card>
            {/* Moved here from More (22 Aug 2026): its audience is exactly
                this page's, and the hub is on the phone's tab bar. ⚠️ The
                SCREEN is cross-squad — appearances across every squad the
                viewer can pick teams for — which is why the link does not
                carry this hub's teamId. */}
            <Card className="p-4">
              <h3 className="text-[15px] font-extrabold text-ink">Game time</h3>
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                Who hasn&apos;t had a game — appearances from your team sheets, fewest first.
              </p>
              <Link to="/game-time" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                Open game time
              </Link>
            </Card>
            <Card className="p-4">
              <h3 className="text-[15px] font-extrabold text-ink">Training</h3>
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                {(() => {
                  const nextTraining = upcoming.find((event) => event.type === 'training')
                  return nextTraining
                    ? `Next session ${shortDate(nextTraining)} · ${eventTimeLabel(nextTraining)}.`
                    : 'No training scheduled yet.'
                })()}
              </p>
              {/* Repointed from /schedule to the squad's own training-plans
                  page (22 Aug 2026) — the page shows the same sessions PLUS
                  what each one runs, and it is the phone's only route there. */}
              <Link to={`/squad/${teamId}/training`} className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                Open training plans
              </Link>
            </Card>
          </div>
          </div>
        </>
      )}

      {/* The same drill-in Dashboard and Schedule use, wired identically —
          including the "closing availability returns to the detail sheet"
          flow. Edit/duplicate are deliberately NOT offered here: the hub is a
          reading room; changing a fixture stays on Schedule, one place. */}
      {selectedEvent && !availabilityOpen && !registerOpen && (
        <EventDetail
          event={selectedEvent}
          team={team}
          onClose={closeEvent}
          canEdit={mayView}
          onOpenAvailability={() => setAvailabilityOpen(true)}
          onOpenRegister={() => setRegisterOpen(true)}
          onOpenMatchSheet={(fixture) => navigate(`/match-sheet/${fixture.id}`)}
          onOpenLineup={(fixture) => navigate(`/lineup/${fixture.id}`)}
        />
      )}
      {selectedEvent && availabilityOpen && (
        <Availability event={selectedEvent} team={team} onClose={() => setAvailabilityOpen(false)} />
      )}
      {selectedEvent && registerOpen && (
        <Register event={selectedEvent} team={team} onClose={() => setRegisterOpen(false)} />
      )}

      {/* The phone's per-player tracking history — the grid's row, turned
          vertical. Same marks, same rules, one player at a time. */}
      {(() => {
        const row = trackingPlayerId ? rows.find((r) => r.player.id === trackingPlayerId) : null
        if (!row) return null
        return (
          <Sheet open onClose={() => setTrackingPlayerId(null)} title={row.player.full_name}>
            <p className="mb-3 text-[13px] font-semibold text-ink">
              {row.percent ?? '—'}% attendance
              <span className={row.noShows > 0 ? 'text-danger-ink' : 'text-ink-muted'}>
                {' '}· {row.noShows} said-in-but-absent
              </span>
            </p>
            {/* The whole season, not the matrix's column cap — this sheet is
                one player deep and vertical, so length costs nothing but
                scroll, and the % above is computed over exactly this list. */}
            <ul className="flex flex-col divide-y divide-line/50">
              {gridEvents.map((event) => {
                const cell = row.cells.get(event.id)
                const rsvp = RSVP_MARK[cell?.availability]
                const attend = ATTEND_MARK[cell?.attendance]
                const noShow = cell?.availability === 'in' && cell?.attendance === 'absent'
                return (
                  <li
                    key={event.id}
                    className={`flex items-center justify-between gap-2 px-1 py-2 ${noShow ? 'bg-danger-bg/60' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-ink">{eventTitle(event)}</span>
                      <span className="text-[12px] font-medium text-ink-muted">{shortDate(event)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold">
                      <span className={`inline-block min-w-[26px] rounded px-1.5 py-0.5 text-center ${rsvp ? rsvp.className : 'text-ink-muted/60'}`}>
                        {rsvp ? rsvp.label : '·'}
                      </span>
                      <span className={`inline-block min-w-[22px] rounded px-1.5 py-0.5 text-center ${attend ? attend.className : 'text-ink-muted/60'}`}>
                        {attend ? attend.label : '·'}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-[11.5px] font-medium text-ink-muted">
              Left: RSVP (In / ? / Out, · no reply). Right: register (P / A / E, · not taken).
              Shaded = said in, didn&apos;t show. Newest first.
            </p>
          </Sheet>
        )
      })()}
    </div>
  )
}
