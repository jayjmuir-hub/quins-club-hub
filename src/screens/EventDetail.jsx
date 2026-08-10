import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Chip from '../components/Chip.jsx'
import Spinner from '../components/Spinner.jsx'
import Button from '../components/Button.jsx'
import { listAvailability, subscribeAvailability } from '../data/availability.js'
import { countSeriesFrom, deleteEvent, deleteSeriesFrom } from '../data/events.js'
import { FEATURES } from '../lib/features.js'
import {
  eventDate,
  eventEndDate,
  eventTitle,
  formatLongDate,
  formatTimeRange,
  hasResult,
  resultLabel,
  resultOutcome,
  resultScore,
} from '../lib/eventFormat.js'

// The event detail sheet (design-system.md §5.5): a branded hero, a set of
// key/value rows, and then either the score (for a fixture that has one) or
// a live availability summary (for one that doesn't). Mounted only while an
// event is selected — Schedule renders it conditionally — so there is no
// `open` prop to thread through and no hidden-but-present DOM.
//
// Footer actions (design-system.md §5.5): Edit + Delete for a user who can
// edit this event's squad, and NOTHING for everyone else. Delete
// is two-step — the confirm replaces the buttons in place rather than using
// a native confirm(), which is unstyled, unannounced and untestable in the
// browser check. `canEdit` is passed in rather than computed here: this
// component stays presentational and the screen already holds memberships
// (the same split EventDetail and PlayerDetail both use).

const TYPE_LABELS = { match: 'Match', training: 'Training', social: 'Social' }

// design-system.md §5.5: whistle = match, shirt = training, trophy = social.
function WhistleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="14" r="5" />
      <path d="M14 12h7l-2-4h-9l1 2" />
      <path d="M9 9V6" />
    </svg>
  )
}

function ShirtIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 3 5 5 3 9l3 1.5V21h12V10.5L21 9l-2-4-4-2" />
      <path d="M9 3a3 3 0 0 0 6 0" />
    </svg>
  )
}

function TrophyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 13v4M9 21h6l-1-4h-4l-1 4Z" />
    </svg>
  )
}

const TYPE_ICONS = { match: WhistleIcon, training: ShirtIcon, social: TrophyIcon }

function KeyValue({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <span className="text-[14.5px] font-semibold text-ink-faint">{label}</span>
      <span className="text-right text-[14.5px] font-bold text-ink">{children}</span>
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
      <p role="alert" className="rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep">
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

function FooterActions({ event, canEdit, onEdit, onDeleted }) {
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
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-brand-deep"
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
        <div className="flex gap-2.5">
          <Button onClick={() => onEdit?.(event)} className={FOOTER_BUTTON}>
            Edit
          </Button>
          <Button
            variant="dangerQuiet"
            onClick={() => setConfirming(true)}
            className={FOOTER_BUTTON}
          >
            Delete
          </Button>
        </div>
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
  onDeleted,
  onOpenAvailability,
  onOpenRegister,
}) {
  const date = eventDate(event)
  // Null for every event created before 8 Aug 2026, and formatTimeRange
  // renders the start alone for those — see its comment. Nothing here
  // substitutes the calendar feed's per-type duration guess.
  const endDate = eventEndDate(event)
  const Icon = TYPE_ICONS[event.type] ?? WhistleIcon
  const typeLabel = TYPE_LABELS[event.type] ?? 'Event'
  const played = hasResult(event)

  return (
    <Sheet open onClose={onClose} title={typeLabel}>
      {/* Negative margins bleed the hero to the sheet's edges, matching the
          prototype's .detail-hero (design-system.md §4.21). */}
      <div className="-mx-[18px] -mt-4 mb-4 bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] px-[18px] py-[22px] text-white">
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-[14px] bg-white/20">
          <Icon className="h-7 w-7" aria-hidden="true" />
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
          {formatLongDate(date)} · {formatTimeRange(date, endDate)}
          {date && <span className="font-normal"> · Abu Dhabi time</span>}
        </p>
      </div>

      <div className="mb-4">
        <KeyValue label="Type">
          {typeLabel}
          {event.type === 'match' ? ` · ${event.home ? 'Home' : 'Away'}` : ''}
        </KeyValue>
        <KeyValue label="Age group">{team?.name ?? 'Not set'}</KeyValue>
        <KeyValue label="Venue">{event.venue || 'To be confirmed'}</KeyValue>
        {/* Only when set. Unlike Venue, which falls back to "To be
            confirmed" because every event has one somewhere, a pitch is
            genuinely optional — a social has none, and every event created
            before this column existed has none either. A row reading
            "Pitch — " on all of them would be noise. */}
        {event.pitch && <KeyValue label="Pitch">{event.pitch}</KeyValue>}
        {event.type === 'match' && event.competition && (
          <KeyValue label="Competition">{event.competition}</KeyValue>
        )}
      </div>

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

      {played ? (
        <div>
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">Result</h4>
          <div className="flex items-center gap-3">
            <Chip type={resultOutcome(event)}>{resultLabel(event)}</Chip>
            <span className="text-base font-extrabold text-ink">{resultScore(event)}</span>
          </div>
        </div>
      ) : FEATURES.availability ? (
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
      {canEdit && onOpenRegister && date && date.getTime() <= Date.now() && (
        <div className="mt-4">
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">Register</h4>
          <Button variant="secondary" full onClick={() => onOpenRegister(event)}>
            Take the register
          </Button>
        </div>
      )}

      <FooterActions event={event} canEdit={canEdit} onEdit={onEdit} onDeleted={onDeleted} />
    </Sheet>
  )
}
