// Chat backgrounds — round 3, Jay: "we need chat backgrounds instead of
// just white or black". Ruled with him: USER-CHOOSABLE PRESETS, no uploads
// — nothing a member posts can become someone else's wallpaper. The choice
// is device-level, like chat-enter-sends: wallpaper belongs to the screen
// in front of you.
//
// Every preset is a low-alpha overlay painted OVER the theme surface, so
// dark mode stays dark and light stays light without per-theme variants.

const KEY = 'chat-background'

// The doodle: club-shaped marks (rugby balls, a whistle-ish circle, pitch
// hash marks) as one repeating SVG tile, ~6% ink. Inline data URI — ships
// in the bundle, no request, no asset store.
const DOODLE = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='none' stroke='%23808080' stroke-opacity='.14' stroke-width='2'><ellipse cx='24' cy='22' rx='14' ry='8' transform='rotate(-24 24 22)'/><path d='M18 24l12-5' stroke-linecap='round'/><circle cx='88' cy='34' r='9'/><path d='M84 30l8 8M92 30l-8 8' stroke-linecap='round'/><ellipse cx='96' cy='94' rx='14' ry='8' transform='rotate(20 96 94)'/><path d='M30 88h16M34 96h8' stroke-linecap='round'/><path d='M58 56l10 6-10 6z'/></g></svg>`,
)}")`

export const BACKGROUND_PRESETS = [
  { key: 'plain', label: 'Plain', style: null },
  { key: 'doodle', label: 'Club doodle', style: { backgroundImage: DOODLE } },
  {
    key: 'green',
    label: 'Green wash',
    style: { backgroundImage: 'linear-gradient(180deg, rgb(42 157 85 / .10), rgb(42 157 85 / .04))' },
  },
  {
    key: 'warm',
    label: 'Warm wash',
    style: { backgroundImage: 'linear-gradient(180deg, rgb(201 138 18 / .10), rgb(201 138 18 / .04))' },
  },
]

export function getChatBackground() {
  try {
    const key = localStorage.getItem(KEY)
    return BACKGROUND_PRESETS.some((p) => p.key === key) ? key : 'plain'
  } catch {
    return 'plain'
  }
}

export function setChatBackground(key) {
  try {
    localStorage.setItem(KEY, key)
  } catch {
    // private-mode storage failures: the wallpaper just stays per-session
  }
}

/** The style object for a preset key — null for plain/unknown. */
export function backgroundStyle(key) {
  return BACKGROUND_PRESETS.find((p) => p.key === key)?.style ?? null
}
