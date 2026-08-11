import { NavLink, Outlet } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { ViewAsSwitcher } from '../components/ViewAsSwitcher.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { hasAdminRight, isAdmin } from '../lib/scope.js'

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

// ⚠️ A REAL ADMIN WHO IS PREVIEWING MUST NOT GET "Not authorised", and this
// branch is what makes the switcher's new home workable at all.
//
// The gate below reads the EFFECTIVE membership set, so the instant an admin
// picks a persona they stop being an admin as far as this screen is
// concerned — the screen they just used the control ON disappears, taking
// the control with it. Without this branch, changing persona would mean Exit
// preview, then re-pick: two steps for what used to be one, a straight
// downgrade from the masthead version.
//
// So: still an admin really, just previewing. Say so, and keep the switcher
// on screen. This is NOT a hole in the gate — it renders no club data, only
// the control, and it is reached only when isAdmin(realMemberships) is true,
// which is the same predicate ViewAsSwitcher itself uses to decide whether
// to render anything.
function PreviewingNotice() {
  return (
    <section>
      <h2 className="sr-only">Admin</h2>
      <Card className="p-6 text-center">
        <h3 className="text-base font-extrabold text-ink">You&apos;re previewing the app</h3>
        <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-ink-muted">
          Admin tools are hidden while you preview, because you are seeing the app as
          someone else sees it. Change who you are previewing below, or use Exit preview
          at the top of the screen to come back.
        </p>
        <div className="mt-4 flex justify-center">
          <ViewAsSwitcher />
        </div>
      </Card>
    </section>
  )
}

// ⚠️ THE PITCHES TAB IS GATED ON AN ADMIN RIGHT, NOT ON `isAdmin`. Every
// admin can already write the pitch table — the RLS policy is `is_admin`
// deliberately, because these rights decide which specialist dashboard
// somebody is SHOWN rather than what they may do
// (claude/decisions/2026-08-10-role-dashboards.md). So hiding the tab is a
// "this is not your job" signal, not a permission, and the screen repeats the
// check because a route is linkable and somebody will paste the URL.
const BASE_TABS = [
  { to: '/admin/accounts', label: 'Accounts' },
  { to: '/admin/club', label: 'Club' },
]

function tabsFor(memberships) {
  // ⚠️ ALLOCATION COMES FIRST, and Pitches (setup) after it. Allocating is the
  // weekly job; setting the list up is done twice a season. Tab order is the
  // cheapest way to say which one somebody came for.
  return hasAdminRight(memberships, 'pitches')
    ? [
        ...BASE_TABS,
        { to: '/admin/allocation', label: 'Allocation' },
        { to: '/admin/pitches', label: 'Pitches' },
      ]
    : BASE_TABS
}

// ⚠️ MODELLED ON adhjrt.com's AGE-GROUP TABS — Jay, 11 Aug 2026, who asked for
// "the tabs on the adhjrt.com website". The spec was MEASURED off the live site
// with getComputedStyle rather than eyeballed from a screenshot:
//
//   border-radius  12px            (not the 100px pill this used to be)
//   border         0.8px solid     stone when inactive, the red when active
//   inactive       white fill, BLACK text
//   active         red fill
//
// ⚠️ ONE THING IS DELIBERATELY NOT COPIED: adhjrt.com puts BLACK text on the
// red active tab. Measured there it is 4.38:1, which already fails WCAG AA for
// 13px bold (the 4.5:1 threshold — bold only counts as "large text" at 18.66px
// and up). Against THIS app's darker red (`brand` #c8102e) the same choice
// would be 3.57:1, materially worse. White on #c8102e is 5.88:1 and is what
// ships here. The look is copied; the contrast bug is not.
//
// The inactive label is `text-ink` rather than the old `text-brand`: on
// adhjrt.com an unselected tab is black-on-white (18.85:1 here), and red text
// on every tab was part of what made this row read as buttons.
function tabClassName({ isActive }) {
  return [
    'rounded-tab px-4 py-2 text-sm font-bold transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    isActive
      ? 'bg-brand text-white'
      : 'bg-surface-card text-ink shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)] hover:bg-surface-mute',
  ].join(' ')
}

export default function AdminDashboard() {
  const { memberships, realMemberships, viewAs } = useMemberships()

  if (!isAdmin(memberships)) {
    // Order matters: the previewing case is a strict subset of "not an admin
    // by the effective set", so it has to be tested first or it can never be
    // reached. realMemberships is what makes it safe — a coach who typed the
    // URL fails it and still gets the original wording.
    if (viewAs && isAdmin(realMemberships ?? [])) return <PreviewingNotice />
    return <NotAuthorised />
  }

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
        {/* ViewAsSwitcher lives HERE, not in the masthead (moved 7 Aug 2026,
            Jay's call). The masthead could not fit an admin's full row at its
            1120px cap and was truncating the club wordmark to "ABU DHABI
            HARLE…" — the reasoning is written out in full at its old call
            site in AppShell.jsx.

            This screen is the right home for it regardless: the control is
            admin-only, used occasionally rather than constantly, and this
            screen is already gated to admins AND already desktop-only, which
            is exactly the switcher's own audience and its own width rule.

            ⚠️ Starting a preview from here immediately removes this screen —
            the /admin gate reads the EFFECTIVE membership set, so previewing
            as a coach drops the admin's own access to it. That is correct and
            is the whole point of the preview, and it is not a trap: the
            ViewAsBanner AppShell still renders at every width carries the
            Exit button, so the way back never depended on this screen. */}
        <div className="mb-3.5 mt-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Admin</h2>
          <ViewAsSwitcher />
        </div>

        <nav aria-label="Admin sections" className="mb-4 flex gap-2">
          {tabsFor(memberships).map((tab) => (
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
