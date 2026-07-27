// Event-type category chip (design-system.md §4.7): a pill-shaped inline
// label used on fixture/event rows to mark whether an event is a match,
// training, or social. Colours are ported verbatim from the prototype's
// .chip.match / .chip.training / .chip.social CSS, not from the Tailwind
// brand tokens — quinsGreen (#7DC351) is never used here, because the
// prototype's own training-chip pairing is light green-bg (#eef7e6) with
// dark sky-deep text (#2F7D3D), which is what actually meets AA contrast;
// quinsGreen itself is a gradient/block-fill colour only (~1.9:1 on white,
// fails AA for text — see design-system.md §1 and the task-9 brief).
//
// An unrecognised (or missing) `type` renders the prototype's default
// neutral chip styling (#f0ecf2 bg / --muted text) rather than crashing or
// rendering nothing — screens should never be able to produce a blank chip
// just because an event's type value is unexpected.
//
// Contrast note (social variant): the design system's literal --warn/
// --warn-bg pair (#c9861a text on #fbf1dd bg) measures ~2.71:1, which fails
// AA even for the 3:1 non-text minimum, let alone 4.5:1 for text. The
// background is kept as specified; the foreground is darkened (same hue,
// #8a5a12) to ~5.3:1, following the same "darken it for text use" rule the
// task-9 brief applies to quinsGreen. See task-9-report.md for the numbers.

const VARIANTS = {
  match: 'bg-quinsRed text-white',
  training: 'bg-[#eef7e6] text-[#2F7D3D]',
  social: 'bg-[#fbf1dd] text-[#8a5a12]',
}

const NEUTRAL_VARIANT = 'bg-[#f0ecf2] text-[#77726e]'

export function Chip({ type, children, className = '' }) {
  const variantClasses = VARIANTS[type] ?? NEUTRAL_VARIANT

  const classes = [
    'inline-flex',
    'items-center',
    'rounded-[20px]',
    'px-[9px]',
    'py-[3px]',
    'text-[11.5px]',
    'font-bold',
    variantClasses,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{children}</span>
}

export default Chip
