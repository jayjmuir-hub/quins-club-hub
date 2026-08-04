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
// Canonical brand values are lifted from the club website
// (adhquins-website-redesign): red #e11b22, green #3bd070, near-black #0c0c0e,
// panels #14151a/#151517, Anton + Barlow + Barlow Condensed.
//
// CONTRAST: every value used as text is measured against the surface it
// actually sits on, and the ratio is noted inline. The raw brand red and green
// are NOT AA-safe as small text on white (#e11b22 = 4.0:1, #3bd070 = 1.9:1),
// which is why `brand.ink` and `accent.ink` exist as the text-safe variants.
// Use `brand`/`accent` for fills and decoration, `*.ink` when it is type.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- surfaces: the light content well -------------------------------
        surface: {
          DEFAULT: '#eef0f3', // page background
          card: '#ffffff', // cards, sheets, dialogs
          sunk: '#e6e9ee', // hover / inset / pressed
          mute: '#f2f4f7', // very light fills, zebra rows
        },

        // --- type ------------------------------------------------------------
        ink: {
          DEFAULT: '#101116', // 16.51:1 on surface — primary text
          muted: '#565c67', //  5.89:1 on surface — labels, secondary
          // 4.84:1 on surface / 5.52:1 on card / 4.54:1 on sunk. The first
          // pass used #6f7681, which cleared 4.5:1 on white but only managed
          // 4.01:1 on the page background — caught by scripts/contrast-check.
          faint: '#636974', // tertiary, placeholders, row subtitles
          invert: '#ffffff', // type on brand/chrome fills
        },

        // --- hairlines --------------------------------------------------------
        line: {
          DEFAULT: '#dfe2e8',
          strong: '#ccd1da',
        },

        // --- brand red --------------------------------------------------------
        brand: {
          DEFAULT: '#e11b22', // 4.79:1 with white — the website's red. Fills.
          // Hover/pressed on a red fill goes DARKER, at 6.93:1 with white.
          // The old app went lighter on hover (#C21F32 -> #D62A3D); against
          // the new, brighter brand red any lighter hover lands under 4.5:1
          // (a #f0343a variant measured 3.99:1), so all 15 hover states now
          // resolve here instead. Darker-on-hover is also the conventional
          // affordance — the old direction was the odd one out.
          deep: '#b3141a',
          ink: '#b3141a', //  6.93:1 on card — red AS TEXT. Never use DEFAULT.
          // Red as text on the DARK chrome — the light end of the ramp, since
          // brand.ink would be near-invisible there. 7.73:1 on the role pill's
          // composited fill (bg-brand/20 over #0c0c0e = #370f12), 8.91:1 on
          // flat chrome.
          onDark: '#ff8f8f',
        },

        // --- brand green ------------------------------------------------------
        accent: {
          DEFAULT: '#3bd070', // the website's green. Decoration only on light.
          mid: '#1f9d4d', // icons, borders, medium-weight marks
          ink: '#157f3c', //  5.08:1 on card — green AS TEXT.
          bg: '#e6f7ec', // success surface
        },

        // --- dark chrome: masthead + bottom tab bar ---------------------------
        // The A+ move. Identity lives on the chrome so the data surfaces can
        // stay light and readable pitch-side in daylight.
        chrome: {
          DEFAULT: '#0c0c0e',
          raised: '#151517',
          ink: '#ffffff',
          muted: '#8b9099', // 6.09:1 on chrome — idle tab labels
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
        'brand-rule': 'linear-gradient(90deg,#e11b22,#3bd070)',
        // The stat band. NOTE the green stop is #157f3c, not #3bd070 — white
        // text on the raw green end measures 2.01:1, a hard AA failure. This
        // formulation holds >=4.79:1 across the band's full width. The vivid
        // green still appears, as the `brand-rule` hairline above the band.
        'stat-band': 'linear-gradient(90deg,#e11b22 0%,#c23a30 52%,#157f3c 100%)',
        // Masthead + hero fills.
        'chrome-grad': 'linear-gradient(180deg,#151517,#0c0c0e)',
        'hero-grad': 'linear-gradient(135deg,#b3141a,#e11b22)',
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
        'brand-glow': '0 6px 20px rgba(225,27,34,.42)',
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
