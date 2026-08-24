// Composer behaviour shared by the channel screen and the DM/group thread
// (24 Aug 2026 feedback round: "message typing area should expand" and
// "option to have enter button send a message, changeable").

const ENTER_KEY = 'chat-enter-sends'

/**
 * Grow a textarea to fit its content, capped so a long paste never swallows
 * the screen (~6 lines). Call from onInput; safe on jsdom.
 */
export function autoGrow(el, maxPx = 148) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`
}

/** Device-level setting, deliberately not an account one: typing habits
 *  belong to the keyboard in front of you, not to the person. */
export function enterSends() {
  try {
    return localStorage.getItem(ENTER_KEY) === 'on'
  } catch {
    return false
  }
}

export function setEnterSends(on) {
  try {
    localStorage.setItem(ENTER_KEY, on ? 'on' : 'off')
  } catch {
    // Private-mode storage failures: the toggle just stays per-session.
  }
}

/**
 * Composer keydown: plain Enter submits the surrounding form when the
 * setting is on; Shift+Enter always makes a new line. Off by default —
 * phones put Enter next to the thumb.
 */
export function composerKeyDown(domEvent) {
  if (domEvent.key !== 'Enter' || domEvent.shiftKey) return
  if (!enterSends()) return
  domEvent.preventDefault()
  domEvent.currentTarget.form?.requestSubmit?.()
}
