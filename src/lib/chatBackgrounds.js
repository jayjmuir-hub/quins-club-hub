// Chat backgrounds — round 3, Jay: "we need chat backgrounds instead of
// just white or black"; grown into a gallery on 25 Aug 2026, Jay: "we need
// better chat backgrounds", ruled down to "too few choices"
// (claude/plans/2026-08-25-chat-wallpapers-and-dm-order.md). The round-3
// rulings survive intact: USER-CHOOSABLE PRESETS, no uploads — nothing a
// member posts can become someone else's wallpaper. The choice is
// device-level, like chat-enter-sends: wallpaper belongs to the screen in
// front of you, and to EVERY chat on it.
//
// Every preset is a low-alpha overlay painted OVER the theme surface, so
// dark mode stays dark and light stays light without per-theme variants.
// Inline data URIs only — ships in the bundle, no request, no asset store.
// The crest watermark is DRAWN (a shield with quarters), not the crest PNG
// embedded: a data-URI PNG would bloat the bundle for a watermark.

const KEY = 'chat-background'

function tile(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

// The doodle: club-shaped marks (rugby balls, a whistle-ish circle, pitch
// hash marks) as one repeating SVG tile.
const DOODLE = tile(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='none' stroke='#808080' stroke-opacity='.14' stroke-width='2'><ellipse cx='24' cy='22' rx='14' ry='8' transform='rotate(-24 24 22)'/><path d='M18 24l12-5' stroke-linecap='round'/><circle cx='88' cy='34' r='9'/><path d='M84 30l8 8M92 30l-8 8' stroke-linecap='round'/><ellipse cx='96' cy='94' rx='14' ry='8' transform='rotate(20 96 94)'/><path d='M30 88h16M34 96h8' stroke-linecap='round'/><path d='M58 56l10 6-10 6z'/></g></svg>`,
)

// A pitch seen from above: touchline, hash marks, the halfway circle.
const PITCH_LINES = tile(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'><g fill='none' stroke='#808080' stroke-opacity='.16' stroke-width='2'><path d='M0 40h160M0 120h160'/><circle cx='80' cy='80' r='22'/><path d='M20 36v8M60 36v8M100 36v8M140 36v8M20 116v8M60 116v8M100 116v8M140 116v8' stroke-linecap='round'/></g></svg>`,
)

// The harlequin quarters as diagonal hoops — the masthead's motif, quiet.
const HOOPS = tile(
  `<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'><g fill-opacity='.09'><path d='M-8 44 44-8h20L-8 64Z' fill='#2a9d55'/><path d='M28 80 80 28v20L48 80Z' fill='#802030'/></g></svg>`,
)

// Match balls, scattered.
const BALLS = tile(
  `<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'><g fill='none' stroke='#808080' stroke-opacity='.16' stroke-width='2'><ellipse cx='34' cy='30' rx='16' ry='9' transform='rotate(-22 34 30)'/><path d='M27 33l14-6' stroke-linecap='round'/><ellipse cx='104' cy='96' rx='16' ry='9' transform='rotate(18 104 96)'/><path d='M97 98l14 -4' stroke-linecap='round'/><ellipse cx='110' cy='26' rx='11' ry='6' transform='rotate(-40 110 26)'/></g></svg>`,
)

// The masthead's diagonal shapes, large and sparse.
const HARLEQUIN = tile(
  `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 220 220'><g fill-opacity='.07'><path d='M140 0h44L64 120H20Z' fill='#2a9d55'/><path d='M220 76v44L96 220H52Z' fill='#802030'/></g></svg>`,
)

// A drawn shield with quarters — crest-shaped, not the crest itself.
const SHIELD = tile(
  `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='220' viewBox='0 0 200 220'><g stroke='#808080' stroke-opacity='.13' stroke-width='2.5' fill='none'><path d='M100 30l52 14v52c0 34-20 58-52 74-32-16-52-40-52-74V44Z'/><path d='M100 30v140M48 96h104'/></g></svg>`,
)

const flat = (rgb) => ({ backgroundImage: `linear-gradient(${rgb}, ${rgb})` })

export const BACKGROUND_PRESETS = [
  // ── Colours ──────────────────────────────────────────────────────────
  { key: 'plain', label: 'Plain', group: 'colour', style: null },
  { key: 'green', label: 'Green', group: 'colour', style: flat('rgb(42 157 85 / .10)') },
  { key: 'maroon', label: 'Maroon', group: 'colour', style: flat('rgb(128 32 48 / .10)') },
  { key: 'sky', label: 'Sky', group: 'colour', style: flat('rgb(56 130 210 / .10)') },
  // ⚠️ The key stays `warm` — it was the round-3 warm wash, and a stored
  // choice must not reset because a label improved.
  { key: 'warm', label: 'Sand', group: 'colour', style: flat('rgb(201 138 18 / .10)') },
  { key: 'rose', label: 'Rose', group: 'colour', style: flat('rgb(196 84 120 / .10)') },
  { key: 'slate', label: 'Slate', group: 'colour', style: flat('rgb(100 116 139 / .12)') },
  // ── Gradients ────────────────────────────────────────────────────────
  {
    key: 'club',
    label: 'Club colours',
    group: 'gradient',
    style: { backgroundImage: 'linear-gradient(135deg, rgb(42 157 85 / .14), rgb(128 32 48 / .12))' },
  },
  {
    key: 'dawn',
    label: 'Dawn',
    group: 'gradient',
    style: { backgroundImage: 'linear-gradient(180deg, rgb(244 114 89 / .14), rgb(250 204 21 / .06))' },
  },
  {
    key: 'dusk',
    label: 'Dusk',
    group: 'gradient',
    style: { backgroundImage: 'linear-gradient(180deg, rgb(79 70 229 / .14), rgb(100 116 139 / .06))' },
  },
  {
    key: 'pitch',
    label: 'Pitch green',
    group: 'gradient',
    style: { backgroundImage: 'linear-gradient(180deg, rgb(21 94 53 / .16), rgb(21 94 53 / .05))' },
  },
  // ── Patterns ─────────────────────────────────────────────────────────
  { key: 'doodle', label: 'Club doodle', group: 'pattern', style: { backgroundImage: DOODLE } },
  { key: 'pitchlines', label: 'Pitch lines', group: 'pattern', style: { backgroundImage: PITCH_LINES } },
  { key: 'hoops', label: 'Hoops', group: 'pattern', style: { backgroundImage: HOOPS } },
  { key: 'balls', label: 'Match balls', group: 'pattern', style: { backgroundImage: BALLS } },
  // ── Club ─────────────────────────────────────────────────────────────
  { key: 'harlequin', label: 'Harlequins', group: 'club', style: { backgroundImage: HARLEQUIN } },
  { key: 'shield', label: 'Crest', group: 'club', style: { backgroundImage: SHIELD } },
]

/** Picker row order and labels — one entry per `group` value above. */
export const BACKGROUND_GROUPS = [
  { group: 'colour', label: 'Colours' },
  { group: 'gradient', label: 'Gradients' },
  { group: 'pattern', label: 'Patterns' },
  { group: 'club', label: 'Club' },
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
