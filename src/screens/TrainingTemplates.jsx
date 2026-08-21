import Card from '../components/Card.jsx'
import TrainingGate from './TrainingGate.jsx'

// ⚠️ A PLACEHOLDER, AND DELIBERATELY A ROUTED ONE. The Templates tab of the Rugby
// Performance Director portal is built in Task 7 of
// claude/plans/2026-08-21-training-plans-implementation.md. The route exists
// now so the portal's tab row, its nested-route behaviour and its gate can all
// be proved before any of the three screens has content — the alternative is a
// tab row pointing at a 404 for the length of the branch.
//
// ⚠️ THE GATE STAYS WHEN THE CONTENT ARRIVES. It is not scaffolding: a route is
// linkable, so every training screen wraps itself.
export default function TrainingTemplates() {
  return (
    <TrainingGate>
      <Card className="p-6 text-center text-sm text-ink-muted">Coming soon.</Card>
    </TrainingGate>
  )
}
