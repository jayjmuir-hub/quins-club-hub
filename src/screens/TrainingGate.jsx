import Card from '../components/Card.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { adminRightLabel, hasAdminRight } from '../lib/scope.js'

// The "not your job" card the three training tabs wrap themselves in.
//
// ⚠️ THE RIGHT GATES THE SCREEN, NOT THE DATA. RLS on every training table is
// private.is_admin / private.can_edit_team; this is a message, never a
// boundary. Anything that must actually be prevented has to be prevented
// server-side — the sentence at the top of src/lib/scope.js.
//
// ⚠️ REPEATED PER SCREEN RATHER THAN ONCE ON THE ROUTE, because a route is
// linkable and somebody will paste one. Every other admin screen already does
// this (YouthDashboard, Pitches, Allocation); this component exists so the
// three training screens share ONE copy of the wording instead of three that
// can drift apart.
//
// ⚠️ THE LABEL IS READ, NOT TYPED. adminRightLabel is the single home for the
// job names (claude/decisions/2026-08-12-jobs-not-people.md), so renaming the
// job renames this card too.
export default function TrainingGate({ children }) {
  const { memberships } = useMemberships()
  if (hasAdminRight(memberships, 'training')) return children

  const label = adminRightLabel('training')
  return (
    <Card role="alert" className="p-6 text-center">
      <h3 className="text-base font-extrabold text-ink">{label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {label} hasn&rsquo;t been added to your account. A super admin can add it on the Accounts
        screen.
      </p>
    </Card>
  )
}
