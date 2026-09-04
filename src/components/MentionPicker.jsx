import { labelForRole } from '../lib/scope.js'

// "@" — mention somebody in this channel.
//
// Typeahead (Jay, 5 Sep 2026): typing "@" opens the squad's list. A
// permanent @ button stole thumb-space on the phone composer; the list
// itself is unchanged — tap a name, `@Full Name` goes into the text and
// the id into `mentions`. The trigger still filters the ids; this is the
// polite front for a rule the database enforces.
//
// @param people   [{ profile_id, full_name, role }] from listMentionables
// @param query    the text after "@" at the caret, or null when closed
// @param onPick   (person) => void
const STAFF = new Set(['admin', 'coach', 'manager', 'medic'])

export default function MentionPicker({ people, query, onPick }) {
  if (query == null || !people?.length) return null
  const needle = query.toLowerCase()
  const shown = needle
    ? people.filter((p) => p.full_name.toLowerCase().includes(needle))
    : people
  if (!shown.length) return null
  return (
    <ul
      role="listbox"
      aria-label="People in this channel"
      className="absolute bottom-full left-0 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-[12px] border border-line bg-surface-card py-1 shadow-card"
    >
      {shown.map((p) => (
        <li key={p.profile_id} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected="false"
            onClick={() => onPick(p)}
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
  )
}

/** The in-progress @token at `caret`, or null when the list should stay shut. */
export function mentionQueryAt(text, caret) {
  if (typeof text !== 'string' || caret == null || caret < 0) return null
  const before = text.slice(0, caret)
  const match = before.match(/(?:^|[\s])(@[^\s@]*)$/)
  if (!match) return null
  const token = match[1]
  return { query: token.slice(1), start: before.length - token.length }
}

/** Writes `@Full Name ` — appending, or replacing the in-progress @query. */
export function appendMention(draft, person, caret = draft.length) {
  const token = mentionQueryAt(draft, caret)
  if (!token) {
    const sep = draft.length === 0 || /\s$/.test(draft) ? '' : ' '
    return `${draft}${sep}@${person.full_name} `
  }
  return `${draft.slice(0, token.start)}@${person.full_name} ${draft.slice(caret)}`
}
