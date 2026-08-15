import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listEvents } from '../data/events.js'
import { listMatchSheetsFor } from '../data/matchSheets.js'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight, visibleTeams } from '../lib/scope.js'
import { clubToday, eventDate, eventTimeLabel, formatTime } from '../lib/eventFormat.js'
import { defaultEventWindow } from '../lib/eventWindow.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { deadlineLabel, isOverdue, matchSheetDeadline } from '../lib/matchSheetDeadline.js'
import { isMinisTeam } from '../lib/minis.js'

// The Club Youth Manager's dashboard — every match, and whether its RCM sheet
// is done. Behind the `youth` admin right, which already existed in
// ADMIN_RIGHTS and until now granted access to nothing (exactly where `pitches`
// was before the pitch stack).
//
// ⚠️ TITLED BY THE JOB, NOT BY A PERSON — Jay, 12 Aug 2026. Nobody holds this
// job in the app yet, and a screen named after somebody who cannot sign in is a
// screen that reads as broken. The club's jobs are named and the volunteers
// holding them are not: claude/decisions/2026-08-12-jobs-not-people.md.
//
// ⚠️ THE RIGHT GATES THE SCREEN, NOT THE DATA. RLS on match_sheets is
// can_edit_team, which already contains an admin arm — so this is a "not your
// job" message and must never be described as a security boundary.
// See claude/decisions/2026-08-10-role-dashboards.md.
//
// ⚠️ BUILT FOR A LOADED CLUB. A full season across fifteen squads is the target,
// so the fixtures come through the rolling event window and the sheets come back
// in ONE query rather than one per row.

const FILTERS = [
  { key: 'todo', label: 'Needs a sheet' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'done', label: 'Ready to send' },
  { key: 'all', label: 'All matches' },
]

export default function YouthDashboard() {
  const { memberships, teams } = useMemberships()
  const [rows, setRows] = useState([])
  const [sheets, setSheets] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('todo')
  const [reloadToken, setReloadToken] = useState(0)

  const mayManage = hasAdminRight(memberships, 'youth')
  const squadsById = useMemo(
    () => new Map(visibleTeams(memberships, teams).map((team) => [team.id, team])),
    [memberships, teams],
  )

  useEffect(() => {
    if (!mayManage) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)

    // ⚠️ THE SAME ROLLING WINDOW SCHEDULE USES — 12 months back, 6 forward.
    // Not "every event ever": listEvents pages, but an unbounded read on a
    // loaded club is thousands of rows to render one season's sheets.
    // ⚠️ THE CLUB'S MONTH, NOT THE READER'S. clubToday() is Abu Dhabi; a bare
    // new Date() would put a reader in another zone into the wrong month at the
    // boundary — the rule design-system.md §7 states as "not new Date()".
    const { year, month } = clubToday()
    const window = defaultEventWindow({ year, month })
    listEvents({ from: window.from, to: window.to })
      .then(async (events) => {
        if (!mounted) return
        const matches = events.filter((row) => row.type === 'match')
        setRows(matches)
        // ⚠️ ONE QUERY FOR EVERY SHEET, not one per fixture. A season of
        // fixtures across fifteen squads would otherwise be hundreds of round
        // trips on the screen whose whole job is to show the list at a glance.
        const found = await listMatchSheetsFor(matches.map((row) => row.id))
        if (mounted) setSheets(found)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setRows([])
        setSheets(new Map())
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [mayManage, reloadToken])

  // ⚠️ "now" READ ONCE PER RENDER AND PASSED DOWN, not called inside the loop:
  // a list that computed it per row could show two fixtures either side of the
  // same deadline disagreeing about whether it has passed.
  const now = new Date()

  const decorated = useMemo(
    () =>
      rows
        // ⚠️ U10 AND BELOW ARE NOT ON THE RCM FORM, so their fixtures are not
        // this screen's work — "U11 to u16 Games" is instruction 1 on the form
        // itself. Left in, every minis friendly sat here reading "Not started"
        // forever and then "Overdue", which is a queue that can never be
        // emptied and a badge that teaches the Youth Manager to ignore the
        // real ones. See src/lib/minis.js.
        //
        // ⚠️ FILTERED HERE RATHER THAN IN THE QUERY, on purpose: listEvents has
        // no notion of an age band, and teaching it one would put a UI rule
        // into the data layer where the calendar feed and Schedule would
        // inherit it silently.
        //
        // ⚠️ A FIXTURE WHOSE SQUAD DID NOT LOAD IS KEPT. isMinisTeam answers
        // false for a blank name, so an unresolvable squad still shows up
        // needing a sheet — the failure a Youth Manager can see and ask about,
        // rather than a fixture that quietly vanished.
        .filter((row) => !isMinisTeam(squadsById.get(row.team_id)?.name))
        .map((row) => {
          const squad = squadsById.get(row.team_id)
          const deadline = matchSheetDeadline(squad?.name ?? '', eventDate(row))
          const sheet = sheets.get(row.id) ?? null
          return {
            event: row,
            squad,
            sheet,
            deadline,
            // ⚠️ A fixture with NO deadline rule is never overdue. isOverdue
            // already refuses, and this is the second place that would otherwise
            // be tempted to write `deadline.at < now`.
            overdue: sheet?.status !== 'complete' && isOverdue(deadline, now),
          }
        }),
    [rows, squadsById, sheets, now],
  )

  const shown = useMemo(() => {
    if (filter === 'all') return decorated
    if (filter === 'done') return decorated.filter((row) => row.sheet?.status === 'complete')
    if (filter === 'overdue') return decorated.filter((row) => row.overdue)
    return decorated.filter((row) => row.sheet?.status !== 'complete')
  }, [decorated, filter])

  if (!mayManage) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Club Youth Manager</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Club Youth Manager hasn&apos;t been added to your account. A super admin can add
          it on the Accounts screen.
        </p>
      </Card>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center py-20">
        <Spinner label="Loading matches…" />
      </div>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the matches</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          {error.message || 'Something went wrong. Try again.'}
        </p>
        <Button onClick={() => setReloadToken((token) => token + 1)} className="mx-auto mt-4">
          Try again
        </Button>
      </Card>
    )
  }

  const overdueCount = decorated.filter((row) => row.overdue).length

  return (
    <section>
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Match sheets</h2>
          {/* ⚠️ "U11 AND UP" IS SAID OUT LOUD rather than left to be noticed.
              The minis' fixtures are filtered out above, so without this line
              the Youth Manager sees a list that is missing matches they know
              are in the schedule and has no way to tell a rule from a bug. */}
          <p className="text-[13px] font-medium text-ink-muted">
            RCM result sheets for every match, U11 and up
            {overdueCount > 0 ? ` · ${overdueCount} past the deadline` : ''}
          </p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setFilter(option.key)}
            aria-pressed={filter === option.key}
            className={[
              'rounded-[8px] border-[1.5px] px-3 py-1.5 text-[12.5px] font-bold transition',
              filter === option.key
                ? 'border-brand bg-surface-mute text-brand-deep'
                : 'border-line text-ink hover:border-brand hover:text-brand',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <Empty message="Nothing here." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {shown.map(({ event, squad, sheet, deadline, overdue }) => (
            <div
              key={event.id}
              data-testid="youth-match-row"
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[14px] py-[11px] last:border-b-0"
            >
              <div className="min-w-0">
                <span className="block text-[15px] font-bold text-ink">
                  {fixtureLabel(event, event.league_team, squad?.name ?? 'Squad')}
                  {event.opponent ? ` v ${event.opponent}` : ''}
                </span>
                <span className="text-[12.5px] text-ink-muted">
                  {eventDate(event).toLocaleDateString(undefined, {
                    timeZone: 'Asia/Dubai',
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  {' · '}
                  {eventTimeLabel(event)}
                  {/* ⚠️ The true RCM deadline, which differs by age band even
                      though one editor serves them all. */}
                  {deadline ? ` · ${deadlineLabel(deadline)}` : ''}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <span
                  className={[
                    'rounded-[8px] px-2 py-1 text-[11.5px] font-extrabold uppercase tracking-[.4px]',
                    sheet?.status === 'complete'
                      ? 'bg-surface-mute text-ink-muted'
                      : overdue
                        ? 'bg-warn-bg text-warn-ink'
                        : 'bg-surface-mute text-ink-muted',
                  ].join(' ')}
                >
                  {sheet?.status === 'complete' ? 'Ready to send' : overdue ? 'Overdue' : 'Not started'}
                </span>
                <Button as={Link} variant="secondary" to={`/match-sheet/${event.id}`}>
                  {sheet ? 'Open' : 'Start'}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </section>
  )
}
