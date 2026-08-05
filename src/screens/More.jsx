import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'

// The "More" tab, for EVERYONE (admin-dashboard plan, 2026-08-05).
//
// This file replaces the old src/screens/Admin.jsx, which rendered a
// club-wide admin overview here and a "not authorised" card for everybody
// else — so three of the four roles got a dead tab. The admin content moved
// to /admin (AdminDashboard.jsx); what stays here is the part that is
// genuinely for all roles.
//
// ⚠️ SIGN-OUT IS NOT IN THIS FILE, AND MUST NOT MOVE INTO /admin.
// AppShell.jsx renders SignOutControl when the path is exactly '/more' (see
// its `isMoreRoute`), which is the ONLY sign-out control a parent, player or
// coach can reach. That is why /more survives as a real route rather than
// redirecting into /admin: a redirect would lock every non-admin out of
// signing out. tests/app.test.jsx pins this with a parent actually clicking
// it.
//
// No data fetch here on purpose. Everything shown is already in
// useMemberships() — re-querying teams or members would be a network round
// trip for data the provider loaded once at session start.

function SectionTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
      {children}
    </h3>
  )
}

export default function More() {
  const { memberships, teams } = useMemberships()
  const admin = isAdmin(memberships)
  const squads = visibleTeams(memberships, teams)

  return (
    <section>
      <div className="mb-3.5 mt-1">
        <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">More</h2>
      </div>

      <SectionTitle>Your access</SectionTitle>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-[14px] py-[11px]">
          <span className="text-[15px] font-bold text-ink">Role</span>
          <span data-testid="your-role" className="text-[12.5px] font-semibold text-ink-muted">
            {roleLabel(memberships)}
          </span>
        </div>
        <div className="px-[14px] py-[11px]">
          <span className="text-[15px] font-bold text-ink">Squads you can see</span>
          <p data-testid="your-squads" className="mt-1 text-[12.5px] font-semibold text-ink-muted">
            {squads.length === 0
              ? 'No squads yet.'
              : squads.map((team) => team.name).join(' · ')}
          </p>
        </div>
      </Card>

      {/* Admins only, and desktop only. /admin is a wide, table-heavy screen
          (the plan calls it desktop-only, like /accounts was), so the whole
          block is hidden below the 820px breakpoint rather than just the
          link — a lone "Manage" heading over an empty card is worse than no
          heading at all. CSS-only (`hidden desktop:block`), not
          useMediaQuery: that hook exists for the case where both branches
          would emit the SAME content into the DOM (see its header comment),
          which is not the case here. */}
      {admin && (
        <div className="hidden desktop:block">
          <SectionTitle>Manage</SectionTitle>
          <Card className="p-[14px]">
            <Link
              to="/admin"
              className="flex items-center justify-center gap-2 rounded-[11px] bg-surface-card px-[15px] py-2.5 text-sm font-bold text-brand shadow-[inset_0_0_0_1.5px_theme(colors.line.DEFAULT)] transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Admin
            </Link>
          </Card>
        </div>
      )}

      {/* Sign out is rendered by AppShell below this, on this route only.
          See the header comment — do not add a second one here. */}
    </section>
  )
}
