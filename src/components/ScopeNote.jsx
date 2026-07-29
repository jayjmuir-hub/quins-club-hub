// Scope callout (design-system.md §4.25 .scope-note): tells the signed-in
// user what slice of the club they're looking at ("You're seeing your
// squads only", "Parent view · read-only. You're only seeing U10."). This
// is deliberately a dumb presentational component — it takes the message as
// children and a `tone` for which of the two prototype variants to use
// (coach = green eye-icon banner, parent = warn lock-icon banner, read-only)
// — it must NOT import useMemberships or scope.js itself. The screen already
// has memberships/visibleTeams from Task 6/8's helpers; it computes the
// message and role and passes the result down here. Keeping the scope
// computation out of this component is what makes it trivially reusable
// (and trivially testable) everywhere the "you're scoped to X" pattern is
// needed later.

function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function LockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

// Contrast note (parent tone): the literal --warn (#c9861a) icon on
// --warn-bg (#fbf1dd) measures ~2.71:1, below the 3:1 minimum for
// meaningful icons (WCAG 1.4.11). The border keeps the literal --warn value
// (decorative, not conveying information on its own); the icon — which
// conveys the "read-only/locked" meaning — uses the same darkened #8a5a12
// as Chip's social variant and Badge's parent/captain tones, for ~5.3:1.
const TONES = {
  coach: { border: 'border-l-accent-ink', bg: 'bg-accent-bg', Icon: EyeIcon, iconColor: 'text-accent-ink' },
  parent: { border: 'border-l-warn', bg: 'bg-warn-bg', Icon: LockIcon, iconColor: 'text-warn-ink' },
}

export function ScopeNote({ tone = 'coach', children }) {
  const { border, bg, Icon, iconColor } = TONES[tone] ?? TONES.coach

  return (
    <div className={['mb-4 flex items-start gap-3 rounded-[11px] border-l-4 px-4 py-3 text-sm', border, bg].join(' ')}>
      <Icon className={['mt-0.5 h-5 w-5 shrink-0', iconColor].join(' ')} aria-hidden="true" />
      <div className="text-ink">{children}</div>
    </div>
  )
}

export default ScopeNote
