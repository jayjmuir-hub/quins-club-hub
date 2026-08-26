// Chat backgrounds — five photo papers, Jay 25 Aug 2026.
// Crest letterhead is the default on every chat (DM, group, squad/channel,
// club, floating dock) unless they pick another. Retired stored keys
// (plain, green, warm, hoops, maroon, sky, rose, slate, club, dawn, pitch,
// pitchlines, balls, shield, and any unknown) fall back to crest. There is
// no plain preset.
//
// The round-3 rulings that still hold: USER-CHOOSABLE PRESETS, no uploads —
// nothing a member posts can become someone else's wallpaper. Device-level,
// localStorage key `chat-background`, one wallpaper for every chat on this
// screen. Each paper is a covered, centered JPEG washed toward the theme
// surface via `--surface-rgb` (not a hardcoded grey), so dark mode stays
// dark and light stays light without per-theme variants.
//
// ⚠️ WHERE THE STYLE GOES MATTERS (26 Aug 2026): `cover` on the growing
// message stream stretched the photo over the whole thread height, so long
// chats went blurry. Both threads now paint it on a sticky, viewport-height
// layer (see DmThread.jsx), so `cover` always resolves against a screen-
// sized box. The picker's swatch tiles still use these styles directly —
// a 64px tile is its own box and covers crisply.

const KEY = 'chat-background'
const DEFAULT_KEY = 'crest'

function paper(key, veil) {
  return {
    backgroundImage: `linear-gradient(rgb(var(--surface-rgb) / ${veil}), rgb(var(--surface-rgb) / ${veil})), url(/chat-backgrounds/${key}.jpg)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

// Picker order is the array order. Crest is the default; it is not first.
export const BACKGROUND_PRESETS = [
  { key: 'harlequin', label: 'Harlequin (kit diamonds + crest bat)', style: paper('harlequin', '0.50') },
  { key: 'dusk', label: 'Dusk (Zayed dusk photo)', style: paper('dusk', '0.42') },
  { key: 'crest', label: 'Crest (DEFAULT; cream paper, faded shield)', style: paper('crest', '0.22') },
  { key: 'doodle', label: 'Club doodle (lighter than the others)', style: paper('doodle', '0.46') },
  { key: 'kit', label: 'Kit (green/red hoop fabric)', style: paper('kit', '0.52') },
]

const KNOWN = new Set(BACKGROUND_PRESETS.map((p) => p.key))

function resolveKey(key) {
  return KNOWN.has(key) ? key : DEFAULT_KEY
}

export function getChatBackground() {
  try {
    return resolveKey(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_KEY
  }
}

export function setChatBackground(key) {
  try {
    localStorage.setItem(KEY, key)
  } catch {
    // private-mode storage failures: the wallpaper just stays per-session
  }
}

/** The style object for a preset key — unknown/retired keys paint crest. */
export function backgroundStyle(key) {
  const resolved = resolveKey(key)
  return BACKGROUND_PRESETS.find((p) => p.key === resolved).style
}
