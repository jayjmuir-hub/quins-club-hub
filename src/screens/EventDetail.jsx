import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Chip from '../components/Chip.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAvailability, subscribeAvailability } from '../data/availability.js'
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
// Edit/Delete actions are deliberately absent: Task 14 owns event writes.
// Adding a disabled or read-only affordance now would promise a control
// that doesn't exist yet.

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
    <div className="flex items-baseline justify-between gap-4 border-b border-[#e6e3e1] py-3 last:border-b-0">
      <span className="text-[14.5px] font-semibold text-[#77726e]">{label}</span>
      <span className="text-right text-[14.5px] font-bold text-[#221f1d]">{children}</span>
    </div>
  )
}

const AVAILABILITY_TONES = {
  in: { bar: 'bg-[#2F9E4F]', dot: 'bg-[#2F9E4F]', label: 'in' },
  maybe: { bar: 'bg-[#c9861a]', dot: 'bg-[#c9861a]', label: 'maybe' },
  out: { bar: 'bg-[#d1483b]', dot: 'bg-[#d1483b]', label: 'out' },
}

const STATUSES = ['in', 'maybe', 'out']

function AvailabilitySummary({ eventId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let mounted = true
    setLoading(true)
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
        if (mounted) setLoading(false)
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
      <p role="alert" className="rounded-[11px] bg-[#fbeae8] px-3 py-2 text-sm font-semibold text-quinsRedDark">
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
    return <p className="text-sm text-[#77726e]">No one has responded yet.</p>
  }

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-[20px] bg-[#eee]">
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
          <span key={status} className="flex items-center gap-1.5 text-xs font-bold text-[#5c5854]">
            <span className={['h-2 w-2 rounded-full', AVAILABILITY_TONES[status].dot].join(' ')} aria-hidden="true" />
            {counts[status]} {AVAILABILITY_TONES[status].label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function EventDetail({ event, team, onClose }) {
  const date = eventDate(event)
  const Icon = TYPE_ICONS[event.type] ?? WhistleIcon
  const typeLabel = TYPE_LABELS[event.type] ?? 'Event'
  const played = hasResult(event)

  return (
    <Sheet open onClose={onClose} title={typeLabel}>
      {/* Negative margins bleed the hero to the sheet's edges, matching the
          prototype's .detail-hero (design-system.md §4.21). */}
      <div className="-mx-[18px] -mt-4 mb-4 bg-[image:linear-gradient(135deg,theme(colors.quinsRedDark),theme(colors.quinsRed))] px-[18px] py-[22px] text-white">
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-[14px] bg-white/20">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
        <h3 className="text-[22px] font-bold leading-tight">{eventTitle(event)}</h3>
        <p className="mt-1 text-sm font-semibold text-white/[.85]">
          {formatLongDate(date)} · {formatTime(date)}
        </p>
      </div>

      <div className="mb-4">
        <KeyValue label="Type">
          {typeLabel}
          {event.type === 'match' ? ` · ${event.home ? 'Home' : 'Away'}` : ''}
        </KeyValue>
        <KeyValue label="Age group">{team?.name ?? 'Not set'}</KeyValue>
        <KeyValue label="Venue">{event.venue || 'To be confirmed'}</KeyValue>
        {event.type === 'match' && event.competition && (
          <KeyValue label="Competition">{event.competition}</KeyValue>
        )}
      </div>

      {played ? (
        <div>
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-[#77726e]">Result</h4>
          <div className="flex items-center gap-3">
            <Chip type={resultOutcome(event)}>{resultLabel(event)}</Chip>
            <span className="text-base font-extrabold text-[#221f1d]">{resultScore(event)}</span>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-[#77726e]">Availability</h4>
          <AvailabilitySummary eventId={event.id} />
        </div>
      )}
    </Sheet>
  )
}
