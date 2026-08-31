import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { countAdminWaiting } from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isPortalOpen, portalHome, portalLabel, PORTALS } from '../lib/portals.js'
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

function DocumentsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M14 3v5a1 1 0 0 0 1 1h5" />
      <path d="M6 3h8l6 6v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 14h6M9 17h6" />
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

function subItemClassName({ isActive }) {
  return [
    'block rounded-btn px-3 py-1.5 text-[13px] font-semibold outline-none transition',
    'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
    isActive
      ? 'bg-white/[0.1] text-white'
      : 'text-chrome-muted hover:bg-white/[0.07] hover:text-white',
  ].join(' ')
}

function itemClassName({ isActive }) {
  return [
    'flex items-center gap-3 rounded-btn px-3 py-2.5 text-[14px] font-semibold outline-none transition',
    'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
    // The same pill the phone's dock gives its active tab (Nav.jsx, design
    // "A", 23 Aug 2026): brand gradient and a soft red glow, so the two
    // navs read as one system rather than a flat fill here and a lit one
    // there.
    isActive
      ? 'bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-white shadow-[0_4px_14px_rgba(194,31,50,0.35)]'
      : 'text-chrome-muted hover:bg-white/[0.07] hover:text-white',
  ].join(' ')
}

// Where the waiting queues are cleared — see the badge below. `/approvals` is
// the same screen mounted for squad staff (src/App.jsx).
const ACCOUNTS_PATHS = ['/admin/accounts', '/approvals']

export default function Sidebar({ showSquadHub = false, showAdmin = false }) {
  const { memberships } = useMemberships()
  const location = useLocation()
  const { user } = useAuth()

  // The Admin item's badge: how many approvals and access requests are
  // waiting (22 Aug 2026, Jay — "the number an admin opens the app for").
  // Admins only; a failed count costs the badge and nothing else, and 0
  // renders nothing rather than a zero.
  //
  // Counted on mount, and AGAIN EACH TIME THE ADMIN LEAVES THE ACCOUNTS SCREEN
  // (23 Aug 2026, Jay). That screen is where the queue gets cleared, so a
  // count taken before the visit is exactly the number that is now wrong —
  // and re-counting on every route change would be a query per click to
  // answer a question whose answer only changes there.
  const [adminWaiting, setAdminWaiting] = useState(0)
  const [recount, setRecount] = useState(0)
  const onAccounts = ACCOUNTS_PATHS.some((path) => location.pathname.startsWith(path))
  const wasOnAccounts = useRef(onAccounts)
  useEffect(() => {
    if (wasOnAccounts.current && !onAccounts) setRecount((n) => n + 1)
    wasOnAccounts.current = onAccounts
  }, [onAccounts])
  useEffect(() => {
    if (!showAdmin) return undefined
    let mounted = true
    countAdminWaiting(user?.id)
      .then((count) => {
        if (mounted) setAdminWaiting(count)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [showAdmin, user?.id, recount])

  // Sub-menus (22 Aug 2026, Jay). Only the ACTIVE section expands — a
  // coach-admin's sidebar with every section open would be a wall — and every
  // child is a real, linkable route or a ?open= deep-link a screen consumes.
  // The Squad Hub section needs the squad from the URL: on bare /squad
  // (the multi-squad picker) there is no squad yet, so no children show.
  const squadMatch = location.pathname.match(/^\/squad\/([^/]+)/)
  const childrenFor = (to) => {
    if (to === '/squad' && squadMatch) {
      return [
        { to: `/squad/${squadMatch[1]}`, label: 'Overview', end: true },
        { to: `/squad/${squadMatch[1]}/match-roster`, label: 'Build a Match Roster' },
        { to: `/squad/${squadMatch[1]}/training`, label: 'Training Plans' },
        { to: `/squad/${squadMatch[1]}/chat`, label: 'Chat' },
      ]
    }
    // /game-time keeps the Roster section open: it is this section's only
    // routed child, and collapsing the menu the moment somebody enters it
    // would leave no sidebar item lit at all.
    if (to === '/roster' && (location.pathname.startsWith('/roster') || location.pathname.startsWith('/game-time'))) {
      // Staff-only section: parents have no add/import rights and Game time
      // is a coach's question, so for them Roster simply has no children.
      return showSquadHub
        ? [
            { to: '/roster?open=add-player', label: 'Add a player', action: true },
            { to: '/roster?open=import', label: 'Import players', action: true },
            { to: '/game-time', label: 'Game time' },
          ]
        : []
    }
    // /pitch-calendar keeps the Schedule section open — same rule as
    // /game-time under Roster: a section must not collapse under its own
    // routed child and leave nothing lit.
    if (to === '/schedule' && (location.pathname.startsWith('/schedule') || location.pathname.startsWith('/pitch-calendar'))) {
      return [
        // `action: true` = a deep-link that opens a sheet on the screen, not a
        // place you can BE — so it never renders as the active item.
        ...(showSquadHub ? [{ to: '/schedule?open=add-event', label: 'Add an event', action: true }] : []),
        ...(showSquadHub ? [{ to: '/pitch-calendar', label: 'Pitch calendar' }] : []),
        { to: '/schedule?open=subscribe', label: 'Add to calendar', action: true },
      ]
    }
    // Chat's categories (24 Aug 2026, Jay: "the different chat categories
    // should appear in the left bar under Chats"). The filters are ?filter=
    // deep-links ChatList consumes — the same mechanism as its chip row, so
    // sidebar and chips cannot disagree. /chat/starred and the DM threads
    // keep the section open, same rule as /game-time under Roster.
    if (to === '/chat' && location.pathname.startsWith('/chat')) {
      return [
        { to: '/chat', label: 'All chats', end: true },
        { to: '/chat?filter=unread', label: 'Unread', action: true },
        { to: '/chat?filter=dms', label: 'Groups & DMs', action: true },
        { to: '/chat?filter=squads', label: 'Your squads', action: true },
        { to: '/chat/starred', label: 'Starred' },
      ]
    }
    // The Admin section expands like the others (24 Aug 2026, Jay: "the admin
    // button in the left bar should expand like the others"). Its children are
    // the PORTALS this admin can enter — the same cards the /admin chooser
    // shows, read from the same registry so the two cannot disagree.
    // /approvals keeps it open: the badge's number lives there.
    if (to === '/admin' && (location.pathname.startsWith('/admin') || location.pathname.startsWith('/approvals'))) {
      return PORTALS.filter((portal) => isPortalOpen(portal, memberships)).map((portal) => ({
        to: portalHome(portal),
        label: portalLabel(portal),
      }))
    }
    return []
  }

  // ⚠️ NO "More" ROW SINCE 29 Aug 2026. It was never really a sidebar
  // destination — it held the account/settings grab-bag and was pinned last —
  // and that whole tab moved into the masthead account menu (AccountMenu.jsx).
  // NAV_ITEMS no longer carries it, so the old filter/append pair is gone.
  const items = [
    ...NAV_ITEMS,
    ...(showSquadHub ? [{ to: '/squad', label: 'Squad Hub', icon: SquadIcon }] : []),
    { to: '/notices', label: 'Notices', icon: NoticesIcon },
    { to: '/documents', label: 'Documents', icon: DocumentsIcon },
    ...(showAdmin ? [{ to: '/admin', label: 'Admin', icon: AdminIcon }] : []),
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
        {/* Home, and back to the top — the same promise the mobile masthead's
            crest makes (AppShell.jsx, 23 Aug 2026). */}
        <Link
          to="/"
          aria-label="Abu Dhabi Harlequins — back to the top"
          data-testid="crest-home"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="shrink-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <img src={crest} alt="" className="h-10 w-10 object-contain" />
        </Link>
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
        {items.map(({ to, label, end, icon: Icon }) => {
          const children = childrenFor(to)
          return (
            <Fragment key={to}>
              <NavLink to={to} end={end} className={itemClassName}>
                <Icon className="h-[19px] w-[19px] shrink-0" aria-hidden="true" />
                <span>{label}</span>
                {/* White pill so it reads on BOTH row states — dark chrome
                    idle and brand-red active. aria-label carries the meaning
                    a bare number does not. */}
                {to === '/admin' && adminWaiting > 0 && (
                  <span
                    data-testid="admin-waiting-badge"
                    aria-label={`${adminWaiting} waiting for review`}
                    className="ml-auto rounded-full bg-white px-2 py-0.5 text-[11px] font-bold leading-4 text-brand-ink"
                  >
                    {adminWaiting}
                  </span>
                )}
              </NavLink>
              {children.length > 0 && (
                <div className="ml-[22px] flex flex-col gap-0.5 border-l border-white/10 pl-2" data-testid={`submenu${to.replaceAll('/', '-')}`}>
                  {children.map((child) =>
                    child.action ? (
                      <Link key={child.to} to={child.to} className={subItemClassName({ isActive: false })}>
                        {child.label}
                      </Link>
                    ) : (
                      <NavLink key={child.to} to={child.to} end={child.end} className={subItemClassName}>
                        {child.label}
                      </NavLink>
                    ),
                  )}
                </div>
              )}
            </Fragment>
          )
        })}
      </nav>

      <p className="shrink-0 px-4 pb-4 font-condensed text-[10px] font-bold uppercase tracking-[0.14em] text-chrome-muted">
        Abu Dhabi Harlequins · Est. 1970
      </p>
    </aside>
  )
}
