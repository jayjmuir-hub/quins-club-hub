import EventTypeIcon, { EVENT_TYPE_ICONS } from './EventTypeIcon.jsx'

// Event-type category chip (design-system.md §4.7): a pill-shaped inline
// label used on fixture/event rows to mark whether an event is a match,
// training, or social. Colours are ported verbatim from the prototype's
// .chip.match / .chip.training / .chip.social CSS, not from the Tailwind
// brand tokens — accent (#3bd070) is never used here, because the
// prototype's own training-chip pairing is light green-bg (#eef7e6) with
// dark sky-deep text (#2F7D3D), which is what actually meets AA contrast;
// accent itself is a gradient/block-fill colour only (~1.9:1 on white,
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
  match: 'bg-brand text-white',
  training: 'bg-accent-bg text-accent-ink',
  social: 'bg-warn-bg text-warn-ink',
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
  //           swapped to --plum/brand-deep (#b3141a) for ~7.9:1.
  //   - draw: #5a6470 on #eef0f2 already measures ~5.3:1 — used verbatim.
  win: 'bg-accent-bg text-accent-ink',
  loss: 'bg-danger-bg text-brand-deep',
  draw: 'bg-surface-mute text-ink-muted',
}

const NEUTRAL_VARIANT = 'bg-surface-mute text-ink-muted'

// ⚠️ THE ICON IS DECIDED HERE, NOT BY THE CALLER — 12 Aug 2026. Three separate
// components draw a type chip (FixtureRow, for the Dashboard and all three
// Schedule tabs; ScheduleTable, for the desktop grid; and EventDetail's result
// chip), and asking each to pass an icon is three chances for one to be
// forgotten and for two screens to disagree about what a training session looks
// like. It is the same reasoning FixtureRow's own header gives for holding the
// fixture label rather than letting each screen build one.
//
// ⚠️ ONLY THE THREE EVENT TYPES GET ONE. EVENT_TYPE_ICONS is keyed by
// match/training/social and returns nothing for anything else, so the win/loss/
// draw result chips and the neutral squad-name pill are untouched — they are
// not event types, and a row where every pill carries a picture stops being
// scannable, which is the whole point of the icon.
//
// ⚠️ `gap-1` ONLY WHEN THERE IS AN ICON. An unconditional gap on a text-only
// chip is dead space inside a pill that is deliberately tight.
export function Chip({ type, children, className = '' }) {
  const variantClasses = VARIANTS[type] ?? NEUTRAL_VARIANT
  // ⚠️ ASKED OF THE MAP, NOT OF THE RENDERED ELEMENT. `<EventTypeIcon />` is a
  // truthy React element even when the component returns null, so testing the
  // element would put `gap-1` on every text-only chip in the app.
  const hasIcon = Boolean(EVENT_TYPE_ICONS[type])

  const classes = [
    'inline-flex',
    'items-center',
    hasIcon ? 'gap-1' : '',
    // ⚠️ `rounded-tab` (12px), was `rounded-[20px]` — Jay, 11 Aug 2026:
    // "things like match pills etc can be similar too", meaning adhjrt.com's
    // age-group buttons. This is the match pill: it marks match/training/
    // social and win/loss/draw, and per design-system.md §4.7 the neutral
    // variant is also the age-group label, so it appears on nearly every
    // screen. Squaring it off is the single largest visual change in the
    // sweep, and it is what ties the fixture rows to the fortnight strip and
    // the nav.
    //
    // ⚠️ COLOURS ARE UNTOUCHED AND MUST STAY THAT WAY. Every pairing in
    // VARIANTS below was chosen to clear AA at 11.5px bold and several are
    // deliberately NOT the brand tokens — the header explains each one. This
    // change is the corner and nothing else.
    'rounded-tab',
    'px-[9px]',
    'py-[3px]',
    'text-[11.5px]',
    'font-bold',
    variantClasses,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      <EventTypeIcon type={type} className="h-3 w-3 shrink-0" />
      {children}
    </span>
  )
}

export default Chip
