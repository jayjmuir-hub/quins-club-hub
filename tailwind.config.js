/** @type {import('tailwindcss').Config} */

// THEME: adhjrt brand system, "A+" variant — light content well, dark brand
// chrome. See claude/specs/design-system.md §2 for the full rationale.
//
// Every colour in the app resolves through one of the semantic groups below.
// Components must never carry a raw hex (no `bg-[#f5f4f3]`) — that was the
// pre-retheme state, 288 hex literals across 39 files, and it made a theme
// change a 20-file archaeology exercise. The rule now: if you need a colour,
// it has a name here, or it doesn't go in.
//
// Canonical brand values are lifted from the club website. RE-POINTED 6 Aug
// 2026 at the current redesign (abudhabiquinspreview.xyz), which moved off the
// values the previous one used (red #e11b22, green #3bd070, near-black
// #0c0c0e). Read off the live site's computed CSS custom properties, not
// sampled from a screenshot.
//
// ⚠️ THE SITE HAS TWO REDS AND THE DIFFERENCE MATTERS.
//   light mode  --primary: #c8102e
//   dark mode   --primary: #ff2d4a
// #ff2d4a is the one you see on the homepage, and it is the WRONG one for this
// app's light surfaces: white text on it measures 3.67:1, a hard AA failure,
// and it would have landed on every primary button in the app. It is correct
// only against near-black, where it makes 5.40:1 — so it lives on `brand.onDark`
// and nowhere else.
//
// #c8102e is a straight improvement on the #e11b22 it replaces: 5.88:1 with
// white vs 4.79:1. It is also now AA as text in its own right, so `brand.ink`
// no longer needs to be a separate darker value.
//
// Greys moved from blue-tinted (#eef0f3) to the site's neutral family
// (#f3f3f3 / #e5e5e5). Typography is deliberately NOT changed here — the site
// uses Inter throughout, this app uses Anton + Barlow + Barlow Condensed, and
// swapping them changes text WIDTH on every nav item, button and title. That
// is a separate, sweep-the-whole-app job.
//
// ⚠️ scripts/contrast-check.mjs keeps its own copy of these values. Change one,
// change both, and run `node scripts/contrast-check.mjs`.
//
// CONTRAST: every value used as text is measured against the surface it
// actually sits on, and the ratio is noted inline. The raw brand green is
// still NOT AA-safe as small text on white (#2a9d55 = 3.5:1), which is why
// `accent.ink` exists. Use `accent` for fills and decoration, `accent.ink`
// when it is type. The red no longer needs that split, but `brand.ink` is
// kept as a name so the ~40 call sites do not all have to change.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- surfaces: the light content well -------------------------------
        // The club site's page is pure #ffffff and separates its cards with a
        // 1px #e5e5e5 border alone. This app keeps a tinted well because it
        // stacks far more cards than a marketing page does, and white-on-white
        // would leave a screen of hairlines. The tint moved from blue-grey to
        // the site's NEUTRAL grey family, which is most of the visual match.
        surface: {
          DEFAULT: '#f3f3f3', // page background — the site's --muted
          card: '#ffffff', // cards, sheets, dialogs
          // #ebebeb, not #e8e8e8: at #e8e8e8 the tertiary-text pair measured
          // 4.51:1, which clears AA by 0.01 and would fail on any later nudge.
          sunk: '#ebebeb', // hover / inset / pressed
          mute: '#f7f7f7', // very light fills, zebra rows
        },

        // --- type ------------------------------------------------------------
        // Unchanged by the re-point — these were measured against the greys
        // and still clear AA on the new ones (re-verified, see below).
        ink: {
          DEFAULT: '#101116', // 16.99:1 on surface — primary text
          muted: '#565c67', //  6.06:1 on surface — labels, secondary
          // 4.98:1 on surface / 5.52:1 on card / 4.63:1 on sunk. The first
          // pass used #6f7681, which cleared 4.5:1 on white but only managed
          // 4.01:1 on the page background — caught by scripts/contrast-check.
          faint: '#636974', // tertiary, placeholders, row subtitles
          invert: '#ffffff', // type on brand/chrome fills
        },

        // --- hairlines --------------------------------------------------------
        // The site's border token exactly. Its cards are white with this
        // hairline and a 16px radius — which is already what Card.jsx renders.
        line: {
          DEFAULT: '#e5e5e5',
          strong: '#d4d4d4',
        },

        // --- brand red --------------------------------------------------------
        brand: {
          DEFAULT: '#c8102e', // 5.88:1 with white — the site's LIGHT-mode red.
          // Hover/pressed on a red fill goes DARKER, at 7.95:1 with white.
          // Darker-on-hover is the conventional affordance; the pre-retheme
          // app went lighter, which was the odd one out.
          deep: '#a30d25',
          // Kept as a name, but no longer a different colour: #c8102e is
          // itself AA as text (5.88:1 on card, 5.30:1 on the page). The old
          // split existed because #e11b22 was not.
          ink: '#c8102e',
          // Red as text on the DARK chrome. This is the site's own dark-mode
          // red — 5.40:1 on flat chrome, 4.85:1 on the role pill's composited
          // fill (bg-brand/20 over #0a0a0a = #300b11). The previous value was
          // a washed-out pink (#ff8f8f) invented to clear contrast against the
          // old red; the site supplies a real one, so use it.
          onDark: '#ff2d4a',
        },

        // --- brand green ------------------------------------------------------
        accent: {
          DEFAULT: '#2a9d55', // the site's green. Decoration only on light.
          mid: '#1f9d4d', // icons, borders, medium-weight marks (3.51:1)
          ink: '#157f3c', //  5.08:1 on card — green AS TEXT.
          bg: '#e6f7ec', // success surface
          // ⚠️ THERE IS DELIBERATELY NO accent.onDark, AND THE ATTEMPT TO ADD
          // ONE IS WORTH RECORDING. On 12 Aug 2026 the club website's own "App"
          // link was sampled to make one — #3bd070, a lovely 9.84:1 on the
          // chrome — and tests/press-feedback.test.js failed the build. That
          // hex is the RETIRED green: the site those values came from still
          // runs the pre-6-Aug palette, so sampling it re-imported a colour
          // this repo had already replaced, and the guard exists precisely
          // because a retired brand colour looks correct to everyone who did
          // not do the re-point.
          //
          // The masthead's App link uses accent.DEFAULT instead — 5.71:1 on
          // flat chrome, a comfortable AA pass as text. If a lighter green is
          // ever genuinely wanted there, it must come from the CURRENT site's
          // dark mode the way brand.onDark did, not from the old one and not
          // invented here.
        },

        // --- dark chrome: masthead + bottom tab bar ---------------------------
        // The A+ move. Identity lives on the chrome so the data surfaces can
        // stay light and readable pitch-side in daylight.
        chrome: {
          DEFAULT: '#0a0a0a', // the site's --background
          raised: '#121212', // the site's dark --card
          ink: '#ffffff',
          muted: '#8b9099', // 6.17:1 on chrome — idle tab labels
        },

        // --- states -----------------------------------------------------------
        danger: { DEFAULT: '#c2352c', bg: '#fdeceb' },
        warn: { DEFAULT: '#c98a12', ink: '#8a5a12', bg: '#fdf3e0' },
        info: { DEFAULT: '#2f5fa8', bg: '#e9f1fb' },

        // ⚠️ NOT PART OF THIS APP'S PALETTE, AND MUST NOT BE USED AS ONE.
        // Rugby Club Management prints its Official Match Result Sheet with red
        // headings, and src/screens/MatchSheet.jsx reproduces that form as a
        // facsimile which gets photographed and sent to RCM. This is THEIR
        // brand colour on THEIR document, named here only because
        // tests/theme.test.js rightly refuses a raw hex in an arbitrary value.
        // ⚠️ Its contrast is not this design system's business and has not been
        // measured against our surfaces — it is only ever black-on-white
        // facsimile chrome. Do not reach for it for an app-side accent.
        rcm: '#c00000',
      },

      // ONE FAMILY NOW. The club redesign uses Inter throughout, and as of
      // 6 Aug 2026 so does this app — Anton, Barlow and Barlow Condensed are
      // gone, and their seven woff2 files with them.
      //
      // The three names are KEPT rather than collapsed to one. ~200 call sites
      // say `font-display` or `font-condensed`, and those names still carry
      // meaning: they mark which type is a title and which is a label, and
      // src/index.css hangs the weight and tracking for each off them. Merging
      // them into `font-sans` would have meant editing every one of those call
      // sites to re-add weights by hand, and losing the distinction.
      //
      // ⚠️ WIDTH. Barlow Condensed was CONDENSED and Inter is not. Measured in
      // a real browser at 700: 'HARLEQUINS' is 177px in Barlow Condensed and
      // 233px in Barlow — Inter is wider still. Every nav item, button label,
      // eyebrow and column header therefore takes more horizontal room than it
      // did. That is the real cost of this change and it is why it needed a
      // pass over every screen at both breakpoints, not just a config edit.
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Titles and stat numerals. Weight comes from .font-display in
        // src/index.css (900) — do not add font-bold at the call site.
        display: ['Inter', 'system-ui', 'sans-serif'],
        // Nav, buttons, eyebrows, stat labels. No longer literally condensed;
        // the callers' uppercase + letter-spacing still make it read as a
        // label rather than body copy.
        condensed: ['Inter', 'system-ui', 'sans-serif'],
      },

      backgroundImage: {
        // The website's signature red -> green gradient hairline. Decorative
        // only; no text ever sits on it, so full-saturation green is safe here.
        'brand-rule': 'linear-gradient(90deg,#c8102e,#2a9d55)',
        // The stat band. NOTE the green stop is #157f3c, not the brand green —
        // white text on raw #2a9d55 measures 3.47:1, an AA failure. This
        // formulation holds >=5.08:1 across the band's full width. The vivid
        // green still appears, as the `brand-rule` hairline above the band.
        'stat-band': 'linear-gradient(90deg,#c8102e 0%,#a83a30 52%,#157f3c 100%)',
        // Masthead + hero fills.
        'chrome-grad': 'linear-gradient(180deg,#121212,#0a0a0a)',
        'hero-grad': 'linear-gradient(135deg,#a30d25,#c8102e)',
        // The squad-contact monogram tiles (15 Aug 2026). Two of the club's
        // fifteen staff have a photo, so the initials tile is the ORDINARY
        // rendering of that block and has to look designed rather than blank.
        // One gradient per role — the role is written in words in the pill on
        // the same tile, so the colour repeats it rather than carrying it.
        //
        // ⚠️ THEY LIVE HERE RATHER THAN AS `to-[#7d0a1c]` AT THE CALL SITE, AND
        // tests/theme.test.js IS WHY — it refuses a raw hex inside a Tailwind
        // arbitrary value, and it caught exactly that on the first version of
        // SquadStaffCard.jsx. The rule is right: a hex in JSX is a colour no
        // contrast sweep can find and no re-theme can follow.
        //
        // Decorative fills with white text over a scrim, not text colours.
        'monogram-coach': 'linear-gradient(150deg,#a30d25,#c8102e 60%,#7d0a1c)',
        'monogram-manager': 'linear-gradient(150deg,#2b2b2b,#121212 60%,#0a0a0a)',
        'monogram-medic': 'linear-gradient(150deg,#157f3c,#2a9d55 60%,#0f6b31)',
      },

      boxShadow: {
        // ⚠️ TWO SHADOWS, NOT ONE, AND THAT IS THE WHOLE CHANGE (12 Aug 2026).
        // This was `0 6px 24px rgba(16,17,22,.10)` — the prototype's single
        // `--shadow`, faithfully ported. One wide soft shadow is what makes a
        // card look like a rectangle with a grey blur under it: there is
        // nothing holding the card to the page, so the edge floats and the
        // whole surface reads slightly muddy.
        //
        // The pair is how real elevation works. A tight, nearly-opaque CONTACT
        // shadow (1px, 6%) grounds the bottom edge and keeps it crisp; a wide,
        // offset AMBIENT one (20px, blurred up and away with a negative spread)
        // does the depth. Same colour, same total weight — this is not "more
        // shadow", it is the same amount of ink placed where it does work.
        //
        // ⚠️ THE SPEC RECORDS THE PROTOTYPE'S VALUE AND IS NOW DELIBERATELY
        // DIVERGED FROM. claude/specs/design-system.md §3 says so; it is a
        // record of what the prototype did, not a contract this app cannot
        // improve on.
        card: '0 1px 2px rgba(16,17,22,.06), 0 6px 20px -4px rgba(16,17,22,.10)',
        // The lifted state for a card you can actually click. Deliberately a
        // LIFT — the offset and blur both grow — rather than just a darker
        // shadow, because a card that only darkens reads as pressed, which is
        // the opposite of what a hover should say.
        //
        // ⚠️ HOVER IS A DESKTOP-ONLY AFFORDANCE and this app is used pitch-side
        // on a phone, where it will never fire. That is fine here and would not
        // be if it were the only signal: every clickable card in this app is
        // also a real <button> or <a> with a focus ring.
        'card-hover': '0 2px 4px rgba(16,17,22,.07), 0 14px 30px -8px rgba(16,17,22,.16)',
        // The same lift PLUS the brand hairline, for a card that is itself a
        // link. Replaces the portal chooser's old
        // `hover:shadow-[0_0_0_1px_…brand]`, which set the ONLY shadow and so
        // FLATTENED the card on hover — losing every bit of elevation at the
        // exact moment the card is meant to look reachable, which reads as
        // pressed rather than inviting.
        'card-ring':
          '0 0 0 1px rgba(200,16,46,1), 0 2px 4px rgba(16,17,22,.07), 0 14px 30px -8px rgba(16,17,22,.16)',
        // NB: named `masthead`, not `chrome`. `chrome` is also a colour key
        // above, and Tailwind resolves `shadow-chrome` against BOTH the
        // boxShadow scale and the shadow-colour scale — the colour wins, and
        // you silently get a shadow *colour* with no shadow. Any boxShadow
        // key must not collide with a colour key.
        masthead: '0 2px 18px rgba(0,0,0,.45)',
        tabbar: '0 -4px 22px rgba(0,0,0,.35)',
        'brand-glow': '0 6px 20px rgba(200,16,46,.42)',
      },

      borderRadius: {
        // The website's radii: pills at 100px, buttons ~11px, cards 16px.
        pill: '100px',
        btn: '8px', // Touchline, 10 Aug 2026. Was 11px. See src/components/Button.jsx.
        // Tab groups. Jay, 11 Aug 2026: "like the tabs on the adhjrt.com
        // website". MEASURED off the live age-group tabs there rather than
        // guessed — border-radius 12px, 0.8px border, white fill when inactive
        // and the club red when active.
        //
        // ⚠️ 12px IS DELIBERATELY NOT `btn` (8px) OR `card` (16px). A tab is
        // neither: it is softer than a control you press and tighter than the
        // surface it sits on, which is exactly how adhjrt.com draws it. Reusing
        // `btn` here would make the tab row read as a row of buttons, which is
        // the thing that prompted the change.
        tab: '12px',
        card: '16px',
      },

      screens: {
        // The prototype's single responsive breakpoint (design-system.md
        // §5): below it is mobile (bottom tab bar, FAB, bottom sheet), at/
        // above it is desktop (top nav, no FAB, centered dialog).
        desktop: '820px',

        // Second stop, added with the desktop roster work (desktop-spec.md
        // §4). `desktop` covers "not a phone" — tablets and small laptops —
        // and keeps a reduced column set. `wide` is the line for "there is a
        // mouse and a big screen", where full tables, the availability matrix
        // and side-by-side detail panes are appropriate.
        //
        // 1280 rather than 1024 deliberately: a landscape iPad is 1024px and
        // is still a touch device with no hover and fat targets. Giving it a
        // dense table designed for a cursor would be worse than the card list
        // it already gets.
        wide: '1280px',
      },

      // Sheet's (src/components/Sheet.jsx) enter animation (design-system.md
      // §4.16). Implemented as a keyframe `animation`, not a `transition`,
      // because Sheet renders nothing at all when closed (task-9 brief) —
      // there's no "before" DOM state to transition from, only a mount
      // event. A CSS animation plays automatically on element insertion,
      // same technique the prototype itself uses for its view fade-in (see
      // design-system.md §6: "the .25s ease fade-in keyframe plays
      // automatically because the newly-active section re-triggers its CSS
      // animation").
      keyframes: {
        sheetSlideUp: {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        // Ports design-system.md §4.16's desktop entrance exactly:
        // `translate(-50%,-46%) scale(.98) opacity:0` -> `translate(-50%,
        // -50%) scale(1) opacity:1` — a fade + scale-up + slight vertical
        // "settle". The -46%/-50% pair is a translateY *relative to the
        // panel's own height* (CSS transform percentages are relative to
        // the element's own box), so translating that literally onto a
        // flex-centered layout (no translate(-50%,-50%) needed for
        // centering here) means the settle is just the -4% delta between
        // them: translateY(-4%) -> translateY(0).
        sheetScaleIn: {
          from: { transform: 'scale(.98) translateY(-4%)', opacity: '0' },
          to: { transform: 'scale(1) translateY(0)', opacity: '1' },
        },
        scrimFadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },

        // ── Redesign, 13 Aug 2026 ──────────────────────────────────────────
        // ⚠️ TRANSFORM AND OPACITY ONLY, EVERY ONE OF THEM. Those two are the
        // properties a browser can hand to the compositor; animating width,
        // top or box-shadow forces layout or paint on every frame, and this
        // app is used on a mid-range Android at the side of a pitch.

        // Rows arriving. A list that fades up in sequence reads as FILLING;
        // the same list appearing at once reads as a flash, and on a slow
        // connection as a glitch.
        riseIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        // The skeleton sweep. A spinner says "wait"; a skeleton in the shape
        // of what is coming says "nearly there", and it stops the page height
        // collapsing and rebounding when the data lands.
        shimmer: {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(100%)' },
        },
        // The live dot on the next fixture. Deliberately slow — 2.2s — because
        // a fast pulse next to text is an accessibility problem, not a flourish.
        livePulse: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '.45', transform: 'scale(.82)' },
        },
      },
      animation: {
        'sheet-slide-up': 'sheetSlideUp .28s cubic-bezier(.32,.72,0,1)',
        'sheet-scale-in': 'sheetScaleIn .2s ease-out',
        'scrim-fade-in': 'scrimFadeIn .2s ease',
        // ⚠️ `both` MATTERS ON THE STAGGERED ONE. Rows carry a delay, and
        // without `backwards` they paint at full opacity for that delay and
        // THEN jump to opacity 0 to start — a visible flicker that gets worse
        // the further down the list you look.
        'rise-in': 'riseIn .4s cubic-bezier(.22,.61,.36,1) both',
        shimmer: 'shimmer 1.4s ease-in-out infinite',
        'live-pulse': 'livePulse 2.2s cubic-bezier(.22,.61,.36,1) infinite',
      },
      transitionTimingFunction: {
        // The house curve: decelerating, so things arrive softly and leave
        // quickly. Used for every lift, slide and reveal in the redesign.
        club: 'cubic-bezier(.22,.61,.36,1)',
      },
    },
  },
  plugins: [],
}
