import Card from './Card.jsx'
import { BACKGROUND_GROUPS, BACKGROUND_PRESETS } from '../lib/chatBackgrounds.js'

// The wallpaper gallery — one card, grouped rows, shared by the DM thread
// and the squad/club chat so the two pickers cannot drift
// (claude/plans/2026-08-25-chat-wallpapers-and-dm-order.md). The choice is
// device-level and applies to every chat; saying so is the card's job.

export default function ChatBackgroundPicker({ current, onPick }) {
  return (
    <Card className="mb-3 p-3" data-testid="background-picker">
      <p className="text-[12.5px] font-extrabold text-ink">Chat background</p>
      <p className="mt-0.5 text-[11.5px] text-ink-muted">For every chat, on this device.</p>
      {BACKGROUND_GROUPS.map(({ group, label }) => (
        <div key={group}>
          <p className="mb-1 mt-2.5 text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">{label}</p>
          <div className="grid grid-cols-4 gap-2">
            {BACKGROUND_PRESETS.filter((p) => p.group === group).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => onPick(p.key)}
                aria-pressed={current === p.key}
                className={`rounded-[10px] border p-1 ${current === p.key ? 'border-brand ring-1 ring-brand' : 'border-line'}`}
              >
                <span aria-hidden="true" className="block h-12 w-full rounded-[7px] bg-surface" style={p.style ?? undefined} />
                <span className="mt-1 block truncate text-[11px] font-semibold text-ink">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Card>
  )
}
