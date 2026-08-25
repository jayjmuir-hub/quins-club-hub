import { Sheet } from './Sheet.jsx'
import { BACKGROUND_PRESETS } from '../lib/chatBackgrounds.js'

// Five photo tiles, no group headings — Jay, 25 Aug 2026: land exactly
// five chat wallpapers. A SHEET, not an in-flow card: the card opened at
// the TOP of the conversation while the stay-pinned hook held the reader
// at the BOTTOM ("nothing happens at all"). Sheet portals to document.body
// (#400), so where the page is scrolled cannot matter.

export default function ChatBackgroundPicker({ open, onClose, current, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title="Chat background">
      <div data-testid="background-picker">
        <p className="text-[11.5px] text-ink-muted">For every chat, on this device.</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {BACKGROUND_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPick(p.key)}
              aria-pressed={current === p.key}
              className={`rounded-[10px] border p-1 ${current === p.key ? 'border-brand ring-1 ring-brand' : 'border-line'}`}
            >
              <span aria-hidden="true" className="block h-16 w-full rounded-[7px] bg-surface" style={p.style} />
              <span className="mt-1 block truncate text-[11px] font-semibold text-ink">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
