import { Sheet } from './Sheet.jsx'
import { BACKGROUND_GROUPS, BACKGROUND_PRESETS } from '../lib/chatBackgrounds.js'

// The wallpaper gallery — one sheet, grouped rows, shared by the DM thread
// and the squad/club chat so the two pickers cannot drift
// (claude/plans/2026-08-25-chat-wallpapers-and-dm-order.md).
//
// ⚠️ A SHEET, NOT AN IN-FLOW CARD — Jay, 25 Aug 2026: "when i click chat
// backgrounds nothing happens at all". The card rendered near the TOP of
// the conversation while the stay-pinned hook held the reader at the
// BOTTOM, so it opened offscreen and the pin kept it there. Sheet portals
// to document.body (#400), so where the page is scrolled cannot matter.

export default function ChatBackgroundPicker({ open, onClose, current, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title="Chat background">
      <div data-testid="background-picker">
        <p className="text-[11.5px] text-ink-muted">For every chat, on this device.</p>
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
      </div>
    </Sheet>
  )
}
