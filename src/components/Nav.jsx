import { NavLink } from 'react-router-dom'

// Primary navigation — THE MOBILE TAB BAR, and since phase 2 of the 2.0
// retheme (claude/plans/2026-08-21-retheme-and-shell.md) nothing else.
// Desktop nav lives in src/components/Sidebar.jsx, which imports NAV_ITEMS
// from here so there is still exactly one list of destinations.
//
// ⚠️ Until 21 Aug 2026 this one component was ALSO the in-header desktop
// pill row, switched by CSS. Those pills — and their measured-off-adhjrt
// styling, the sheen, the Admin pill — retired with the sidebar's arrival.
// The `.nav-tab` sheen CSS in src/index.css survives them for now; it is
// inert without a desktop nav-tab and phase 5's sweep decides its fate.

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

// Exported for Sidebar, which shows the same destination to the same people —
// one icon, one home, like NAV_ITEMS itself.
export function SquadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
      <path d="M8.5 12.5l2.3 2.3 4.7-4.6" />
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
    // (The desktop pill styling that lived here 6-21 Aug, with its measured
    // adhjrt values, is retired — see the header note.)
  ].join(' ')
}

// The Admin pill that used to render here (admin-only, desktop-only) is now
// the sidebar's Admin item — same isAdmin() gate, same destination. The tab
// bar never showed it and still does not: since phase 4 the phone's route to
// /admin is the Manage card on More, not a fifth tab.
export default function Nav({ showSquadHub = false }) {
  // Squad Hub joins the bar for the same people the sidebar shows it to
  // (22 Aug 2026, Jay) — until now the Dashboard card was the phone's only
  // way in. Between Roster and More, matching the sidebar's order.
  const items = showSquadHub
    ? [
        ...NAV_ITEMS.filter((item) => item.to !== '/more'),
        { to: '/squad', label: 'Squad Hub', icon: SquadIcon },
        ...NAV_ITEMS.filter((item) => item.to === '/more'),
      ]
    : NAV_ITEMS
  return (
    // The bar is dark chrome so the app is bookended in near-black — masthead
    // at the top, tab bar at the bottom, light content well between. The
    // `brand-rule` hairline sits on its top edge, mirroring the masthead's.
    // Opaque, not the old bg-white/95 + backdrop-blur: a translucent bar over
    // scrolling light content made the idle label contrast depend on whatever
    // happened to be underneath it.
    <nav
      aria-label="Primary"
      /* `desktop:gap-[2px]` matches adhjrt.com's `.hdr-nav { gap: 2px }`. The
         items now carry their own hover fill, so a wider gap would read as
         five separate buttons rather than one row of tabs. */
      className={`fixed inset-x-0 bottom-0 z-40 grid ${items.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} bg-chrome pb-[env(safe-area-inset-bottom)] shadow-tabbar desktop:hidden`}
    >
      <div className="brand-rule absolute inset-x-0 top-0" />
      {items.map(({ to, label, end, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} className={linkClassName}>
          <Icon className={'h-[23px] w-[23px]'} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
