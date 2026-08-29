import Sheet from './Sheet.jsx'
import { RugbyBallIcon, ConeIcon, PeopleIcon } from './EventTypeIcon.jsx'

// The "What are you adding?" step that opens BEFORE the event form (Jay,
// 29 Aug 2026: he liked "the quick what are you adding? thing then the form
// comes up"). It exists to make a TOURNAMENT a first-class thing you choose up
// front, rather than a Match you scroll ten fields down to reclassify — the
// unintuitiveness that started this. See
// claude/plans/2026-08-29-tournaments-as-containers.md.
//
// ⚠️ THE FOUR KINDS ARE NOT THE FOUR event.type VALUES. type is
// match | training | social; "tournament" is a match with
// competition_type = 'tournament' (a CONTAINER, with its games recorded
// underneath it). The chooser speaks the user's language — the four things they
// actually add — and EventForm turns the pick back into columns. `onPick` is
// called with one of 'match' | 'tournament' | 'training' | 'social'.

// ⚠️ A TROPHY MEANS TOURNAMENT HERE, AND THAT DOES NOT CONTRADICT THE
// EventTypeIcon TOMBSTONE. That tombstone retired the trophy as the SOCIAL mark,
// because a trophy means winning/competition and was sitting on the end-of-term
// BBQ. A tournament IS competition — so a trophy is exactly right for it, and
// the objection there is the argument for it here. It is drawn locally rather
// than added to EVENT_TYPE_ICONS because a tournament is not an event.type and
// the chip/detail marks are keyed by type.
function TrophyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3M9 20h6M10 20l.5-3h3l.5 3" />
    </svg>
  )
}

const KINDS = [
  { kind: 'match', label: 'Match', hint: 'One side, home or away', Icon: RugbyBallIcon },
  { kind: 'tournament', label: 'Tournament', hint: 'A festival or 10s, with its games', Icon: TrophyIcon },
  { kind: 'training', label: 'Training', hint: 'A session', Icon: ConeIcon },
  { kind: 'social', label: 'Social', hint: 'A club event', Icon: PeopleIcon },
]

export default function EventKindChooser({ open = true, onPick, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="New event">
      <p className="mb-3 text-[15px] font-extrabold text-ink">What are you adding?</p>
      <div className="grid grid-cols-2 gap-2.5">
        {KINDS.map(({ kind, label, hint, Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            className="flex flex-col items-start gap-1.5 rounded-[13px] border-[1.5px] border-line bg-surface-card p-3.5 text-left outline-none transition hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Icon className="h-5 w-5 text-ink" aria-hidden="true" />
            <span className="text-sm font-bold text-ink">{label}</span>
            <span className="text-[11.5px] leading-snug text-ink-faint">{hint}</span>
          </button>
        ))}
      </div>
    </Sheet>
  )
}
