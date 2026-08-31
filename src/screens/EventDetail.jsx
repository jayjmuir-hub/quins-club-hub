import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Chip from '../components/Chip.jsx'
import EventTypeIcon from '../components/EventTypeIcon.jsx'
import Spinner from '../components/Spinner.jsx'
import Button from '../components/Button.jsx'
import PitchRequest from '../components/PitchRequest.jsx'
import { PITCH_TBD } from '../data/pitches.js'
import { portionShort } from '../lib/pitchPortion.js'
import SessionPlan from '../components/SessionPlan.jsx'
import { listAvailability, subscribeAvailability } from '../data/availability.js'
import { getEventThread } from '../data/messages.js'
import { countSeriesFrom, deleteEvent, deleteSeriesFrom } from '../data/events.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { squadFormat } from '../lib/minis.js'
import { matchSheetApplies } from '../lib/matchSheetDeadline.js'
import { FEATURES } from '../lib/features.js'
import {
  eventDate,
  eventTimeRangeLabel,
  eventTitle,
  formatLongDate,
  hasResult,
  resultLabel,
  resultOutcome,
  resultScore,
  eventPitchLabel,
} from '../lib/eventFormat.js'

// The compact share tag (¼/⅓/½) ONLY when a booking takes part of a pitch. A
// full or unset pitch is the whole thing — nobody is sharing it — so it returns
// null and the Pitch row stays plain. portionShort gives 'full' for an explicit
// full pitch, which is not a share, hence the guard.
function sharedPortion(portion) {
  const tag = portionShort(portion)
  return tag && tag !== 'full' ? tag : null
}

// The event detail sheet (design-system.md §5.5): a branded hero, a set of
// key/value rows, and then either the score (for a fixture that has one) or
// a live availability summary (for one that doesn't). Mounted only while an
// event is selected — Schedule renders it conditionally — so there is no
// `open` prop to thread through and no hidden-but-present DOM.
//
// Footer actions (design-system.md §5.5): Edit / Duplicate / Delete for a
// user who can edit this event's squad, and NOTHING for everyone else.
// Each button renders only when its handler exists — the Duplicate rule,
// applied to Edit and Delete too, so a screen that withholds a handler
// (Squad Hub hides calendar Delete) shows no lying button. Delete is
// two-step — the confirm replaces the buttons in place rather than using
// a native confirm(), which is unstyled, unannounced and untestable in the
// browser check. `canEdit` is passed in rather than computed here: this
// component stays presentational and the screen already holds memberships
// (the same split EventDetail and PlayerDetail both use).

const TYPE_LABELS = { match: 'Match', training: 'Training', social: 'Social' }

function KeyValue({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="text-[14.5px] font-semibold text-ink-faint">{label}</span>
      <span className="text-right text-[14.5px] font-bold text-ink">{children}</span>
    </div>
  )
}

// How a minis squad's season works, on the fixture a parent has just opened.
//
// ⚠️ MATCHES ONLY, AND MINIS ONLY. squadFormat returns null for U11 and above,
// so this renders nothing at all for most of the club — the same "costs nothing
// when there is nothing to say" property NoticeBoard has, and the reason it can
// sit this high on the sheet without becoming furniture.
//
// ⚠️ IT SITS WHERE THE COMPETITION ROW WOULD BE, and that is the point rather
// than a coincidence. An older squad's fixture answers "what is this game for?"
// with League · Round 4. These squads have no answer to give there, and a blank
// where the answer goes is what makes a parent ask.
function SquadFormatNote({ format }) {
  return (
    <div
      data-testid="squad-format-note"
      className="mb-4 rounded-[11px] bg-surface-mute px-3.5 py-3"
    >
      <h4 className="text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
        {format.title}
      </h4>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">{format.summary}</p>
      <ul className="mt-1.5 space-y-1">
        {format.points.map((point) => (
          <li key={point} className="text-[12.5px] leading-relaxed text-ink-muted">
            {point}
          </li>
        ))}
      </ul>
    </div>
  )
}

const AVAILABILITY_TONES = {
  in: { bar: 'bg-accent-mid', dot: 'bg-accent-mid', label: 'in' },
  maybe: { bar: 'bg-warn', dot: 'bg-warn', label: 'maybe' },
  out: { bar: 'bg-danger', dot: 'bg-danger', label: 'out' },
}

const STATUSES = ['in', 'maybe', 'out']

function AvailabilitySummary({ eventId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // The event id a first attempt has already settled for. Only that first
  // attempt shows the spinner: this effect also re-runs on every realtime
  // RSVP, and spinning then would blank the availability bar the user is
  // reading each time a squad-mate tapped "in". A refresh leaves the bar up
  // and swaps the numbers when the new counts land.
  const settledForEvent = useRef(null)

  useEffect(() => {
    let mounted = true
    if (settledForEvent.current !== eventId) setLoading(true)
    setError(null)

    listAvailability(eventId)
      .then((data) => {
        if (mounted) setRows(data)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setRows([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        settledForEvent.current = eventId
      })

    return () => {
      mounted = false
    }
  }, [eventId, reloadToken])

  // setReloadToken is a stable state setter, so the subscription is created
  // once per event id and its cleanup only unsubscribes — it never touches
  // focus, and no caller-supplied callback is in this dependency array.
  useEffect(() => subscribeAvailability(eventId, () => setReloadToken((token) => token + 1)), [eventId])

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner label="Loading availability…" />
      </div>
    )
  }

  if (error) {
    return (
      <p role="alert" className="rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
        {error.message || "We couldn't load availability. Try again."}
      </p>
    )
  }

  const counts = { in: 0, maybe: 0, out: 0 }
  rows.forEach((row) => {
    if (counts[row.status] != null) counts[row.status] += 1
  })
  const total = counts.in + counts.maybe + counts.out

  if (total === 0) {
    return <p className="text-sm text-ink-faint">No one has responded yet.</p>
  }

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-[20px] bg-surface-sunk">
        {STATUSES.map((status) =>
          counts[status] > 0 ? (
            <span
              key={status}
              className={AVAILABILITY_TONES[status].bar}
              style={{ width: `${(counts[status] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
            <span className={['h-2 w-2 rounded-full', AVAILABILITY_TONES[status].dot].join(' ')} aria-hidden="true" />
            {counts[status]} {AVAILABILITY_TONES[status].label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ⚠️ LAYOUT ONLY, now that these go through <Button>. It used to carry the
// radius, padding, weight, transition, focus ring and disabled state as well —
// every one of which <Button> now supplies. Leaving them here would not have
// been merely redundant: `className` is appended LAST, so the old
// `rounded-[11px]` would have raced `rounded-btn` on equal specificity and the
// winner would have been decided by the order Tailwind happened to emit them.
// Anything added here must be something Button does not already say.
const FOOTER_BUTTON = 'flex-1'

// --- Deleting a repeating series ---------------------------------------
//
// Jay's ruling, 8 Aug 2026: "future only". Deleting a series from here means
// THIS occurrence and every later one. The ones already played stay put —
// they carry results and availability history, and a coach cancelling the
// rest of a term is not asking to erase the sessions the squad turned up to.
// The filter lives in deleteSeriesFrom(); read the comment above it.
//
// ⚠️ SCOPE: series_id only. The multi-squad group_id fan-out is deliberately
// NOT offered here — Jay deferred it the same day. An event with a group_id
// and no series_id gets exactly the single-event confirm it had before.

function seriesLaterLabel(later) {
  return later === 1 ? 'This and 1 later session' : `This and ${later} later sessions`
}

function FooterActions({ event, canEdit, onEdit, onDuplicate, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  // null when idle, otherwise which delete is in flight — the two buttons
  // must be able to say "Deleting…" independently.
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState(null)
  // A short delete is NOT an error: rows really were removed and the sheet
  // must not claim otherwise in either direction. Held apart from `error`
  // so it can be worded and toned differently.
  const [shortfall, setShortfall] = useState(null)
  // How many events the series delete is about to attempt: this occurrence
  // plus the later ones. null while counting, 'failed' when the count
  // itself did not come back.
  const [seriesTotal, setSeriesTotal] = useState(null)

  const seriesId = event.series_id ?? null

  // Counted only once the user has actually asked to delete — opening an
  // event is the common action and must not fire an extra query for a
  // confirm step nobody reached. Re-runs if the sheet is confirmed again
  // after a cancel, which is right: someone else may have changed the
  // series in between.
  useEffect(() => {
    if (!confirming || !seriesId) return undefined
    let mounted = true
    setSeriesTotal(null)
    countSeriesFrom(seriesId, event.starts_at)
      .then((count) => {
        if (mounted) setSeriesTotal(count)
      })
      .catch(() => {
        // ⚠️ NO COUNT MEANS NO SERIES BUTTON (see the render below), rather
        // than a button promising "all later sessions" and a result nobody
        // can check. The single-event delete is still offered.
        if (mounted) setSeriesTotal('failed')
      })
    return () => {
      mounted = false
    }
  }, [confirming, seriesId, event.starts_at])

  // Nothing for someone who can't edit — see PlayerDetail's FooterActions.
  // Not being able to change a fixture is the ordinary state for most people
  // opening this sheet, not an exception worth a banner every time.
  if (!canEdit) return null
  // canEdit with no handlers used to draw a lying Edit/Delete row. An empty
  // bordered footer is the same class of defect; skip the chrome entirely.
  if (!onEdit && !onDuplicate && !onDeleted) return null

  function handleDelete() {
    setDeleting('one')
    setError(null)
    setShortfall(null)
    deleteEvent(event.id)
      .then(() => onDeleted?.(event))
      .catch((err) => {
        setError(err)
        setDeleting(null)
        setConfirming(false)
      })
  }

  function handleDeleteSeries() {
    setDeleting('series')
    setError(null)
    setShortfall(null)
    deleteSeriesFrom(seriesId, event.starts_at)
      .then((rows) => {
        // ⚠️ THE POINT OF THE WHOLE COUNT. RLS refuses a row by filtering it
        // out of the statement, not by raising — so a delete that removed
        // three of ten arrives here as a success with no error anywhere.
        // Exactly the shape that caught this codebase out once already (the
        // silent anon downgrade behind the session guard in
        // src/lib/supabase.js, where signed-in requests quietly became anon
        // ones and returned successful zero-row responses). Compare what
        // came back against the number this sheet PUT ON THE BUTTON, and
        // say so when they disagree rather than closing on "done".
        if (rows.length !== seriesTotal) {
          setShortfall({ asked: seriesTotal, deleted: rows.length })
          setDeleting(null)
          setConfirming(false)
          return
        }
        onDeleted?.(event)
      })
      .catch((err) => {
        setError(err)
        setDeleting(null)
        setConfirming(false)
      })
  }

  const counting = Boolean(seriesId) && seriesTotal === null
  const laterCount = typeof seriesTotal === 'number' ? seriesTotal - 1 : null
  // Only worth offering when there IS a later one. On the last occurrence of
  // a series "this and all later sessions" and "just this one" are the same
  // action wearing two labels, which is how someone taps the wrong one.
  const offerSeries = Boolean(seriesId) && (counting || (laterCount != null && laterCount > 0))

  return (
    <div className="mt-5 border-t border-line pt-4">
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
        >
          {error.message || "We couldn't delete that. Try again."}
        </p>
      )}

      {shortfall && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-warn-bg px-3 py-2.5 text-sm font-semibold text-ink"
        >
          {`We tried to delete ${shortfall.asked} sessions and ${shortfall.deleted} went. `}
          The rest are still there — you may not be able to change all of them. Check the schedule
          before telling anyone the sessions are off.
        </p>
      )}

      {confirming ? (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">
            Delete this event? This can&apos;t be undone.
          </p>
          {seriesId && (
            <p className="mb-3 text-[12.5px] text-ink-muted">
              This is part of a repeating series. Sessions that have already started stay as they
              are — they hold results and availability.
            </p>
          )}
          {seriesId && seriesTotal === 'failed' && (
            <p className="mb-3 text-[12.5px] text-ink-muted">
              We couldn&apos;t check how many other sessions are in this series, so only this one
              can be deleted right now.
            </p>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={Boolean(deleting)}
              className={FOOTER_BUTTON}
            >
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={Boolean(deleting)}
              className={FOOTER_BUTTON}
            >
              {deleting === 'one' ? 'Deleting…' : seriesId ? 'Just this one' : 'Yes, delete'}
            </Button>
            {offerSeries && (
              <Button
                variant="danger"
                onClick={handleDeleteSeries}
                // Disabled until the count lands, so the button can never be
                // pressed while its own label is still a guess.
                disabled={Boolean(deleting) || counting}
                className={`${FOOTER_BUTTON} basis-full`}
              >
                {deleting === 'series'
                  ? 'Deleting…'
                  : counting
                    ? 'Counting the rest of the series…'
                    : seriesLaterLabel(laterCount)}
              </Button>
            )}
          </div>
        </div>
      ) : (
        // ⚠️ `flex-wrap` IS INSURANCE HERE, NOT A FIX, and the difference was
        // MEASURED rather than assumed — an earlier version of this comment
        // claimed it was load-bearing and that was wrong twice over.
        //
        // What was actually measured, in real Chromium at 320px (the narrowest
        // width the overflow harness runs): the row is 284px and the three
        // buttons come to 83 + 97 + 85 with 10px gaps. THEY FIT ON ONE LINE,
        // nothing is clipped, and removing `flex-wrap` changes nothing at any
        // harness width. The claim that they needed ~330px was arithmetic done
        // from guessed button widths.
        //
        // ⚠️ AND THE SECOND HALF OF THE CLAIM WAS ALSO WRONG: this row cannot
        // widen the document whatever it does. Sheet renders `position:fixed`
        // and sets `document.body.style.overflow = 'hidden'` while open, so
        // its contents are outside the document's scrollWidth entirely. The
        // Schedule-header failure that comment invoked was an IN-FLOW row on a
        // scrolling page — a different situation, cited as if it applied.
        //
        // It stays because it is free, it matches the delete-confirm row
        // directly above which already wraps, and it is what keeps a longer
        // label (or a larger accessibility text size) from squeezing three
        // buttons below their min-content width. It must NOT be described as
        // the thing preventing an overflow.
        <div className="flex flex-wrap gap-2.5">
          {/* Same handler-required rule as Duplicate below: Squad Hub used to
              pass canEdit so Edit drew, then omit onEdit, so the tap was
              swallowed. Full schedule and Home pass onEdit; the hub does too
              once it mounts EventForm. */}
          {onEdit && (
            <Button onClick={() => onEdit(event)} className={FOOTER_BUTTON}>
              Edit
            </Button>
          )}
          {/* ⚠️ RENDERED ONLY WHEN A HANDLER EXISTS, and this is not defensive
              styling — it is the fix for a defect this exact component has
              already shipped. "Set my availability" rendered unconditionally
              and called `onOpenAvailability?.(event)`; Schedule passed the
              handler and THE DASHBOARD DID NOT, so on the home screen the
              button drew itself, invited a tap and the optional-call swallowed
              it, silently, for weeks. Requiring the prop makes a dead button
              impossible to render: a screen that forgets it shows no button
              rather than a lying one. Both Schedule and Dashboard pass this
              one, and tests/duplicate-event.test.jsx fails if either stops. */}
          {onDuplicate && (
            <Button
              variant="secondary"
              onClick={() => onDuplicate(event)}
              className={FOOTER_BUTTON}
            >
              Duplicate
            </Button>
          )}
          {/* Calendar delete is withheld on Squad Hub on purpose — staff
              confuse it with clearing the training plan / hour. Full schedule
              and Home pass onDeleted; the hub does not. */}
          {onDeleted && (
            <Button
              variant="dangerQuiet"
              onClick={() => setConfirming(true)}
              className={FOOTER_BUTTON}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function ChatBlock({ event, onOpenChat }) {
  const [thread, setThread] = useState(undefined) // undefined = loading
  useEffect(() => {
    let mounted = true
    setThread(undefined)
    getEventThread(event.id)
      .then((t) => {
        if (mounted) setThread(t)
      })
      .catch(() => {
        if (mounted) setThread(null)
      })
    return () => {
      mounted = false
    }
  }, [event.id])

  return (
    <div data-testid="event-chat-block">
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">Squad chat</h4>
      {thread ? (
        <Button variant="secondary" full onClick={() => onOpenChat(event)}>
          {thread.replies === 0 ? 'Open the thread' : `${thread.replies} ${thread.replies === 1 ? 'reply' : 'replies'} · Open the thread`}
        </Button>
      ) : (
        <Button variant="secondary" full onClick={() => onOpenChat(event)} disabled={thread === undefined}>
          Start a thread
        </Button>
      )}
    </div>
  )
}

export default function EventDetail({
  event,
  team,
  onClose,
  canEdit = false,
  onEdit,
  onDuplicate,
  onDeleted,
  onOpenAvailability,
  onOpenRegister,
  onOpenMatchSheet,
  onOpenLineup,
  onOpenChat,
  onAssignPitch,
}) {
  const date = eventDate(event)
  const pitch = eventPitchLabel(event)
  // Null for every event created before 8 Aug 2026, and formatTimeRange
  // renders the start alone for those — see its comment. Nothing here
  // substitutes the calendar feed's per-type duration guess.
  const typeLabel = TYPE_LABELS[event.type] ?? 'Event'
  const played = hasResult(event)
  // A club-wide event (30 Aug 2026) has no squad (team_id null): it reads
  // "Whole club" for the age group and carries no roster RSVP — the availability
  // section is player-based, and there is no roster to RSVP against.
  const clubWide = event.team_id == null
  // ⚠️ NULL FOR EVERY SQUAD FROM U11 UP, and for a squad whose row has not
  // loaded — squadFormat fails open the same way isMinisTeam does, so a missing
  // `team` prop shows nothing rather than the wrong age group's format.
  const format = event.type === 'match' ? squadFormat(team?.name) : null
  // ⚠️ THE RESULT BLOCK NEEDS NO AGE RULE, AND ADDING ONE WOULD BE A TAUTOLOGY.
  // It already renders on `played` — hasResult(), i.e. a score is present — so a
  // U7 fixture with no score has never shown it, and one that somehow HAS a
  // score should. Gating it on the band as well would read as `played && (
  // recordsScores || played)`, which is just `played`. The rule belongs where
  // the score is ENTERED (EventForm), not where it is displayed.

  return (
    <Sheet open onClose={onClose} title={typeLabel}>
      {/* Negative margins bleed the hero to the sheet's edges, matching the
          prototype's .detail-hero (design-system.md §4.21). */}
      <div className="-mx-[18px] -mt-4 mb-4 bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] px-[18px] py-[22px] text-white">
        {/* ⚠️ THE BOX IS RENDERED EVEN WHEN THE TYPE HAS NO MARK. An
            unrecognised type gets no icon (see EventTypeIcon) — and the hero's
            proportions are built around a 56px square, so dropping the square
            too would leave the title jumping up by 68px on a row nothing
            recognised. An empty tinted square is the quieter wrong answer. */}
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-[14px] bg-white/20">
          <EventTypeIcon type={event.type} className="h-7 w-7" />
        </div>
        <h3 className="text-[22px] font-bold leading-tight">{eventTitle(event)}</h3>
        {/* Every time in the app is Abu Dhabi time (see CLUB_TIME_ZONE), and
            this line is the one place that says so. It belongs here and not
            on every fixture row: someone scanning the list doesn't need
            reminding once per line, but someone reading a single fixture
            from abroad does need to know that 20:00 isn't their 20:00.
            Kept on the same line, at the same white/85% as the rest of it —
            that measures 4.63:1 against the lightest point of the hero
            gradient (brand #e11b22) and so clears AA for normal text,
            where dropping to white/70% for emphasis would have fallen to
            3.55:1 and failed. It is set apart by weight instead. The
            --muted-on-paper rule (#5c5854, not #77726e) doesn't apply here:
            this sits on the gradient, not on paper. */}
        <p className="mt-1 text-sm font-semibold text-white/[.85]">
          {formatLongDate(date)} · {eventTimeRangeLabel(event)}
          {date && <span className="font-normal"> · Abu Dhabi time</span>}
        </p>
      </div>

      <div className="mb-4">
        <KeyValue label="Type">
          {typeLabel}
          {event.type === 'match' ? ` · ${event.home ? 'Home' : 'Away'}` : ''}
        </KeyValue>
        <KeyValue label="Age group">{clubWide ? 'Whole club' : team?.name ?? 'Not set'}</KeyValue>
        {/* ⚠️ A SEPARATE ROW, NOT A REPLACEMENT FOR "Age group". The squad and
            the league team are different facts and this is the one screen with
            room for both: "U14B Contact" is who trains together, "ADHQ2 · Div B
            · Round 4" is what played. Everywhere else the two are collapsed
            into one chip because there is only room for one.
            ⚠️ RENDERED ONLY WHEN THERE IS ONE. No league team means this is not
            a league match, and a row reading "Not set" on every friendly would
            be noise — the same rule the Pitch row below follows. */}
        {event.league_team && (
          <KeyValue label="League team">
            {fixtureLabel(event, event.league_team, team?.name ?? '')}
          </KeyValue>
        )}
        <KeyValue label="Venue">{event.venue || 'To be confirmed'}</KeyValue>
        {/* Only when set. Unlike Venue, which falls back to "To be
            confirmed" because every event has one somewhere, a pitch is
            genuinely optional — a social has none, and every event created
            before this column existed has none either. A row reading
            "Pitch — " on all of them would be noise. */}
        {pitch && (
          <KeyValue label="Pitch">
            {pitch}
            {/* The SHARE, and only to staff — Jay, 30 Aug 2026. When this booking
                takes only part of the pitch (¼/⅓/½), a coach or admin sees
                "· sharing ⅓" so they know the pitch is split and how much is
                theirs; a parent or player (no `canEdit`) sees just the pitch,
                because how the ground is carved up is a pitch-management detail
                that only reads as noise to them — the exact confusion this hides.
                A whole pitch (full/unset) is never "shared", so it shows nothing. */}
            {canEdit && sharedPortion(event.pitch_portion) ? ` · sharing ${sharedPortion(event.pitch_portion)}` : ''}
          </KeyValue>
        )}
        {/* ⚠️ `competition` ALONE IS NO LONGER ENOUGH TO RENDER THIS ROW.
            Since 12 Aug 2026 it holds the TOURNAMENT'S NAME and is null for a
            league fixture, so testing it the old way made every league match
            show no competition at all. The type is the thing to test.
            ⚠️ THE ROUND IS REPEATED HERE ON PURPOSE. It also appears in the
            League team row above, via fixtureLabel — but only when there IS a
            league team, and a league fixture whose team nobody has picked yet
            is a real state. Without this the round would be invisible in
            exactly that case.
            ⚠️ A row is still rendered for an OLD fixture carrying free text and
            no type, so nothing anybody typed before today disappears. */}
        {event.type === 'match' && (event.competition_type || event.competition) && (
          <KeyValue label="Competition">
            {/* ⚠️ 'tbd' IS ITS OWN BRANCH AND MUST NOT FALL THROUGH. Without it
                the final arm would render `event.competition || 'Tournament'`
                and label an undecided fixture a tournament — the exact
                mis-filing the TBD option exists to stop. */}
            {event.competition_type === 'tbd'
              ? 'To be decided'
              : event.competition_type === 'league'
                ? `League${event.round != null ? ` · Round ${event.round}` : ''}`
                : event.competition || 'Tournament'}
          </KeyValue>
        )}
      </div>

      {/* Direct pitch assignment — Allocation passes this
          (claude/plans/2026-08-24-pitch-direct-assign.md); every other caller
          omits it and gets no button, per the onOpenAvailability lesson in
          the footer below. Allocation itself withholds it for an AWAY match
          — somebody else's ground, no pitch of ours to give — the same
          strict `home === false` rule PitchRequest follows. */}
      {onAssignPitch && (
        <div className="mb-4">
          <Button variant="secondary" full onClick={() => onAssignPitch(event)}>
            {event.pitch && event.pitch !== PITCH_TBD ? 'Change pitch' : 'Assign pitch'}
          </Button>
        </div>
      )}

      {format && <SquadFormatNote format={format} />}

      {/* Additional info (8 Aug 2026). Only when set, for the same reason
          Pitch is: most events have none and a permanent empty heading is
          noise. NOT a KeyValue row — those are one short value on one line,
          and this is free text that can run to a paragraph, so it gets its
          own block with the heading above rather than a value squeezed
          right-aligned against a label.
          whitespace-pre-line keeps the line breaks a coach typed into the
          textarea; without it "Kit list:\n- gumshield\n- boots" collapses
          into one run-on line. */}
      {event.notes && (
        <div className="mb-4">
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
            Additional info
          </h4>
          <p className="whitespace-pre-line text-[14.5px] text-ink">{event.notes}</p>
        </div>
      )}

      {/* ── Squad chat (phase 2, 23 Aug 2026) ─────────────────────────────
          The fixture's thread: "N replies · Open thread", or "Start a
          thread" when there is none. Anyone in the squad may start it — it
          is the fixture's discussion, not an announcement — so this is NOT
          gated on canEdit.
          ⚠️ SAME handler-required rule as every other button in this file:
          a screen that forgets onOpenChat gets no block rather than a dead
          one. The handler receives the event and navigates to
          /chat/<team>?event=<id>; the chat screen decides open-or-start. */}
      {onOpenChat && <ChatBlock event={event} onOpenChat={onOpenChat} />}

      {played ? (
        <div>
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">Result</h4>
          <div className="flex items-center gap-3">
            <Chip type={resultOutcome(event)}>{resultLabel(event)}</Chip>
            <span className="text-base font-extrabold text-ink">{resultScore(event)}</span>
          </div>
        </div>
      ) : /* ⚠️ NOTHING TO REPLY TO, SO NOTHING IS RENDERED AND NOTHING IS
             FETCHED. A Club Diary entry (info_only) suppresses the whole
             availability section — the summary is not mounted, so no query
             runs, and the button is not rendered at all rather than disabled.
             That follows the same rule the onOpenAvailability comment below
             records: a screen that cannot service the button shows no button.
             Placed beside the existing clubWide guard because it is the same
             kind of condition — "this event does not take RSVPs".
             claude/plans/2026-08-31-club-diary.md. */
      FEATURES.availability && !clubWide && event.info_only !== true ? (
        <div>
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">Availability</h4>
          <AvailabilitySummary eventId={event.id} />
          {/* Everyone gets this button, not just canEdit users: a player or
              parent who cannot edit the FIXTURE still needs to set their own
              RSVP, and Task 16's brief calls this out explicitly. The PARENT
              screen holds the "is the RSVP sheet open" state and renders
              src/screens/Availability.jsx from it — the same
              parent-holds-the-state wiring EventForm/PlayerForm already use
              from Schedule/Roster — rather than this component opening a
              second sheet of its own.

              ⚠️ AND THAT IS WHY IT IS GATED ON THE HANDLER EXISTING. Until
              10 Aug 2026 this rendered unconditionally and called
              `onOpenAvailability?.(event)`. Schedule passed the handler;
              THE DASHBOARD DID NOT — so on the home screen the button drew
              itself, invited a tap, and the optional-call swallowed it. A
              parent tapping "Set my availability" there got silence, which
              is how "where is the availability function?" gets asked about a
              feature that shipped. Requiring the prop makes a dead button
              impossible to render: a screen that forgets it now shows no
              button rather than a lying one. */}
          {onOpenAvailability && (
          <Button
            variant="secondary"
            full
            onClick={() => onOpenAvailability(event)}
            className="mt-3"
          >
            {canEdit ? 'View & set availability' : 'Set my availability'}
          </Button>
          )}
        </div>
      ) : null}

      {/* ── The register ────────────────────────────────────────────────
          Attendance: who actually turned up. Separate from the availability
          block above in every way that matters — it is the FACT rather than
          the intent, it is coach-only, and it is NOT behind
          `FEATURES.availability`, because Jay's 10 Aug ruling was to ship
          attendance INSTEAD of switching RSVP on.

          ⚠️ ONLY ONCE THE EVENT HAS STARTED. A register for a session that
          has not happened is not a register, it is a guess — and offering it
          early is how a coach ends up marking the squad present on Tuesday
          for a Saturday match. `date` is null for an unparseable starts_at,
          and the `date &&` guard means those get no button rather than one
          that compares against NaN and renders unpredictably.

          ⚠️ AND ONLY WHEN A HANDLER EXISTS, for the reason directly above:
          this same component rendered a dead availability button on the
          dashboard for weeks because the optional call swallowed the tap. A
          screen that forgets to pass the handler gets no button. */}
      {/* ⚠️ SELF-CONTAINED, and takes no handler — unlike the availability and
          register blocks below, which each need one and each shipped a dead
          button when a screen forgot to pass it. Nothing here can be forgotten
          by a caller. It decides for itself whether to render: a fixture that
          already has a real pitch has nothing to ask for, and somebody who
          cannot edit the squad sees it only if a request already exists. */}
      <PitchRequest event={event} canEdit={canEdit} />

      {/* ⚠️ TRAINING ONLY, AND THE GATE IS HERE RATHER THAN INSIDE THE CARD.
          A match has no session plan to read, and asking the database for one
          on every fixture is a round trip that can only ever answer "none".
          Self-contained like PitchRequest above: it loads its own session,
          takes no handler a screen could forget, and renders NOTHING when the
          squad has neither a published plan nor a focus covering the night.
          ⚠️ `canEdit` decides what it OFFERS, never what it shows — a parent
          sees tonight's plan read-only on purpose (it holds no children's
          data), and RLS on public.training_sessions is the actual boundary. */}
      {event.type === 'training' && (
        <SessionPlan event={event} team={team} canEdit={canEdit} />
      )}

      {canEdit && onOpenRegister && date && date.getTime() <= Date.now() && (
        <div className="mt-4">
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">Register</h4>
          <Button variant="secondary" full onClick={() => onOpenRegister(event)}>
            Take the register
          </Button>
        </div>
      )}

      {/* ⚠️ MATCHES ONLY, and only for someone who may edit the squad. The RCM
          sheet is a per-match governing-body form — a training session has no
          sheet, and a parent has no business opening one.
          ⚠️ ALWAYS AVAILABLE, NOT GATED ON THE MATCH HAVING STARTED, unlike the
          register above. U18's sheet is due an HOUR BEFORE kick-off (see
          src/lib/matchSheetDeadline.js), so a "not until it has finished" gate
          would lock out the one age group whose deadline falls first.
          ⚠️ A HANDLER PROP, NOT A <Link>, and this is not a style preference.
          This component renders inside a Sheet from Schedule and the Dashboard;
          a router-aware element here couples a presentational sheet to route
          context and broke eighteen existing tests that render it bare. The
          file already had the answer in onOpenRegister.
          ⚠️ RENDERED ONLY WHEN A HANDLER EXISTS, so a forgetful caller gets NO
          button rather than a lying one — the exact defect the availability
          button shipped with, where `onOpenAvailability?.()` drew a button on
          the Dashboard that silently swallowed every tap. */}
      {/* ⚠️ THE TEAM SHEET IS NOT THE RCM MATCH SHEET, and the two sit apart on
          this screen on purpose (Jay, 14 Aug 2026). Picking a team happens
          BEFORE the match and is shared to a WhatsApp group; the RCM sheet is
          filed AFTER it with the governing body. Putting them under one heading
          is how a coach ends up filing a team selection.
          ⚠️ SAME handler-required rule as every other button in this file — a
          screen that forgets to pass it gets no button rather than a dead one. */}
      {canEdit && event.type === 'match' && onOpenLineup && (
        <div className="mt-4">
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
            Team sheet
          </h4>
          <Button variant="secondary" full onClick={() => onOpenLineup(event)}>
            Pick the team
          </Button>
        </div>
      )}

      {/* ⚠️ ONLY FOR AN RCM LEAGUE MATCH — matchSheetApplies is the single gate
          (27 Aug 2026). RCM sheets are for LEAGUE games, U11 and up: not
          tournaments (run by their own organiser and not RCM league games), not
          friendlies, not minis. This replaces the older `type==='match' && !minis`
          condition, which offered the button on tournaments the governing body
          never wanted a sheet for. The minis exclusion is inside the gate; the
          Women's XV keeps its button because WXV is a league match. */}
      {canEdit && matchSheetApplies(event, team?.name) && onOpenMatchSheet && (
        <div className="mt-4">
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
            Match sheet
          </h4>
          <Button variant="secondary" full onClick={() => onOpenMatchSheet(event)}>
            Open the RCM match sheet
          </Button>
        </div>
      )}

      <FooterActions
        event={event}
        canEdit={canEdit}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDeleted={onDeleted}
      />
    </Sheet>
  )
}
