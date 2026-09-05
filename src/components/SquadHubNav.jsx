import { NavLink, useParams } from 'react-router-dom'
import { useMemberships } from '../lib/memberships.jsx'
import { squadHubNavItems } from '../lib/squadHub.js'

// Phone Squad Hub subnav. Desktop already has these as sidebar children;
// the dock has no room for them, so the hub screens carry the same list.
// ⚠️ border-b + mb-4 (16px) since 5 Sep 2026: the grey underline sat on
// the W–D–L band. pb-2.5 lifts the pills off the line; mb-4 is the
// 12–16px air Jay locked. Seniors has no sibling of this chrome.
export default function SquadHubNav({ teamId: teamIdProp }) {
  const params = useParams()
  const teamId = teamIdProp ?? params.teamId
  const { memberships, teams } = useMemberships()
  const team = (teams ?? []).find((candidate) => candidate.id === teamId)
  const items = squadHubNavItems({ teamId, team, memberships, teams })
  if (items.length === 0) return null

  return (
    <nav
      data-testid="squad-hub-pills"
      aria-label="Squad Hub"
      className="mb-4 flex gap-2 overflow-x-auto border-b border-line pb-2.5 desktop:hidden"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            [
              'shrink-0 rounded-pill px-3 py-1.5 text-[12.5px] font-bold',
              isActive ? 'bg-ink text-ink-invert' : 'bg-surface-card text-ink-muted shadow-[inset_0_0_0_1.5px_var(--line)]',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
