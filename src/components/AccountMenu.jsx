import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin } from '../lib/scope.js'
import { effectiveTheme, toggleTheme, watchSystemTheme } from '../lib/theme.js'
import { ViewAsOptions } from './ViewAsSwitcher.jsx'

// The masthead's account menu: the initial button, and everything that used to
// sit beside it in the row.
//
// ══ WHY THIS EXISTS — THE MASTHEAD HAD BEEN OVER-FULL FOR A MONTH ════════════
//
// Between 7 and 22 Aug 2026 the masthead row was fixed five separate times for
// the same fault: every item in it except the wordmark is `shrink-0`, so the
// wordmark absorbed every overflow and truncated — "ABU DHABI HARLE…" on
// desktop, "QUINS CLUB HUB · …" on a phone (Jay's screenshot, 23 Aug). Each
// fix bought a few pixels (the theme toggle sized to 32px, the View-as pill cut
// to an icon, the account name hidden below `wide`) and each new control spent
// them again.
//
// Jay, 23 Aug 2026: "couldn't you tap the J and have a drop down or something?
// … we should also do a similar thing on the desktop version". So: ONE trigger
// in the row — the person's initial — and the account link, the theme toggle,
// the View-as switcher and sign-out all live behind it, at every width. The
// row stops being width-critical, and the next control anyone adds goes in
// here rather than re-opening the fight.
//
// ⚠️ THE ROLE PILL IS NOT IN HERE, ON PURPOSE. tests/view-as.test.jsx reads it
// as the proof that a preview really swapped the EFFECTIVE membership set (the
// anti-soft-lock check), and AppShell's note says why the banner cannot stand
// in for it. It stays in the masthead — on its own line under the wordmark on
// a phone, so the two never share a line again.
//
// ══ THE DROPDOWN MECHANICS ARE COPIED FROM ViewAsSwitcher, WITH ITS REASONS ══
//
// Portalled to <body> and positioned in viewport coordinates, because the
// masthead row carries `overflow-hidden` (it clips the harlequin diagonals) and
// an absolutely-positioned child of a clipped ancestor is clipped with it —
// that bug shipped once on 14 Aug and showed as a 6px sliver. Escape,
// outside-click and focus return are hand-rolled for the same reason they were
// there: a menu that lives on every screen and cannot be closed is worse than
// no menu. `position: fixed` escapes the clip only while no ancestor sets
// `transform`/`filter`/`perspective`; Sheet.jsx carries the same caveat.
//
// ══ VIEW AS IS A SECOND PAGE OF THE SAME PANEL ═══════════════════════════════
//
// An admin's persona list is two items per squad — fifteen squads is thirty
// rows — and that cannot sit inline under "My account" without burying the
// sign-out. So "View as" swaps the panel's contents for the persona list with
// a Back row, and choosing a persona closes the whole menu. The list itself is
// `ViewAsOptions`, exported from ViewAsSwitcher.jsx, so there is one copy of
// the rule that Coach and Parent are the only personas.

function SunIcon(props) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  )
}

function MoonIcon(props) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  )
}

function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function UserIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6" />
    </svg>
  )
}

function LogoutIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" />
      <path d="M15 8l4 4-4 4M19 12H9" />
    </svg>
  )
}

function BackIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}

const ITEM =
  'flex w-full items-center gap-3 rounded-[9px] px-3 py-2.5 text-left text-[14px] font-semibold text-ink transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset'
const ICON = 'h-[18px] w-[18px] shrink-0 text-ink-muted'

/**
 * @param {object} props
 * @param {string|null} props.firstName   The signed-in person's first name, if known.
 * @param {string|null} props.email       Fallback for the initial and the header line.
 * @param {string|null} props.roleLabel   What AppShell shows in the role pill, or null while loading.
 * @param {() => Promise<void>} props.signOut
 */
export default function AccountMenu({ firstName, email, roleLabel, signOut }) {
  const { realMemberships, viewAs } = useMemberships()
  const [open, setOpen] = useState(false)
  // 'main' | 'viewAs' — which page of the panel is showing.
  const [page, setPage] = useState('main')
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(null)
  const [theme, setThemeState] = useState(() => effectiveTheme())
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const [anchor, setAnchor] = useState(null)

  // Real memberships, never effective: while previewing as a parent the
  // effective set is not an admin's, and gating on it would hide the only way
  // to change or leave the preview (the ViewAsSwitcher rule, kept here).
  const admin = isAdmin(realMemberships)

  // Follow OS-level theme flips while mounted, so the row never lies.
  useEffect(() => {
    const unwatch = watchSystemTheme()
    const sync = () => setThemeState(effectiveTheme())
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => {
      unwatch()
      observer.disconnect()
    }
  }, [])

  function close({ refocus = true } = {}) {
    setOpen(false)
    setPage('main')
    if (refocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') close()
    }
    function onPointerDown(event) {
      if (triggerRef.current?.contains(event.target)) return
      if (panelRef.current?.contains(event.target)) return
      close({ refocus: false })
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setAnchor({ top: Math.round(rect.bottom + 8), right: Math.round(window.innerWidth - rect.right) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  async function handleSignOut() {
    setSigningOut(true)
    setSignOutError(null)
    try {
      await signOut()
    } catch (err) {
      setSignOutError(err.message || 'Something went wrong signing out. Try again.')
      setSigningOut(false)
    }
  }

  const initial = (firstName || email || '?').trim().charAt(0).toUpperCase()
  const dark = theme === 'dark'
  const triggerName = firstName ? `Account menu, ${firstName}` : 'Account menu'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="account-button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerName}
        className={[
          'relative ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white outline-none transition',
          'focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
          // A preview in progress is shown on the trigger too — ring and dot,
          // not colour alone (claude/specs/accessibility.md) — because the
          // View-as control now lives behind this button.
          viewAs ? 'bg-brand/30 ring-1 ring-inset ring-brand-onDark' : 'bg-white/15 hover:bg-white/25',
        ].join(' ')}
      >
        {initial}
        {viewAs && (
          <span aria-hidden="true" className="absolute right-0 top-0 h-2 w-2 rounded-full bg-brand-onDark" />
        )}
      </button>

      {open && anchor && createPortal(
        <div
          ref={panelRef}
          data-testid="account-menu"
          role="menu"
          aria-label={page === 'viewAs' ? 'View as' : 'Account'}
          style={{ position: 'fixed', top: anchor.top, right: anchor.right }}
          className="z-50 max-h-[70vh] w-[272px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[14px] border border-line bg-surface-card p-2 shadow-card"
        >
          {page === 'main' ? (
            <>
              {/* Who this is, in full — the masthead only has room for the
                  initial, and since 23 Aug 2026 no longer tries to say more. */}
              <div className="border-b border-line px-3 pb-2.5 pt-1.5">
                <p data-testid="account-menu-name" className="truncate text-[15px] font-extrabold text-ink">
                  {firstName || email || 'Your account'}
                </p>
                {roleLabel && (
                  <p className="truncate text-[12.5px] font-semibold text-ink-muted">{roleLabel}</p>
                )}
              </div>

              <Link to="/more" role="menuitem" onClick={() => close({ refocus: false })} className={`${ITEM} mt-1`}>
                <UserIcon className={ICON} />
                My account
              </Link>

              {admin && (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="view-as-trigger"
                  aria-haspopup="menu"
                  onClick={() => setPage('viewAs')}
                  className={ITEM}
                >
                  <EyeIcon className={ICON} />
                  <span className="flex-1">View as</span>
                  {viewAs && (
                    <span className="rounded-pill bg-danger-bg px-2 py-0.5 text-[11px] font-bold uppercase tracking-[.4px] text-brand-ink">
                      On
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={dark}
                data-testid="theme-toggle"
                onClick={() => {
                  toggleTheme()
                  setThemeState(effectiveTheme())
                }}
                className={ITEM}
              >
                {dark ? <SunIcon className={ICON} /> : <MoonIcon className={ICON} />}
                <span className="flex-1">Dark mode</span>
                {/* A switch drawn in CSS, not a checkbox: the state is carried
                    by aria-checked on the row, and this is purely the picture
                    of it. */}
                <span
                  aria-hidden="true"
                  className={[
                    'relative h-[18px] w-8 shrink-0 rounded-pill transition',
                    dark ? 'bg-brand' : 'bg-ink-faint/40',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white transition',
                      dark ? 'left-[16px]' : 'left-[2px]',
                    ].join(' ')}
                  />
                </span>
              </button>

              <div className="mt-1 border-t border-line pt-1">
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className={`${ITEM} disabled:opacity-60`}
                >
                  <LogoutIcon className={ICON} />
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
                {signOutError && (
                  <p role="alert" className="mx-1 mt-1 rounded-[9px] bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger-ink">
                    {signOutError}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div data-testid="view-as-menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => setPage('main')}
                className={`${ITEM} mb-1 border-b border-line rounded-b-none`}
              >
                <BackIcon className={ICON} />
                Back
              </button>
              <ViewAsOptions onChoose={() => close()} />
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
