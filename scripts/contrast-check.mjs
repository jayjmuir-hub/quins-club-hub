// Contrast gate for the adhjrt theme. Checks every foreground/background pair
// the app actually renders, including the two gradients (sampled across their
// width, because a gradient's worst point is not at either stop).
//
// Run: node scripts/contrast-check.mjs      (exit 1 if anything fails)
//
// Thresholds are WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text
// (>=24px, or >=18.66px bold) and for non-text UI boundaries.
//
// This exists because the retheme invalidated every contrast number that was
// previously written into component comments by hand. Numbers in comments go
// stale silently; a script that fails the build does not.

// ⚠️ MIRRORS tailwind.config.js. Change one, change both. Re-pointed at the
// current club redesign (abudhabiquinspreview.xyz) on 6 Aug 2026.
const T = {
  surface: '#f3f3f3',
  surfaceCard: '#ffffff',
  surfaceSunk: '#ebebeb',
  surfaceMute: '#f7f7f7',
  ink: '#101116',
  inkMuted: '#565c67',
  inkFaint: '#636974',
  line: '#e5e5e5',
  brand: '#c8102e',
  brandDeep: '#a30d25',
  brandInk: '#c8102e',
  accent: '#2a9d55',
  accentMid: '#1f9d4d',
  accentInk: '#157f3c',
  accentBg: '#e6f7ec',
  chrome: '#0a0a0a',
  chromeRaised: '#121212',
  chromeMuted: '#8b9099',
  brandOnDark: '#ff2d4a',
  // bg-brand/20 composited over chrome — the role pill's real fill.
  // Recomputed for the new brand + chrome: mix(#0a0a0a, #c8102e, .2).
  rolePill: '#300b11',
  danger: '#c2352c',
  dangerBg: '#fdeceb',
  warn: '#c98a12',
  warnInk: '#8a5a12',
  warnBg: '#fdf3e0',
  info: '#2f5fa8',
  infoBg: '#e9f1fb',
  white: '#ffffff',
}

const lum = (h) => {
  const s = h.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
const mix = (a, b, t) => {
  const p = (h, i) => parseInt(h.replace('#', '').slice(i, i + 2), 16)
  return '#' + [0, 2, 4].map((i) =>
    Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('')
}

// [foreground, background, where it's used, minimum required]
const PAIRS = [
  [T.ink, T.surface, 'body text on page', 4.5],
  [T.ink, T.surfaceCard, 'body text on card', 4.5],
  [T.ink, T.surfaceMute, 'text on muted fill', 4.5],
  [T.ink, T.surfaceSunk, 'text on hover/inset row', 4.5],
  [T.inkMuted, T.surface, 'labels on page', 4.5],
  [T.inkMuted, T.surfaceCard, 'labels on card', 4.5],
  [T.inkMuted, T.surfaceMute, 'Chip/Badge neutral text', 4.5],
  [T.inkFaint, T.surfaceCard, 'secondary row text on card', 4.5],
  [T.inkFaint, T.surface, 'secondary text on page', 4.5],
  [T.brandInk, T.surfaceCard, 'red text/links on card', 4.5],
  [T.brandInk, T.surface, 'red text on page', 4.5],
  [T.brandInk, T.dangerBg, 'loss chip', 4.5],
  [T.accentInk, T.surfaceCard, 'green text on card', 4.5],
  [T.accentInk, T.accentBg, 'training / win chip', 4.5],
  [T.accentMid, T.surfaceCard, 'green icons & borders (non-text)', 3],
  [T.warnInk, T.warnBg, 'social chip / ScopeNote', 4.5],
  [T.warnInk, T.surfaceCard, 'warning text on card', 4.5],
  [T.danger, T.dangerBg, 'error text on error surface', 4.5],
  [T.danger, T.surfaceCard, 'error text on card', 4.5],
  [T.info, T.infoBg, 'info badge', 4.5],
  [T.white, T.brand, 'white on red fill (buttons, match chip)', 4.5],
  [T.white, T.brandDeep, 'white on hover/pressed red', 4.5],
  [T.inkFaint, T.surfaceMute, 'tertiary text on muted fill', 4.5],
  [T.inkFaint, T.surfaceSunk, 'tertiary text on hover row', 4.5],
  [T.white, T.chrome, 'masthead / tab bar text', 4.5],
  [T.white, T.chromeRaised, 'raised chrome text', 4.5],
  [T.chromeMuted, T.chrome, 'idle bottom-tab labels', 4.5],
  [T.brandOnDark, T.rolePill, 'role pill text on its composited fill', 4.5],
  [T.brandOnDark, T.chrome, 'red text on flat chrome', 4.5],
  // The App link in the masthead (12 Aug 2026). accent.DEFAULT on the flat
  // chrome — see the note in tailwind.config.js about why this is NOT the
  // brighter green the club site shows.
  [T.accent, T.chrome, 'green App link on flat chrome', 4.5],
  [T.line, T.surfaceCard, 'hairline vs card (non-text)', 1.2],
]

let failed = 0
console.log('PAIRS')
for (const [fg, bg, where, min] of PAIRS) {
  const r = ratio(fg, bg)
  const ok = r >= min
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (need ${min})  ${where}`)
}

// Gradients: sample across the full width. A band that passes at both stops can
// still fail in the middle, and vice versa.
const GRADIENTS = [
  ['stat-band', [[0, '#c8102e'], [0.52, '#a83a30'], [1, '#157f3c']], T.white, 4.5],
  ['hero-grad', [[0, '#a30d25'], [1, '#c8102e']], T.white, 4.5],
  ['chrome-grad', [[0, '#121212'], [1, '#0a0a0a']], T.white, 4.5],
]
console.log('\nGRADIENTS (sampled every 5%)')
for (const [name, stops, fg, min] of GRADIENTS) {
  let worst = Infinity
  let worstAt = 0
  for (let p = 0; p <= 1.0001; p += 0.05) {
    let col = stops[stops.length - 1][1]
    for (let i = 0; i < stops.length - 1; i++) {
      const [p0, c0] = stops[i]
      const [p1, c1] = stops[i + 1]
      if (p >= p0 && p <= p1) { col = mix(c0, c1, p1 === p0 ? 0 : (p - p0) / (p1 - p0)); break }
    }
    const r = ratio(fg, col)
    if (r < worst) { worst = r; worstAt = p }
  }
  const ok = worst >= min
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  worst ${worst.toFixed(2)}:1 at ${Math.round(worstAt * 100)}%  (need ${min})  ${name}`)
}

console.log(failed ? `\n${failed} FAILING PAIR(S)` : '\nall pairs pass AA')
process.exit(failed ? 1 : 0)
