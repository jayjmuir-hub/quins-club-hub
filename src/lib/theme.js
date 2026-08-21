// Light/dark theme switching — the 2.0 retheme
// (claude/plans/2026-08-21-retheme-and-shell.md).
//
// The rules, which match the club site and member portal exactly:
//   - default follows the OS (prefers-color-scheme), live — flipping the OS
//     while the app is open flips the app, UNLESS the person has chosen;
//   - an explicit choice is persisted and beats the OS;
//   - the mechanism is the `dark` class on <html>, which tailwind.config.js
//     (darkMode: 'class') and the :root.dark token block in index.css key on.
//
// ⚠️ index.html carries a tiny inline copy of applyTheme's logic so the first
// paint is already themed — without it a dark-mode user gets a white flash on
// every load. Change the STORAGE_KEY or the class name here and that inline
// script must change with it; tests/theme-switch.test.js pins the pair.

export const STORAGE_KEY = 'club-hub-theme'

/** The stored choice: 'light' | 'dark' | null (= follow the OS). */
export function storedTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

/** What should actually be showing right now. */
export function effectiveTheme() {
  const chosen = storedTheme()
  if (chosen) return chosen
  return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
}

/** Stamp the current answer onto <html>. Idempotent; safe to call often. */
export function applyTheme() {
  document.documentElement.classList.toggle('dark', effectiveTheme() === 'dark')
}

/**
 * Record a choice ('light' | 'dark') or null to hand control back to the OS,
 * and apply it immediately.
 */
export function setTheme(choice) {
  try {
    if (choice === 'light' || choice === 'dark') localStorage.setItem(STORAGE_KEY, choice)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private-mode storage failures degrade to "follows the OS", not a crash.
  }
  applyTheme()
}

/** The toggle's next stop: whatever is NOT currently showing. */
export function toggleTheme() {
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark')
}

/**
 * Keep an OS-following session live. Returns an unsubscribe function.
 * A stored choice makes the OS irrelevant, and applyTheme re-checks that on
 * every fire, so this can stay subscribed unconditionally.
 */
export function watchSystemTheme() {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!media?.addEventListener) return () => {}
  const onChange = () => applyTheme()
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
