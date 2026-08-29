import { useEffect, useMemo, useState } from 'react'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import { PitchMonth, PitchOccupancy, PitchWeek } from '../components/PitchCalendar.jsx'
import Segmented from '../components/Segmented.jsx'
import Spinner from '../components/Spinner.jsx'
import { findPitchClashes, listPitchOccupancy, pitchShares } from '../data/pitches.js'
import { listShareApprovalKeys, shareKey } from '../data/pitchShareApprovals.js'
import { monthGrid, shiftDay, shiftMonth, weekDays, windowFor } from '../lib/calendarGrid.js'
import { clubToday } from '../lib/eventFormat.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin } from '../lib/scope.js'

// The pitch calendar, for the people who REQUEST pitches rather than allocate
// them (22 Aug 2026, Jay) — a read-only view of the club-wide booking picture,
// so "is D2 free on Saturday morning?" stops being a message to an admin.
//
// ⚠️ READ-ONLY BY CONSTRUCTION, not by hiding buttons. The rows come from the
// pitch_occupancy SECURITY DEFINER function and carry no title, opponent or
// notes — only who, where, when. Allocation (/admin/allocation) remains the
// only place a pitch is granted or declined, and the only place with the
// request queue and the day-by-hour grid.
//
// ⚠️ THE GATE IS "NOT SQUAD STAFF", NOT SECURITY — the function itself
// refuses non-staff with zero rows. This screen's gate only decides who is
// OFFERED the page, same as every role dashboard.

const VIEWS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export default function PitchGlance() {
  const { memberships, teams, loading: membershipsLoading } = useMemberships()

  const [view, setView] = useState('week')
  const [anchor, setAnchor] = useState(() => clubToday())
  const [events, setEvents] = useState([])
  const [approvedKeys, setApprovedKeys] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const mayView =
    isAdmin(memberships) ||
    (teams ?? []).some((team) => canEditTeam(memberships, team.id))

  // The fetch follows the visible days, exactly like Allocation — a season of
  // fifteen squads is the read that made listEvents page, and this screen
  // never needs more than the grid on screen.
  const window = useMemo(
    () => windowFor(view === 'week' ? weekDays(anchor) : monthGrid(anchor)),
    [view, anchor],
  )

  useEffect(() => {
    if (!mayView || !window) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)
    // ⚠️ THE APPROVALS RIDE ALONGSIDE, AND A FAILED READ IS NOT AN ERROR. If the
    // approvals table is unreachable the calendar still loads — it just shows
    // the clash markers an admin may already have cleared, which is the safe
    // direction (a warning that should be gone, not a clash silently hidden).
    Promise.all([
      listPitchOccupancy(window),
      listShareApprovalKeys().catch(() => new Set()),
    ])
      .then(([rows, keys]) => {
        if (!mounted) return
        setEvents(rows)
        setApprovedKeys(keys)
      })
      .catch((cause) => {
        if (mounted) setError(cause)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [mayView, window])

  // The redacted rows carry the squad's name themselves; the map exists only
  // because PitchWeek labels entries through teamsById like Allocation does.
  const teamsById = useMemo(() => {
    const map = new Map()
    for (const event of events) map.set(event.team_id, { id: event.team_id, name: event.team_name })
    return map
  }, [events])

  // A clash an admin has marked "fine" stops highlighting — so the same
  // approval that resolves the occupancy row also clears the calendar marker,
  // and the two never disagree.
  const clashing = useMemo(() => {
    const ids = new Set()
    for (const clash of findPitchClashes(events)) {
      if (approvedKeys.has(shareKey(clash.events))) continue
      for (const event of clash.events) ids.add(event.id)
    }
    return ids
  }, [events, approvedKeys])

  // Every shared pitch in the loaded window, for the occupancy panel below the
  // calendar — the "what's free before I ask" view. Clashes are the subset of
  // these that overflow; the panel shows the room left on the ones that fit too.
  const shares = useMemo(() => pitchShares(events), [events])

  if (membershipsLoading) return <Spinner label="Loading…" />
  if (!mayView) {
    return <Empty message="The pitch calendar is for squad staff. If you should be picking teams and booking pitches, ask an admin to add you." />
  }

  const today = clubToday()
  const step = (delta) =>
    setAnchor((current) => (view === 'week' ? shiftDay(current, delta * 7) : shiftMonth(current, delta)))

  return (
    <section>
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Kicker>Schedule</Kicker>
          <AccentTitle lead="Pitch" accent="calendar." />
          <p className="text-[13px] font-medium text-ink-muted">
            Every squad&apos;s bookings, so you can see what&apos;s free before you ask.
            Requests still go through the fixture itself.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => step(-1)}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(clubToday())}>
            Today
          </Button>
          <Button variant="secondary" size="sm" onClick={() => step(1)}>
            Next
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <Segmented legend="View" name="pitch-glance-view" options={VIEWS} value={view} onChange={setView} />
      </div>

      {error && (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-danger-ink">
          Something went wrong loading the bookings. Try again shortly.
        </p>
      )}
      {loading && <Spinner label="Loading bookings…" />}

      {!loading && !error && events.length === 0 && (
        <Card>
          <Empty message="Nothing booked in this stretch — no squad has an event with a pitch here yet." />
        </Card>
      )}

      {!loading && !error && events.length > 0 && (
        view === 'week' ? (
          <PitchWeek
            anchor={anchor}
            today={today}
            events={events}
            clashing={clashing}
            teamsById={teamsById}
            // Picking a day zooms the week onto it — the coach's question is
            // "that Saturday", and the day-by-hour grid stays Allocation's.
            onPickDay={(day) => setAnchor(day)}
          />
        ) : (
          <PitchMonth
            anchor={anchor}
            today={today}
            events={events}
            clashing={clashing}
            onPickDay={(day) => {
              setAnchor(day)
              setView('week')
            }}
          />
        )
      )}

      {/* The occupancy view — how full each shared pitch is, and what's spare.
          Read-only here (approving lives on the Allocation screen, where the
          fixtures carry the club the write needs); it reflects the approved
          state so a cleared clash reads as resolved. Renders nothing when
          nothing is shared in the loaded window. */}
      {!loading && !error && (
        <PitchOccupancy shares={shares} teamsById={teamsById} approvedKeys={approvedKeys} />
      )}
    </section>
  )
}
