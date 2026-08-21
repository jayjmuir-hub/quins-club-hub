import { useEffect, useState } from 'react'
import { effectiveTheme, toggleTheme, watchSystemTheme } from '../lib/theme.js'

// The masthead's light/dark switch — a 32px icon button, the same footprint
// as ViewAsSwitcher's trigger, because the masthead row breaks at +190px and
// has ~66px unspent (the 12 Aug probe, re-read before widening ANYTHING in
// that row — see AppShell's notes). The club site and portal carry the same
// control in the same corner.
//
// The icon shows where you're GOING, not where you are — a moon in light
// mode ("tap for dark"), a sun in dark. Matches the site's toggle.
export default function ThemeToggle() {
  const [theme, setThemeState] = useState(() => effectiveTheme())

  // Follow OS-level flips while mounted, so the icon never lies.
  useEffect(() => {
    const unwatch = watchSystemTheme()
    const sync = () => setThemeState(effectiveTheme())
    // watchSystemTheme re-applies the class; observe it to stay in sync.
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      unwatch()
      observer.disconnect()
    }
  }, [])

  const dark = theme === 'dark'
  return (
    <button
      type="button"
      onClick={() => {
        toggleTheme()
        setThemeState(effectiveTheme())
      }}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-chrome-ink/80 transition hover:bg-chrome-raised hover:text-chrome-ink"
    >
      {dark ? (
        // Sun
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      ) : (
        // Moon
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  )
}
