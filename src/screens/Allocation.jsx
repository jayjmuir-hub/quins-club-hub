import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Button from '../components/Button.jsx'
import Spinner from '../components/Spinner.jsx'
import { listEvents } from '../data/events.js'
import { listPitches, findPitchClashes, pitchShares, PITCH_TBD } from '../data/pitches.js'
import { listShareApprovalKeys, approveShare, unapproveShare, shareKey } from '../data/pitchShareApprovals.js'
import { PITCH_PORTIONS, defaultPitchPortion, portionShort } from '../lib/pitchPortion.js'
import { listPitchRequests, allocatePitch, declinePitch, setEventPitch } from '../data/pitchRequests.js'
import { Sheet } from '../components/Sheet.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight, isAdmin, visibleTeams } from '../lib/scope.js'
import { CLUB_TIME_ZONE, clubToday, eventDate, eventEndDate, eventTimeLabel, eventTitle, formatTime } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { PitchMonth, PitchOccupancy, PitchWeek } from '../components/PitchCalendar.jsx'
import { PitchDayCard, PitchWeekCard } from '../components/PitchShareCard.jsx'
import { diagramSlots, diagramWeek } from '../lib/pitchOccupancy.js'
import { shareCanvas } from '../lib/shareImage.js'
import { drawPitchDayCanvas, drawPitchWeekCanvas } from '../lib/pitchShareCanvas.js'
import EventDetail from './EventDetail.jsx'
import {
  dayKey,
  monthGrid,
  sameDay,
  shiftMonth,
  weekDays,
  windowFor,
  shiftDay as shiftDayParts,
} from '../lib/calendarGrid.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// The allocation grid — pitches down the side, the day across the top.
//
// Jay picked this ("option C") from three layouts drawn at browser width, and
// it is the screen the pitch work exists for: a Saturday morning fits on one
// view and a double booking reads as two amber cells without reading a word.
//
// ⚠️ IT OPENS ON THE WEEK, ANCHORED ON TODAY — Jay, 30 Aug 2026. The week is the
// planning horizon a coach actually opens this screen for; the month is one tab
// away.
//
// ⚠️ THIS SUPERSEDES THE 12 Aug "OPENS ON THE MONTH" DEFAULT, which itself
// replaced the explicit 11 Aug "opens on today, in Day view" ruling. Each was a
// decision Jay was asked for, not a guess — so the superseded ones are left
// legible here rather than erased, the same way the month default kept the day
// one. A default nobody asked about is a guess; these three were not.
//
// ⚠️ "ANCHORED ON TODAY" IS STILL TRUE AND STILL MATTERS. `day` is initialised
// to clubToday(), so the week that opens is THIS week, today inside it — not
// January, and not the week of some remembered selection.
//
// ⚠️ WEEK → DAY LANDS ON THE FIRST DAY OF THAT WEEK (Jay, 30 Aug 2026). `day` is
// whatever anchor the week paged to — and that is often its LAST day, because
// paging shifts `day` by 7 from today and today can be a Sunday — so switching
// to Day without resetting it jumped to that anchor (the last day of the week).
// The view switch now moves `day` to the week's Monday, so Day opens where the
// week reads from. See the tablist onClick below.
//
// ⚠️ THE THREE VIEWS ANSWER DIFFERENT QUESTIONS, which is why all three exist:
//   DAY    pitches × hours — "what is on this pitch at this hour", the grid you
//          allocate from. The only view that can show a double booking as two
//          cells side by side.
//   WEEK   seven columns — "what is coming this weekend", the planning horizon.
//   MONTH  the full calendar — "which days need me at all".
//
// ⚠️ THIS IS THE WEEKLY JOB. Setting the pitch list up is the rare one and
// lives on its own screen, so a destructive action (retire) is not sitting on
// the screen somebody uses every Saturday.

/** The three views, in the order they widen. */
const VIEWS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

// ⚠️ dayWindow AND shiftDay USED TO LIVE HERE AND ARE NOW IN
// src/lib/calendarGrid.js, which the week and month views also need. They were
// byte-for-byte the same arithmetic — `windowFor([day])` and `dayWindow(day)`
// produced the identical pair of ISO strings — and two copies of a time-zone
// calculation is two places to get Abu Dhabi's +04:00 wrong in different ways.
// The offset reasoning now lives in one file, with its own tests.

/**
 * The hour columns the grid needs.
 *
 * ⚠️ DERIVED FROM THE DAY'S FIXTURES, NOT FIXED. A fixed 08:00-20:00 grid
 * would silently drop a 07:00 kick-off — the fixture would exist, be
 * allocated, and simply not appear. Deriving means the grid always contains
 * everything it is showing.
 */
export function hourRange(events) {
  const starts = []
  const ends = []
  for (const event of events ?? []) {
    const start = eventDate(event)
    if (!start) continue
    starts.push(start.getTime())
    ends.push((eventEndDate(event) ?? start).getTime())
  }
  if (starts.length === 0) return []

  const hourOf = (ms) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: CLUB_TIME_ZONE,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date(ms))
    return Number(parts.find((part) => part.type === 'hour').value)
  }

  const first = Math.min(...starts.map(hourOf))
  // The last column has to CONTAIN the finish, so an event ending at 11:30
  // needs the 11:00 column.
  const last = Math.max(...ends.map(hourOf), first)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

function hourOfEvent(event) {
  const start = eventDate(event)
  if (!start) return null
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: CLUB_TIME_ZONE, hour: '2-digit', hour12: false })
      .formatToParts(start)
      .find((part) => part.type === 'hour').value,
  )
}

/**
 * The rows: every ACTIVE pitch, plus any pitch a fixture that day names even
 * if it is retired or was never in the list.
 *
 * ⚠️ THE SECOND HALF IS THE POINT. Showing only active pitches would make a
 * booking on a retired pitch vanish from the one screen whose job is to show
 * what is booked — the fixture would still exist, still clash, and be
 * invisible. A retired pitch that has something on it is exactly what somebody
 * needs to see.
 */
export function rowsFor(pitches, events) {
  const active = (pitches ?? []).filter((pitch) => pitch.is_active)
  const known = new Set(active.map((pitch) => pitch.name))
  const extra = []

  for (const event of events ?? []) {
    const name = (event?.pitch ?? '').trim()
    if (!name || name === PITCH_TBD || known.has(name)) continue
    known.add(name)
    const retired = (pitches ?? []).find((pitch) => pitch.name === name)
    extra.push({
      id: retired?.id ?? `unlisted:${name}`,
      name,
      is_active: false,
      unlisted: !retired,
    })
  }

  return [...active, ...extra]
}

export default function Allocation() {
  const { memberships, teams } = useMemberships()
  const [requests, setRequests] = useState([])
  const [deciding, setDeciding] = useState(null)
  const [chosenPitch, setChosenPitch] = useState('')
  // How much of the pitch this allocation gives. Shared with chosenPitch across
  // both entry points (queue answer and direct assign) — only one decision is
  // ever in flight, the same reason decideBusy is shared. Defaulted from the
  // fixture's squad when a flow opens (portionDefaultFor), then editable.
  const [chosenPortion, setChosenPortion] = useState('full')
  const [reason, setReason] = useState('')
  const [decideBusy, setDecideBusy] = useState(false)
  const [decideError, setDecideError] = useState(null)
  const [day, setDay] = useState(() => clubToday())
  // Jay's call, 30 Aug 2026. See the header — the week is the planning horizon
  // this screen is opened for; this supersedes the 12 Aug month default (which
  // superseded the 11 Aug Day one).
  const [view, setView] = useState('week')
  const [events, setEvents] = useState([])
  const [pitches, setPitches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  // The "this overload is fine" approvals, and the state for the approve/undo
  // control on the occupancy panel below.
  const [approvedKeys, setApprovedKeys] = useState(() => new Set())
  const [approveBusy, setApproveBusy] = useState(false)
  const [approveError, setApproveError] = useState(null)
  // The pitch-layout picture (day/week) is shown on screen as a DOM card and,
  // for the share, DRAWN NATIVELY on a canvas from the same model — no ref, no
  // html2canvas photograph (see shareVisual, and src/lib/pitchShareCanvas.js).
  const [shareBusy, setShareBusy] = useState(false)
  const [shareError, setShareError] = useState(null)

  const teamIds = useMemo(() => visibleTeams(memberships, teams).map((team) => team.id), [memberships, teams])
  const teamsById = useMemo(() => new Map((teams ?? []).map((team) => [team.id, team])), [teams])
  // ⚠️ THE FETCH FOLLOWS THE VIEW, AND THAT IS THE WHOLE COST OF THE CALENDAR.
  // A month of fifteen squads is the read that made listEvents page in the
  // first place (~1,690 rows over 18 months, so a month is ~90) — well inside
  // fetchAllPages, but it is the reason the window is derived from the visible
  // days rather than left at one day and filtered.
  const window = useMemo(() => {
    if (view === 'day') return windowFor([day])
    return windowFor(view === 'week' ? weekDays(day) : monthGrid(day))
  }, [view, day])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    Promise.all([
      listEvents({ teamIds, from: window.from, to: window.to }),
      listPitches({ includeRetired: true }),
      // ⚠️ THE QUEUE IS NOT FILTERED BY THE DAY ON SCREEN. A request is a job
      // waiting to be done, not a thing that happens on a date — filtering it
      // to the visible day would hide next Saturday's requests every weekday
      // and the queue would look empty precisely when there is work.
      listPitchRequests({ status: 'submitted' }).catch(() => []),
      // A failed approvals read is not an error state — it just leaves the
      // clash markers showing, the safe direction.
      listShareApprovalKeys().catch(() => new Set()),
    ])
      .then(([eventRows, pitchRows, requestRows, approvalKeys]) => {
        if (!mounted) return
        setEvents(eventRows)
        setPitches(pitchRows)
        setRequests(requestRows)
        setApprovedKeys(approvalKeys)
      })
      .catch((failure) => {
        if (!mounted) return
        setError(failure)
        setEvents([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [teamIds, window.from, window.to, reloadToken])

  const hours = useMemo(() => hourRange(events), [events])
  const rows = useMemo(() => rowsFor(pitches, events), [pitches, events])

  // ⚠️ Clashes are computed over the DAY'S events, and the exemptions live in
  // findPitchClashes — a multi-squad fan-out sharing a group_id is not a clash,
  // portions that fit within one pitch are not a clash, touching is not
  // overlapping, and Pitch TBD never clashes. An overload an admin has marked
  // "fine" is excluded too, so the marker and the occupancy row agree.
  const clashing = useMemo(() => {
    const ids = new Set()
    for (const clash of findPitchClashes(events)) {
      if (approvedKeys.has(shareKey(clash.events))) continue
      for (const event of clash.events) ids.add(event.id)
    }
    return ids
  }, [events, approvedKeys])

  // Every shared pitch on screen, for the occupancy panel below the grid.
  const shares = useMemo(() => pitchShares(events), [events])

  // ── The pitch-layout picture ────────────────────────────────────────────
  // The on-screen "visual representation" and the day/week share images are one
  // card. Built from BOOKED events only: the diagram takes a real pitch name,
  // and the TBD placeholder — which this screen owns — is not one, so it is
  // filtered here rather than teaching the pure builder the data layer's constant.
  const bookedEvents = useMemo(
    () =>
      events.filter((event) => {
        const name = (event.pitch ?? '').trim()
        return name && name !== PITCH_TBD
      }),
    [events],
  )
  const dayModel = useMemo(
    () => (view === 'day' ? diagramSlots(bookedEvents, teamsById) : []),
    [view, bookedEvents, teamsById],
  )
  const weekModel = useMemo(() => {
    if (view !== 'week') return []
    return diagramWeek(bookedEvents, weekDays(day), teamsById).map(({ dayParts, empty, slots }) => ({
      // The reader's own locale, formatted from the day's PARTS in UTC — the
      // same carrier-date trick the heading uses, so the label matches the date
      // it labels regardless of the browser's zone.
      weekday: new Date(Date.UTC(dayParts.year, dayParts.month, dayParts.day))
        .toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short' })
        .toUpperCase(),
      dayNum: dayParts.day,
      empty,
      slots,
    }))
  }, [view, bookedEvents, day, teamsById])
  const hasLayout =
    view === 'day' ? dayModel.length > 0 : view === 'week' ? weekModel.some((entry) => !entry.empty) : false

  // ⚠️ AWAY MATCHES ARE NOT WAITING FOR ANYTHING — somebody else's ground,
  // no pitch of ours to give (Jay, 24 Aug 2026). Strict `=== false`, the
  // same rule PitchRequest pins with a test: `home` is NULL for every
  // training and social, and a `!event.home` check would put the majority
  // of the club's pitch-needing events out of this list.
  const unallocated = useMemo(
    () =>
      events.filter(
        (event) =>
          event.home !== false &&
          (!(event.pitch ?? '').trim() || event.pitch === PITCH_TBD),
      ),
    [events],
  )

  async function decide(work) {
    setDecideBusy(true)
    setDecideError(null)
    try {
      await work()
      setDeciding(null)
      setAssigning(null)
      // Refetch both: allocating writes the FIXTURE, so the grid is stale too.
      setReloadToken((token) => token + 1)
    } catch (failure) {
      setDecideError(failure)
    } finally {
      setDecideBusy(false)
    }
  }

  // Approve / undo a sharing overload. Re-reads just the approvals afterwards —
  // the fixtures did not change, only whether one overlap is being flagged.
  async function runApproval(work) {
    setApproveBusy(true)
    setApproveError(null)
    try {
      await work()
      setApprovedKeys(await listShareApprovalKeys())
    } catch (failure) {
      setApproveError(failure)
    } finally {
      setApproveBusy(false)
    }
  }

  // ── Direct assignment — click an event, give it a pitch ─────────────────
  // (claude/plans/2026-08-24-pitch-direct-assign.md). `assigning` holds the
  // clicked EVENT; the Sheet below is the picker. Shares decideBusy/
  // decideError with the queue on purpose — one decision in flight at a
  // time is the queue's own rule, and a second busy flag would let the two
  // race each other.
  const [assigning, setAssigning] = useState(null)
  // Details first (Jay, 24 Aug 2026): a click opens the full EventDetail
  // sheet — match details, competition, notes — and the pitch picker is a
  // button inside it, not the first thing thrown at the screen.
  const [detailEvent, setDetailEvent] = useState(null)

  // The portion to pre-fill for an event, from its squad's age and type — the
  // same rule EventForm uses, so a pitch answered here lands with the split the
  // coach would have picked (matches U6–U8 ¼, U9–U11 ½, U12+ full; training
  // smaller). A suggestion, always editable.
  function portionDefaultFor(event) {
    if (!event) return 'full'
    return defaultPitchPortion(teamsById.get(event.team_id)?.name ?? null, { type: event.type })
  }

  function openAssign(event) {
    setDetailEvent(null)
    setAssigning(event)
    const current = (event.pitch ?? '').trim()
    setChosenPitch(current === PITCH_TBD ? '' : current)
    // Keep an existing split when re-assigning; otherwise suggest by age.
    setChosenPortion(event.pitch_portion ?? portionDefaultFor(event))
    setDecideError(null)
  }

  function saveAssign() {
    // ⚠️ A PENDING REQUEST RIDES ALONG. If the coach already asked for this
    // fixture, answering by clicking the event must close their request too
    // — otherwise the queue says "waiting" about a fixture that has its
    // pitch, and the next admin answers it again.
    const pending = requests.find((request) => request.event_id === assigning.id)
    // No real pitch means nothing to split — a null portion, matching EventForm.
    const portion = chosenPitch ? chosenPortion : null
    return decide(() =>
      pending
        ? allocatePitch({ requestId: pending.id, eventId: assigning.id, pitch: chosenPitch, portion })
        : setEventPitch(assigning.id, chosenPitch, portion),
    )
  }

  if (!hasAdminRight(memberships, 'pitches')) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Allocation</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Pitch Management hasn&apos;t been added to your account. A super admin can add
          it on the Accounts screen.
        </p>
      </Card>
    )
  }

  // ⚠️ BUILT FROM UTC PARTS WITH timeZone: 'UTC', which looks wrong and is not.
  // `day` is already the CLUB's calendar date, so the Date below is a carrier
  // for those parts rather than an instant — formatting it in any other zone
  // would shift the label off the date it is labelling.
  const asDate = new Date(Date.UTC(day.year, day.month, day.day))
  const heading =
    view === 'month'
      ? asDate.toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', year: 'numeric' })
      : view === 'week'
        ? (() => {
            const days = weekDays(day)
            // ⚠️ BOTH ENDS CARRY THE MONTH, EVEN WITHIN ONE MONTH. Omitting it
            // from the first date produced "10 – August 16" in a
            // month-before-day locale — measured in Chromium, not imagined —
            // which reads as a range between a number and a date. Formatting
            // both ends the same way is unambiguous in EVERY locale, which is
            // the point: the locale is the reader's and this code does not get
            // to assume its order.
            const format = (parts) =>
              new Date(Date.UTC(parts.year, parts.month, parts.day)).toLocaleDateString(undefined, {
                timeZone: 'UTC',
                day: 'numeric',
                month: 'short',
              })
            return `${format(days[0])} – ${format(days[6])}`
          })()
        : asDate.toLocaleDateString(undefined, {
            timeZone: 'UTC',
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })

  const today = clubToday()
  // "Today" means the visible RANGE contains today, not that the anchor is
  // today — otherwise the button would offer to move a week view that is
  // already showing this week.
  const isToday =
    view === 'day'
      ? sameDay(today, day)
      : view === 'week'
        ? weekDays(day).some((d) => sameDay(d, today))
        : day.year === today.year && day.month === today.month

  /** Paging moves by whatever the view is showing. */
  const step = (delta) =>
    setDay((current) =>
      view === 'month' ? shiftMonth(current, delta) : shiftDayParts(current, view === 'week' ? 7 * delta : delta),
    )

  // DRAW the layout picture on a canvas and hand it to the OS share sheet
  // (native file-share on a phone, a PNG download on desktop). ⚠️ NATIVE CANVAS,
  // NOT html2canvas: html2canvas mangled the small squad codes into dashes, so
  // the picture is drawn with the browser's own text engine (src/lib/
  // pitchShareCanvas.js) from the same model the on-screen card renders. A cancel
  // is not an error; shareCanvas returns rather than throwing on it.
  async function shareVisual() {
    const isDay = view === 'day'
    setShareBusy(true)
    setShareError(null)
    try {
      const canvas = isDay
        ? drawPitchDayCanvas({ title: heading, slots: dayModel })
        : drawPitchWeekCanvas({ title: heading, days: weekModel })
      const anchor = isDay ? day : weekDays(day)[0]
      await shareCanvas(canvas, {
        filename: `pitch-${isDay ? 'day' : 'week'}-${dayKey(anchor)}.png`,
        title: 'Pitch allocation',
        text: `Pitch allocation · ${heading}`,
      })
    } catch (failure) {
      setShareError(failure)
    } finally {
      setShareBusy(false)
    }
  }

  return (
    <section>
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[26px]">{heading}</h2>
          <p className="text-[13px] font-medium text-ink-muted">
            {events.length} {events.length === 1 ? 'fixture' : 'fixtures'}
            {unallocated.length > 0 ? ` · ${unallocated.length} without a pitch` : ''}
            {clashing.size > 0 ? ` · ${clashing.size / 2} clash` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => step(-1)} aria-label="Previous">
            Previous
          </Button>
          {!isToday && (
            <Button variant="secondary" size="sm" onClick={() => setDay(clubToday())}>
              Today
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => step(1)} aria-label="Next">
            Next
          </Button>
        </div>
      </div>

      {/* ⚠️ A ROW OF TABS, NOT the shared <Segmented>. Segmented is a
          fieldset/legend RADIO GROUP built for a form question ("what gender is
          this player") — it renders a visible legend and takes a full-width
          row. This is a VIEW SWITCH sitting in a page header, where a legend
          would be a label for something that is not a question. Same reason
          Schedule's own filter pills are not Segmented either. */}
      <div
        role="tablist"
        aria-label="Calendar view"
        data-testid="allocation-views"
        className="mb-3.5 inline-flex rounded-[11px] border-[1.5px] border-line p-0.5"
      >
        {VIEWS.map((option) => {
          const on = view === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={on}
              // ⚠️ WEEK → DAY OPENS THE WEEK'S FIRST DAY, not wherever `day`
              // happened to be anchored. Paging weeks shifts `day` by 7 from
              // today, so it is usually the week's LAST day (a Sunday) — the
              // jump Jay reported (30 Aug 2026). Reset to the Monday so Day
              // opens where the week reads from.
              onClick={() => {
                if (option.value === 'day' && view === 'week') setDay(weekDays(day)[0])
                setView(option.value)
              }}
              className={[
                'rounded-[8px] px-3.5 py-1.5 text-[13px] font-bold transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
                on ? 'bg-brand text-ink-invert' : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {/* ── The pitch-layout picture, and its Share button ────────────────
          The "visual representation" Jay asked for (30 Aug 2026): each pitch
          drawn as the ground carved into the portions its squads take. Shown for
          the DAY and the WEEK — the two things worth sending — above the
          interactive grid, and the Share button photographs this very card.
          Hidden in the month view and when nothing is booked, where a picture of
          an empty ground says nothing. */}
      {!loading && !error && hasLayout && (view === 'day' || view === 'week') && (
        <div className="mb-3.5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">Pitch layout</h3>
            <div className="flex items-center gap-2">
              {shareError && (
                <span role="alert" className="text-[12px] font-semibold text-danger-ink">
                  {friendlyMessage(shareError, 'That could not be shared.')}
                </span>
              )}
              <Button size="sm" variant="secondary" disabled={shareBusy} onClick={shareVisual}>
                {shareBusy ? 'Preparing…' : view === 'day' ? 'Share day' : 'Share week'}
              </Button>
            </div>
          </div>
          {/* The card scrolls inside this box on a phone rather than widening the
              whole page — the same overflow gate the week/month grids use. */}
          <div className="overflow-x-auto pb-1">
            {view === 'day' ? (
              <PitchDayCard title={heading} slots={dayModel} />
            ) : (
              <PitchWeekCard title={heading} days={weekModel} />
            )}
          </div>
        </div>
      )}

      {loading && events.length === 0 ? (
        <div role="status" className="flex flex-1 items-center justify-center py-20">
          <Spinner />
        </div>
      ) : error ? (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load the day</h3>
          <p className="mt-2 text-sm leading-relaxed text-danger-ink">
            {friendlyMessage(error, 'Something went wrong. Try again.')}
          </p>
        </Card>
      ) : view === 'month' ? (
        /* ⚠️ THE MONTH GRID RENDERS EVEN WHEN THE MONTH IS EMPTY, unlike the
           day view below. An empty month is a legible answer — thirty quiet
           squares that say "nothing booked" — whereas fifteen empty PITCH rows
           say nothing and read as a failed load. The empty states differ
           because the grids differ, not by oversight. */
        <PitchMonth
          anchor={day}
          today={today}
          events={events}
          clashing={clashing}
          teamsById={teamsById}
          onPickDay={(picked) => {
            setDay({ year: picked.year, month: picked.month, day: picked.day })
            setView('day')
          }}
        />
      ) : view === 'week' ? (
        <PitchWeek
          anchor={day}
          today={today}
          events={events}
          clashing={clashing}
          teamsById={teamsById}
          onPickDay={(picked) => {
            setDay({ year: picked.year, month: picked.month, day: picked.day })
            setView('day')
          }}
          // A booking in the week view opens its details, the same details-first
          // click the day grid uses (Jay, 30 Aug 2026).
          onPickEvent={setDetailEvent}
        />
      ) : events.length === 0 ? (
        /* ⚠️ A SENTENCE, NOT AN EMPTY GRID. The screen opens on today (Jay's
           call) and today is often a quiet Tuesday — fifteen empty rows would
           read as the app failing to load rather than as a quiet day. */
        <Card className="px-5 py-11 text-center">
          <p className="text-sm text-ink-faint">
            Nothing on {isToday ? 'today' : 'this day'}. Use Next to look ahead.
          </p>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <div
            data-testid="allocation-grid"
            className="min-w-[640px] grid border-t border-line"
            style={{ gridTemplateColumns: `120px repeat(${hours.length}, minmax(96px, 1fr))` }}
          >
            <div className="border-b border-r border-line px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted">
              Pitch
            </div>
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-r border-line px-2.5 py-2 text-[11px] font-extrabold uppercase tracking-[.6px] text-ink-muted last:border-r-0"
              >
                {String(hour).padStart(2, '0')}:00
              </div>
            ))}

            {rows.map((pitch) => {
              const onThisPitch = events.filter((event) => (event.pitch ?? '').trim() === pitch.name)
              return [
                <div
                  key={`${pitch.id}-name`}
                  className="flex items-center gap-2 border-b border-r border-line px-2.5 py-2 text-sm font-bold text-ink"
                >
                  {pitch.name}
                  {!pitch.is_active && (
                    <span className="rounded-pill bg-surface-mute px-2 py-0.5 text-[10.5px] font-bold text-ink-muted">
                      {pitch.unlisted ? 'not listed' : 'retired'}
                    </span>
                  )}
                </div>,
                ...hours.map((hour) => {
                  const here = onThisPitch.filter((event) => hourOfEvent(event) === hour)
                  return (
                    <div
                      key={`${pitch.id}-${hour}`}
                      className="min-h-[44px] border-b border-r border-line p-1.5 last:border-r-0"
                    >
                      {here.map((event) => {
                        const clash = clashing.has(event.id)
                        return (
                          <button
                            key={event.id}
                            type="button"
                            data-testid={clash ? 'booking-clash' : 'booking'}
                            onClick={() => setDetailEvent(event)}
                            aria-label={`Details for ${fixtureLabel(event, event.league_team, teamsById.get(event.team_id)?.name ?? eventTitle(event))}`}
                            className={[
                              'block w-full rounded-[6px] px-2 py-1 text-left text-[12px] font-bold leading-tight transition hover:ring-2 hover:ring-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                              clash ? 'bg-warn-bg text-warn-ink' : 'bg-danger-bg text-danger-ink',
                            ].join(' ')}
                          >
                            {/* ⚠️ LABELLED BY LEAGUE TEAM WHERE THERE IS ONE,
                                and this is the point of the change for
                                Pitch Management:
                                a Saturday of A and B fixtures used to read as
                                the same squad name twice in two rows, with
                                nothing to say which booking was which. */}
                            {fixtureLabel(
                              event,
                              event.league_team,
                              teamsById.get(event.team_id)?.name ?? eventTitle(event),
                            )}
                            <span className="block text-[11px] font-semibold opacity-90">
                              {eventTimeLabel(event)}
                              {/* The pitch is the row, so only the PORTION is
                                  added here — how much of this pitch the booking
                                  takes (Jay, 30 Aug 2026). */}
                              {portionShort(event.pitch_portion) ? ` · ${portionShort(event.pitch_portion)}` : ''}
                              {clash ? ' · clash' : ''}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )
                }),
              ]
            })}
          </div>
        </Card>
      )}

      {/* ── The occupancy view, with the "it's fine" override ─────────────
          Admins can clear a genuine overload here; the marker on the grid above
          clears with it. `isAdmin`, not the pitches right, matches the RLS that
          backs the write (private.is_admin), the same gate the request queue's
          Answer uses. */}
      {approveError && (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-danger-ink">
          {friendlyMessage(approveError, "That didn't save. Try again.")}
        </p>
      )}
      <PitchOccupancy
        shares={shares}
        teamsById={teamsById}
        approvedKeys={approvedKeys}
        canApprove={isAdmin(memberships)}
        onApprove={(group) => runApproval(() => approveShare(group.events))}
        onUndo={(key) => runApproval(() => unapproveShare(key))}
        busy={approveBusy}
      />

      {/* ── The Pitch Management queue ───────────────────────────────────
          ⚠️ NOT FILTERED BY THE DAY ON SCREEN — see the fetch. A request is a
          job waiting, not an event on a date. */}
      {requests.length > 0 && (
        <Card className="mt-3.5 p-3.5">
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Requests waiting ({requests.length})
          </h3>

          <ul className="flex flex-col gap-2.5">
            {requests.map((request) => {
              const fixture = request.events
              const start = fixture ? eventDate(fixture) : null
              const open = deciding === request.id
              return (
                <li key={request.id} data-testid="pitch-request" className="rounded-[11px] border border-line p-2.5">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-sm font-bold text-ink">
                      {teamsById.get(fixture?.team_id)?.name ?? 'Squad'}
                    </span>
                    <span className="text-[12.5px] text-ink-muted">
                      {start
                        ? `${start.toLocaleDateString(undefined, { timeZone: CLUB_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' })} · ${formatTime(start)}`
                        : 'Date unknown'}
                    </span>
                    {request.needs_referee && (
                      <span className="rounded-pill bg-surface-mute px-2.5 py-0.5 text-[11.5px] font-bold text-ink-muted">
                        Referee
                      </span>
                    )}
                    <span className="flex-1" />
                    {!open && (
                      <Button size="sm" onClick={() => {
                        setDeciding(request.id)
                        setChosenPitch('')
                        setChosenPortion(portionDefaultFor(fixture))
                        setReason('')
                        setDecideError(null)
                      }}>
                        Answer
                      </Button>
                    )}
                  </div>

                  {request.note && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{request.note}</p>
                  )}

                  {open && (
                    <div className="mt-2.5 flex flex-wrap items-end gap-2">
                      <label className="min-w-0">
                        <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                          Give them
                        </span>
                        <select
                          aria-label={`Pitch for ${teamsById.get(fixture?.team_id)?.name ?? 'this request'}`}
                          value={chosenPitch}
                          disabled={decideBusy}
                          onChange={(domEvent) => setChosenPitch(domEvent.target.value)}
                          className="rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
                        >
                          <option value="">Choose a pitch</option>
                          {pitches.filter((pitch) => pitch.is_active).map((pitch) => (
                            <option key={pitch.id} value={pitch.name}>{pitch.name}</option>
                          ))}
                        </select>
                      </label>

                      {/* How much of that pitch — shown once a pitch is chosen,
                          since a portion of nothing is meaningless. Defaulted
                          from the squad's age when the request was opened. */}
                      {chosenPitch && (
                        <label className="min-w-0">
                          <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                            How much
                          </span>
                          <select
                            aria-label="How much of the pitch"
                            value={chosenPortion}
                            disabled={decideBusy}
                            onChange={(domEvent) => setChosenPortion(domEvent.target.value)}
                            className="rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
                          >
                            {PITCH_PORTIONS.map((portion) => (
                              <option key={portion.value} value={portion.value}>{portion.label}</option>
                            ))}
                          </select>
                        </label>
                      )}

                      <Button
                        size="sm"
                        disabled={decideBusy || !chosenPitch}
                        onClick={() => decide(() =>
                          allocatePitch({
                            requestId: request.id,
                            eventId: request.event_id,
                            pitch: chosenPitch,
                            portion: chosenPitch ? chosenPortion : null,
                          }),
                        )}
                      >
                        {decideBusy ? 'Saving…' : 'Allocate'}
                      </Button>

                      <label className="min-w-0 flex-1">
                        <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                          Or say why not
                        </span>
                        <input
                          type="text"
                          aria-label="Reason for declining"
                          value={reason}
                          disabled={decideBusy}
                          onChange={(domEvent) => setReason(domEvent.target.value)}
                          placeholder="All pitches taken that morning"
                          className="w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand"
                        />
                      </label>

                      {/* ⚠️ A REASON IS REQUIRED TO DECLINE. "No pitch
                          available" with nothing after it leaves a coach with
                          nothing to act on — and because a decline never shows
                          on the fixture, this note is the only thing they get. */}
                      <Button
                        variant="dangerQuiet"
                        size="sm"
                        disabled={decideBusy || !reason.trim()}
                        onClick={() => decide(() =>
                          declinePitch({ requestId: request.id, reason }),
                        )}
                      >
                        Decline
                      </Button>

                      <Button variant="ghost" size="sm" disabled={decideBusy} onClick={() => setDeciding(null)}>
                        Cancel
                      </Button>
                    </div>
                  )}

                  {open && decideError && (
                    <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-ink">
                      {friendlyMessage(decideError, "That didn't save. Try again.")}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {unallocated.length > 0 && (
        /* ⚠️ THE WHOLE REASON THE GRID EXISTS. A fixture with no pitch appears
           in no row, so without this it would be invisible on the one screen
           whose job is to allocate it — the emptier the grid looks, the more
           work there actually is. */
        <Card className="mt-3.5 p-3.5">
          <h3 className="mb-2 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Waiting for a pitch
          </h3>
          <ul className="flex flex-col gap-1.5">
            {unallocated.map((event) => (
              <li key={event.id} data-testid="unallocated" className="text-sm text-ink">
                {/* The whole row is the button — this list is a to-do list,
                    and the to-do is "give it a pitch". */}
                <button
                  type="button"
                  onClick={() => setDetailEvent(event)}
                  className="-mx-1.5 block w-[calc(100%+12px)] rounded-[8px] px-1.5 py-1 text-left transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="font-bold">
                    {fixtureLabel(event, event.league_team, teamsById.get(event.team_id)?.name ?? 'Squad')}
                  </span>
                  <span className="text-ink-muted">
                    {' · '}
                    {/* The DATE leads (Jay, 24 Aug 2026: "the events don't
                        show a date unless you click them") — this list spans
                        whatever window is on screen, so a bare time answers
                        "when" for none of them. Same format the request
                        queue above uses. */}
                    {(() => {
                      const start = eventDate(event)
                      return start
                        ? `${start.toLocaleDateString(undefined, { timeZone: CLUB_TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' })} · `
                        : ''
                    })()}
                    {eventTimeLabel(event)} · {eventTitle(event)}
                  </span>
                  <span className="ml-2 text-[12px] font-bold text-brand-ink">Assign</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Details first (Jay, 24 Aug 2026): the same EventDetail sheet the
          Schedule opens — hero, key facts, competition, notes — with one
          Allocation-only extra: the Assign/Change pitch button, which swaps
          this sheet for the picker below. Withheld for an AWAY match:
          somebody else's ground, no pitch of ours to give (strict
          `home === false`, the PitchRequest rule). No edit/availability
          handlers are passed, so none of those buttons render here. */}
      {detailEvent && (
        <EventDetail
          event={detailEvent}
          team={teamsById.get(detailEvent.team_id)}
          onClose={() => setDetailEvent(null)}
          onAssignPitch={detailEvent.home === false ? undefined : openAssign}
        />
      )}

      {/* The direct-assignment picker. One Sheet serves both entry points
          (grid bookings and the waiting list); closing it clears the shared
          error so the queue's own panel never inherits a stale one. */}
      <Sheet
        open={Boolean(assigning)}
        onClose={() => {
          setAssigning(null)
          setDecideError(null)
        }}
        title={
          assigning
            ? fixtureLabel(assigning, assigning.league_team, teamsById.get(assigning.team_id)?.name ?? eventTitle(assigning))
            : ''
        }
      >
        {assigning && (
          <div>
            <p className="mb-3 text-[13px] text-ink-muted">
              {eventTimeLabel(assigning)} · {eventTitle(assigning)}
              {requests.some((request) => request.event_id === assigning.id) &&
                ' · answers the waiting request too'}
            </p>
            <label className="mb-4 block">
              <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                Pitch
              </span>
              <select
                aria-label="Pitch for this fixture"
                value={chosenPitch}
                disabled={decideBusy}
                onChange={(domEvent) => setChosenPitch(domEvent.target.value)}
                className="w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
              >
                <option value="">Choose a pitch</option>
                {pitches.filter((pitch) => pitch.is_active).map((pitch) => (
                  <option key={pitch.id} value={pitch.name}>{pitch.name}</option>
                ))}
              </select>
            </label>
            {/* How much of the pitch — appears once a pitch is chosen, defaulted
                from the fixture's squad, so a shared pitch is not later flagged
                as a clash. */}
            {chosenPitch && (
              <label className="mb-4 block">
                <span className="mb-1 block text-[11.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                  How much of the pitch
                </span>
                <select
                  aria-label="How much of the pitch"
                  value={chosenPortion}
                  disabled={decideBusy}
                  onChange={(domEvent) => setChosenPortion(domEvent.target.value)}
                  className="w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-sm text-ink outline-none transition focus:border-brand"
                >
                  {PITCH_PORTIONS.map((portion) => (
                    <option key={portion.value} value={portion.value}>{portion.label}</option>
                  ))}
                </select>
              </label>
            )}
            {decideError && (
              <p role="alert" className="mb-3 text-[12.5px] font-semibold text-danger-ink">
                {friendlyMessage(decideError, "That didn't save. Try again.")}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" disabled={decideBusy || !chosenPitch} onClick={saveAssign}>
                {decideBusy ? 'Saving…' : 'Save pitch'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={decideBusy}
                onClick={() => {
                  setAssigning(null)
                  setDecideError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  )
}
