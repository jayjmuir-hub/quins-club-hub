import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Chip from '../components/Chip.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAvailability, subscribeAvailability } from '../data/availability.js'
import { deleteEvent } from '../data/events.js'
import { FEATURES } from '../lib/features.js'
import {
  eventDate,
  eventTitle,
  formatLongDate,
  formatTime,
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

const FOOTER_BUTTON =
  'flex-1 rounded-[11px] px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

function FooterActions({ event, canEdit, onEdit, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  // Nothing for someone who can't edit — see PlayerDetail's FooterActions.
  // Not being able to change a fixture is the ordinary state for most people
  // opening this sheet, not an exception worth a banner every time.
  if (!canEdit) return null

  function handleDelete() {
    setDeleting(true)
    setError(null)
    deleteEvent(event.id)
      .then(() => onDeleted?.(event))
      .catch((err) => {
        setError(err)
        setDeleting(false)
        setConfirming(false)
      })
  }

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

      {confirming ? (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">
            Delete this event? This can&apos;t be undone.
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className={`${FOOTER_BUTTON} border-[1.5px] border-line bg-surface-card text-ink hover:bg-surface-mute`}
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className={`${FOOTER_BUTTON} bg-brand-deep text-white hover:bg-brand`}
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => onEdit?.(event)}
            className={`${FOOTER_BUTTON} bg-brand text-white hover:bg-brand-deep`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={`${FOOTER_BUTTON} border-[1.5px] border-line bg-surface-card text-brand-deep hover:bg-danger-bg`}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function EventDetail({ event, team, onClose, canEdit = false, onEdit, onDeleted, onOpenAvailability }) {
  const date = eventDate(event)
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
          {formatLongDate(date)} · {formatTime(date)}
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
              RSVP, and Task 16's brief calls this out explicitly. Schedule
              holds the "is the RSVP sheet open" state and renders
              src/screens/Availability.jsx from it — the same
              parent-holds-the-state wiring EventForm/PlayerForm already use
              from Schedule/Roster — rather than this component opening a
              second sheet of its own. */}
          <button
            type="button"
            onClick={() => onOpenAvailability?.(event)}
            className="mt-3 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {canEdit ? 'View & set availability' : 'Set my availability'}
          </button>
        </div>
      ) : null}

      <FooterActions event={event} canEdit={canEdit} onEdit={onEdit} onDeleted={onDeleted} />
    </Sheet>
  )
}
