import { useId } from 'react'

// The three event-type marks — match, training, social — in ONE place.
//
// ⚠️ THIS FILE EXISTS BECAUSE THEY USED TO LIVE IN A SCREEN. Until 12 Aug 2026
// the only type icons in the app were three local functions inside
// src/screens/EventDetail.jsx, rendered in that sheet's hero and nowhere else.
// The moment the same marks were wanted on the chip — which is drawn by
// FixtureRow (Dashboard + all three Schedule tabs) and by ScheduleTable — a
// screen was the wrong home: a second copy is a copy that drifts, and the app
// has already paid for that lesson once (FixtureRow's own header records being
// moved out of Schedule.jsx for exactly this reason).
//
// ⚠️ TOMBSTONE — what was here before, and why it went. Jay, 12 Aug 2026,
// looking at real fixtures:
//   whistle = match    A whistle starts a training session just as often as it
//                      starts a match. It marked the thing it was least
//                      specific to.
//   shirt   = training A shirt says "kit", not "session". It read as a kit
//                      order or a strip, not as something in the diary.
//   trophy  = social   The worst of the three: a trophy means WINNING. It was
//                      sitting on the end-of-term BBQ.
// design-system.md §5.5 named that trio; that line has been updated with this
// change. Do not reinstate them — the argument against each is above, and it
// was made by the person who uses the app.
//
// ⚠️ THE BALL IS SOLID AND THE OTHER TWO ARE OUTLINES, AND THAT IS DELIBERATE,
// not drift. The Match chip is the only one of the three with a DARK fill
// (bg-brand, #c8102e, white text — see Chip.jsx VARIANTS); training and social
// sit on pale tints. A 2px hairline that reads cleanly on #e6f7ec turns to mush
// on solid red at the 12px the chip renders at, so the match mark carries its
// weight as a filled shape instead. Jay's call, 12 Aug 2026. If the Match chip
// ever stops being a dark fill, this is the reason to revisit it.

// ⚠️ THE SEAM AND LACES ARE A MASK, NOT STROKED LINES ON TOP, and that is not
// a stylistic choice — it is the only version that works everywhere this icon
// renders. Stroking them needs a colour to stroke them IN, and the two
// backgrounds disagree: on the chip it is solid #c8102e, in the detail-sheet
// hero it is a translucent white box over a red gradient, where no opaque
// colour matches. Masking cuts the seam out of the ball, so the background
// itself shows through and the mark is correct on both.
//
// ⚠️ useId, NOT A LITERAL STRING. A fixed id would be duplicated in the
// document the moment two match chips render — which is the normal case, since
// a Saturday of age-group fixtures is a list of them — and duplicate ids make
// which mask applies a matter of document order.
export function RugbyBallIcon(props) {
  const maskId = useId()
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <mask id={maskId}>
        <rect x="0" y="0" width="24" height="24" fill="#fff" />
        <g stroke="#000" strokeWidth="1.7" strokeLinecap="round">
          {/* The seam, running corner to corner along the ball's long axis. */}
          <path d="M8.6 15.4 15.4 8.6" />
          {/* Three laces, perpendicular to it and centred on it. */}
          <path d="M9.35 13.35 10.65 14.65" />
          <path d="M10.85 11.85 12.15 13.15" />
          <path d="M12.35 10.35 13.65 11.65" />
        </g>
      </mask>
      <ellipse
        cx="12"
        cy="12"
        rx="9.5"
        ry="5.5"
        transform="rotate(-35 12 12)"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  )
}

// A marker cone: the object that means "a drill is set up here". Rounded apex
// rather than a point — Jay's pick from six, 12 Aug 2026 — because a hard
// triangular tip reads as a hazard/warning triangle, and the softened one reads
// as the plastic cone it is meant to be. The single stripe is load-bearing for
// the same reason: without it the silhouette IS a triangle.
export function ConeIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M11.1 4.6a1 1 0 0 1 1.8 0L16.4 18H7.6L11.1 4.6Z" />
      <path d="M4.5 21h15l-1.6-3H6.1L4.5 21Z" />
      <path d="M10 12h4" />
    </svg>
  )
}

// Two people. A social is the one event type defined by who turns up rather
// than by what equipment is out, so it is the only one of the three not drawn
// as an object.
export function PeopleIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2.5 20.5a6.5 6.5 0 0 1 13 0" />
      <path d="M16.5 4.4a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18 14.6a6.5 6.5 0 0 1 3.5 5.9" />
    </svg>
  )
}

// ⚠️ KEYED BY `events.type`, WHICH IS THE COLUMN'S OWN VOCABULARY — the same
// three strings Chip.jsx's VARIANTS map uses, so a chip that gets a colour also
// gets a mark and the two can never disagree about which types exist.
//
// ⚠️ AN UNKNOWN OR MISSING TYPE GETS NO ICON, and never a fallback one. Chip
// deliberately renders an unrecognised type as the neutral grey pill; giving
// that a rugby ball would assert a fixture is a match on the strength of a
// value nothing recognised. Absence is the honest answer here — the same rule
// EventDetail's "Not a league match" default follows.
/**
 * Club Diary — a dated item with nothing to reply to.
 *
 * ⚠️ A CALENDAR, NOT A MEGAPHONE AND NOT A TROPHY. A megaphone says
 * "announcement", which is the NOTICEBOARD — a different feature with read
 * receipts, and confusing the two is the exact ambiguity the name "Club Diary"
 * was chosen to avoid. A trophy is already the tournament mark in
 * EventKindChooser. A calendar page says "a date you keep", which is the whole
 * of what this kind means. See claude/plans/2026-08-31-club-diary.md.
 *
 * ⚠️ EXPORTED, because EventKindChooser draws it too. The tournament trophy is
 * drawn locally there precisely because a tournament is NOT an event.type and
 * so has no entry here; a diary entry DOES have one (via eventChipKind), so a
 * second copy would be the drift that comment warns about.
 */
export function CalendarIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

export const EVENT_TYPE_ICONS = {
  match: RugbyBallIcon,
  training: ConeIcon,
  social: PeopleIcon,
  // ⚠️ 'diary' IS NOT AN events.type. It comes from eventChipKind() in
  // src/lib/eventFormat.js, which returns it for an info_only event. Adding it
  // here is safe for exactly the reason the note above gives: this map is asked
  // about CHIP KINDS, and 'diary' is not a result value, so the win/loss/draw
  // chips and the neutral squad pill stay untouched.
  diary: CalendarIcon,
}

/**
 * The mark for one event type, or null when there isn't one.
 *
 * ⚠️ ALWAYS DECORATIVE (`aria-hidden`). Every place this renders, the word it
 * marks is right beside it — "Match" in the chip, the event's own title under
 * the hero. Giving it a label would make a screen reader say the type twice.
 * That is baked in here rather than left to each call site, because it is a
 * property of the icon's ROLE and not of where it happens to be drawn.
 */
export default function EventTypeIcon({ type, className = '' }) {
  const Icon = EVENT_TYPE_ICONS[type]
  if (!Icon) return null
  return <Icon className={className} aria-hidden="true" focusable="false" />
}
