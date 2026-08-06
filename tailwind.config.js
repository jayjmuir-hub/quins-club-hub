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
      },

      fontFamily: {
        // Barlow is the workhorse: all body copy, form labels, table rows.
        sans: ['Barlow', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        // Anton is DISPLAY ONLY — screen titles, stat numerals, date chips.
        // It has no lowercase rhythm and .92 leading; it is wrong on anything
        // you have to read quickly. Do not put it on a form label.
        display: ['Anton', 'Impact', 'sans-serif'],
        // Barlow Condensed: nav, buttons, eyebrows, stat labels.
        // WARNING: only the 600 and 700 cuts are bundled (public/fonts). CSS
        // does not error on a missing weight — it quietly renders the next
        // family in the stack — so `font-condensed` WITHOUT font-semibold or
        // font-bold silently falls back to Barlow. Always pair the two.
        // Verified in a real browser: at 700, 'HARLEQUINS' measures 177px in
        // Barlow Condensed vs 233px in Barlow, so a regression is visible.
        condensed: ['Barlow Condensed', 'Barlow', 'sans-serif'],
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
      },

      boxShadow: {
        card: '0 6px 24px rgba(16,17,22,.10)',
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
        btn: '11px',
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
      },
      animation: {
        'sheet-slide-up': 'sheetSlideUp .28s cubic-bezier(.32,.72,0,1)',
        'sheet-scale-in': 'sheetScaleIn .2s ease-out',
        'scrim-fade-in': 'scrimFadeIn .2s ease',
      },
    },
  },
  plugins: [],
}
