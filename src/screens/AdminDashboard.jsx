import { NavLink, Outlet } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin } from '../lib/scope.js'

// The back-end dashboard (admin-dashboard plan, 2026-08-05): one /admin
// route with two tabs, absorbing what used to be /accounts and the admin
// half of /more, and the one working section of the deleted /overview.
//
// Tabs are REAL ROUTES (/admin/accounts, /admin/club), not local state, so a
// tab is linkable, bookmarkable and survives a refresh. App.jsx mounts them
// as children of this route; <Outlet/> below is where they render.
//
// The gate reads the EFFECTIVE membership set from useMemberships() — the
// same one Accounts.jsx has always used — so an admin previewing as a coach
// via ViewAsSwitcher correctly loses this screen along with the nav pill.
// Gating here is a UI decision only: RLS is what actually decides which rows
// any query returns, so getting this wrong could hide the screen from an
// admin but could never show club data to someone RLS would refuse.
//
// The "Not authorised" copy below is carried over verbatim from the old
// Admin.jsx so a coach who typed the URL sees exactly what they saw before.

function NotAuthorised() {
  return (
    <section>
      <h2 className="sr-only">Admin</h2>
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">Not authorised</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          This page is for club admins only. If you think you should have access, ask a
          current admin to check your account.
        </p>
      </Card>
    </section>
  )
}

const TABS = [
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/club', label: 'Club' },
]

function tabClassName({ isActive }) {
  return [
    'rounded-pill px-4 py-2 text-sm font-bold transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    isActive
      ? 'bg-brand text-white'
      : 'bg-surface-card text-brand shadow-[inset_0_0_0_1.5px_theme(colors.line.DEFAULT)] hover:bg-surface-mute',
  ].join(' ')
}

export default function AdminDashboard() {
  const { memberships } = useMemberships()

  if (!isAdmin(memberships)) return <NotAuthorised />

  return (
    <section>
      {/* Desktop-only, the same way /accounts and /overview always were:
          these are wide tables and multi-column forms, not a pitch-side
          screen. Someone who bookmarked /admin and opens it on a phone gets
          this note instead of a broken layout.

          CSS-only (`desktop:hidden` / `hidden desktop:block`) rather than
          useMediaQuery — see that hook's header comment: it exists for when
          both branches would emit the SAME content into the DOM, which is
          not the case here. A consequence worth knowing: on a phone the
          dashboard is still mounted behind the hidden wrapper and still
          issues its queries. That is the same behaviour /accounts had, and
          it keeps the width decision entirely in CSS with no JS listener. */}
      <Card data-testid="admin-small-screen-note" className="p-6 text-center desktop:hidden">
        <h3 className="text-base font-extrabold text-brand-deep">Needs a bigger screen</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          Managing the club needs a wider screen. Open this page on a laptop or desktop.
        </p>
      </Card>

      <div className="hidden desktop:block">
        <div className="mb-3.5 mt-1">
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Admin</h2>
        </div>

        <nav aria-label="Admin sections" className="mb-4 flex gap-2">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} className={tabClassName}>
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>
    </section>
  )
}
