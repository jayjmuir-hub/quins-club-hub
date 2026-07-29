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
    // Mobile (tab bar item): icon above label. The bar itself is now dark
    // chrome, so idle items are chrome-muted (#8b9099, 6.09:1 on #0c0c0e)
    // and the active item goes pure white plus a red icon — brighter, not
    // just a different hue, so it reads at a glance in sunlight.
    'flex flex-col items-center justify-center gap-1 rounded-lg py-2 font-condensed text-[11px] font-bold uppercase tracking-[0.06em] outline-none transition',
    'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
    isActive ? 'text-white' : 'text-chrome-muted hover:text-white',
    // Desktop (in-header top nav): text pill on the flat near-black masthead.
    // The old code needed two different black overlays here, one for active
    // and one for idle, because the underlying gradient's colour varied with
    // viewport width and idle text at 82% opacity fell under 4.5:1 without
    // help. The masthead is flat #0c0c0e now, so idle text can simply be
    // full-strength white at 19.54:1 and the active state can be a solid red
    // pill (4.79:1 white-on-red) instead of a darker patch. No opacity
    // tricks, no width-dependent measurements.
    'desktop:flex-row desktop:gap-0 desktop:rounded-pill desktop:px-4 desktop:py-2 desktop:text-[16px] desktop:tracking-[0.06em]',
    isActive
      ? 'desktop:bg-brand desktop:text-white'
      : 'desktop:text-white/80 desktop:hover:bg-white/10 desktop:hover:text-white',
  ].join(' ')
}

export default function Nav() {
  return (
    // The bar is dark chrome so the app is bookended in near-black — masthead
    // at the top, tab bar at the bottom, light content well between. The
    // `brand-rule` hairline sits on its top edge, mirroring the masthead's.
    // Opaque, not the old bg-white/95 + backdrop-blur: a translucent bar over
    // scrolling light content made the idle label contrast depend on whatever
    // happened to be underneath it.
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 bg-chrome pb-[env(safe-area-inset-bottom)] shadow-tabbar desktop:static desktop:z-auto desktop:flex desktop:w-auto desktop:grid-cols-none desktop:gap-1 desktop:bg-transparent desktop:p-0 desktop:shadow-none"
    >
      <div className="brand-rule absolute inset-x-0 top-0 desktop:hidden" />
      {NAV_ITEMS.map(({ to, label, end, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} className={linkClassName}>
          <Icon
            className={'h-[23px] w-[23px] desktop:hidden'}
            aria-hidden="true"
          />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
