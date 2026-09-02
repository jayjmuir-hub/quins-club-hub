// The shared button this app never had.
//
// WHY IT EXISTS. Every button used to carry its own hand-written class string.
// That is why the app had no press state (commit c5315ba had to add it as a
// global CSS rule, because there was nowhere else to put it), and why the club
// site's hover choreography could not be adopted without editing every file.
// The variants below are not invented: they are the clusters the existing
// strings already fell into.
//
//   primary      bg-brand, white text, darker on hover
//   secondary    hairline border, card fill, red text, red border on hover
//   ghost        no chrome until hovered; icon and tertiary actions
//   danger       solid deep red — the CONFIRM half of a destructive pair
//   dangerQuiet  bordered, red text — the button that ARMS that pair
//
// ⚠️ NO COUNTS IN THIS COMMENT, DELIBERATELY. It carried four of them until
// 10 Aug 2026 and three were wrong — "76 across 26 files", "105 raw buttons",
// and the claim that `rounded-[11px]`'s occurrences were drifting button
// radii. That last one was published in a commit message and a merged pull
// request, neither of which can be edited, and the correction of record is in
// `claude/state-of-play.md`. The figures were re-measured while writing this
// and did not match the correction either. `scripts/docs-check.mjs` bans test
// counts in the DOCS for exactly this reason; nothing bans them in the CODE,
// so the rule is kept by hand here. **State the invariant and let a test
// enforce it** — `tests/button-sweep.test.js` does, and unlike a number it
// cannot quietly go stale.
//
// PRESS IS NOT HANDLED HERE. `button:not(:disabled):active` in index.css
// already scales every button in the app, including these. Adding
// `active:scale-*` here as well would compose into a double transform.
//
// ⚠️ NOT A DESIGN SYSTEM, AND SOME `<button>`s ARE MEANT TO STAY RAW. The
// routing sweep deliberately left these alone — do not "finish the job" by
// forcing them through here:
//
//   - **Layout boxes.** FixtureRow, Roster's player row, Schedule's calendar
//     cells. A <button> used as a layout box inherits Chromium's UA
//     content-centring, which no jsdom test can see, and each of these already
//     carries an explicit layout that overrides it. See RESTORE.md.
//   - **Masthead chrome.** ViewAsSwitcher's trigger, persona rows and exit
//     pill live on dark chrome with different contrast rules.
//   - **Toggles and tabs.** Availability's and Register's segmented controls
//     and Login's mode tabs are `aria-pressed`/`role="tab"` controls whose
//     selected state IS their styling.
//   - **Text links.** "Forgot password?", "Show"/"Hide", "Reset my link",
//     "Show dismissed" — underlined type, not chrome.
//   - **Pills and icons.** TeamFilter, PlayerPicker's chips, RosterTable's
//     captain toggle and sort headers, Sheet's round close, Schedule's month
//     chevrons.

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
    'border-[1.5px] border-b-[3px] border-line bg-surface-card text-ink hover:border-brand hover:text-brand-ink btn-glow-soft',
  ghost: 'text-brand-ink hover:bg-surface-mute',

  // ── The destructive pair ────────────────────────────────────────────────
  //
  // ⚠️ THESE TWO ARE A PAIR AND THE ORDER OF EVENTS IS THE POINT.
  // `dangerQuiet` ARMS the action ("Delete"); `danger` CONFIRMS it ("Yes,
  // delete"). Never use `danger` for the first tap — a solid red button that
  // deletes on the first press is the whole reason the two-step inline
  // confirm exists (RESTORE.md: never a native `confirm()`).
  //
  // ⚠️ `danger` GOES DARKER-AT-REST AND LIGHTER ON HOVER, the opposite of
  // `primary`. That is not drift: it is how every hand-rolled confirm button
  // in this app was already written, and it is what stops the confirm reading
  // as the friendly default when it sits beside a `secondary` "Keep it".
  //
  // ⚠️ NO SWEEP AND NO BLOOM, for the reason the primary comment gives: a
  // glowing, sweeping "Yes, delete" pulls the eye toward the destructive
  // choice. The bottom edge uses `border-black/20` rather than a token —
  // `brand-deep` is already the darkest red in the palette, so there is no
  // next step down to name, and a flat darkening works on the fill it sits on
  // without inventing a colour.
  danger: 'bg-brand-deep text-white hover:bg-brand border-b-[3px] border-black/20',
  dangerQuiet:
    'border-[1.5px] border-b-[3px] border-line bg-surface-card text-danger-ink hover:bg-danger-bg',
}

// ⚠️ 8px FOR BUTTONS, 11px FOR SURFACES — AND BOTH ARE CORRECT.
//
// This comment used to call the mismatch temporary, on the theory that
// `rounded-[11px]` was a drifting button radius that would disappear once the
// hand-rolled buttons were routed through here. **It was not, and it will
// not.** Re-measured 10 Aug 2026: the overwhelming majority of `rounded-[11px]`
// occurrences are not buttons at all — they are alerts, inputs, panels and
// cards. `rounded-[11px]` is the app's general SURFACE radius, used correctly
// and consistently, and it stays.
//
// So the two radii sitting side by side are not a receipt for unfinished work.
// They are the button radius and the surface radius, and they are meant to
// differ: a control you press should not have the same corner as the card it
// sits on. `rounded-btn` is the token — change it here, not at a call site.
const SIZES = {
  // ⚠️ py-3, not py-2.5. This app is used standing on a pitch, one-handed,
  // often wet; 44px is the floor and the old size sat under it.
  md: 'rounded-btn px-4 py-3 text-sm',
  // py-2.5, not py-2: sm measured ~33px tall and it fronts the approval
  // queue's actions (2 Sep 2026 UX review, item 5). Still short of 44 on
  // purpose — sm sits in dense rows where a full-height button would wrap.
  sm: 'rounded-[6px] px-3 py-2.5 text-[13px]',
  // For the full-width submit at the foot of a form, which was 15px type
  // everywhere it was hand-rolled. Routing those to `md` would have quietly
  // shrunk the most important button on the screen.
  lg: 'rounded-btn px-4 py-3 text-[15px]',
}

// The variants that paint white type on a solid red fill. Used only by
// ArrowBadge, and kept beside the variants so the two cannot drift apart.
const SOLID_FILL = new Set(['primary', 'danger'])

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
        // On a solid red fill a white wash reads; on the white fill it would
        // be invisible, so the badge tints with the brand instead. Keyed on
        // "does this variant have a solid fill", not on the variant name —
        // adding `danger` to the list of names was the bug waiting to happen.
        SOLID_FILL.has(variant) ? 'bg-white/20' : 'bg-brand/10',
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
