import { useState } from 'react'
import { enterSends, setEnterSends } from '../lib/chatComposer.js'

// "option to have enter button send a message, changeable" — Jay, 24 Aug
// 2026. A DEVICE setting (localStorage), not an account one: typing habits
// belong to the keyboard in front of you — Enter-to-send suits a desktop
// keyboard and is a mis-send trap next to a phone thumb. Off by default.
export default function EnterSendsToggle() {
  const [on, setOn] = useState(() => enterSends())

  function toggle() {
    setEnterSends(!on)
    setOn(!on)
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[14px] font-bold text-ink">Enter sends the message</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-ink-muted">
          In chat, pressing Enter sends instead of starting a new line (Shift+Enter for a new line). This device only.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Enter sends the message"
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-pill transition-colors ${on ? 'bg-accent-mid' : 'bg-surface-sunk'}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-surface-card shadow-card transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  )
}
