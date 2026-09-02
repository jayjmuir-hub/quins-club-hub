import { useEffect } from 'react'

/**
 * While `dirty` is true, the browser's own "Leave site?" dialog guards a
 * reload, a closed tab and a typed address. That dialog is the ONE native
 * prompt this app allows (RESTORE.md rules out confirm()/alert()), because
 * nothing else can intercept those exits.
 *
 * ⚠️ IT DOES NOT COVER IN-APP NAVIGATION — the dock, the sidebar, navigate().
 * Each form guards its own in-app exits: the event form asks before the
 * sheet closes, the team sheet asks on its Back button, the match sheet keeps
 * a draft in sessionStorage. The gap that is left on purpose (leaving the team
 * sheet via the dock) is recorded in
 * claude/plans/2026-09-02-ux-unsaved-work.md — read it before "fixing" this
 * with a router blocker; the app is on BrowserRouter and has no data router.
 *
 * Pass `dirty && !saving`: the browser must not warn while the save that
 * clears the dirt is in flight.
 */
export default function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return undefined
    function warn(event) {
      event.preventDefault()
      // Older browsers read returnValue; current ones ignore the text and show
      // their own wording. Both need the property set.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}
