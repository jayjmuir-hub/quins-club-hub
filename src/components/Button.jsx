// The shared button this app never had.
//
// WHY IT EXISTS. Until now every button carried its own hand-written class
// string — 76 of them across 26 files. That is why the app had no press state
// (commit c5315ba had to add it as a global CSS rule, because there was
// nowhere else to put it), and why the club site's hover choreography could
// not be adopted without editing every file. The variants below are not
// invented: they are the three clusters the existing strings already fall
// into, counted.
//
//   primary   x21   bg-brand, white text, darker on hover
//   secondary x16   hairline border, card fill, red text, red border on hover
//   ghost      —    no chrome until hovered; new, for icon/tertiary actions
//
// PRESS IS NOT HANDLED HERE. `button:not(:disabled):active` in index.css
// already scales every button in the app, including these. Adding
// `active:scale-*` here as well would compose into a double transform.
//
// ⚠️ NOT A DESIGN SYSTEM. This deliberately does not cover the pill-shaped
// chrome buttons in the masthead (ViewAsSwitcher, the role pill) — those live
// on dark chrome with condensed uppercase type and different contrast rules.
// Forcing them through one component would mean a variant that shares almost
// nothing with the other three.

const BASE = [
  // `group` so the arrow badge can react to hover on the whole control.
  'group inline-flex items-center justify-center gap-2',
  'font-bold',
  'transition',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-60',
].join(' ')

// ── The Touchline look, 10 Aug 2026 ────────────────────────────────────────
//
// Jay picked it from four directions, then picked "Sweep" from three motion
// studies of it. Two ideas, and both are about a thumb rather than a mouse:
//
//   A WEIGHTED BOTTOM EDGE. 3px of the darker brand under the primary, and a
//   thicker bottom border on the secondary, so a button reads as a physical
//   key with a top and a bottom rather than a coloured rectangle. It is what
//   makes the existing `active:scale(.97)` press (see src/index.css) look like
//   the key going down instead of the whole control shrinking.
//
//   A TALLER TAP TARGET. py-2.5 -> py-3. This app is used standing on a pitch
//   in Abu Dhabi, one-handed, often wet. 44px is the floor everyone quotes and
//   the old size sat under it.
//
// ⚠️ THE SWEEP AND THE BLOOM ARE ON `primary` ONLY, DELIBERATELY. Applied to
// everything they stop meaning anything, and a glowing "Cancel" pulls the eye
// toward the destructive-adjacent choice. `secondary` gets the bloom at a
// third strength and no sweep; `ghost` gets neither. The CSS itself is in
// src/index.css — see the comment there for why it is not Tailwind utilities.
const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-deep border-b-[3px] border-brand-deep btn-sweep btn-glow',
  // border-[1.5px] rather than `border`: the hairline reads too thin against a
  // white fill at 1px, which is why every existing secondary button used 1.5.
  // The bottom edge is thicker than the other three for the same reason the
  // primary has one at all.
  secondary:
    'border-[1.5px] border-b-[3px] border-line bg-surface-card text-ink hover:border-brand hover:text-brand btn-glow-soft',
  ghost: 'text-brand hover:bg-surface-mute',
}

// ⚠️ 8px, NOT THE 11px THE APP USES EVERYWHERE ELSE. Deliberate, and the
// mismatch is temporary by design: `rounded-btn` is the token, it is used
// TWICE, and the identical literal `rounded-[11px]` appears 117 times because
// the shared component was never adopted. Changing the token to 8px therefore
// restyles the twelve buttons that go through here and nothing else — which is
// exactly the point. The 105 hand-rolled ones move as they are routed through
// this component, and until then the two radii sitting side by side are the
// visible receipt for work that is not finished.
const SIZES = {
  md: 'rounded-btn px-4 py-3 text-sm',
  sm: 'rounded-[6px] px-3 py-2 text-[13px]',
}

// The club site's signature: a circular badge holding an arrow that rotates
// 45° on hover (`group-hover:rotate-45`). Their arrow points up-right and
// swings to point right — it reads as "this goes somewhere".
//
// Opt-in, not automatic. On a marketing site every button is a call to
// action; here most buttons are Save and Cancel, and an arrow on "Cancel"
// would be nonsense.
function ArrowBadge({ variant }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'grid h-6 w-6 shrink-0 place-items-center rounded-full',
        'transition-transform duration-300 group-hover:rotate-45',
        // On the red fill a white wash reads; on the white fill it would be
        // invisible, so the badge tints with the brand instead.
        variant === 'primary' ? 'bg-white/20' : 'bg-brand/10',
      ].join(' ')}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 17 17 7" />
        <path d="M7 7h10v10" />
      </svg>
    </span>
  )
}

export default function Button({
  variant = 'primary',
  size = 'md',
  arrow = false,
  full = false,
  as: Tag = 'button',
  className = '',
  children,
  ...rest
}) {
  // A <button> with no explicit type inside a <form> submits it. That has
  // caused real bugs in this app's forms, so default it here rather than
  // relying on every caller to remember.
  const typeProp = Tag === 'button' ? { type: rest.type ?? 'button' } : {}

  const classes = [
    BASE,
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    full ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag {...rest} {...typeProp} className={classes}>
      {children}
      {arrow && <ArrowBadge variant={variant} />}
    </Tag>
  )
}

export { ArrowBadge }
