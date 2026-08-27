import { Link } from 'react-router-dom'
import { CLUB_TIME_ZONE, eventDate, eventTimeLabel, eventTitle } from '../lib/eventFormat.js'

// The fixture a chat thread hangs off, with its RSVP chips.
//
// ⚠️ THE CHIPS ARE THE POINT OF A FIXTURE THREAD. "Who's coming Saturday?" in
// WhatsApp is forty replies nobody tallies; here the answer IS the data —
// the same availability rows the Squad Hub counts. Pure props, so it renders
// in the harness beside MessageRow.
//
// @param event   the embedded event row (see SELECT in src/data/messages.js)
// @param tally   { in, maybe, out } or undefined while loading
// @param compact true inside the stream; false on its own (the event screen)

function dateLine(event) {
  const date = eventDate(event)
  if (!date) return ''
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: CLUB_TIME_ZONE })
  return `${day} · ${eventTimeLabel(event)}`
}

export default function FixtureCard({ event, tally, compact = true }) {
  if (!event) return null
  const where = event.home === false ? 'Away' : event.home === true ? 'Home' : null
  return (
    <div
      data-testid="fixture-card"
      className={`rounded-[12px] border border-line bg-surface-mute/60 ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'}`}
    >
      <p className="text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">
        Fixture · {dateLine(event)}
        {where && ` · ${where}`}
      </p>
      <p className="mt-0.5 text-[14.5px] font-extrabold leading-tight text-ink">{eventTitle(event)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="rsvp-chips">
        <span className="rounded-full border border-accent-ink bg-accent-bg px-2 py-0.5 text-[11.5px] font-bold text-accent-ink">
          Going · {tally?.in ?? '–'}
        </span>
        <span className="rounded-full border border-line-strong bg-surface-card px-2 py-0.5 text-[11.5px] font-bold text-ink-muted">
          Maybe · {tally?.maybe ?? '–'}
        </span>
        <span className="rounded-full border border-danger-ink/40 bg-danger-bg px-2 py-0.5 text-[11.5px] font-bold text-danger-ink">
          Can’t · {tally?.out ?? '–'}
        </span>
        <Link
          to={`/schedule?event=${encodeURIComponent(event.id)}`}
          className="ml-auto text-[12px] font-bold text-brand-ink underline-offset-2 hover:underline"
        >
          Open fixture
        </Link>
      </div>
    </div>
  )
}
