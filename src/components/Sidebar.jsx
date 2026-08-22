import { NavLink } from 'react-router-dom'
import { NAV_ITEMS, SquadIcon } from './Nav.jsx'
import crest from '../assets/crest.png'

// The desktop sidebar — phase 2 of the 2.0 retheme
// (claude/plans/2026-08-21-retheme-and-shell.md), modelled on the member
// portal's shell measured live on 21 Aug 2026: fixed 256px column, dark
// panel, hairline right border, icon+label nav, content full-width beside it.
//
// ⚠️ DESKTOP-ONLY BY CSS (`hidden desktop:flex`), the same CSS-only gating
// the app uses everywhere. Mobile keeps the bottom tab bar untouched — this
// is the answer to "the desktop version looks like an app", not a change to
// the phone.
//
// ⚠️ DARK IN BOTH THEMES, like the masthead and tab bar: identity lives on
// the chrome so the content well can follow the theme. bg-chrome and its
// text tokens are theme-independent on purpose.
//
// The nav consolidates what used to be scattered: the four tab-bar items,
// plus Squad Hub (squad staff and admins), Notices, and the Admin portals.
// One nav, every dashboard — the information-architecture half of phase 2.

function NoticesIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </svg>
  )
}

function AdminIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" />
    </svg>
  )
}

function itemClassName({ isActive }) {
  return [
    'flex items-center gap-3 rounded-btn px-3 py-2.5 text-[14px] font-semibold outline-none transition',
    'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
    isActive
      ? 'bg-brand text-white'
      : 'text-chrome-muted hover:bg-white/[0.07] hover:text-white',
  ].join(' ')
}

export default function Sidebar({ showSquadHub = false, showAdmin = false }) {
  const items = [
    ...NAV_ITEMS.filter((item) => item.to !== '/more'),
    ...(showSquadHub ? [{ to: '/squad', label: 'Squad Hub', icon: SquadIcon }] : []),
    { to: '/notices', label: 'Notices', icon: NoticesIcon },
    ...(showAdmin ? [{ to: '/admin', label: 'Admin', icon: AdminIcon }] : []),
    // More stays last, matching the tab bar's order instinct.
    ...NAV_ITEMS.filter((item) => item.to === '/more'),
  ]

  return (
    <aside
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-chrome text-white desktop:flex"
    >
      <div className="brand-rule shrink-0" />
      {/* The portal's sidebar header: crest, then the app's name over the
          club's, in the kicker voice. */}
      <div className="flex items-center gap-3 px-4 py-4">
        <img src={crest} alt="" className="h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 leading-tight">
          <p className="font-condensed text-[10px] font-bold uppercase tracking-[0.14em] text-chrome-muted">
            Members
          </p>
          <p className="truncate font-condensed text-[14px] font-bold uppercase tracking-[0.08em]">
            Club Hub
          </p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4" aria-label="Sections">
        {items.map(({ to, label, end, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} className={itemClassName}>
            <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <p className="shrink-0 px-4 pb-4 font-condensed text-[10px] font-bold uppercase tracking-[0.14em] text-chrome-muted">
        Abu Dhabi Harlequins · Est. 1970
      </p>
    </aside>
  )
}
