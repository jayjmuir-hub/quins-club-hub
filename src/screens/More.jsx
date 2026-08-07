import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import CalendarSubscribe from '../components/CalendarSubscribe.jsx'
import YourPlayers from '../components/YourPlayers.jsx'
import { useAuth } from '../lib/auth.jsx'
import useMyProfile from '../lib/useMyProfile.js'
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
// ⚠️ THIS SCREEN USED TO MAKE NO QUERY AT ALL, and that was written here as
// a contract. It no longer holds: as of 6 Aug 2026 it reads the caller's
// profile row (name), and YourPlayers reads the linked players, their
// contact rows and their parent rows. The role and squad list still come
// free from useMemberships().
//
// The rule that survives is the reason behind the old one: do not re-query
// anything the membership provider already loaded.

function SectionTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
      {children}
    </h3>
  )
}

export default function More() {
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()
  const { profile } = useMyProfile()
  const admin = isAdmin(memberships)
  const squads = visibleTeams(memberships, teams)

  return (
    <section>
      <div className="mb-3.5 mt-1">
        <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">More</h2>
      </div>

      {/* Added 6 Aug 2026 (Jay): the More screen showed a role, a squad list
          and two links, so "what does the club actually hold about me?" had
          no answer anywhere in the app. Name and email come from the profile
          row and the session — both already loaded, no extra round trip. */}
      <SectionTitle>You</SectionTitle>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-[14px] py-[11px]">
          <span className="text-[15px] font-bold text-ink">Name</span>
          <span data-testid="your-name" className="text-[12.5px] font-semibold text-ink-muted">
            {/* ⚠️ Not every account has a name. A magic-link sign-in has none
                until NamePrompt is answered, and NamePrompt is skippable, so
                this says so plainly rather than rendering an empty row. */}
            {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Not set yet'}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-line px-[14px] py-[11px]">
          <span className="text-[15px] font-bold text-ink">Email</span>
          <span data-testid="your-email" className="truncate text-[12.5px] font-semibold text-ink-muted">
            {user?.email ?? '—'}
          </span>
        </div>
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

      {/* Renders nothing at all for a coach or admin with no child at the
          club — an empty "Your players" card would imply something missing. */}
      <YourPlayers memberships={memberships} teams={teams} />

      {/* The .ics feed already existed but lived only on Schedule. This is
          where someone comes looking for "my stuff", so it belongs here too;
          the component is shared, not copied. */}
      <SectionTitle>Your calendar</SectionTitle>
      <Card className="p-[14px]">
        <CalendarSubscribe />
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

      {/* Account — the IN-APP half of Google Play's account deletion
          requirement (the other half is the public /delete-account URL, which
          is the same screen). Deliberately a link out to that page rather
          than a delete button here: one implementation of a destructive
          action, not two that can drift apart.

          Not styled as a danger button. This sits directly above sign-out,
          and a red "Delete" next to "Sign out" is a mis-tap waiting to
          happen on a phone — the confirmation lives on the page itself. */}
      <SectionTitle>Account</SectionTitle>
      <Card className="overflow-hidden">
        <Link
          to="/privacy"
          className="flex items-center justify-between gap-3 border-b border-line px-[14px] py-[11px] transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span className="text-[15px] font-bold text-ink">Privacy policy</span>
          <span aria-hidden="true" className="text-[15px] text-ink-faint">
            ›
          </span>
        </Link>
        <Link
          to="/delete-account"
          className="flex items-center justify-between gap-3 px-[14px] py-[11px] transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          <span className="text-[15px] font-bold text-ink">Delete your account</span>
          <span aria-hidden="true" className="text-[15px] text-ink-faint">
            ›
          </span>
        </Link>
      </Card>

      {/* Sign out is rendered by AppShell below this, on this route only.
          See the header comment — do not add a second one here. */}
    </section>
  )
}
