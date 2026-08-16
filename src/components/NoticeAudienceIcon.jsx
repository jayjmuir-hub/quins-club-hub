// The two marks a notice can carry: it went to the whole club, or to one squad.
//
// ⚠️ INLINE SVG, NEVER EMOJI — `claude/specs/design-system.md` §"Icons" is
// explicit: "100% inline SVG, no icon font and no emoji". The first draft of
// this card used 📣 and 🏉 and it was wrong for a concrete reason as well as a
// stylistic one: Windows ships no glyph for a good many emoji, and this app has
// already been bitten by exactly that — `src/components/PhoneInput.jsx` uses SVG
// flags because Chrome and Edge on Windows render an emoji flag as two letters.
//
// ⚠️ `stroke="currentColor"` AND NO FIXED FILL, same as EventTypeIcon. These
// render on a pale tint on the card and could later render on a dark chip; a
// baked colour would be wrong in one of those and nobody would notice until it
// shipped.
//
// ⚠️ DELIBERATELY NOT REUSING THE EVENT MARKS. `EVENT_TYPE_ICONS` already means
// match / training / social, and its own header records how carefully that trio
// was chosen. A rugby ball here would say "match" beside a notice about kit
// collection, and the people mark already means "social".

function MegaphoneIcon({ className = '', ...rest }) {
  // Whole club — an announcement pointed outward at everyone.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M6 14v3a2 2 0 0 0 2 2h.5" />
    </svg>
  )
}

function ShieldIcon({ className = '', ...rest }) {
  // One squad — a crest, which is how a club refers to a team.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M12 3.5 5 6v6c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V6l-7-2.5Z" />
      <path d="M9.5 12l1.8 1.8 3.4-3.6" />
    </svg>
  )
}

/**
 * The mark for one notice's audience.
 *
 * ⚠️ ALWAYS DECORATIVE (`aria-hidden`), baked in here rather than left to the
 * call site — the same rule EventTypeIcon states, and for the same reason: the
 * audience is written in words on the chip immediately beside it, so a label
 * would make a screen reader say it twice.
 *
 * @param {{ clubWide: boolean, className?: string }} props
 */
export default function NoticeAudienceIcon({ clubWide, className = '' }) {
  const Icon = clubWide ? MegaphoneIcon : ShieldIcon
  return <Icon className={className} aria-hidden="true" focusable="false" />
}
