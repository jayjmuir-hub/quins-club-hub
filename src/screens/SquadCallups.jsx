import { useParams } from 'react-router-dom'
import CallupCard from '../components/CallupCard.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import SquadHubNav from '../components/SquadHubNav.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam } from '../lib/scope.js'

// Senior Call-ups — own Squad Hub pill. The U18 pool must not sit on Overview.
export default function SquadCallups() {
  const { teamId } = useParams()
  const { memberships, teams, loading: membershipsLoading } = useMemberships()
  const team = teams?.find((candidate) => candidate.id === teamId)
  const mayView = canEditTeam(memberships, teamId)

  if (membershipsLoading) return <Spinner label="Loading…" />
  if (!mayView) {
    return <Empty message="This isn't one of your squads. The Squad Hub shows a squad to the staff who run it." />
  }
  if (!team?.is_senior) {
    return <Empty message="Call-ups are for senior squads. U18 staff are told when a family is asked." />
  }

  return (
    <div>
      <div className="mb-3.5 mt-1">
        <Kicker>{team?.name ?? 'Squad'} · Squad Hub</Kicker>
        <AccentTitle lead="U18" accent="call-ups." />
        <p className="text-[13px] font-medium text-ink-muted">
          Ask a family once. They say yes or no; consent lasts the season.
        </p>
      </div>
      <SquadHubNav teamId={teamId} />
      <CallupCard team={team} />
    </div>
  )
}
