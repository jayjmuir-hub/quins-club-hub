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
// neutral chip styling (#f0ecf2 bg / darkened --muted text, see contrast
// note below) rather than crashing or rendering nothing — screens should
// never be able to produce a blank chip just because an event's type value
// is unexpected. This neutral variant is also, per design-system.md §4.7,
// the chip used everywhere for age-group labels ("Senior Men 1st XV"), so
// it appears on nearly every screen.
//
// Contrast notes (component-scoped literal overrides, not token changes —
// see task-9-report.md for the full numbers and rationale for each):
//   - social variant: the design system's literal --warn/--warn-bg pair
//     (#c9861a text on #fbf1dd bg) measures ~2.71:1, failing AA even at the
//     3:1 non-text minimum. Background kept as specified; foreground
//     darkened (same hue) to #8a5a12, ~5.3:1.
//   - neutral/default variant: the literal --muted/#f0ecf2 pair (#77726e on
//     #f0ecf2) measures 4.07:1, just under the 4.5:1 AA text threshold (this
//     chip text is 11.5px bold, which does not qualify as "large text").
//     Background kept as specified; foreground darkened to #5c5854, ~6.0:1.
//     This is scoped to Chip/Badge only — the shared --muted token used
//     elsewhere in the app (e.g. on white, where it already clears 4.5:1)
//     is untouched.

const VARIANTS = {
  match: 'bg-quinsRed text-white',
  training: 'bg-[#eef7e6] text-[#2F7D3D]',
  social: 'bg-[#fbf1dd] text-[#8a5a12]',
  // Result variants (win/loss/draw) come from the same design-system.md
  // §4.7 variant list as match/training/social — the same chip, used on the
  // Schedule's Results rows, not a second component. Same contrast
  // treatment as the social/neutral variants: the specified background is
  // kept, the foreground darkened to the nearest existing palette value
  // that clears AA at this 11.5px bold size.
  //   - win:  --good (#2F9E4F) on --good-bg (#e7f6ea) measures 3.06:1.
  //           Text swapped to --sky-deep (#2F7D3D), already the training
  //           chip's foreground, for ~4.6:1.
  //   - loss: --bad (#d1483b) on --bad-bg (#fbeae8) measures 3.84:1. Text
  //           swapped to --plum/quinsRedDark (#8E1526) for ~7.9:1.
  //   - draw: #5a6470 on #eef0f2 already measures ~5.3:1 — used verbatim.
  win: 'bg-[#e7f6ea] text-[#2F7D3D]',
  loss: 'bg-[#fbeae8] text-quinsRedDark',
  draw: 'bg-[#eef0f2] text-[#5a6470]',
}

const NEUTRAL_VARIANT = 'bg-[#f0ecf2] text-[#5c5854]'

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
