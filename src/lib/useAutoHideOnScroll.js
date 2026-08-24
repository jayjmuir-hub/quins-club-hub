import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

// ══ AUTO-HIDE ON SCROLL — Safari's bar, and iOS apps that read ══════════════
//
// Scrolling DOWN past the first 80px hides the chrome (more room for the
// content you are reading); any scroll UP, or reaching the top or the bottom
// of the page, brings it back. Thresholded at 6px so a thumb resting on the
// glass does not flicker it. Re-shown on every route change, so a fresh
// screen never opens with its chrome hidden.
//
// ⚠️ ONE COPY, TWO BARS. This lived inline in Nav.jsx (the dock) until
// 24 Aug 2026, when the top masthead learned the same trick
// (claude/plans/2026-08-24-topbar-autohide-liquid-glass.md). The two bars
// must slide as one gesture, which they only do while they share these
// numbers — do not fork this back into a component.
//
// `disabled` pins the chrome shown and is not decoration: the masthead
// passes `viewAs` truthy through it, because the View-as banner shares the
// masthead's wrapper and is contractually persistent and unmissable
// (claude/specs/accessibility.md §1). While an admin is previewing, nothing
// up there may leave the screen.
export default function useAutoHideOnScroll({ disabled = false } = {}) {
  const { pathname } = useLocation()
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (disabled) {
      setHidden(false)
      return undefined
    }
    let last = window.scrollY
    let ticking = false
    function onScroll() {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        const y = window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        const delta = y - last
        if (y <= 80 || y >= max - 8) setHidden(false)
        else if (delta > 6) setHidden(true)
        else if (delta < -6) setHidden(false)
        last = y
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [disabled])

  useEffect(() => {
    setHidden(false)
  }, [pathname])

  return hidden
}
