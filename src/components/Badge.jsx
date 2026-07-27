// Small role/status label — NOT a duplicate of Chip. See design-system.md
// §4.15 (.p-cap captain badge) and §4.20 (.role-tag): both are visually and
// structurally distinct from the event-type Chip (§4.7) —
//   - smaller text (10px vs Chip's 11.5px), uppercase, wider letter-spacing
//   - a much smaller corner radius (6px, near-square) vs Chip's fully-
//     rounded 20px pill
//   - different padding (2px 7px vs Chip's 3px 9px)
// and a different purpose: Chip marks *what an event is* (match/training/
// social); Badge marks *who someone is* (a role tag next to a name) or a
// short status flag (the "Capt" marker next to a captain's name). Screens
// from Task 11 onward need both, so building only one and overloading its
// meaning would mean approximating rather than porting the design system —
// see the task-9 report for the full ruling.
//
// Tones map 1:1 onto the prototype's role-tag/captain-badge colour pairs:
// role-admin reuses --maroon/white, role-coach uses #eaf4fb/sky-deep,
// role-parent and the captain badge both use the warn bg/text pair (the
// design system notes these intentionally share the --warn tokens, despite
// being semantically different — captain status and parent role are simply
// not visually distinguished from each other in the source design).
//
// Contrast note: the literal --warn/--warn-bg pair (#c9861a on #fbf1dd)
// measures ~2.71:1 — fails AA. Background kept as specified; foreground
// darkened to #8a5a12 (~5.3:1), same treatment as Chip's social variant.

const TONES = {
  admin: 'bg-quinsRed text-white',
  coach: 'bg-[#eaf4fb] text-[#2F7D3D]',
  parent: 'bg-[#fbf1dd] text-[#8a5a12]',
  captain: 'bg-[#fbf1dd] text-[#8a5a12]',
}

const NEUTRAL_TONE = 'bg-[#f0ecf2] text-[#77726e]'

export function Badge({ tone, children, className = '' }) {
  const toneClasses = TONES[tone] ?? NEUTRAL_TONE

  const classes = [
    'inline-flex',
    'items-center',
    'rounded-[6px]',
    'px-[7px]',
    'py-[2px]',
    'text-[10px]',
    'font-extrabold',
    'uppercase',
    'tracking-[.5px]',
    toneClasses,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{children}</span>
}

export default Badge
