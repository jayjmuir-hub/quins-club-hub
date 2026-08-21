import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import NoticeBoard from '../components/NoticeBoard.jsx'
import Segmented from '../components/Segmented.jsx'
import Spinner from '../components/Spinner.jsx'
import { listMyReads, listNotices } from '../data/announcements.js'
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
  out: { label: 'Out', className: 'bg-danger-bg text-brand-deep' },
}
const ATTEND_MARK = {
  present: { label: 'P', className: 'bg-accent-bg text-accent-ink' },
  absent: { label: 'A', className: 'bg-danger-bg text-brand-deep' },
  excused: { label: 'E', className: 'bg-surface-mute text-ink-muted' },
}

const TRACKING_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'training', label: 'Training' },
  { value: 'match', label: 'Matches' },
]

/** How many past events the grid renders. The data window is wider; a coach
 * scanning further back than this is asking a season question the export of
 * which is future work, not a wider table. */
const GRID_EVENT_LIMIT = 15
// Jay, 21 Aug 2026: the section "should not be too big vertically and take
// the entire page" — five rows, then the list scrolls inside itself.
const UPCOMING_LIMIT = 5

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
  const [notices, setNotices] = useState([])
  const [noticeReads, setNoticeReads] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
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
  const myHubTeams = useMemo(() => {
    if (!teams) return []
    return teams.filter((candidate) => canEditTeam(memberships, candidate.id))
  }, [memberships, teams])

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
      const [eventRows, playerRows, noticeRows, readRows] = await Promise.all([
        listEvents({ teamIds: [teamId], from, to }),
        listPlayers({ teamIds: [teamId] }),
        listNotices(),
        listMyReads(),
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
      setNotices(noticeRows)
      setNoticeReads(new Set(readRows))
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
    if (membershipsLoading) return <Spinner label="Loading your squads…" />
    if (myHubTeams.length === 1) return <Navigate to={`/squad/${myHubTeams[0].id}`} replace />
    if (myHubTeams.length === 0) {
      return (
        <Empty message="The Squad Hub is for squad staff. You don't look after a squad yet — if you should, ask an admin to add you." />
      )
    }
    return (
      <div>
        <h2 className="mb-3.5 mt-1 text-[21px] font-extrabold tracking-[-0.2px] text-ink">
          Squad Hub
        </h2>
        <Card className="p-4">
          <p className="mb-3 text-[13px] font-medium text-ink-muted">Which squad?</p>
          <ul className="flex flex-col gap-2">
            {myHubTeams.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  to={`/squad/${candidate.id}`}
                  className="block rounded-[11px] border-[1.5px] border-line px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-mute"
                >
                  {candidate.name}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
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
  const { events: gridEvents, rows } = buildTracking({
    players,
    events: filteredPast.slice(-GRID_EVENT_LIMIT * 2), // pre-trim before sort; buildTracking sorts newest-first
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

  const squadNotices = notices.filter(
    (notice) => !notice.team_id || (notice.teamIds ?? [notice.team_id]).includes(teamId),
  )

  return (
    <div>
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">
            {team?.name ?? 'Squad'} hub
          </h2>
          <p className="text-[13px] font-medium text-ink-muted">
            {players.length} {players.length === 1 ? 'player' : 'players'} · availability, register and the season at a glance
          </p>
        </div>
        {myHubTeams.length > 1 && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {myHubTeams.map((candidate) => (
              <Link
                key={candidate.id}
                to={`/squad/${candidate.id}`}
                aria-current={candidate.id === teamId ? 'page' : undefined}
                className={`rounded-full border-[1.5px] px-2.5 py-1 text-[12.5px] font-bold ${
                  candidate.id === teamId
                    ? 'border-brand bg-surface-mute text-brand-deep'
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
        <p role="alert" className="mb-3 text-[13px] font-semibold text-brand-deep">
          Something went wrong loading this squad. Pull to refresh or try again shortly.
        </p>
      )}
      {loading && <Spinner label="Loading squad…" />}

      {!loading && !error && (
        <>
          <NoticeBoard notices={squadNotices} readIds={noticeReads} teamsById={new Map(teams.map((t) => [t.id, t]))} />

          {/* ---- Upcoming -------------------------------------------------- */}
          <Card className="mb-4 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[15px] font-extrabold text-ink">Coming up</h3>
              <Link to="/schedule" className="text-[13px] font-bold text-brand underline-offset-2 hover:underline">
                Full schedule
              </Link>
            </div>
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
                        className="text-[13px] font-semibold text-brand underline-offset-2 hover:underline"
                      >
                        {eventTitle(event)} — {shortDate(event)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {/* ---- Tracking -------------------------------------------------- */}
          <Card className="mb-4 p-4">
            <h3 className="mb-1 text-[15px] font-extrabold text-ink">Availability &amp; attendance</h3>
            <p className="mb-3 text-[12.5px] font-medium text-ink-muted">
              What they said, then what the register says — side by side per event.
              % is present / (present + absent); excused doesn&apos;t count either way.
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
                  Squad: {summary.percent ?? '—'}% attendance
                  {summary.noShows > 0 && (
                    <span className="text-brand-deep"> · {summary.noShows} said-in-but-absent</span>
                  )}
                </p>
                <div className="max-h-[24rem] overflow-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead>
                      <tr className="sticky top-0 z-10 border-b-[1.5px] border-line bg-surface-card text-[11.5px] font-bold uppercase tracking-[.3px] text-ink-muted">
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
                          <td className={`px-1.5 py-1.5 text-right text-[13px] font-bold ${row.noShows > 0 ? 'text-brand-deep' : 'text-ink-muted'}`}>
                            {row.noShows}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11.5px] font-medium text-ink-muted">
                  Left mark: RSVP (In / ? / Out, · no reply). Right mark: register (P present, A absent,
                  E excused, · not taken). Shaded cell = said in, didn&apos;t show. Newest first, last{' '}
                  {shownEvents.length} events.
                </p>
              </>
            )}
          </Card>

          {/* ---- Front doors ---------------------------------------------- */}
          <div className="grid grid-cols-1 gap-3 desktop:grid-cols-2">
            <Card className="p-4">
              <h3 className="text-[15px] font-extrabold text-ink">Roster</h3>
              <p className="mb-2 text-[13px] font-medium text-ink-muted">
                {players.length} {players.length === 1 ? 'player' : 'players'} in this squad.
              </p>
              <Link to="/roster" className="text-[13px] font-bold text-brand underline-offset-2 hover:underline">
                Open the roster
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
              <Link to="/schedule" className="text-[13px] font-bold text-brand underline-offset-2 hover:underline">
                See sessions in the schedule
              </Link>
            </Card>
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
    </div>
  )
}
