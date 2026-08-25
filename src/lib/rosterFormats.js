// Format presets for the roster builder — one row per players-per-side value.
// claude/plans/2026-08-25-roster-builder-three-views.md.
//
// ⚠️ A GUIDE, NOT A GATE — the same standing rule as players_per_side itself.
// Position names are what gets written onto lineup_players.position for the
// slotted starters, and they are a convenience for the sheet, never a rule the
// app enforces. Age-grade position sets vary by union and by season; a coach
// who disagrees with a label ignores it and loses nothing.
//
// ⚠️ `pitch` COORDINATES ARE PERCENTAGES of the pitch SVG's width and height
// (x rightward, y downward, attacking toward the top). They only have to look
// right, and they are per-format because a 7s spread and a 15s scrum shape are
// different pictures, not a scaled version of one picture.
//
// ⚠️ 5-a-side HAS NO POSITION NAMES on purpose — minis tag is "five kids and a
// ball". Slots show the number alone; the pitch shows a plain spread.

const FIFTEEN_POSITIONS = [
  'Loosehead prop',
  'Hooker',
  'Tighthead prop',
  'Lock',
  'Lock',
  'Blindside flanker',
  'Openside flanker',
  'Number 8',
  'Scrum-half',
  'Fly-half',
  'Left wing',
  'Inside centre',
  'Outside centre',
  'Right wing',
  'Full-back',
]

export const ROSTER_FORMATS = {
  5: {
    perSide: 5,
    label: '5-a-side',
    positions: null,
    pitch: [
      { x: 22, y: 30 },
      { x: 50, y: 22 },
      { x: 78, y: 30 },
      { x: 36, y: 62 },
      { x: 64, y: 62 },
    ],
  },
  7: {
    perSide: 7,
    label: '7-a-side',
    positions: ['Prop', 'Hooker', 'Prop', 'Scrum-half', 'Fly-half', 'Centre', 'Wing'],
    pitch: [
      { x: 30, y: 22 },
      { x: 50, y: 18 },
      { x: 70, y: 22 },
      { x: 42, y: 44 },
      { x: 58, y: 56 },
      { x: 40, y: 72 },
      { x: 72, y: 78 },
    ],
  },
  9: {
    perSide: 9,
    label: '9-a-side',
    positions: [
      'Prop',
      'Hooker',
      'Prop',
      'Scrum-half',
      'Fly-half',
      'Centre',
      'Centre',
      'Wing',
      'Full-back',
    ],
    pitch: [
      { x: 30, y: 20 },
      { x: 50, y: 16 },
      { x: 70, y: 20 },
      { x: 44, y: 40 },
      { x: 56, y: 52 },
      { x: 38, y: 64 },
      { x: 66, y: 64 },
      { x: 22, y: 80 },
      { x: 60, y: 86 },
    ],
  },
  10: {
    perSide: 10,
    label: '10-a-side',
    positions: [
      'Prop',
      'Hooker',
      'Prop',
      'Lock',
      'Lock',
      'Scrum-half',
      'Fly-half',
      'Centre',
      'Centre',
      'Full-back',
    ],
    pitch: [
      { x: 30, y: 18 },
      { x: 50, y: 14 },
      { x: 70, y: 18 },
      { x: 40, y: 32 },
      { x: 60, y: 32 },
      { x: 46, y: 48 },
      { x: 58, y: 60 },
      { x: 36, y: 70 },
      { x: 68, y: 70 },
      { x: 52, y: 88 },
    ],
  },
  12: {
    perSide: 12,
    label: '12-a-side',
    positions: [
      'Prop',
      'Hooker',
      'Prop',
      'Lock',
      'Lock',
      'Flanker',
      'Scrum-half',
      'Fly-half',
      'Centre',
      'Centre',
      'Wing',
      'Full-back',
    ],
    pitch: [
      { x: 30, y: 16 },
      { x: 50, y: 12 },
      { x: 70, y: 16 },
      { x: 40, y: 28 },
      { x: 60, y: 28 },
      { x: 50, y: 40 },
      { x: 44, y: 52 },
      { x: 58, y: 62 },
      { x: 34, y: 72 },
      { x: 70, y: 72 },
      { x: 18, y: 84 },
      { x: 52, y: 90 },
    ],
  },
  13: {
    perSide: 13,
    label: '13-a-side',
    positions: [
      'Prop',
      'Hooker',
      'Prop',
      'Lock',
      'Lock',
      'Flanker',
      'Scrum-half',
      'Fly-half',
      'Centre',
      'Centre',
      'Wing',
      'Wing',
      'Full-back',
    ],
    pitch: [
      { x: 30, y: 15 },
      { x: 50, y: 11 },
      { x: 70, y: 15 },
      { x: 40, y: 27 },
      { x: 60, y: 27 },
      { x: 50, y: 38 },
      { x: 44, y: 50 },
      { x: 58, y: 60 },
      { x: 36, y: 70 },
      { x: 68, y: 70 },
      { x: 16, y: 82 },
      { x: 84, y: 82 },
      { x: 52, y: 90 },
    ],
  },
  15: {
    perSide: 15,
    label: '15-a-side',
    positions: FIFTEEN_POSITIONS,
    pitch: [
      { x: 32, y: 14 },
      { x: 50, y: 10 },
      { x: 68, y: 14 },
      { x: 41, y: 24 },
      { x: 59, y: 24 },
      { x: 26, y: 30 },
      { x: 74, y: 30 },
      { x: 50, y: 34 },
      { x: 46, y: 46 },
      { x: 58, y: 56 },
      { x: 14, y: 78 },
      { x: 40, y: 68 },
      { x: 66, y: 70 },
      { x: 86, y: 78 },
      { x: 52, y: 90 },
    ],
  },
}

/** The preset for a players-per-side value, or null when the size is unset or
 *  not one the club plays (a hand-typed lineup from before this file). */
export function rosterFormat(perSide) {
  if (perSide == null) return null
  return ROSTER_FORMATS[perSide] ?? null
}

/** Shirt-number label for a slot: "1", and the position name when the format
 *  has one. Slot indexes are zero-based; shirts are not. */
export function slotLabel(format, slotIndex) {
  const shirt = String(slotIndex + 1)
  const position = format?.positions?.[slotIndex] ?? null
  return { shirt, position }
}

/**
 * The slot whose pitch coordinate is closest to (x, y), or null when nothing
 * is within `maxDistance`. Pure — this is the whole of the drag-onto-pitch
 * drop decision, tested in tests/drag-reorder.test.js; PitchDiagram is wiring.
 */
export function nearestSlot(pitch, x, y, maxDistance) {
  let best = null
  let bestDistance = maxDistance
  for (let index = 0; index < (pitch?.length ?? 0); index += 1) {
    const distance = Math.hypot(pitch[index].x - x, pitch[index].y - y)
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  }
  return best
}
