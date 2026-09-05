import { NavLink, useParams } from 'react-router-dom'
import { useMemberships } from '../lib/memberships.jsx'
import { squadHubNavItems } from '../lib/squadHub.js'

// Phone Squad Hub subnav. Desktop already has these as sidebar children;
// the dock has no room for them, so the hub screens carry the same list.
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
      className="mb-3.5 flex gap-2 overflow-x-auto desktop:hidden"
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
