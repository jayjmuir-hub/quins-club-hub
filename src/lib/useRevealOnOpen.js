import { useEffect, useRef } from 'react'

// An editor panel that opens BELOW a long list has to say so — 2 Sep 2026 UX
// review (coaches/managers, Medium): the scoring panel and the template block
// editor append after fifteen squads or thirty templates, and tapping
// "Scoring" on the first row appeared to do nothing. Some panels autofocus a
// text input, which scrolls; these did not.
//
// Returns a ref for the panel root. Whenever `key` becomes truthy or changes
// (a different row was picked while the panel was already open), the panel
// is scrolled into view. jsdom has no scrollIntoView, so its absence is
// tolerated rather than assumed.
export default function useRevealOnOpen(key) {
  const ref = useRef(null)
  useEffect(() => {
    if (!key) return
    const node = ref.current
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [key])
  return ref
}
