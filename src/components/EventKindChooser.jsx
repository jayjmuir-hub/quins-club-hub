import Sheet from './Sheet.jsx'
// ⚠️ CalendarIcon IS IMPORTED, NOT REDRAWN, and that is the opposite of the
// TrophyIcon below on purpose. A trophy is drawn locally because a tournament
// is not an event.type and so has no entry in EVENT_TYPE_ICONS; a Club Diary
// entry DOES have one (keyed 'diary', via eventChipKind), so a second copy here
// would be exactly the drift the trophy's own comment warns about.
import { RugbyBallIcon, ConeIcon, PeopleIcon, CalendarIcon } from './EventTypeIcon.jsx'

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
  // ⚠️ FULL WIDTH, AND NOT MERELY BECAUSE FIVE DOES NOT DIVIDE BY TWO. The four
  // above are things that happen on a pitch; this one is not, and the layout
  // should say so rather than leaving it as an orphan in a third row.
  //
  // ⚠️ 'diary' IS NOT AN events.type. It maps to type='social' with
  // info_only = true in EventForm's initialValues, exactly as 'tournament' maps
  // to a match with competition_type='tournament'. The string never reaches the
  // database. claude/plans/2026-08-31-club-diary.md.
  //
  // ⚠️ THE HINT IS THE WHOLE DISTINCTION FROM "Social", so it has to earn its
  // line: both are club events on a date, and the only difference that matters
  // to whoever is choosing is whether anybody is expected to answer.
  {
    kind: 'diary',
    label: 'Club Diary',
    hint: 'On the calendar, nothing to reply to',
    Icon: CalendarIcon,
    span: true,
  },
]

export default function EventKindChooser({ open = true, onPick, onClose }) {
  return (
    <Sheet open={open} onClose={onClose} title="New event">
      <p className="mb-3 text-[15px] font-extrabold text-ink">What are you adding?</p>
      <div className="grid grid-cols-2 gap-2.5">
        {KINDS.map(({ kind, label, hint, Icon, span }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onPick(kind)}
            className={`flex flex-col items-start gap-1.5 rounded-[13px] border-[1.5px] border-line bg-surface-card p-3.5 text-left outline-none transition hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2${span ? ' col-span-2' : ''}`}
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
