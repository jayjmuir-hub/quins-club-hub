import { NavLink } from 'react-router-dom'

// Primary navigation: one component rendered once, styled entirely by CSS
// to be the fixed bottom tab bar below the 820px breakpoint and the
// in-header top nav at/above it (design-system.md §4.3, §5). It is meant to
// be rendered as a child of AppShell's header: below 820px it detaches to
// the viewport bottom via `fixed`, at/above 820px it sits inline in the
// header's flex row via `desktop:static`. There is deliberately only one
// list of items and one <nav> in the DOM — no duplicated mobile/desktop
// trees and no JS width check.

// icon components: inline SVG, stroke="currentColor" so they inherit the
// surrounding text colour (muted/maroon on the mobile tab bar), matching
// design-system.md §8. Hidden entirely at the desktop breakpoint, where the
// nav is text-only pills (design-system.md §4.1).
function HomeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5a1 1 0 0 0 1-1v-4.5a1 1 0 0 1 1-1H12.5a1 1 0 0 1 1 1V19a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

function ScheduleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

function RosterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16.5 8.5a2.5 2.5 0 1 1 0 5" />
      <path d="M15 12.5c2.4.3 4.5 1.7 4.5 4.5" />
    </svg>
  )
}

function MoreIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="16" height="3.2" rx="1.2" />
      <rect x="4" y="10.4" width="16" height="3.2" rx="1.2" />
      <rect x="4" y="15.8" width="16" height="3.2" rx="1.2" />
    </svg>
  )
}

// Single source of truth for the nav items, so nothing (AppShell, Nav
// itself, any future breadcrumb-style consumer) duplicates this list.
export const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true, icon: HomeIcon },
  { to: '/schedule', label: 'Schedule', icon: ScheduleIcon },
  { to: '/roster', label: 'Roster', icon: RosterIcon },
  { to: '/more', label: 'More', icon: MoreIcon },
]

function linkClassName({ isActive }) {
  return [
    // Mobile (tab bar item): icon above label, muted/active colour swap.
    'flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-[10.5px] font-bold outline-none transition',
    'focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2',
    isActive ? 'text-quinsRed' : 'text-[#77726e] hover:text-quinsBlack',
    // Desktop (in-header top nav): text-only pill on the gradient, per
    // design-system.md §4.1 (.nav-desktop button styling).
    'desktop:flex-row desktop:gap-0 desktop:rounded-[10px] desktop:px-3.5 desktop:py-2 desktop:text-sm desktop:font-semibold desktop:text-white',
    isActive
      ? 'desktop:bg-white/[.16] desktop:opacity-100'
      : 'desktop:opacity-[.82] desktop:hover:opacity-100',
  ].join(' ')
}

export default function Nav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-[#e6e3e1] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md desktop:static desktop:z-auto desktop:flex desktop:w-auto desktop:grid-cols-none desktop:gap-1 desktop:border-0 desktop:bg-transparent desktop:p-0 desktop:backdrop-blur-none"
    >
      {NAV_ITEMS.map(({ to, label, end, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} className={linkClassName}>
          <Icon className="h-[23px] w-[23px] desktop:hidden" aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
