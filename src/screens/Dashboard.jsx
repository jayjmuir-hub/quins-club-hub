import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { BlockTitle, Kicker } from '../components/Editorial.jsx'
import Greeting from '../components/Greeting.jsx'
import UpcomingStrip from '../components/UpcomingStrip.jsx'
import DaySheet from '../components/DaySheet.jsx'
import Empty from '../components/Empty.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import { DashboardSkeleton } from '../components/Skeleton.jsx'
import Availability from './Availability.jsx'
import Register from './Register.jsx'
import EventDetail from './EventDetail.jsx'
import EventForm from './EventForm.jsx'
import SquadStaffCard from '../components/SquadStaffCard.jsx'
import PersonCard from '../components/PersonCard.jsx'
import NoticeBoard from '../components/NoticeBoard.jsx'
import NotificationsNudge from '../components/NotificationsNudge.jsx'
import CallupBanner from '../components/CallupBanner.jsx'
import PostNoticeAction from '../components/PostNoticeAction.jsx'
import { listEvents, subscribeEvents } from '../data/events.js'
import { listPlayers } from '../data/players.js'
import { openConversation } from '../data/messages.js'
import { listMySquadStaff } from '../data/staff.js'
import {
  listMyReads,
  listNotices,
  markNoticesRead,
  subscribeNotices,
} from '../data/announcements.js'
import { pinnedNotices,
  collapseGroups,
  scopeNotices,
} from '../lib/notices.js'
import { SeasonRecordBand } from '../components/SeasonRecordCard.jsx'
import { defaultEventWindow } from '../lib/eventWindow.js'
import { scoringSquadRecords, windowCoveringSeason } from '../lib/matchRecord.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditEvent, canEditTeam, isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'
import { recordsScores, squadFormat } from '../lib/minis.js'
import {
  clubDayParts,
  clubToday,
  eventDate,
  eventTimeLabel,
  eventTitle,
  formatLongDate,
  hasResult,
  nextEventLabel,
  sortByStart,
  titleRepeatsType,
  venueLine,
} from '../lib/eventFormat.js'
import { friendlyMessage } from '../lib/friendlyError.js'

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

// ⚠️ `BUTTON_BASE` and `BUTTON_GHOST` LIVED HERE AND WERE BOTH DEAD — removed
// 10 Aug 2026 during the routing sweep. `BUTTON_GHOST` had no reference
// anywhere in src or tests, and `BUTTON_BASE` existed only to build it, so the
// pair had been carrying a six-line comment about a layout concern for markup
// that no longer existed. Nothing rendered differently when they went.
//
// The concern the comment described is real and now lives where it can be
// enforced: <Button> declares `inline-flex items-center justify-center` in its
// BASE, so a button and an `as="a"` link lay their content out identically
// instead of relying on two constants staying in step by hand.

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
// BlockTitle moved to src/components/Editorial.jsx in phase 3, so Squad Hub
// and the admin screens write the identical section anatomy. Imported above.

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
//
// ⚠️ mt-[18px] IS LOAD-BEARING, AND IT IS HERE BECAUSE THIS BLOCK HAS NO
// TITLE. Every other block on this screen gets its top gap from BlockTitle's
// own mt-[18px]; the stat band is the only one with no heading above it, so
// nothing was supplying one. It looked fine until 6 Aug only because the band
// used to sit directly under the fixture hero and was living off the hero's
// mb-4 — an accident, not a rule. Putting the fortnight strip between them
// removed that donor and the band ended up flush against the strip's card,
// with the two touching. The value matches BlockTitle exactly so the band
// lines up with every other block boundary on the screen.
// ⚠️ 2×2 ON A PHONE, FOUR ACROSS ON DESKTOP — SINCE 28 Aug 2026. It was a single
// four-across row for one deploy, and Jay's phone showed why that fails: at
// ~90px a tile, the LONG single word "TOURNAMENTS" cannot wrap, so it overflowed
// its cell and collided with "Needs a score". A two-word label wraps and fits;
// a one-word label of eleven characters does not, and no amount of tracking
// saved it. 2×2 gives ~180px tiles where the word sits on one line. The known
// cost is that the horizontal red→green gradient now repeats on each row rather
// than sweeping once — accepted: legible beats a broken sweep. Desktop keeps the
// single sweep at four across, where there is room.
//
// Borders: StatTile's own `border-r … last:border-r-0` draws the verticals (the
// top-right tile's right border lands on the container edge and is clipped by
// overflow-hidden). The horizontal divider between the two phone rows is a
// `border-b` on the first two tiles, dropped at desktop where there is one row.
function StatBand({ children }) {
  return (
    <div className="mt-[18px] overflow-hidden rounded-card shadow-card">
      <div className="brand-rule" />
      <div className="grid grid-cols-2 bg-stat-band desktop:grid-cols-4">{children}</div>
    </div>
  )
}

// design-system.md §4.11. Two-stop plum -> maroon gradient, white text
// throughout (>= 5.9:1 against the lighter maroon end).
//
// The days/hrs/min countdown that used to sit at the bottom of this hero was
// removed on 6 Aug 2026 (Jay: "we don't need the countdown clock to the next
// event, i don't think we really need it anywhere"). It was the prototype's
// idea of a hero, and it makes sense for a cup final; for a club whose next
// event is usually a training session 24 days out, three boxes reading
// "24 / 7 / 54" is precision nobody asked for. The date and time are right
// above it and are what people actually read.
//
// ⚠️ Its removal also took the once-a-minute re-render with it — see the
// `now` state in Dashboard. That timer existed ONLY to tick this display.
function NextFixtureHero({ event, teamName }) {
  // Still needed after the countdown went: this is what the date and time
  // lines below render from.
  const date = eventDate(event)

  // ══ WHAT THE TWO LINES CARRY, AND WHY IT DEPENDS ON THE EVENT ══════════
  // The headline slot always takes the MOST SPECIFIC fact available; the
  // eyebrow takes what is left. For a match that is easy — "QUINS VS DUBAI
  // EXILES" is unarguably the most specific thing on the card.
  //
  // ⚠️ FOR A TRAINING IT USED TO BE A TAUTOLOGY. eventTitle falls back to the
  // stored title, coaches type "Training" into it (it is the obvious thing to
  // type, and every session in the database says it), and the eyebrow already
  // said "NEXT TRAINING". So the largest type on the dashboard restated the
  // smallest, directly above it — and out of season, when the hero falls back
  // from "next match" to "next event of any type", that is the NORMAL state
  // rather than an edge case.
  //
  // So when the title only echoes the type (titleRepeatsType — the same rule
  // FixtureRow uses to drop its bold line), the squad moves UP into the
  // headline and out of the eyebrow:
  //
  //   match            NEXT FIXTURE · U16B CONTACT / QUINS VS DUBAI EXILES
  //   named training   NEXT TRAINING · U16B CONTACT / EXTRA SESSION BEFORE …
  //   plain training   NEXT TRAINING               / U16B CONTACT
  //
  // ⚠️ FALLS BACK WHEN THERE IS NO SQUAD NAME. teamName is optional here, and
  // a hero with an empty headline would read as a rendering failure — so with
  // nothing better to promote it keeps eventTitle's own fallback and accepts
  // the repetition, which is the lesser of the two.
  const titleIsEcho = titleRepeatsType(event)
  const promoteTeam = titleIsEcho && Boolean(teamName)
  const headline = promoteTeam ? teamName : eventTitle(event)
  const eyebrow = `${nextEventLabel(event)}${!promoteTeam && teamName ? ` · ${teamName}` : ''}`

  return (
    <div
      data-testid="next-fixture"
      className="harlequin relative mb-4 overflow-hidden rounded-card bg-hero-grad p-[18px] pb-[21px] text-white shadow-card"
    >
      {/* ⚠️ TWO DECORATIVE LAYERS, BOTH BEHIND THE CONTENT (every text block
          below already carries `z-10`), both pointer-events-none so neither can
          swallow a tap.

          The hero was a FLAT maroon gradient — the strongest surface on the
          screen with no depth in it at all. A single soft radial, warm and
          low-opacity, reads as light falling across the card rather than as a
          second colour. It uses white at 12%, NOT a new brand hue: the palette
          is a hard constraint and this must not become a fourth red. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.12),transparent_68%)]"
      />
      {/* ⚠️ THE CLUB'S OWN RED→GREEN HAIRLINE, AT THE BASE. It already exists
          as `brand-rule` in tailwind.config.js and appeared in exactly one
          place in the whole app — under the masthead. Repeating it here ties
          the page's loudest card back to the chrome above it, and it is the one
          mark in this design system nobody else has. Decorative only: no text
          sits on it, so the full-saturation green is safe.
          ⚠️ `pb-[21px]` ON THE CARD ABOVE IS THIS LINE'S DOING — without the
          extra 3px the hairline sits under the last row of text rather than
          below it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-brand-rule"
      />
      {/* ⚠️ Reflects the event's TYPE. This was hardcoded "Next fixture",
          which made a training session announce itself as a fixture whenever
          no match was coming — and the fallback to any event type is
          deliberate, so that is the normal out-of-season state, not a rare
          one. See nextEventLabel in src/lib/eventFormat.js. */}
      <div className="relative z-10 flex items-center gap-2 font-condensed text-[14px] font-bold uppercase tracking-[0.18em] opacity-95">
        {/* ⚠️ THE DOT IS NOT THE MESSAGE — the eyebrow beside it already says
            what this card is. It is an ambient sign that the screen is showing
            live data rather than something cached from yesterday. `aria-hidden`
            because a screen reader gaining "bullet, bullet, bullet" tells it
            nothing. 2.2s deliberately: anything faster next to text is a
            distraction, and for some people a genuine barrier. */}
        <span
          aria-hidden="true"
          className="h-[7px] w-[7px] shrink-0 animate-live-pulse rounded-full bg-white/90"
        />
        {eyebrow}
      </div>

      {/* This is the page's opening statement and the one piece of type on the
          dashboard meant to be read as a headline rather than scanned, so it
          gets the display face.
          ⚠️ IT USED TO REPEAT THE LINE ABOVE IT. For a training the eyebrow
          read "NEXT TRAINING · U16B CONTACT" and this read "TRAINING" at 42px
          — the biggest type on the screen restating the smallest. See the
          headline/eyebrow split above for what each now carries. */}
      <div className="relative z-10 mt-1.5 font-display text-[30px] uppercase leading-[0.94] desktop:text-[42px]">
        {headline}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13.5px] font-semibold">
        <span className="flex items-center gap-1.5">
          <CalendarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {formatLongDate(date)}
        </span>
        <span className="flex items-center gap-1.5">
          <ClockIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {eventTimeLabel(event)}
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
    </div>
  )
}

// Quick actions (design-system.md §5.1). Two navigation actions every role
// gets, a WRITE action for anyone who may post a notice, and for a read-only
// role a line saying why there is nothing else here.
//
// ⚠️ THE POST ACTION LEADS, AND THE ORDER IS AN ARGUMENT RATHER THAN A
// PREFERENCE. The two below it go to Schedule and Roster — which are also the
// second and third tabs of the bottom nav, reachable from every screen in the
// app. Posting a notice has no other route at all. The item with no alternative
// belongs above the two with one.
//
// ⚠️ AND IT MOVED HERE FROM ABOVE THE HERO — Jay, 16 Aug 2026: "the post a
// notice should not be at the top of the screen, it should be in the quick
// actions section". The first placement put it between the noticeboard and the
// next fixture, which is the one piece of vertical space this screen's own
// comments defend hardest.
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
function QuickActions({ canEdit, readOnlyRole, onPosted }) {
  return (
    <Card data-testid="quick-actions" className="p-[14px]">
      <div className="flex flex-col gap-2.5">
        {/* ⚠️ NO ARROW ON THIS ONE. The badge means "this goes somewhere" —
            Button.jsx is explicit that Save/Cancel do not get one — and this
            opens a sheet in place. That is the whole point of it. */}
        <PostNoticeAction variant="secondary" full onPosted={onPosted} />

        {/* These two GO somewhere, which is exactly the case the club site
            marks with its rotating arrow badge. Save/Cancel buttons do not
            get one — see Button.jsx. */}
        <Button as={Link} to="/schedule" variant="secondary" full arrow>
          {canEdit ? 'View full schedule' : 'View schedule'}
        </Button>
        <Button as={Link} to="/roster" variant="secondary" full arrow>
          View roster
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
  // Routing out to the full-page match sheet. See onOpenMatchSheet below.
  const navigate = useNavigate()
  const { memberships, teams } = useMemberships()
  // Only for the notice read-receipt write, which needs the caller's own
  // profile id. Everything else on this screen is scoped by RLS.
  const { user } = useAuth()
  // The person card: the tapped staff name's profile id, or null.
  const [cardFor, setCardFor] = useState(null)

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  // ⚠️ THE SQUADS THIS PERSON IS *ATTACHED TO*, WHICH IS NOT `scopedTeams`.
  // visibleTeams() hands an ADMIN every squad in the club, so building the staff
  // block from it would put fifteen contact cards on an admin's home screen —
  // /admin/staff is where that view belongs, and this one is "your squads".
  //
  // ⚠️ AND IT READS THE *EFFECTIVE* MEMBERSHIPS, SO "VIEW AS" NARROWS IT. The
  // RPC underneath runs against the admin's REAL auth.uid() and will return
  // every squad regardless — exactly as memberships.jsx documents for every
  // other screen ("RLS still returns club-wide rows; the app simply declines to
  // display them"). Filtering here is what makes the preview behave, and it is
  // cosmetic, never a boundary.
  const myTeams = useMemo(() => {
    const attached = new Set(
      (memberships ?? []).map((m) => m.team_id).filter((id) => id != null),
    )
    // scopedTeams is already sorted by sort_order, so the cards come out in the
    // club's own squad order rather than in membership-row order.
    return scopedTeams.filter((team) => attached.has(team.id))
  }, [memberships, scopedTeams])

  // The squads whose season needs explaining — U10 and below, and nothing else.
  //
  // ⚠️ BUILT FROM `myTeams`, NOT FROM `scopedTeams`. An admin sees every squad
  // in the club, and a card explaining Mighty Minis to somebody with no child in
  // them is the definition of furniture. This is the same list the Squad
  // contacts block uses, and for the same reason: it is about YOUR squads.
  //
  // ⚠️ GROUPED BY FORMAT, NOT ONE CARD PER SQUAD — Jay, 15 Aug 2026: "we have
  // some parents who could have up to 5 age groups worth of players". Per squad,
  // a parent with children in U6, U7 and U8 would get three cards carrying the
  // same two sentences about the cricket stadium, which is how somebody learns
  // to scroll past a block without reading it. There are only ever two formats,
  // so this is at most two cards however many children somebody has.
  //
  // ⚠️ THE SQUADS ARE STILL NAMED ON THE CARD. Collapsing to a bare "Mighty
  // Minis" would leave a parent with a child in U8 AND one in U11 unable to tell
  // which of them this is about — and that parent is exactly who needs to know
  // the two are on different systems. `myTeams` is already in the club's sort
  // order, so the names come out U6, U7, U8 rather than in membership order.
  const formats = useMemo(() => {
    const byFormat = new Map()
    for (const team of myTeams) {
      const format = squadFormat(team.name)
      if (!format) continue
      const existing = byFormat.get(format.key)
      if (existing) existing.teams.push(team)
      else byFormat.set(format.key, { format, teams: [team] })
    }
    return [...byFormat.values()]
  }, [myTeams])

  const [events, setEvents] = useState([])
  const [players, setPlayers] = useState([])
  // null until the first read settles, so the board can stay absent rather than
  // flashing an empty card under the greeting on every load.
  const [allNotices, setNotices] = useState(null)
  // ⚠️ SCOPED AT RENDER, NOT IN THE FETCH. "View as" is a browser filter over
  // an admin's session, which the server rightly hands every notice; this
  // narrows them to the effective memberships, as every other block does
  // through visibleTeams(). A real member's rows are unchanged. It is NOT in
  // the fetch effect's deps — memberships is rebuilt per render in preview,
  // and a first cut that refetched on it looped forever (21 Aug 2026).
  const notices = useMemo(
    () => (allNotices ? scopeNotices(allNotices, memberships, teams) : allNotices),
    [allNotices, memberships, teams],
  )
  // Bumped when this person posts one, so the card they just wrote appears
  // without a reload. Deliberately separate from `reloadToken`, which realtime
  // bumps on `events` — see the note on the effect below.
  const [noticeToken, setNoticeToken] = useState(0)
  const [noticeReads, setNoticeReads] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  // ⚠️ ITS OWN STATE, NOT THE PAGE'S (2 Sep 2026 UX review, High). A refused
  // DM used to go into `error`, which switches Home into the whole "We
  // couldn't load your dashboard" card — and, being a string, read as
  // "Something went wrong" with a Try again that refetched everything. The
  // staff card is where the tap happened; the refusal belongs beside it.
  const [chatError, setChatError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [selectedEventId, setSelectedEventId] = useState(null)
  // The fortnight strip's day chooser: { year, month, day } club-day parts for
  // a tapped day holding SEVERAL events, or null. A single-event day never
  // sets this — it opens the event directly (see the strip's onSelect below).
  const [stripDay, setStripDay] = useState(null)
  // null = closed; { event } = editing that event. The dashboard never opens
  // the form for a NEW event (that lives on the Schedule screen), so there
  // is no "adding" case here.
  const [formState, setFormState] = useState(null)
  // ⚠️ THE HOME SCREEN COULD NOT REACH AVAILABILITY AT ALL until 10 Aug 2026,
  // and it did not look like it. EventDetail rendered "Set my availability"
  // here exactly as it does on Schedule — but this screen never passed
  // `onOpenAvailability`, and the optional call swallowed the tap. The button
  // was drawn, tappable, and dead.
  //
  // It mattered most to the people least likely to find the other route: a
  // parent opens the app, sees the next fixture on the dashboard, taps it, and
  // taps the availability button. Setting an RSVP without going via Schedule is
  // the common case, not a shortcut.
  //
  // Same shape as Schedule's: this screen owns the open/closed state and renders
  // the sheet, rather than EventDetail opening a second one itself.
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  // Squad staff for the block at the bottom. A Map keyed by team id; null until
  // the read settles, so the block can stay absent rather than flashing twelve
  // "nobody listed yet" cards on every load and then filling them in.
  const [staffByTeam, setStaffByTeam] = useState(null)
  const [staffError, setStaffError] = useState(null)
  // The register (attendance): the fact rather than the intent, coach-only,
  // and not behind FEATURES.availability. Same parent-holds-the-state wiring.
  const [registerOpen, setRegisterOpen] = useState(false)

  // ⚠️ OPENING A FIXTURE MUST CLEAR THE RSVP SHEET, and this is not tidiness.
  // `availabilityOpen` is screen-level state, not per-event: leave it true after
  // closing one fixture and the NEXT fixture tapped skips its detail sheet and
  // opens straight into that event's availability. The two pieces of state
  // disagree silently and the screen obeys the stale one. Every path that opens
  // or closes a fixture goes through here or resets it explicitly.
  const openEvent = (id) => {
    setAvailabilityOpen(false)
    setRegisterOpen(false)
    setSelectedEventId(id)
  }
  const closeEvent = () => {
    setAvailabilityOpen(false)
    setRegisterOpen(false)
    setSelectedEventId(null)
  }

  // Captured once at mount. Used only to decide which day the fortnight
  // strip marks as today — see the note where the timer used to live.
  const [now] = useState(() => Date.now())
  // Anchored once on mount, like `now` directly above and for the same reason:
  // recomputing it each render would mint a new object and refetch forever
  // through the effect's dependencies.
  const [eventWindow] = useState(() =>
    windowCoveringSeason(defaultEventWindow(clubToday()), new Date(Date.now())),
  )

  // Both reads go out together and land together: the stat tiles mix counts
  // from each, so settling them independently would show a half-filled grid.
  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    // ⚠️ The same 18-month window Schedule uses, and for one of the same
    // reasons: the "matches played with no score" tile counts BACKWARDS over
    // the season, so a short lookback would quietly stop counting the early
    // fixtures it exists to chase. Dashboard never navigates months, so unlike
    // Schedule it needs no widening — the default window is the whole story.
    Promise.all([
      listEvents({ teamIds, from: eventWindow.from, to: eventWindow.to }),
      listPlayers({ teamIds }),
    ])
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

  // ⚠️ A SEPARATE READ FROM THE TWO ABOVE, AND DELIBERATELY NOT IN THEIR
  // Promise.all. Those two are joined because the stat tiles mix counts from
  // both, so settling them apart would draw a half-filled grid. This one feeds
  // its own block at the bottom of the screen and shares no number with
  // anything — putting it in the same all() would mean a failed staff read
  // takes down the fixture list, which is the screen's whole reason to exist.
  //
  // ⚠️ NOT KEYED ON `reloadToken`. It is a realtime event on `events` that
  // bumps that token, and no change to a fixture can change who coaches a
  // squad. Refetching here would issue an extra round trip every time anyone in
  // the club touched a fixture, for a result that cannot have moved.
  useEffect(() => {
    let mounted = true
    setStaffError(null)
    listMySquadStaff()
      .then((byTeam) => {
        if (mounted) setStaffByTeam(byTeam)
      })
      .catch((err) => {
        if (mounted) setStaffError(err)
      })
    return () => {
      mounted = false
    }
  }, [memberships, noticeToken])

  // ⚠️ REALTIME, BECAUSE THE EFFECT ABOVE RUNS ONCE AND THEN NEVER AGAIN.
  // Jay, 16 Aug 2026: "notices are not appearing instantly on home screen, they
  // only show up when i click refresh… if i don't hit refresh they never show
  // up". `noticeToken` only covers a notice THIS person posts; one posted by
  // anybody else never arrived until a reload.
  //
  // ⚠️ IT BUMPS THE TOKEN RATHER THAN REFETCHING HERE. One loader, one place —
  // a second fetch path would be a second thing to keep in step with the reads
  // and the error handling above.
  useEffect(() => subscribeNotices(() => setNoticeToken((n) => n + 1)), [])

  // ⚠️ A THIRD SEPARATE READ, for the same reason as the staff one above: the
  // noticeboard shares no number with the stat tiles, so a failed notice read
  // must not take the fixture list down with it. There is deliberately no error
  // state — a board that could not load renders as no board, which is what an
  // empty board looks like anyway. That is acceptable HERE and would not be on
  // /notices, where the person came specifically to read them and silence would
  // be a lie; that screen says so out loud.
  //
  // ⚠️ NOT KEYED ON `reloadToken`, like the staff read. That token is bumped by
  // realtime on `events`, and no fixture change can alter a notice.
  // ⚠️ PART OF THE FIRST-LOAD GATE (2 Sep 2026 UX review, pattern 6): the
  // pinned notice board used to mount after paint and push the hero down.
  const [noticesSettled, setNoticesSettled] = useState(false)
  useEffect(() => {
    let mounted = true
    Promise.all([listNotices(), listMyReads()])
      .then(([rows, reads]) => {
        if (!mounted) return
        setNotices(collapseGroups(rows))
        setNoticeReads(reads)
      })
      .catch(() => {
        if (mounted) setNotices([])
      })
      .finally(() => {
        if (mounted) setNoticesSettled(true)
      })
    return () => {
      mounted = false
    }
  }, [memberships])

  // ⚠️ MARKS READ ONLY WHAT IS ACTUALLY DRAWN — the pinned ones, and only the
  // unexpired pinned ones, because `pinnedNotices` filters expiry. The count a
  // coach sees means "this appeared in front of them", and the Home card renders
  // the full body, so a pinned notice seen here genuinely was. Anything not on
  // this screen stays unread until /notices shows it.
  useEffect(() => {
    if (!notices || !user?.id) return
    const unseen = pinnedNotices(notices)
      .filter((notice) => !noticeReads.has(notice.id))
      .map((notice) => notice.id)
    if (unseen.length === 0) return

    markNoticesRead(user.id, unseen)
    setNoticeReads((previous) => {
      const next = new Set(previous)
      for (const id of unseen) next.add(id)
      return next
    })
  }, [notices, noticeReads, user])

  // Realtime: bump the token and let the effect above refetch. The callback
  // closes over nothing but setReloadToken (a stable state setter), so this
  // subscribes exactly once for the life of the screen, and its cleanup only
  // unsubscribes — it never touches focus.
  useEffect(() => subscribeEvents(() => setReloadToken((token) => token + 1)), [])

  // Only a load with nothing on screen replaces the content with a spinner. A
  // realtime refresh fires on every insert/update/delete anywhere in scope,
  // from any user — spinning on those would tear the dashboard out of the DOM
  // and collapse the page height each time somebody else touched a fixture.
  const isFirstLoad = (loading && !settled) || !noticesSettled

  const admin = isAdmin(memberships)
  // Asked per visible team through canEditTeam, rather than by looking for a
  // 'coach' membership row, so this agrees with the helper that will gate the
  // actual writes in Tasks 14/15. A coach row with a null team_id contributes
  // no team to scopedTeams (visibleTeams drops null ids), so `.some()` over an
  // empty list is false and that coach is read-only — where a raw role check
  // would grant, enabling an action that opens a form with no squad to pick.
  // canEditTeam's own null guard is the second line of defence behind that.
  // Same shape as Schedule.jsx's precedent.
  // The admin split (3 Sep 2026): no `admin ||` — canEditTeam already asks
  // whether the admin's RIGHT reaches squads, and a zero-rights admin's does not.
  const canEdit = scopedTeams.some((team) => canEditTeam(memberships, team.id))
  // Null for anyone who can edit; otherwise the role noun for the read-only
  // explanation, from the same roleLabel() the scope note uses.
  const readOnlyRole = canEdit ? null : roleLabel(memberships).toLowerCase()

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
  // ⚠️ MATCHES ONLY, AND THE STAT TILE IS THE ONLY THING THAT USES IT.
  // "Fixtures to play" counted `toPlay` — every future event — so a squad
  // training twice a week read "26 fixtures to play" before a single match had
  // been entered. Jay spotted it on 10 Aug 2026.
  //
  // The vocabulary rule was already written down in this codebase and this
  // screen broke it anyway: nextEventLabel's own comment says "'Fixture' is
  // not a loose synonym for 'event' in rugby — it means a match against
  // another side, which is exactly the thing a parent is checking for." The
  // hero was fixed to respect that on 6 Aug; the tile beneath it was not.
  //
  // ⚠️ `toPlay` ITSELF IS UNCHANGED and must stay that way — the fortnight
  // strip and the Upcoming list both want every event type, and narrowing it
  // would empty both of training.
  //
  // ⚠️ A TOURNAMENT IS A MATCH — `type === 'match'` with
  // `competition_type === 'tournament'` (src/lib/eventFormat.js, EventForm) —
  // so "Fixtures to play" USED to count it, which read a tournament weekend as
  // an ordinary fixture. Jay, 27 Aug 2026: split them. Fixtures are now
  // non-tournament matches; tournaments get their own tile. The other three
  // competition_types (null / 'tbd' / 'league') are all ordinary fixtures.
  const fixturesToPlay = toPlay.filter(
    (event) => event.type === 'match' && event.competition_type !== 'tournament',
  )
  const tournamentsToPlay = toPlay.filter(
    (event) => event.type === 'match' && event.competition_type === 'tournament',
  )

  const results = sortByStart(events.filter(hasResult), 'desc')
  const lastResult = results[0] ?? null

  // ⚠️ REPLACES "AGE GROUPS", WHICH WAS THE WEAKEST NUMBER ON THE SCREEN.
  // The stat band is the loudest element the dashboard has — a saturated
  // red-to-green gradient carrying 42px numerals, the club website's strongest
  // signature — and the third cell was spending all of that on
  // `scopedTeams.length`. For an admin that read "Age groups 15": a count of
  // how the club is CONFIGURED, which changes when somebody adds a squad, which
  // is to say roughly never. It was the one number on the band nobody could act
  // on, and it was shouting.
  //
  // A match that has been played and has no score is the opposite: it moves, it
  // is somebody's job, and it is invisible everywhere else on this screen. The
  // rule is already settled and already implemented in Schedule's Upcoming tab
  // (Task 11): an unscored match stays visible until somebody records it. This
  // is that same backlog, counted.
  //
  // ⚠️ ZERO IS A REAL ANSWER HERE, not a hole in the data — "nothing is waiting
  // on you" is exactly what a management summary should be able to say. That is
  // also why it is `<= now` and not `< now`: a match kicking off this second has
  // not been played yet.
  //
  // MATCHES ONLY, for the same reason `fixturesToPlay` is matches only — a
  // training cannot carry a score, so counting one here would rebuild the
  // "26 fixtures to play" bug in a new cell.
  //
  // ⚠️ AND NOT U6 OR U7, WHICH RECORD NO SCORE AT ALL (Jay, 15 Aug 2026). This
  // is the same failure the Youth Manager's queue had before the minis were
  // filtered out of it: a fixture that can never be ticked off sits in the count
  // for ever, and a number that only goes up teaches the coach it is on to stop
  // reading it. `recordsScores` fails open, so a squad whose row has not loaded
  // still counts — an unresolvable squad should look like work, not vanish.
  const needsScore = events.filter((event) => {
    if (event.type !== 'match') return false
    if (hasResult(event)) return false
    if (!recordsScores(teamsById.get(event.team_id)?.name)) return false
    const date = eventDate(event)
    return date != null && date.getTime() <= now
  })

  // The hero is just the head of that list, preferring a match and falling
  // back to the next event of any type (design-system.md §4.11).
  const nextFixture = toPlay.find((event) => event.type === 'match') ?? toPlay[0] ?? null

  // ⚠️ NO TIMER HERE ANY MORE. A once-a-minute setInterval used to re-render
  // this whole screen so the hero's countdown stayed honest. The countdown
  // was removed on 6 Aug 2026 and the timer went with it: nothing left on
  // this screen changes minute by minute, so a phone sitting on the
  // dashboard now re-renders only when the data actually changes.
  //
  // What that costs: `now` is captured when the screen mounts, so the
  // fortnight strip's "today" cell will not roll over at midnight for
  // someone who leaves the app open across it. Accepted — a phone re-mounts
  // this screen on almost any wake — and cheaper than a timer running all
  // night to move one red highlight one cell.

  const upcoming = toPlay.slice(0, 5)

  const seasonRecordRows = useMemo(
    () => scoringSquadRecords(events, scopedTeams, { at: new Date(now) }),
    [events, scopedTeams, now],
  )

  // Derive the open event from the live list rather than storing the row
  // itself, so a realtime update keeps the sheet's contents fresh and a
  // deleted fixture closes it instead of stranding a stale copy on screen.
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null

  if (isFirstLoad) {
    return (
      // ⚠️ A SKELETON, NOT A SPINNER. The spinner was not merely plainer; it
      // gave the page NO HEIGHT. The masthead sat on the tab bar, then the data
      // landed and the document grew by six hundred pixels in a single frame.
      // On a phone that reads as the app lurching, and it throws away the
      // scroll position of anyone who had started to move. The skeleton holds
      // the real shape, so nothing jumps.
      //
      // ⚠️ role="status" AND THE VISUALLY-HIDDEN SENTENCE STAY. The blocks are
      // aria-hidden, so without this line a screen reader would be told nothing
      // at all was happening — a silent screen is worse than a spinner.
      <section role="status" aria-live="polite">
        <h2 className="sr-only">Dashboard</h2>
        <span className="sr-only">Loading your dashboard…</span>
        <DashboardSkeleton />
      </section>
    )
  }

  if (error) {
    return (
      <section>
        <h2 className="sr-only">Dashboard</h2>
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load your dashboard</h3>
          <p className="mt-2 text-sm leading-relaxed text-danger-ink">
            {friendlyMessage(error, 'Something went wrong. Try again.')}
          </p>
          <Button
            onClick={() => setReloadToken((token) => token + 1)}
            className="mx-auto mt-4"
          >
            Try again
          </Button>
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
      <Kicker>Member home</Kicker>
      <Greeting />

      {/* ⚠️ ABOVE THE FIXTURE HERO, AND THAT IS A KNOWING DEPARTURE FROM
          design-system.md §5.1, WHICH CALLS THE HERO "the page's opening
          statement". Jay approved this placement from a mockup on 14 Aug 2026,
          and the reason is that the alternative defeats the feature: a notice
          below the hero and the fortnight strip is a notice nobody scrolls to,
          which is WhatsApp with extra steps.
          ⚠️ IT COSTS NOTHING WHEN THERE IS NOTHING PINNED. NoticeBoard returns
          null rather than an empty card (see its header), so on the ordinary
          week where nobody has posted, the hero is still the first thing on the
          screen and this line has no effect at all. That property is what makes
          the departure survivable — if it ever starts rendering a placeholder,
          this decision has to be re-made. */}
      <NoticeBoard notices={notices} readIds={noticeReads} teamsById={teamsById} />

      {/* ⚠️ BELOW THE NOTICEBOARD, ABOVE THE HERO, AND IT COSTS NOTHING WHEN
          IT DOES NOT APPLY — NotificationsNudge returns null for anybody
          already subscribed, anybody who said no, any browser that cannot do
          it, and anybody who dismissed it. Same argument the NoticeBoard
          placement above rests on.
          ⚠️ IT MUST NOT MOVE ABOVE THE NOTICEBOARD. A notice somebody posted
          for the squad this week outranks a prompt about a feature. */}
      <NotificationsNudge />
      {/* A call-up waiting for THIS family's answer (4 Sep 2026). Null for
          everyone else, so it costs the page nothing. */}
      <CallupBanner />

      {/* The Squad Hub card that sat here (21-22 Aug 2026) is gone entirely:
          it became desktop:hidden when the sidebar took the desktop entry,
          and the mobile tab bar carrying Squad Hub (Nav.jsx, same
          showSquadHub gate) removed its last job — the phone's only way in. */}

      {nextFixture && (
        <NextFixtureHero
          event={nextFixture}
          teamName={nextFixture.team_id == null ? 'Whole club' : teamsById.get(nextFixture.team_id)?.name}
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
        <UpcomingStrip
          events={toPlay}
          now={now}
          // ⚠️ ONE EVENT OPENS DIRECTLY; SEVERAL GET THE CHOOSER. This used to
          // receive a single event and open it — which for a day with three
          // dots meant dayEvents[0] and no route to the other two, the exact
          // defect the calendar's DaySheet was built to fix in Task 23. The
          // single-event day skips the chooser on purpose: a one-row sheet
          // between the tap and the detail is a step that answers nothing.
          onSelect={(dayEvents, day) => {
            if (dayEvents.length === 1) openEvent(dayEvents[0].id)
            else setStripDay(day)
          }}
        />
      </Card>

      {seasonRecordRows.length > 0 && (
        <div className="mt-[18px]">
          <SeasonRecordBand rows={seasonRecordRows} />
        </div>
      )}

      {/* STAFF ONLY (Jay, 6 Aug 2026). Hidden from anyone who cannot edit —
          in practice parents and players.
          
          These three numbers are a management summary: how big is the squad,
          how much is left to play, what is waiting on me. A parent has one
          child and already knows the answer to all three, so the band was
          three tiles of noise at the top of the screen they see most. It was
          never a privacy problem — the values are scoped, and a parent saw
          "Players in view: 12", not the club's 315 — it was just useless to
          them.

          ⚠️ THE THIRD NUMBER USED TO BE "AGE GROUPS" and was the weakest thing
          on the screen: a count of how the club is configured, rendered at
          42px in the loudest element the dashboard has. See `needsScore`
          above for why an unscored match replaced it. The band's styling is
          deliberately UNCHANGED — the complaint was that the loudest element
          carried the weakest data, and the honest fix for that is better data,
          not quietening the club website's strongest signature.

          Gated on canEdit rather than on a role name so it follows the
          permission that already exists: add a role later and it lands on the
          correct side automatically. Coaches, managers, medics and admins
          keep it.

          What replaces it for parents is deliberately nothing, for now.

          Four cells since 28 Aug 2026 — Registered players, Fixtures to play,
          Tournaments, Needs a score. Fixtures and Tournaments are the split of
          what "Fixtures to play" used to conflate (a tournament is a match, so
          it was counted as an ordinary fixture). 2×2 on a phone, one row on
          desktop — see StatBand for why. The first two tiles carry the phone
          row-divider (border-b), dropped at desktop's single row. */}
      {canEdit && (
        <StatBand>
          <StatTile
            testId="stat-players"
            value={players.length}
            label={admin ? 'Registered players' : 'Players in view'}
            className="border-b border-white/25 desktop:border-b-0"
          />
          <StatTile
            testId="stat-fixtures"
            value={fixturesToPlay.length}
            label="Fixtures to play"
            className="border-b border-white/25 desktop:border-b-0"
          />
          <StatTile
            testId="stat-tournaments"
            value={tournamentsToPlay.length}
            label="Tournaments"
          />
          <StatTile
            testId="stat-needs-score"
            value={needsScore.length}
            label="Needs a score"
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
              {upcoming.map((event, index) => (
                // ⚠️ THE DELAY CAP IS CURRENTLY UNREACHABLE, AND IT IS KEPT ON
                // PURPOSE — SAY SO RATHER THAN LET IT LOOK LIKE IT DOES WORK.
                // `upcoming` is sliced to five above, so the largest index here
                // is 4 and `Math.min(index, 6)` never binds. It stays because
                // the slice is the thing likely to change: 40ms each is lively
                // over four rows and a queue over twenty, so a list that grew
                // to a full month would have its last row waiting most of a
                // second — motion that reads as a slow page. The cap is the
                // guard for that day, not a description of today.
                //
                // ⚠️ AN INLINE STYLE, NOT A CLASS. The delay is per-index, so
                // as a class it would be an arbitrary value Tailwind has to
                // generate a rule for per row — and Tailwind cannot see a class
                // name built at runtime anyway, so they would all silently
                // resolve to nothing.
                //
                // ⚠️ THE KEY IS event.id AND MUST STAY THAT WAY. Keyed by index
                // the animation would replay on every realtime refresh, so a
                // fixture somebody else edited would make the whole list
                // flicker for everyone looking at it.
                //
                // ⚠️ AND IT GOES ON THE ROW, NOT A WRAPPER — see FixtureRow's
                // note on `className`. A wrapper div would take the divider off
                // every row in the list.
                <FixtureRow
                  key={event.id}
                  event={event}
                  teamName={event.team_id == null ? 'Whole club' : teamsById.get(event.team_id)?.name}
                  onSelect={openEvent}
                  className="animate-rise-in"
                  style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                />
              ))}
            </Card>
          )}
        </div>

        {/* ⚠️ mt-[18px] ON MOBILE ONLY, and it is not decoration.
            BlockTitle carries `first:mt-0` so the two COLUMN headings line up
            on desktop. "Quick actions" is the first child of this div, so it
            gets that reset — correct side by side, wrong once the columns
            stack, where it left the heading flush against the bottom of the
            Upcoming card with ZERO separation. Measured at 390px: 0px gap,
            against 18px everywhere else on the screen. Reported by Jay from a
            phone as "the training event overlaps with the quick actions area".
            desktop:mt-0 hands the spacing back to first:mt-0 at width. */}
        <div className="mt-[18px] desktop:mt-0">
          <BlockTitle>Quick actions</BlockTitle>
          <QuickActions
            canEdit={canEdit}
            readOnlyRole={readOnlyRole}
            onPosted={() => setNoticeToken((n) => n + 1)}
          />

          <BlockTitle>Last result</BlockTitle>
          <Card data-testid="last-result" className="overflow-hidden">
            {lastResult ? (
              <FixtureRow
                event={lastResult}
                teamName={teamsById.get(lastResult.team_id)?.name}
                onSelect={openEvent}
              />
            ) : (
              <Empty message="No results yet. Scores show here once someone adds them." />
            )}
          </Card>
        </div>
      </div>

      {/* ⚠️ WHO LOOKS AFTER THE SQUAD — Jay's ask, 13 Aug 2026: "i want age
          groups to see their coaches, managers, and medics on their home
          screen". Phase 3 of claude/plans/2026-08-13-squad-staff-on-home.md.

          Shown to EVERY role, not gated like the stat band. A coach seeing the
          other people on their own squad is useful rather than noise, and the
          data is the same data — the gate that matters is in the database
          (public.my_squad_staff), not here.

          ⚠️ LAST ON THE SCREEN, AND THAT IS ON PURPOSE. "What is on, and when"
          is why a parent opens this app; who to ring is what they come back for
          occasionally. Putting it above the fixtures would push the thing
          everyone wants below the fold to serve the thing they want sometimes.

          The block disappears entirely for somebody attached to no squad — an
          admin whose only membership has a null team_id, which is Jay's own
          second account.

          ⚠️ `mt-[18px]` ON THE WRAPPER IS LOAD-BEARING AND ITS ABSENCE IS
          INVISIBLE IN JSDOM. BlockTitle carries `mt-[18px] first:mt-0`, and
          `first:` compiles to `:first-child` — which is scoped to the element's
          PARENT, not to the page. So wrapping a BlockTitle in a div makes it
          that div's first child and silently zeroes its top margin: the heading
          then sits flush against whatever card precedes it. Reported from a
          screenshot on 14 Aug 2026, SQUAD CONTACTS jammed against the fixture
          card above it.

          ⚠️ THE TWO OTHER WRAPPED USES ON THIS SCREEN (the Upcoming grid and
          the Quick actions column) ALREADY CARRY THIS MARGIN for the same
          reason, which is why this read as a one-off rather than as a pattern.
          If you add a third wrapper around a BlockTitle, it needs this too. */}
      {/* ⚠️ HOW YOUR SQUAD'S SEASON WORKS — U10 and below only (15 Aug 2026).
          "so what actually happens on a Saturday?" is the question a new minis
          parent has, and until now the app answered it with a fixture list that
          looks identical to a U16 league season and a Competition row reading
          nothing. The facts came from the club's youth section: U6-U8 play
          Mighty Minis at the cricket stadium; U9-U10 play friendly festivals
          three or four clubs at a time, each hosting one weekend; and the league
          does not start until U11.

          ⚠️ COSTS NOTHING FOR EVERY OTHER SQUAD. squadFormat returns null from
          U11 up, so `formats` is empty for most of the club and this block does
          not render at all — the same property that lets NoticeBoard sit above
          the fixture hero. If it ever starts rendering a placeholder, its
          position on the screen has to be re-argued.

          ⚠️ ABOVE SQUAD CONTACTS AND BELOW THE FIXTURES, deliberately. It is
          reference — read once when a child joins, then never again — so it
          belongs with the other reference block at the foot rather than above
          "what is on, and when", which is why anybody opens this screen.

          ⚠️ `mt-[18px]` ON THE WRAPPER IS LOAD-BEARING — see the Squad contacts
          note directly below for the full reason. BlockTitle's `first:mt-0` is
          scoped to its PARENT, so wrapping one in a div silently zeroes its top
          margin and jams the heading against the card above. This is the third
          wrapped BlockTitle on this screen and it needs the margin for the same
          reason the other two do. */}
      {formats.length > 0 && (
        <div data-testid="squad-format-block" className="mt-[18px]">
          <BlockTitle>How your season works</BlockTitle>
          {formats.map(({ format, teams: formatTeams }) => (
            <Card
              key={format.key}
              data-testid="squad-format-card"
              className="mb-2.5 p-[14px] last:mb-0"
            >
              <h3 className="text-[15px] font-extrabold text-ink">{format.title}</h3>
              {/* The squads this card is about. Its own line rather than part of
                  the heading: three squad names plus a title runs to two lines
                  on a phone and the title stops being findable. */}
              <p className="mt-0.5 text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-faint">
                {formatTeams.map((team) => team.name).join(' · ')}
              </p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
                {format.summary}
              </p>
              <ul className="mt-2 space-y-1">
                {format.points.map((point) => (
                  <li key={point} className="text-[12.5px] leading-relaxed text-ink-muted">
                    {point}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {myTeams.length > 0 && (staffByTeam || staffError) && (
        <div data-testid="squad-staff-block" className="mt-[18px]">
          <BlockTitle>Squad contacts</BlockTitle>
          {staffError ? (
            // ⚠️ SAID OUT LOUD RATHER THAN RENDERED AS "nobody yet". A failed
            // read and an unstaffed squad look identical from here, and the
            // difference matters enormously: one is a bug and the other is the
            // normal state of twelve of the club's fifteen squads. Silently
            // showing the empty state on an error would teach a parent that
            // their child's squad has no coach.
            <Card className="px-4 py-3">
              <p role="alert" className="text-[13px] text-ink-muted">
                We couldn&apos;t load your squad contacts just now.
              </p>
            </Card>
          ) : (
            // ⚠️ ONLY THE FIRST SQUAD OPENS, AND THIS ONE PROP IS THE WHOLE
            // MECHANISM. Jay's ceiling, 15 Aug 2026: "we have parents who could
            // have up to 5 age groups worth of players". Five open squads is
            // still too much of Home even as rows rather than poster tiles.
            //
            // ⚠️ `myTeams` IS ALREADY IN CLUB ORDER (visibleTeams sorts by
            // `sort_order`), so "the first" is the youngest squad the parent is
            // attached to rather than whichever row the database happened to
            // return first. That is stable between loads, which matters — a
            // disclosure that opens a different squad each visit is worse than
            // one that opens none.
            <>
            {chatError && (
              <p role="alert" data-testid="chat-error" className="rounded-[10px] bg-danger-surface px-3 py-2 text-[13px] font-semibold text-danger-ink">
                {chatError}
              </p>
            )}
            {myTeams.map((team, index) => (
              <SquadStaffCard
                key={team.id}
                squadName={team.name}
                staff={staffByTeam.get(team.id) ?? []}
                defaultOpen={index === 0}
                selfId={user?.id ?? null}
                onOpenCard={setCardFor}
                // Round 2, Jay: "chat icon option in all coach, manager, etc
                // pills". Find-or-create the DM and land in it; whether the
                // DM is allowed is open_conversation's call, and its refusal
                // is worded by the database.
                onChat={async (member) => {
                  try {
                    const conversationId = await openConversation(member.profileId)
                    navigate(`/chat/dm/${conversationId}`)
                  } catch (err) {
                    setChatError(friendlyMessage(err, 'Could not open a chat with them.'))
                  }
                }}
              />
            ))}
            </>
          )}
        </div>
      )}

      <PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />

      {/* The dashboard's fixture rows open the same detail sheet the
          schedule does, so they get the same Edit/Delete footer and the same
          form — otherwise a coach tapping a fixture here would be told the
          event is read-only, which is untrue. Adding fixtures still lives on
          the Schedule screen only (design-system.md §5.2); the quick-actions
          card above stays as it is until Task 15's player form lands with
          it. */}
      {/* Same precedence rule as Schedule's: the day chooser sits below the
          detail and form sheets — opening a fixture from it replaces it
          rather than stacking. Events are filtered from live state at render,
          not captured at tap time, so an edit or delete while it is open
          cannot leave a stale row. canManage is false by design: the
          dashboard has no route to creating events (see formState above). */}
      {stripDay && !selectedEvent && !formState && (
        <DaySheet
          day={stripDay}
          events={toPlay.filter((event) => {
            const parts = clubDayParts(eventDate(event))
            return (
              parts.year === stripDay.year &&
              parts.month === stripDay.month &&
              parts.day === stripDay.day
            )
          })}
          teamsById={teamsById}
          canManage={false}
          onClose={() => setStripDay(null)}
          onSelectEvent={(id) => {
            openEvent(id)
            setStripDay(null)
          }}
        />
      )}

      {selectedEvent && !formState && !availabilityOpen && !registerOpen && (
        <EventDetail
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={closeEvent}
          canEdit={canEditEvent(memberships, selectedEvent)}
          onEdit={(event) => setFormState({ event })}
          // ⚠️ NOT OPTIONAL, AND THIS SCREEN IS THE REASON THE RULE EXISTS.
          // The Dashboard is the screen that forgot onOpenAvailability and
          // shipped a button that silently swallowed every tap for weeks.
          // EventDetail now refuses to draw Duplicate without a handler, so
          // forgetting this gives no button rather than a lying one — but the
          // point is to pass it, and tests/duplicate-event.test.jsx enforces
          // that from this screen as well as from Schedule.
          onDuplicate={(event) => setFormState({ event, duplicate: true })}
          onOpenAvailability={() => setAvailabilityOpen(true)}
          onOpenMatchSheet={(fixture) => navigate(`/match-sheet/${fixture.id}`)}
          // Squad chat (phase 2): the fixture's thread. Same handler rule.
          onOpenChat={(fixture) => navigate(`/chat/${fixture.team_id}?event=${fixture.id}`)}
          onOpenLineup={(fixture) => navigate(`/lineup/${fixture.id}`)}
          onOpenRegister={() => setRegisterOpen(true)}
          onDeleted={() => {
            closeEvent()
            setReloadToken((token) => token + 1)
          }}
        />
      )}

      {/* Closing this returns to the event's detail sheet rather than all the
          way to the dashboard — the same "drill in and back" flow Schedule
          uses, and for the same reason: somebody who just set an RSVP wants to
          glance at the fixture again, not lose their place. */}
      {selectedEvent && availabilityOpen && !formState && (
        <Availability
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}

      {selectedEvent && registerOpen && !formState && (
        <Register
          event={selectedEvent}
          team={teamsById.get(selectedEvent.team_id)}
          onClose={() => setRegisterOpen(false)}
        />
      )}

      {formState && (
        <EventForm
          event={formState.event}
          duplicate={formState.duplicate ?? false}
          onClose={() => {
            setFormState(null)
            closeEvent()
          }}
          onSaved={() => setReloadToken((token) => token + 1)}
        />
      )}
    </section>
  )
}
