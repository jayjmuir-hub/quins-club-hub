import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import Spinner from '../components/Spinner.jsx'
import EventDetail from './EventDetail.jsx'
import EventForm from './EventForm.jsx'
import { listAvailabilityForEvents } from '../data/availability.js'
import { listEvents } from '../data/events.js'
import { listContactsForPlayers, listPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { eventDate, sortByStart } from '../lib/eventFormat.js'
import { canEditTeam, visibleTeams } from '../lib/scope.js'

// Desktop-only organizer screen (design spec:
// docs/superpowers/specs/2026-08-03-club-overview-dashboard-design.md).
// Reached only via the desktop-only, role-gated Nav item (Task 4) — this
// component itself does not re-check width or role; by the time it renders,
// Nav/App.jsx have already decided who gets here. Scoping is still enforced
// the normal way (visibleTeams + RLS), so a stale/bad nav-visibility check
// could only ever fail to show a link, never widen what data comes back.
//
// Three sections, per the spec: upcoming fixtures across every visible team,
// RSVP status per fixture, and roster gaps per team. No activity feed here —
// that's Phase 2, gated on a not-yet-built audit-log table.

const UPCOMING_WINDOW_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

// The implementation plan's draft called clubToday().toISOString() /
// .getTime() — but src/lib/eventFormat.js's clubToday() actually returns a
// plain { year, month, day } object (club-time calendar parts), not a Date;
// see clubDayParts/clubToday there. There is also no ready-made "start of
// today, in club time, as a UTC instant" helper exported from that module
// (clubWallTimeToUtc exists but expects '<input type="date">' string values,
// not the numeric parts clubToday() returns), so reproducing that exactly
// here would mean re-deriving date-string formatting this screen has no
// other need for. This screen only needs a rolling "upcoming" window, not a
// precise club-midnight boundary — every other window-ish concern in this
// codebase (Dashboard's "to play" filter) is a plain instant comparison
// against Date.now() too — so `from` is simply "right now" as a real
// instant, which every JS Date natively supports.
function upcomingWindow() {
  const from = new Date()
  const to = new Date(from.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS)
  return { from: from.toISOString(), to: to.toISOString() }
}

function statusCounts(rows) {
  const counts = { in: 0, maybe: 0, out: 0 }
  rows.forEach((row) => {
    if (counts[row.status] !== undefined) counts[row.status] += 1
  })
  return counts
}

export default function Overview() {
  const { memberships, teams } = useMemberships()

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  const [events, setEvents] = useState([])
  const [availability, setAvailability] = useState([])
  const [players, setPlayers] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedEventId, setSelectedEventId] = useState(null)
  // null = closed; { event } = editing that event. Overview never opens the
  // form for a NEW event (that lives on the Schedule screen), so there is no
  // "adding" case here — same shape as Dashboard.jsx.
  const [formState, setFormState] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    const { from, to } = upcomingWindow()

    listEvents({ teamIds, from, to })
      .then((eventRows) => {
        if (!mounted) return
        setEvents(eventRows)
        const eventIds = eventRows.map((event) => event.id)
        return Promise.all([
          listAvailabilityForEvents(eventIds),
          listPlayers({ teamIds }),
        ])
      })
      .then((results) => {
        if (!mounted || !results) return
        const [availabilityRows, playerRows] = results
        setAvailability(availabilityRows)
        setPlayers(playerRows)
        const playerIds = playerRows.map((player) => player.id)
        return listContactsForPlayers(playerIds)
      })
      .then((contactRows) => {
        if (!mounted || !contactRows) return
        setContacts(contactRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setEvents([])
        setAvailability([])
        setPlayers([])
        setContacts([])
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

  const isFirstLoad = loading && !settled

  const upcoming = sortByStart(
    events.filter((event) => eventDate(event) != null),
    'asc',
  )

  const availabilityByEvent = useMemo(() => {
    const map = new Map()
    availability.forEach((row) => {
      if (!map.has(row.event_id)) map.set(row.event_id, [])
      map.get(row.event_id).push(row)
    })
    return map
  }, [availability])

  const playersByTeam = useMemo(() => {
    const map = new Map()
    players.forEach((player) => {
      if (!map.has(player.team_id)) map.set(player.team_id, [])
      map.get(player.team_id).push(player)
    })
    return map
  }, [players])

  const contactedPlayerIds = useMemo(() => new Set(contacts.map((row) => row.player_id)), [contacts])

  // Derive the open event from the live list rather than storing the row
  // itself, so a realtime-style reload keeps the sheet's contents fresh and
  // a deleted fixture closes it instead of stranding a stale copy on screen
  // (same rule Dashboard.jsx follows).
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  if (isFirstLoad) {
    return (
      <section>
        <h2 className="sr-only">Overview</h2>
        <Card className="flex justify-center py-10">
          <Spinner label="Loading the overview…" />
        </Card>
      </section>
    )
  }

  if (error) {
    return (
      <section>
        <h2 className="sr-only">Overview</h2>
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the overview</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-deep">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mx-auto mt-4 w-auto rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </Card>
      </section>
    )
  }

  return (
    <section>
      <h2 className="mb-3 font-display text-[22px] uppercase tracking-[0.03em] text-ink">Overview</h2>

      <h3 className="mb-2 mt-4 font-display text-[15px] uppercase tracking-[0.03em] text-ink">
        Upcoming fixtures
      </h3>
      {upcoming.length === 0 ? (
        <Card>
          <Empty message="No upcoming fixtures in the next two weeks." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {upcoming.map((event) => {
            const counts = statusCounts(availabilityByEvent.get(event.id) ?? [])
            const responded = counts.in + counts.maybe + counts.out
            const total = (playersByTeam.get(event.team_id) ?? []).length
            const noResponse = Math.max(0, total - responded)
            return (
              <div key={event.id}>
                <FixtureRow
                  event={event}
                  teamName={teamsById.get(event.team_id)?.name}
                  onSelect={setSelectedEventId}
                />
                <div
                  data-testid={`rsvp-summary-${event.id}`}
                  className="border-b border-line px-[14px] pb-3 text-[12.5px] text-ink-faint last:border-b-0"
                >
                  {counts.in} In · {counts.maybe} Maybe · {counts.out} Out
                  {noResponse > 0 ? ` · ${noResponse} no response` : ''}
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <h3 className="mb-2 mt-5 font-display text-[15px] uppercase tracking-[0.03em] text-ink">
        Roster gaps
      </h3>
      <Card className="overflow-hidden">
        {scopedTeams.map((team) => {
          const teamPlayers = playersByTeam.get(team.id) ?? []
          const missingContact = teamPlayers.filter((player) => !contactedPlayerIds.has(player.id)).length
          return (
            <div
              key={team.id}
              data-testid={`roster-gap-${team.id}`}
              className="flex items-center justify-between border-b border-line px-[14px] py-2.5 text-sm last:border-b-0"
            >
              <span className="font-semibold text-ink">{team.name}</span>
              <span className="text-ink-faint">
                {teamPlayers.length} players
                {missingContact > 0 ? ` · ${missingContact} missing contact info` : ''}
              </span>
            </div>
          )
        })}
      </Card>

      {/* Same shape as Dashboard.jsx's fixture-click wiring: the overview's
          fixture rows open the same detail sheet Dashboard/Schedule use, so a
          coach clicking a fixture here gets the same Edit/Delete footer and
          form rather than being told the event is read-only. */}
      {selectedEvent && !formState && (
        <EventDetail
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setSelectedEventId(null)}
          canEdit={canEditTeam(memberships, selectedEvent.team_id)}
          onEdit={(event) => setFormState({ event })}
          onDeleted={() => {
            setSelectedEventId(null)
            setReloadToken((token) => token + 1)
          }}
        />
      )}

      {formState && (
        <EventForm
          event={formState.event}
          onClose={() => {
            setFormState(null)
            setSelectedEventId(null)
          }}
          onSaved={() => setReloadToken((token) => token + 1)}
        />
      )}
    </section>
  )
}
