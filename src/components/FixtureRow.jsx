import Chip from './Chip.jsx'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import {
  dateBoxParts,
  eventDate,
  eventTitle,
  formatTime,
  hasResult,
  resultLabel,
  resultOutcome,
  resultScore,
  titleRepeatsType,
} from '../lib/eventFormat.js'

// Fixture / event row (design-system.md §4.13) — "the single most-reused
// component", rendered identically in the Dashboard's Upcoming list, the
// Dashboard's Last result card, and all three Schedule tabs. It lived inside
// Schedule.jsx until Task 13 needed the same row on the Dashboard; moved here
// verbatim rather than copied, so the two screens can never drift apart.
//
// The date box's month/day/weekday and the meta row's time are Abu Dhabi
// time, via dateBoxParts/formatTime (see CLUB_TIME_ZONE in eventFormat.js).
// The row itself carries no zone label; only the detail sheet says so.

const TYPE_LABELS = { match: 'Match', training: 'Training', social: 'Social' }

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

// A pitch is "known" when it names one. Anything a coach types to mean "not
// decided" is not — matched loosely because the value is free text typed into
// a form, so "TBC", "tbd" and "Pitch TBD" all arrive in practice.
function isKnownPitch(value) {
  const pitch = String(value ?? '').trim().toLowerCase()
  if (!pitch) return false
  return !/\b(tbd|tba|tbc)\b/.test(pitch)
}

/**
 * The 3px edge down the left of a row, and what it means.
 *
 * Redesign, 13 Aug 2026. Every row in every list looked identical, so scanning
 * a month meant reading. An edge is the cheapest possible encoding: it costs
 * three pixels, it is visible in peripheral vision, and it needs no legend
 * because each state also carries its words elsewhere in the row.
 *
 * ⚠️ IT IS NEVER THE ONLY SIGNAL. The chip says the type, the score says the
 * result, "no pitch yet" says the pitch is missing. This repeats what is
 * already written, which is exactly what makes it safe for anyone who cannot
 * separate the colours — roughly one man in twelve, and this club's volunteers
 * are mostly men.
 *
 * ⚠️ ORDER MATTERS. A played match is a result first and a match second; a
 * match with no pitch needs attention more than it needs to look like a match.
 */
function edgeTone(event, played) {
  if (played) return 'bg-line-strong'
  if (event?.type === 'match') {
    const pitch = String(event?.pitch ?? '').trim()
    const missing = !pitch || /(tbd|tba|tbc)/i.test(pitch)
    if (missing) return 'bg-warn'
    return 'bg-brand'
  }
  if (event?.type === 'training') return 'bg-accent'
  return 'bg-line-strong'
}

export function FixtureRow({ event, teamName, onSelect }) {
  const date = eventDate(event)
  const { month, day, weekday } = dateBoxParts(date)
  const played = hasResult(event)
  const venue = (event?.venue ?? '').trim()
  const pitch = (event?.pitch ?? '').trim()
  const pitchIsKnown = isKnownPitch(pitch)
  // ⚠️ ONE CHIP, NOT TWO, AND THE LABEL IS THE SHARED FORMATTER'S. This row is
  // rendered by the Dashboard AND all three Schedule tabs, so putting the label
  // here rather than in each caller is what stops the two screens drifting —
  // the same reason the row itself was moved out of Schedule.jsx.
  // ⚠️ NO LEAGUE TEAM MEANS THE SQUAD NAME, UNCHANGED. `event.league_team` is
  // the embed from listEvents and is null for every fixture that is not a
  // league match, which is most of them.
  const squadLabel = fixtureLabel(event, event?.league_team, teamName)

  return (
    <button
      type="button"
      data-testid="fixture-row"
      onClick={() => onSelect(event.id)}
      // `flex` and `items-center` are load-bearing, not decorative:
      // Chromium's UA stylesheet centres a <button>'s content inside its box,
      // which would shove this row's contents around once it is taller than
      // its text. Setting the layout explicitly overrides that.
      className="relative flex w-full items-center gap-[13px] border-b border-line p-[14px] pl-[17px] text-left transition-colors duration-150 last:border-b-0 hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
    >
      {/* The state edge. Inset by 1px at top and bottom so it never overlaps
          the row divider below it, which would read as a broken line. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-px left-0 w-[3px] rounded-r-[3px] ${edgeTone(event, played)}`}
      />
      <span className="w-[52px] shrink-0 rounded-[11px] bg-surface-mute px-1 py-2 text-center">
        <span className="block text-[10.5px] font-extrabold uppercase tracking-[.5px] text-brand">{month}</span>
        <span className="block text-[21px] font-extrabold leading-none text-ink">{day}</span>
        <span className="block text-[10px] font-semibold text-ink-faint">{weekday}</span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="mb-1 flex flex-wrap items-center gap-1.5">
          <Chip type={event.type}>{TYPE_LABELS[event.type] ?? 'Event'}</Chip>
          {squadLabel && <Chip>{squadLabel}</Chip>}
        </span>
        {/* ⚠️ DROPPED WHEN IT ONLY ECHOES THE CHIP ABOVE IT — see
            titleRepeatsType in src/lib/eventFormat.js. A training called
            "Training" said the same word twice, in the row's two heaviest
            treatments, one above the other. With it gone the bold line belongs
            to matches and to sessions someone actually named, so scanning a
            month for what is different is reading the bold lines. */}
        {!titleRepeatsType(event) && (
          <span data-testid="fixture-title" className="block text-[15.5px] font-extrabold text-ink">
            {eventTitle(event)}
          </span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-ink-faint">
          <span className="flex items-center gap-1">
            <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {formatTime(date)}
          </span>
          {/* ⚠️ VENUE AND PITCH RENDERED SEPARATELY, not through venueLine().
              A KNOWN pitch is the one thing a parent standing at a 12-pitch
              complex needs (the same reasoning the calendar feed gives for
              putting it in LOCATION), so it is set a step darker than the rest
              of the meta line. "Pitch TBD" stays at the faint weight — it is a
              status, not a destination, and Jay's ruling is that it must still
              show: without it nobody can tell "no pitch allocated yet" from
              "the app didn't say".
              ⚠️ THE KNOWN PITCH IS DARKENED RATHER THAN THE TBD LIGHTENED.
              ink-faint is already the lightest AA-safe token on this surface
              (4.98:1); going below it to create the contrast would buy a visual
              distinction with a contrast failure. */}
          {venue && (
            <span className="flex items-center gap-1">
              <PinIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {venue}
            </span>
          )}
          {pitch && (
            <span className={pitchIsKnown ? 'font-semibold text-ink-muted' : ''}>{pitch}</span>
          )}
        </span>
      </span>

      {played && (
        <span className="shrink-0 text-right">
          <Chip type={resultOutcome(event)}>{resultLabel(event)}</Chip>
          <span className="mt-1 block text-base font-extrabold text-ink">{resultScore(event)}</span>
        </span>
      )}
    </button>
  )
}

export default FixtureRow
