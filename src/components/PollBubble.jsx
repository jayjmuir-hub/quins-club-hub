// The poll, rendered inside a chat bubble. The question is the message body
// (drawn by ChatBubble above this); this is only the options, bars and the
// "View votes" affordance. Spec: claude/plans/2026-08-27-chat-polls.md.
//
// ⚠️ ADAPTS TO THE BUBBLE IT SITS IN. On my own bubble the ground is brand red,
// so text is white and the bars are white-alpha; on an incoming bubble the
// ground is the card surface, so text is ink and the bars are brand-tinted.
// `mine` is the only switch.

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * @param poll  { allowMultiple, totalVoters, options: [{ id, label, voters: [{id,name}] }] }
 * @param selfId       the reader, to mark their own picks
 * @param mine         is this the reader's own (brand) bubble?
 * @param onVote       (optionId, nextOn) => void ; null makes the poll read-only
 * @param onViewVotes  () => void ; opens the votes sheet. Null hides it.
 */
export default function PollBubble({ poll, selfId, mine = false, onVote = null, onViewVotes = null }) {
  if (!poll) return null
  const { allowMultiple, totalVoters, options } = poll
  const most = options.reduce((m, o) => Math.max(m, o.voters.length), 0)

  const subtle = mine ? 'text-white/75' : 'text-ink-faint'
  const strong = mine ? 'text-white' : 'text-ink'
  const track = mine ? 'bg-white/15' : 'bg-surface-sunk'
  const fill = mine ? 'bg-white/30' : 'bg-brand/25'
  const ring = mine ? 'border-white/50' : 'border-line-strong'
  const chosen = mine ? 'bg-white text-brand' : 'bg-brand text-ink-invert'

  return (
    <div className="mt-1.5 flex flex-col gap-1.5" data-testid="poll">
      <p className={`text-[11px] font-bold uppercase tracking-[0.04em] ${subtle}`}>
        {allowMultiple ? 'Select one or more' : 'Select one'}
      </p>
      {options.map((o) => {
        const count = o.voters.length
        const voted = o.voters.some((v) => v.id === selfId)
        const pct = most > 0 ? Math.round((100 * count) / most) : 0
        return (
          <button
            key={o.id}
            type="button"
            disabled={!onVote}
            onClick={() => onVote?.(o.id, !voted)}
            className="group relative flex w-full items-center gap-2.5 rounded-[10px] px-1 py-1.5 text-left disabled:cursor-default"
            data-testid={`poll-option-${o.position}`}
            aria-pressed={voted}
          >
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center border-2 ${
                allowMultiple ? 'rounded-[6px]' : 'rounded-full'
              } ${voted ? `${chosen} border-transparent` : `${ring} border-solid`}`}
            >
              {voted && <Check />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`flex items-baseline justify-between gap-2 text-[14px] ${strong}`}>
                <span className="min-w-0 break-words">{o.label}</span>
                <span className={`shrink-0 tabular-nums text-[12.5px] ${subtle}`} data-testid={`poll-count-${o.position}`}>
                  {count}
                </span>
              </span>
              <span className={`mt-1 block h-1.5 overflow-hidden rounded-full ${track}`}>
                <span className={`block h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
              </span>
            </span>
          </button>
        )
      })}
      <div className={`mt-0.5 flex items-center justify-between text-[12px] ${subtle}`}>
        <span data-testid="poll-total">
          {totalVoters} {totalVoters === 1 ? 'vote' : 'votes'}
        </span>
        {onViewVotes && totalVoters > 0 && (
          <button
            type="button"
            onClick={onViewVotes}
            className={`font-bold underline-offset-2 hover:underline ${mine ? 'text-white' : 'text-brand-ink'}`}
            data-testid="poll-view-votes"
          >
            View votes
          </button>
        )}
      </div>
    </div>
  )
}
