/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        quinsRed: '#C21F32',
        quinsGreen: '#7DC351',
        quinsGreenSoft: '#87C97F',
        quinsRedDark: '#8E1526',
        quinsBlack: '#141414',
      },
      screens: {
        // The prototype's single responsive breakpoint (design-system.md
        // §5): below it is mobile (bottom tab bar, FAB, bottom sheet), at/
        // above it is desktop (top nav, no FAB, centered dialog).
        desktop: '820px',
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
