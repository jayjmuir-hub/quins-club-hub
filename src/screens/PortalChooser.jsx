import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import { countAdminWaiting } from '../data/members.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { PORTALS, closedReason, portalHome, portalLabel } from '../lib/portals.js'

// What /admin renders. Jay, 12 Aug 2026: "i'd like more of a split off for the
// dashboards, accounts with those rights would have a tab to enter whichever
// portal they have access to".
// Ruling: claude/decisions/2026-08-12-admin-portals.md.
//
// ⚠️ EVERY CARD RENDERS FOR EVERY ADMIN — Jay: "the cards would still be
// visible but greyed out and not clickable". Hiding a portal somebody does not
// hold would mean granting the right produces no visible change, which reads as
// a broken grant. Showing all four makes the club's shape legible.
//
// ⚠️ A GREY CARD IS NOT A LINK, IN THE MARKUP AND NOT MERELY IN THE STYLING.
// This repo has already shipped a control that drew itself, invited a tap and
// swallowed it — the availability button on the Dashboard. A disabled-looking
// <Link> is that defect with a lower opacity. So the closed branch renders a
// plain element: nothing to focus, nothing to press, nothing to route.
//
// ⚠️ THE STATE IS IN WORDS, NOT IN THE GREY. "You haven't been given this job"
// and "No screen yet" are DIFFERENT SITUATIONS with different fixes — a super
// admin can solve the first on the Accounts screen; only building something
// solves the second. Colour alone cannot say which (claude/specs/accessibility.md),
// and collapsing them into one message would send people to Accounts to ask for
// a thing that does not exist.

const CLOSED_COPY = {
  'no-right': 'This job hasn’t been added to your account. A super admin can add it on the Accounts screen.',
  'no-screen': 'No screen yet.',
}

const CLUB_PORTAL = PORTALS.find((portal) => portal.key === 'club')
const ACCOUNTS_TO = portalHome(CLUB_PORTAL)

export default function PortalChooser() {
  const { memberships } = useMemberships()
  const { user } = useAuth()

  // The same count the sidebar Admin badge shows (`countAdminWaiting`): pending
  // memberships plus people waiting for access. Zero (or a failed read) renders
  // nothing, matching Sidebar — a "0" card would be a destination to an empty
  // queue. The card is the destination that badge was missing: /admin is a
  // chooser, and without this the number on Admin had nowhere to go.
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    let mounted = true
    countAdminWaiting(user?.id)
      .then((count) => {
        if (mounted) setWaiting(count)
      })
      .catch(() => {
        if (mounted) setWaiting(0)
      })
    return () => {
      mounted = false
    }
  }, [user?.id])

  return (
    <div>
      {/* Phase 3: the chooser opens in the editorial voice like every other
          landing surface. The cards below are unchanged. */}
      <div className="mb-4">
        <Kicker>Club admin</Kicker>
        <AccentTitle lead="The club's jobs," accent="pick yours." />
      </div>
      {waiting > 0 && (
        <Card
          as={Link}
          to={ACCOUNTS_TO}
          data-testid="admin-waiting-queue"
          className="mb-3 block p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-card-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[17px] font-extrabold tracking-[-0.2px] text-ink">
              Waiting for review
            </h3>
            <span
              aria-label={`${waiting} waiting for review`}
              className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold leading-4 text-white"
            >
              {waiting}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            People waiting for access, and memberships still waiting to be approved.
            This is the number on Admin.
          </p>
          <span className="mt-3 inline-block text-[13px] font-bold text-brand-ink">Open Accounts</span>
        </Card>
      )}
      <div data-testid="portal-chooser" className="grid gap-3 desktop:grid-cols-2">
      {PORTALS.map((portal) => {
        const reason = closedReason(portal, memberships)
        const label = portalLabel(portal)
        const showWaiting = portal.key === 'club' && waiting > 0

        if (!reason) {
          return (
            <Card
              key={portal.key}
              as={Link}
              to={portalHome(portal)}
              data-testid="portal-card-open"
              className="block p-5 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-card-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[17px] font-extrabold tracking-[-0.2px] text-ink">{label}</h3>
                {showWaiting && (
                  <span
                    aria-hidden="true"
                    data-testid="admin-waiting-on-club"
                    className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold leading-4 text-white"
                  >
                    {waiting}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{portal.blurb}</p>
              <span className="mt-3 inline-block text-[13px] font-bold text-brand-ink">Open</span>
            </Card>
          )
        }

        return (
          <Card
            key={portal.key}
            data-testid="portal-card-closed"
            data-reason={reason}
            className="p-5 opacity-70"
          >
            <h3 className="text-[17px] font-extrabold tracking-[-0.2px] text-ink-muted">{label}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{CLOSED_COPY[reason]}</p>
          </Card>
        )
      })}
      </div>
    </div>
  )
}
