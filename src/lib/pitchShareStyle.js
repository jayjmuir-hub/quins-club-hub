// The FIXED palette and the label rules for the pitch-layout picture, shared by
// its two renderers so they cannot drift.
//
// ⚠️ THERE ARE TWO RENDERERS ON PURPOSE, AND THIS FILE IS WHY THAT IS SAFE.
// The on-screen "visual representation" is the DOM card (src/components/
// PitchShareCard.jsx). The SHARED PNG is drawn natively on a <canvas>
// (src/lib/pitchShareCanvas.js) because html2canvas rendered the small squad
// codes as a row of dashes — a canvas draws crisp text at any scale. Two
// renderers of one layout is exactly the drift this codebase warns about, so
// the parts that carry MEANING — the colours and, more importantly, how a
// club-wide booking's free-text title is clipped versus a squad code — live
// here once and both import them. A colour or a clip rule changed in one place
// changes both pictures together.
//
// ⚠️ FIXED LIGHT PALETTE, NOT design-system TOKENS. The picture is sent to
// WhatsApp and must render the same on a phone, a desktop, and in a dark-themed
// browser; a token that flips in dark mode would put light text on the forced
// white background. It is a document, like the match sheet, not app chrome.
//
// ⚠️ COLOUR IS NEVER THE ONLY SIGNAL (design-system §accessibility; the club is
// mostly men and ~8% have a colour-vision deficiency). Every segment is named
// in text, every pitch carries its full/free/over status in words.

export const FIELD = ['#2f7d4f', '#3a8a5c'] // alternating greens for adjacent squads
export const OVER_FILL = '#c2410c' // amber-brown: an overloaded pitch, said in words too
export const SPARE_FILL = '#e6eaee'
export const BRAND = '#c8102e'
export const INK = '#15181c'
export const MUTED = '#5b626b'
export const LINE = '#e6e8eb'
export const WHITE = '#ffffff'

/** The status-pill colours — brand for full, green for spare, amber for over. */
export function statusChipColours({ over, spareFraction }) {
  const full = !over && spareFraction < 1e-9
  return over
    ? { bg: '#fbe4d8', fg: '#9a3412' }
    : full
      ? { bg: '#fbe1e6', fg: BRAND }
      : { bg: '#e2f0e8', fg: '#1f6b41' }
}

export const SAVED_NOTE_BG = '#f4f6f8'
export const SAVED_NOTE_TEXT =
  'These pitches are already saved to each squad’s training session — coaches and managers will ' +
  'see them on the session in Club Hub, so there’s nothing to add.'
export const FOOTER_TEXT = 'Abu Dhabi Harlequins RFC · generated from Club Hub'
export const HEADER_TEXT = 'CLUB HUB · Pitch Allocation'
export const WEEK_LEGEND_TEXT = 'Each bar is one pitch, split by squad. Segment width = portion (¼, ⅓, ½).'

/** The font stack both renderers use — kept identical so the two pictures match. */
export const FONT_STACK = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

/** The leading token of a squad name — "U12G QR" → "U12G" — for the tight week
 *  columns where the full name will not fit a quarter-width segment. */
export const shortSquad = (name) => String(name ?? '').split(/\s+/)[0] || name

/** A club-wide booking labels by its TITLE, which is free text and can be long.
 *  Cap it so it stays readable and cannot dominate a tight segment. */
export const clip = (name, max) => {
  const s = String(name ?? '').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

/** The label a segment shows: a squad code (clipped to its leading token on the
 *  tight week bars) or, for a club-wide booking, its capped title. `compact` is
 *  the week form. */
export const segLabel = (seg, compact) =>
  seg.clubWide ? clip(seg.squad, compact ? 16 : 30) : compact ? shortSquad(seg.squad) : seg.squad
