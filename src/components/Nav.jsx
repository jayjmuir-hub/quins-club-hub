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

// Exported for Sidebar, same reason as SquadIcon.
export function ChatIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.4A.5.5 0 0 1 4 19z" />
      <path d="M8 8.5h8M8 12h5" />
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
  // Chat (23 Aug 2026) — the squad channel. On the bar for EVERYONE: the
  // phone's only entry point is the thing you cannot delete (the 22 Aug
  // handoff's lesson), and a chat nobody can find is a chat nobody uses.
  { to: '/chat', label: 'Chat', icon: ChatIcon },
  { to: '/more', label: 'More', icon: MoreIcon },
]

const GRID_COLS = { 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6' }

function linkClassName({ isActive }) {
  return [
    // Mobile (tab bar item): icon above label. The bar itself is now dark
    // chrome, so idle items are chrome-muted (#8b9099, 6.09:1 on #0c0c0e)
    // and the active item goes pure white plus a red icon — brighter, not
    // just a different hue, so it reads at a glance in sunlight.
    // ⚠️ `whitespace-nowrap` + 10px + tight tracking: six items on a 360px
    // Android (squad staff get Squad Hub) gave each ~58px, and "SQUAD HUB"
    // wrapped onto two lines while "SCHEDULE" and "ROSTER" ran together —
    // Jay's screenshots, 23 Aug 2026. Condensed caps at 10px keep the
    // longest label inside that, and nowrap makes a tight fit clip at the
    // item edge rather than grow the bar.
    'flex min-w-0 flex-col items-center justify-center gap-[3px] px-0.5 pb-2 pt-[11px] font-condensed text-[10px] font-bold uppercase tracking-[0.03em] whitespace-nowrap outline-none transition',
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
        // `short` is what the tab PRINTS; `label` stays the accessible name.
        // Measured at 360px with six tabs: "SQUAD HUB" is 61px of condensed
        // caps in a 56px cell and clipped — "SQUAD" is 33. The sidebar still
        // says Squad Hub in full; the tab bar is the only place this is short.
        { to: '/squad', label: 'Squad Hub', short: 'Squad', icon: SquadIcon },
        ...NAV_ITEMS.filter((item) => item.to === '/more'),
      ]
    : NAV_ITEMS
  return (
    // The bar is dark chrome so the app is bookended in near-black — masthead
    // at the top, tab bar at the bottom, light content well between. The
    // `brand-rule` hairline sits on its top edge, mirroring the masthead's.
    // ⚠️ TRANSLUCENT AGAIN SINCE 23 Aug 2026, AND THE OLD OBJECTION IS
    // ANSWERED, NOT IGNORED. It was opaque because a bg-white/95 bar over
    // scrolling light content made the idle-label contrast depend on whatever
    // was underneath. `glass-chrome` (src/index.css) is DARK at 82% over a
    // 20px blur: the worst thing behind it is pure white, and the composite is
    // still near-black — 4.9:1 for the idle label by arithmetic; see the
    // note in src/index.css on why the harness cannot photograph it.
    <nav
      aria-label="Primary"
      /* `desktop:gap-[2px]` matches adhjrt.com's `.hdr-nav { gap: 2px }`. The
         items now carry their own hover fill, so a wider gap would read as
         five separate buttons rather than one row of tabs. */
      // ⚠️ FULL CLASS NAMES, NEVER `grid-cols-${n}` — Tailwind only emits the
      // classes it can see in the source. Five for everyone since Chat joined
      // (23 Aug 2026), six for squad staff.
      // ══ THE DOCK — Jay, 23 Aug 2026, with a photo of his iPhone's home
      // screen: a floating, rounded, frosted pill inset from the edges and
      // lifted clear of the home indicator, not a slab welded to the bottom.
      // `inset-x-3 bottom-[calc(12px+safe-area)]` is the inset; `rounded-[26px]`
      // and `glass-chrome` are the material; `overflow-hidden` clips the
      // brand-rule and item hover fills to the pill's corners.
      //
      // ⚠️ The content's bottom padding in AppShell and the help button's
      // offset in HelpButton.jsx are sized to clear THIS. Change the height or
      // the inset here and re-measure both.
      className={`fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 grid ${GRID_COLS[items.length] ?? 'grid-cols-5'} glass-chrome overflow-hidden rounded-[26px] border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.35)] desktop:hidden`}
    >
      <div className="brand-rule absolute inset-x-0 top-0" />
      {items.map(({ to, label, short, end, icon: Icon }) => (
        <NavLink key={to} to={to} end={end} className={linkClassName} aria-label={short ? label : undefined}>
          <Icon className={'h-[23px] w-[23px]'} aria-hidden="true" />
          <span>{short ?? label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
