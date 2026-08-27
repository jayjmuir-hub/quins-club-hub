/**
 * Keep a popover fully inside the viewport on the X axis.
 *
 * Used by the chat reaction picker (and nothing else yet). MessageMenu already
 * flips on Y; this is the horizontal twin so ChatBubble, MessageRow, the
 * floating dock, and ReactionBar's leftover add-button do not each paste a
 * third copy of the same arithmetic.
 *
 * `preferred` is which edge of the TRIGGER the popover hugs:
 *   'left'  — popover's left = trigger's left (grows right)
 *   'right' — popover's right = trigger's right (grows left)
 *
 * If that placement overflows, flip. If both overflow (narrow viewport, or a
 * trigger sitting in a gap thinner than the popover), shift so the popover
 * sits inside [margin, viewportWidth − margin]. Never scales.
 *
 * Returns viewport `left` in CSS pixels.
 */

export function fitPopoverX({
  triggerLeft,
  triggerRight,
  popoverWidth,
  viewportWidth,
  preferred = 'left',
  margin = 8,
}) {
  const hugLeft = triggerLeft
  const hugRight = triggerRight - popoverWidth
  const minLeft = margin
  const maxLeft = viewportWidth - margin - popoverWidth

  function fits(left) {
    return left >= minLeft - 0.5 && left <= maxLeft + 0.5
  }

  const preferredLeft = preferred === 'right' ? hugRight : hugLeft
  if (fits(preferredLeft)) return preferredLeft

  const flippedLeft = preferred === 'right' ? hugLeft : hugRight
  if (fits(flippedLeft)) return flippedLeft

  if (maxLeft < minLeft) {
    // Viewport is narrower than the popover: pin to the left margin. Scaling
    // the tray down is not a fix — every control stays tappable at full size,
    // even if the far edge still clips on an absurdly thin window.
    return minLeft
  }
  return Math.min(maxLeft, Math.max(minLeft, preferredLeft))
}
