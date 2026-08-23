import { useState } from 'react'
import { labelForRole } from '../lib/scope.js'

// "@" — mention somebody in this channel.
//
// ⚠️ A LIST, NOT AN AUTOCOMPLETE. Typing "@" and getting a popover is the
// WhatsApp habit, and it is the first thing that breaks on a phone keyboard
// with autocorrect. A button that opens the squad's list, tap a name, done —
// the name goes into the text as `@Full Name` and the id into `mentions`.
// The trigger filters the ids to the squad anyway; this is the polite front
// for a rule the database enforces.
//
// @param people   [{ profile_id, full_name, role }] from listMentionables
// @param onPick   (person) => void
const STAFF = new Set(['admin', 'coach', 'manager', 'medic'])

export default function MentionPicker({ people, onPick, disabled = false }) {
  const [open, setOpen] = useState(false)
  if (!people?.length) return null
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Mention someone"
        className="grid h-[40px] w-[40px] place-items-center rounded-[10px] border border-line bg-surface-card text-[16px] font-extrabold text-ink-muted hover:text-ink disabled:opacity-50"
      >
        @
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="People in this channel"
          className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-[12px] border border-line bg-surface-card py-1 shadow-card"
        >
          {people.map((p) => (
            <li key={p.profile_id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onPick(p)
                  setOpen(false)
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-surface-mute"
              >
                <span className="truncate font-semibold text-ink">{p.full_name}</span>
                {STAFF.has(p.role) && (
                  <span className="shrink-0 rounded-[6px] bg-danger-bg px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] text-danger-ink">
                    {labelForRole(p.role) ?? p.role}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Appends `@Full Name ` to a draft, with a space before it if needed. */
export function appendMention(draft, person) {
  const sep = draft.length === 0 || /\s$/.test(draft) ? '' : ' '
  return `${draft}${sep}@${person.full_name} `
}
