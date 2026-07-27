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
    },
  },
  plugins: [],
}
