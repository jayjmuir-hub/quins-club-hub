// Where the face is, as CSS.
//
// ⚠️ THIS LIVES IN `lib/` RATHER THAN IN `PhotoPositioner.jsx` BECAUSE OF WHO
// NEEDS IT. It started there, beside the picker that produces the value, and
// that was right while the picker was the only thing reading it back. It is not
// any more: `SquadStaffCard` and `PlayerAvatar` — the two components that draw a
// face on Home and on the roster, on the first screen of the app — each need
// four lines of formatting, and importing them out of the picker would pull the
// drop zone, the drag maths and the preview strip into the bundle of every
// screen showing a photograph, to use a percentage.
//
// ⚠️ THE PICKER STILL RE-EXPORTS THESE, and that is deliberate rather than
// laziness: `focusToObjectPosition` is the reason a preview can be trusted to
// predict a tile, so the picker and every renderer must be provably using the
// SAME function. One definition, imported everywhere, is that proof. Two
// formatters agreeing today is not.

export const DEFAULT_FOCUS = { x: 50, y: 50 }

/**
 * Clamp to the 0-100 the database stores, and round — sub-pixel focus is noise.
 *
 * ⚠️ TAKES THE WHOLE VALUE RATHER THAN DESTRUCTURING IN THE SIGNATURE, because a
 * default parameter only fires on `undefined` and the database will hand this
 * `null` for every photo uploaded before the column existed. `clampFocus(null)`
 * destructured in the signature throws, and it throws inside a render.
 */
export function clampFocus(focus) {
  const source = focus && typeof focus === 'object' ? focus : {}
  const n = (v) => Math.max(0, Math.min(100, Math.round(Number.isFinite(v) ? v : 50)))
  return { x: n(source.x), y: n(source.y) }
}

/** The CSS value. Kept here so the picker and every renderer agree on the format. */
export function focusToObjectPosition(focus) {
  const { x, y } = clampFocus(focus ?? DEFAULT_FOCUS)
  return `${x}% ${y}%`
}
