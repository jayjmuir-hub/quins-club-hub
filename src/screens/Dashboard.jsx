import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Greeting from '../components/Greeting.jsx'
import UpcomingStrip from '../components/UpcomingStrip.jsx'
import Empty from '../components/Empty.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import Spinner from '../components/Spinner.jsx'
import EventDetail from './EventDetail.jsx'
import EventForm from './EventForm.jsx'
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
  nextEventLabel,
  sortByStart,
  venueLine,
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
const MUTED_ON_PAPER = 'text-ink-muted'

// design-system.md §3: .btn{padding:10px 15px;border-radius:11px}, 14px/700.
// `flex items-center justify-center` is load-bearing rather than decorative:
// these are full-width buttons and links used as layout boxes, and a
// <button>'s content is centred by Chromium's UA stylesheet but an <a>'s is
// not — so without an explicit layout the two variants would sit differently
// on the same stack. Declared once here so they cannot drift.
const BUTTON_BASE =
  'flex w-full items-center justify-center gap-2 rounded-[11px] px-[15px] py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'
// Ghost: --maroon text on white, 5.93:1, clears AA.
const BUTTON_GHOST = `${BUTTON_BASE} bg-surface-card text-brand shadow-[inset_0_0_0_1.5px_theme(colors.line.DEFAULT)] hover:bg-surface-mute`

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

// Section headers get Anton plus the website's red rule fading out across the
// remaining width. Anton is legitimate here — these are two-word signposts, not
// running text. The rule is a flex child rather than a border so it can taper.
function BlockTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] flex items-center gap-2.5 font-display text-[17px] uppercase tracking-[0.03em] text-ink first:mt-0">
      <span>{children}</span>
      <span
        aria-hidden="true"
        className="h-[2px] flex-1 rounded-sm bg-[image:linear-gradient(90deg,theme(colors.brand.DEFAULT),transparent)]"
      />
    </h3>
  )
}

// StatTile is no longer a Card. The three tiles now render as cells of one
// continuous red->green band — the club website's single strongest signature
// (its .statband). `tone` is kept in the signature so callers don't change,
// but it is ignored: every numeral on the band is white, because the band's
// own colour is what varies across it.
//
// See tailwind.config.js `stat-band` for why the green stop is #157f3c rather
// than the site's #3bd070 (white text hits 2.01:1 on the raw green).
function StatTile({ testId, value, label, className = '' }) {
  return (
    <div
      data-testid={testId}
      className={`border-r border-white/25 px-3 py-4 text-center last:border-r-0 ${className}`}
    >
      <div className="font-display text-[30px] leading-none text-white desktop:text-[42px]">
        {value}
      </div>
      <div className="mt-1 font-condensed text-[11px] font-bold uppercase leading-tight tracking-[0.04em] text-white/95 desktop:text-[14px] desktop:tracking-[0.1em]">
        {label}
      </div>
    </div>
  )
}

// Wraps the tiles in the gradient band plus the vivid brand-rule hairline.
// The hairline is where the full-saturation #3bd070 lives now — it carries no
// text, so it is free to be as bright as the website's.
function StatBand({ children }) {
  return (
    <div className="overflow-hidden rounded-card shadow-card">
      <div className="brand-rule" />
      <div className="grid grid-cols-3 bg-stat-band">{children}</div>
    </div>
  )
}

function CountdownBox({ testId, value, label }) {
  return (
    <div className="flex-1 rounded-[10px] bg-white/[.16] py-2 text-center">
      <b data-testid={testId} className="block font-display text-[26px] font-normal leading-none">
        {value}
      </b>
      {/* font-semibold is load-bearing: only the 600 and 700 cuts of Barlow
          Condensed are bundled, so a condensed element left at the default
          400 silently renders in the fallback face instead. */}
      <span className="mt-1 block font-condensed text-[12px] font-semibold uppercase tracking-[1px] opacity-90">
        {label}
      </span>
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
      className="harlequin relative mb-4 overflow-hidden rounded-card bg-hero-grad p-[18px] text-white shadow-card"
    >
      {/* ⚠️ Reflects the event's TYPE. This was hardcoded "Next fixture",
          which made a training session announce itself as a fixture whenever
          no match was coming — and the fallback to any event type is
          deliberate, so that is the normal out-of-season state, not a rare
          one. See nextEventLabel in src/lib/eventFormat.js. */}
      <div className="relative z-10 font-condensed text-[14px] font-bold uppercase tracking-[0.18em] opacity-95">
        {nextEventLabel(event)}{teamName ? ` · ${teamName}` : ''}
      </div>

      {/* Anton. This is the page's opening statement and the one piece of type
          on the dashboard that is meant to be read as a headline rather than
          scanned, so it gets the display face. */}
      <div className="relative z-10 mt-1.5 font-display text-[30px] uppercase leading-[0.94] desktop:text-[42px]">
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
        {venueLine(event) && (
          <span className="flex items-center gap-1.5">
            <PinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {venueLine(event)}
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
        {/* These two GO somewhere, which is exactly the case the club site
            marks with its rotating arrow badge. Save/Cancel buttons do not
            get one — see Button.jsx. */}
        <Button as={Link} to="/schedule" variant="secondary" full arrow>
          {canEdit ? 'View full schedule' : 'View schedule'}
        </Button>
        <Button as={Link} to="/roster" variant="secondary" full arrow>
          View team list
        </Button>

        {/* The role noun comes from roleLabel(), the same source as the scope
            note at the top of this screen. Hardcoding "parent" here told a
            player they were a parent, twelve lines below a scope note that
            said "Player view". */}
        {readOnlyRole && (
          <p className="text-center text-[12.5px] leading-relaxed text-ink-faint">
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
  // null = closed; { event } = editing that event. The dashboard never opens
  // the form for a NEW event (that lives on the Schedule screen), so there
  // is no "adding" case here.
  const [formState, setFormState] = useState(null)

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
  // Asked per visible team through canEditTeam, rather than by looking for a
  // 'coach' membership row, so this agrees with the helper that will gate the
  // actual writes in Tasks 14/15. A coach row with a null team_id contributes
  // no team to scopedTeams (visibleTeams drops null ids), so `.some()` over an
  // empty list is false and that coach is read-only — where a raw role check
  // would grant, enabling an action that opens a form with no squad to pick.
  // canEditTeam's own null guard is the second line of defence behind that.
  // Same shape as Schedule.jsx's precedent.
  const canEdit = admin || scopedTeams.some((team) => canEditTeam(memberships, team.id))
  // Null for anyone who can edit; otherwise the role noun for the read-only
  // explanation, from the same roleLabel() the scope note uses.
  const readOnlyRole = canEdit ? null : roleLabel(memberships).toLowerCase()
  const teamNames = scopedTeams.map((team) => team.name).join(', ')

  // What the Dashboard calls "to play" is a question about the CALENDAR:
  // what is coming up next, and how much of it is there. That is not the same
  // question as Schedule's Upcoming tab, which asks about the RESULT rule —
  // "which fixtures still need a score" — and deliberately keeps an unscored
  // match from last week visible until somebody records it (Task 11's ruling,
  // untouched). The two questions shared a filter here, and the split showed:
  // trainings and socials can never carry a score, so under `!hasResult` a
  // week-old social sat at the top of "Upcoming" forever and was counted in
  // "Fixtures to play". Filtering on the date is what this screen actually
  // means. An event with an unparseable starts_at is excluded rather than
  // floated to the top; sortByStart already sinks those to the bottom on
  // Schedule, where they stay visible.
  const toPlay = sortByStart(
    events.filter((event) => {
      const date = eventDate(event)
      return date != null && date.getTime() > now
    }),
    'asc',
  )
  const results = sortByStart(events.filter(hasResult), 'desc')
  const lastResult = results[0] ?? null

  // The hero is just the head of that list, preferring a match and falling
  // back to the next event of any type (design-system.md §4.11).
  const nextFixture = toPlay.find((event) => event.type === 'match') ?? toPlay[0] ?? null

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
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load your dashboard</h3>
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
      {/* The prototype's home view has no visible title (design-system.md
          §5.1) — the hero is the page's opening statement. This heading keeps
          the document outline intact for screen readers without changing the
          approved design. */}
      <h2 className="sr-only">Dashboard</h2>

      {/* Sits above the fixture hero so the first thing on the screen is
          addressed to the person, not to the club. */}
      <Greeting />

      {nextFixture && (
        <NextFixtureHero
          event={nextFixture}
          teamName={teamsById.get(nextFixture.team_id)?.name}
          now={now}
        />
      )}

      {/* The fortnight glance (option C of the three Jay compared). Fed the
          SCOPED event list, so a parent sees their child's squad and a coach
          sees theirs — the dots follow the same visibility rules as every
          other number on this screen.

          Shown to everyone, not gated like the stat band: "what is on in the
          next two weeks" is the one question every role opens this app to
          answer. */}
      <BlockTitle>Next two weeks</BlockTitle>
      <Card>
        <UpcomingStrip events={toPlay} now={now} onSelect={(event) => setSelectedEventId(event.id)} />
      </Card>

      {/* STAFF ONLY (Jay, 6 Aug 2026). Hidden from anyone who cannot edit —
          in practice parents and players.
          
          These three numbers are a management summary: how big is the squad,
          how much is left to play, how many groups am I responsible for. A
          parent has one child and already knows the answer to all three, so
          the band was three tiles of noise at the top of the screen they see
          most. It was never a privacy problem — the values are scoped, and a
          parent saw "Players in view: 12", not the club's 315 — it was just
          useless to them.

          Gated on canEdit rather than on a role name so it follows the
          permission that already exists: add a role later and it lands on the
          correct side automatically. Coaches, managers, medics and admins
          keep it.

          What replaces it for parents is deliberately nothing, for now.

          Three cells in one band at every width. The old 2-up mobile grid
          needed the third tile to span both columns to avoid a ragged
          half-width tile; a single 3-column band has no ragged case, so that
          special-casing is gone. */}
      {canEdit && (
        <StatBand>
          <StatTile
            testId="stat-players"
            value={players.length}
            label={admin ? 'Registered players' : 'Players in view'}
          />
          <StatTile testId="stat-fixtures" value={toPlay.length} label="Fixtures to play" />
          <StatTile
            testId="stat-groups"
            value={scopedTeams.length}
            label={admin ? 'Age groups' : 'Your groups'}
          />
        </StatBand>
      )}

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

      {/* The dashboard's fixture rows open the same detail sheet the
          schedule does, so they get the same Edit/Delete footer and the same
          form — otherwise a coach tapping a fixture here would be told the
          event is read-only, which is untrue. Adding fixtures still lives on
          the Schedule screen only (design-system.md §5.2); the quick-actions
          card above stays as it is until Task 15's player form lands with
          it. */}
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
