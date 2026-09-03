import { useCallback, useState } from 'react'
import useUnsavedChanges from './useUnsavedChanges.js'

/**
 * The one way a sheet with typing in it closes.
 *
 * ⚠️ WHY (Jay, 3 Sep 2026: "if I mis-click outside the event box while adding
 * something it just disappears and I have to start all over"). The event form
 * got this in #631; every OTHER sheet still closed on a backdrop tap with no
 * question. This hook is that fix, made reusable so the next sheet cannot
 * forget it.
 *
 * Hand it `dirty` (has the person typed anything that is not saved yet),
 * `saving` (a save is in flight — the browser must not warn while the thing
 * that clears the dirt is running) and the sheet's real `onClose`. It gives
 * back:
 *   - `requestClose` — wire it to the Sheet's onClose. Clean closes at once;
 *     dirty arms the question instead.
 *   - `confirming` — render <DiscardConfirm> when true.
 *   - `discard` / `keep` — the two answers.
 *
 * The reload / tab-close guard (useUnsavedChanges) rides along, so a form
 * that adopts this gets both halves in one line.
 */
export default function useDiscardGuard({ dirty, saving = false, onClose }) {
  const [confirming, setConfirming] = useState(false)
  useUnsavedChanges(Boolean(dirty) && !saving)

  const requestClose = useCallback(() => {
    if (dirty && !saving) setConfirming(true)
    else onClose?.()
  }, [dirty, saving, onClose])

  const discard = useCallback(() => {
    setConfirming(false)
    onClose?.()
  }, [onClose])

  const keep = useCallback(() => setConfirming(false), [])

  return { requestClose, confirming, discard, keep }
}
