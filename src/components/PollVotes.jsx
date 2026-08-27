import { Sheet } from './Sheet.jsx'
import { Avatar } from './NewChatPicker.jsx'

// "View votes" — who picked what. Everyone who can read the poll sees this: the
// 27 Aug parity ruling (claude/decisions/2026-08-27-chat-polls-open-visible.md).
// Names are full_name, never a photo — the same rule the rest of chat keeps.

export default function PollVotes({ open, onClose, poll }) {
  return (
    <Sheet open={open} onClose={onClose} title="Votes">
      {poll && (
        <div className="flex flex-col gap-4" data-testid="poll-votes">
          {poll.options.map((o) => (
            <div key={o.id}>
              <div className="flex items-baseline justify-between gap-2 border-b border-line pb-1.5">
                <p className="min-w-0 break-words text-[14px] font-bold text-ink">{o.label}</p>
                <span className="shrink-0 tabular-nums text-[12.5px] text-ink-faint">
                  {o.voters.length}
                </span>
              </div>
              {o.voters.length === 0 ? (
                <p className="mt-1.5 text-[12.5px] italic text-ink-faint">No votes yet</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {o.voters.map((v) => (
                    <li key={v.id} className="flex items-center gap-2.5">
                      <Avatar name={v.name} size="sm" />
                      <span className="text-[13.5px] text-ink">{v.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
