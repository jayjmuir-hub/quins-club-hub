import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin } from '../lib/scope.js'
import { portalForPath, portalLabel, visibleTabs } from '../lib/portals.js'

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
        <h3 className="text-base font-extrabold text-danger-ink">Not authorised</h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
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
        {/* ⚠️ THE COPY NAMES THE MASTHEAD, AND IT HAS TO. This card used to
            render its own <ViewAsSwitcher /> and say "change who you are
            previewing BELOW". The control moved into the masthead on 14 Aug
            2026 and is now on every screen, so the word "below" pointed at
            nothing — the exact shape of dead instruction this repo has shipped
            before (the availability button that drew itself and swallowed the
            tap). Both ways out are at the top of the screen now: the eye button
            changes the persona, Exit preview ends it. */}
        <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-relaxed text-ink-muted">
          Admin tools are hidden while you preview, because you are seeing the app as
          someone else sees it. Use the eye button at the top of the screen to change who
          you are previewing, or Exit preview to come back.
        </p>
      </Card>
    </section>
  )
}

// ⚠️ THE TAB ROW IS NOW PORTAL-SCOPED, and this replaced a single row that grew
// with every right somebody held (12 Aug 2026,
// claude/decisions/2026-08-12-admin-portals.md). /admin is a chooser; standing
// inside a portal shows THAT portal's tabs and no others.
//
// ⚠️ THE PORTALS AND THEIR TABS LIVE IN src/lib/portals.js, not here. The
// chooser reads the same list, so a portal cannot be enterable from one place
// and invisible in the other.
//
// ⚠️ Gating remains a UI decision only, exactly as it was: RLS decides which
// rows any query returns, and the rights gate SCREENS rather than data
// (claude/decisions/2026-08-10-role-dashboards.md). Each screen still repeats
// its own check, because a route is linkable and somebody will paste the URL.

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
// The inactive label is `text-ink` rather than the old `text-brand-ink`: on
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
  const { pathname } = useLocation()

  // null at /admin itself, which is the chooser. Everything below keys off it.
  const portal = portalForPath(pathname)

  // ⚠️ THE TAB ROW IS NARROWER THAN THE PORTAL SINCE 17 Aug 2026 — the Rights
  // log is Club Admin's, but only a super admin is offered it. Read from the
  // EFFECTIVE set like the gate above, so an admin previewing as a coach loses
  // the tab along with the screen. Hiding a tab grants nothing and hides no
  // data: see visibleTabs' header, and membership_audit's read policy.
  const tabs = portal ? visibleTabs(portal, memberships) : []

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
      {/* ⚠️ THE WIDTH GATE IS GONE — phase 4 of the 2.0 retheme, and it was
          Jay's own ruling: "we need to figure out how to bring admin
          functions into the app, that is my decision now" (21 Aug 2026).
          The "Needs a bigger screen" card sat here from the first admin
          screen to that day. It guarded against "wide tables and
          multi-column forms" that a survey found the admin screens do not
          actually contain — they are card- and list-based, and the one true
          grid (Allocation) carries its own overflow-x-auto. The ROLE gates
          above are untouched: width was never one of them. */}
      <div>
        {/* ⚠️ ViewAsSwitcher NO LONGER LIVES HERE — 14 Aug 2026, Jay: "i want
            to be able to select view as with a drop down from any screen, as an
            admin". It is in the masthead, which AppShell renders around every
            routed screen, so this screen was the ONE place it did not need to
            be repeated.

            ⚠️ IT WAS REMOVED RATHER THAN LEFT IN PLACE ALONGSIDE, and that is
            the point: two copies of one control drift, and on this screen they
            would have been six inches apart doing the same job. The same
            reasoning src/lib/portals.js gives for one tab list read by two
            things.

            ⚠️ Starting a preview immediately removes this screen — the /admin
            gate reads the EFFECTIVE membership set, so previewing as a coach
            drops the admin's own access to it. That is correct and is the whole
            point of the preview, and it was never a trap: ViewAsBanner carries
            Exit at every width, and now the trigger is up there too. */}
        <div className="mb-3.5 mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {portal && (
              <Link
                to="/admin"
                className="text-[13px] font-bold text-brand-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                ← Admin
              </Link>
            )}
            <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[26px]">
              {portal ? portalLabel(portal) : 'Admin'}
            </h2>
          </div>
        </div>

        {/* ⚠️ NO TAB ROW FOR A ONE-TAB PORTAL. A row of a single tab is chrome
            that says nothing the heading has not already said. Match sheets is
            the current case; Social Media Management will be the next one. */}
        {portal && tabs.length > 1 && (
          <nav aria-label="Admin sections" className="mb-4 flex flex-wrap gap-2">
            {/* ⚠️ `flex-wrap` ON THIS NAV IS LOAD-BEARING, NOT TIDINESS — added
                12 Aug 2026 with the "Squads & league teams" rename. The row was
                a bare `flex`, and a row that overruns does not clip: the
                DOCUMENT gets wider than the viewport, and after that every
                element sized to the viewport renders short or clipped, on
                screens three away from this one. That exact failure is already
                recorded against Schedule's header, where one bug read as four
                because the bottom nav is `fixed` and looked perfect throughout.
                Two tabs fit at 360px today; the wrap is what stops the NEXT
                label being a five-screen bug. */}
            {/* ⚠️ `end` IS LOAD-BEARING AND WAS NOT NEEDED UNTIL 12 Aug 2026.
                Every tab used to be a leaf, so a prefix match was harmless.
                Social Media Management introduced the first NESTED pair —
                /admin/social and /admin/social/ideas — and without `end` a
                NavLink is active for its own path AND every path beneath it,
                so "What's on" would light up while you are standing on
                "Ideas". Two tabs marked current is worse than none. */}
            {tabs.map((tab) => (
              <NavLink key={tab.to} to={tab.to} end className={tabClassName}>
                {tab.label}
              </NavLink>
            ))}
          </nav>
        )}

        <Outlet />
      </div>
    </section>
  )
}
