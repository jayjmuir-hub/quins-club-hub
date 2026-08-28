import { useEffect, useState } from 'react'

// True once `active` has stayed true for `delayMs` without resolving — so a load
// that is riding out a slow moment can say "taking longer than usual…" instead
// of showing a spinner that looks frozen. Resets the moment `active` goes false.
// Part of claude/plans/2026-08-28-provider-resilience.md §3.
export default function useSlowLoad(active, delayMs = 6000) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!active) {
      setSlow(false)
      return undefined
    }
    const timer = setTimeout(() => setSlow(true), delayMs)
    return () => clearTimeout(timer)
  }, [active, delayMs])
  return slow
}
