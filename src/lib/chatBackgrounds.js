// Chat backgrounds — five photo papers, Jay 25 Aug 2026.
// The club doodle is the default on every chat (DM, group, squad/channel,
// club, floating dock) unless they pick another — Jay, 26 Aug 2026, when the
// wallpaper also stopped being device-level (below). Retired stored keys
// (plain, green, warm, hoops, maroon, sky, rose, slate, club, dawn, pitch,
// pitchlines, balls, shield, and any unknown) fall back to the doodle. There
// is no plain preset.
//
// The round-3 rulings that still hold: USER-CHOOSABLE PRESETS, no uploads —
// nothing a member posts can become someone else's wallpaper. ⚠️ SINCE 26 Aug
// 2026 THE CHOICE IS PER-CHAT AND PER-PERSON, IN THE DATABASE, NOT PER-DEVICE:
// `chat_prefs.background`, keyed by the same chat_key as pins and archive
// (src/data/chatPrefs.js), so a pick follows the person to every device but
// stays invisible to the other side of the chat. The old device-level
// localStorage key (`chat-background`) is retired unread — the feature was a
// day old and Jay redefined it before anyone leaned on it.
//
// Each paper is a covered, centered JPEG washed toward the theme surface via
// `--surface-rgb` (not a hardcoded grey), so dark mode stays dark and light
// stays light without per-theme variants.
//
// ⚠️ WHERE THE STYLE GOES MATTERS (26 Aug 2026): `cover` on the growing
// message stream stretched the photo over the whole thread height, so long
// chats went blurry. Both threads now paint it on a sticky, viewport-height
// layer (see DmThread.jsx), so `cover` always resolves against a screen-
// sized box. The picker's swatch tiles still use these styles directly —
// a 64px tile is its own box and covers crisply.

export const DEFAULT_BACKGROUND = 'doodle'

function paper(key, veil) {
  return {
    backgroundImage: `linear-gradient(rgb(var(--surface-rgb) / ${veil}), rgb(var(--surface-rgb) / ${veil})), url(/chat-backgrounds/${key}.jpg)`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
}

// Picker order is the array order. The doodle is the default; it is not first.
export const BACKGROUND_PRESETS = [
  { key: 'harlequin', label: 'Harlequin (kit diamonds + crest bat)', style: paper('harlequin', '0.50') },
  { key: 'dusk', label: 'Dusk (Zayed dusk photo)', style: paper('dusk', '0.42') },
  { key: 'crest', label: 'Crest (cream paper, faded shield)', style: paper('crest', '0.22') },
  { key: 'doodle', label: 'Club doodle (DEFAULT; lighter than the others)', style: paper('doodle', '0.46') },
  { key: 'kit', label: 'Kit (green/red hoop fabric)', style: paper('kit', '0.52') },
]

const KNOWN = new Set(BACKGROUND_PRESETS.map((p) => p.key))

/** A stored key, sanitised: unknown/retired keys become the doodle. */
export function resolveBackground(key) {
  return KNOWN.has(key) ? key : DEFAULT_BACKGROUND
}

/** The style object for a preset key — unknown/retired keys paint the doodle. */
export function backgroundStyle(key) {
  const resolved = resolveBackground(key)
  return BACKGROUND_PRESETS.find((p) => p.key === resolved).style
}
