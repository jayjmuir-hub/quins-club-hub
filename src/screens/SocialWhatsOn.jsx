import { useEffect, useMemo, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { Chip } from '../components/Chip.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listEvents } from '../data/events.js'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight, visibleTeams } from '../lib/scope.js'
import { clubToday, eventDate, eventTimeLabel, formatTime } from '../lib/eventFormat.js'
import { defaultEventWindow } from '../lib/eventWindow.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'

// "What's on" — the Social Media Management all-in-one view. Jay, 12 Aug 2026:
// "give the social media manager all in one view of the events happening or
// have happened like matches, tournaments, socials, etc".
// Ruling: claude/decisions/2026-08-12-social-media-management.md.
//
// ⚠️ TWO SECTIONS, PAST AND FUTURE, AND THE SPLIT IS THE WHOLE POINT. The job
// has two halves that need different things: something that HAS happened wants
// a report and a result, something COMING wants a preview. One long
// chronological list would bury today's line in the middle and make the
// manager scroll to find either.
//
// ⚠️ RECENT IS NEWEST-FIRST, UPCOMING IS SOONEST-FIRST. Both orders put the
// thing you are most likely to post about next at the top of its section, and
// they are therefore deliberately opposite. A single sort direction would be
// tidier to read in the code and worse to use.
//
// ⚠️ THE RIGHT GATES THE SCREEN, NOT THE DATA. RLS on events is unchanged and
// every admin can already read them; this is a "not your job" message. The
// screen repeats the check because a route is linkable.

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'match', label: 'Matches' },
  { key: 'social', label: 'Socials' },
  { key: 'training', label: 'Training' },
]

export default function SocialWhatsOn() {
  const { memberships, teams } = useMemberships()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [reloadToken, setReloadToken] = useState(0)

  const mayManage = hasAdminRight(memberships, 'media')
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

    // ⚠️ THE SAME ROLLING WINDOW EVERY OTHER SCREEN USES — 12 months back, 6
    // forward — and the club's month, not the reader's. A bare new Date()
    // would put a reader in another timezone into the wrong month at the
    // boundary (design-system.md §7).
    const { year, month } = clubToday()
    const window = defaultEventWindow({ year, month })
    listEvents({ from: window.from, to: window.to })
      .then((events) => {
        if (mounted) setRows(events)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setRows([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [mayManage, reloadToken])

  // ⚠️ "now" READ ONCE PER RENDER and passed down, never called inside the
  // loop: two events either side of the same instant must not disagree about
  // which side of "now" they are on.
  const now = new Date()

  const { upcoming, recent } = useMemo(() => {
    const shown = filter === 'all' ? rows : rows.filter((row) => row.type === filter)
    const future = []
    const past = []
    for (const row of shown) {
      if (eventDate(row) >= now) future.push(row)
      else past.push(row)
    }
    future.sort((a, b) => eventDate(a) - eventDate(b))
    past.sort((a, b) => eventDate(b) - eventDate(a))
    return { upcoming: future, recent: past }
  }, [rows, filter, now])

  if (!mayManage) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">Social Media Management</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Social Media Management hasn&apos;t been added to your account. A super admin can
          add it on the Accounts screen.
        </p>
      </Card>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div role="status" className="flex flex-1 items-center justify-center py-20">
        <Spinner label="Loading what's on…" />
      </div>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load what&apos;s on</h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
          {error.message || 'Something went wrong. Try again.'}
        </p>
        <Button onClick={() => setReloadToken((token) => token + 1)} className="mx-auto mt-4">
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <section>
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
                ? 'border-brand bg-surface-mute text-danger-ink'
                : 'border-line text-ink hover:border-brand hover:text-brand-ink',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      <EventSection
        title="Coming up"
        events={upcoming}
        squadsById={squadsById}
        empty="Nothing coming up in this window."
      />
      <EventSection
        title="Recently"
        events={recent}
        squadsById={squadsById}
        empty="Nothing has happened in this window yet."
      />
    </section>
  )
}

function EventSection({ title, events, squadsById, empty }) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.6px] text-ink-muted">
        {title}
      </h3>
      {events.length === 0 ? (
        <Card>
          <Empty message={empty} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {events.map((event) => {
            const squad = squadsById.get(event.team_id)
            const played =
              event.result_us !== null && event.result_us !== undefined &&
              event.result_them !== null && event.result_them !== undefined
            return (
              <div
                key={event.id}
                data-testid="whats-on-row"
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
                    {event.venue ? ` · ${event.venue}` : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {/* ⚠️ A SCORE ONLY WHERE ONE WAS RECORDED. "0-0" and "not
                      entered" are different facts and this must not render
                      the second as the first — a social manager posting a
                      0-0 that never happened is the failure. */}
                  {played && (
                    <span className="text-[13px] font-extrabold text-ink">
                      {event.result_us}–{event.result_them}
                    </span>
                  )}
                  <Chip type={event.type}>{event.type}</Chip>
                </div>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
