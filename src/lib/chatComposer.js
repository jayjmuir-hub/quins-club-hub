import { isAcceptableImage } from './imageResize.js'

// Composer behaviour shared by the channel screen and the DM/group thread
// (24 Aug 2026 feedback round: "message typing area should expand" and
// "option to have enter button send a message, changeable"), plus the paste
// door added by plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md).

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
 * Insert text at a textarea's cursor and return the new value with the
 * caret parked after the insertion. Pure on the VALUE — the caller owns the
 * state — but it does move the DOM selection so a second emoji lands after
 * the first, not before it. Round 2's emoji picker
 * (claude/plans/2026-08-24-chat-round-2.md); safe on jsdom.
 */
export function insertAtCursor(el, text) {
  if (!el) return text
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const value = el.value.slice(0, start) + text + el.value.slice(end)
  const caret = start + text.length
  // Reflect immediately so selectionStart is right even before React
  // re-renders the controlled value.
  el.value = value
  try {
    el.setSelectionRange(caret, caret)
  } catch {
    // some input types refuse selection APIs; the append still happened
  }
  return value
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

/**
 * The PASTE door: Ctrl+V a screenshot into a chat and it joins the tray.
 *
 * ⚠️ PASTING TEXT IS A HUNDRED TIMES COMMONER THAN PASTING A PHOTO, so this
 * does nothing at all unless the clipboard actually carries image files.
 * Calling preventDefault on an ordinary text paste would break typing into
 * the message box — a far worse bug than the one this fixes — which is why
 * the early return comes BEFORE preventDefault and not after it.
 *
 * ⚠️ AND IT ONLY CLAIMS IMAGES. Copying a file in Explorer puts it on the
 * clipboard as a File too, so "the clipboard has files" is not enough: a
 * pasted PDF must be left to the browser rather than silently swallowed by
 * a handler that prevents the default and then adds nothing.
 *
 * Returns true when it took over, for tests and for callers that care.
 */
export function pasteImages(domEvent, add) {
  const files = Array.from(domEvent.clipboardData?.files ?? []).filter(isAcceptableImage)
  if (files.length === 0) return false
  domEvent.preventDefault()
  add(files)
  return true
}
