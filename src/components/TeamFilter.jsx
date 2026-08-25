import { useEffect, useId, useRef, useState } from 'react'

// The squad filter, for the Schedule and Roster screens. `selected` is either
// a team id or the ALL_TEAMS_ID sentinel; `onChange` is called with whichever
// was chosen.
//
// ══ ⚠️ A CUSTOM PILL DROPDOWN, NOT A NATIVE <select>, AND NOT A PILL ROW ══
// design-system.md §4.8 specifies a `.pill-row` here and this component
// rendered one for months. It stopped working at this club's real size:
// at 18 squads the row wrapped to FOUR lines on a laptop and three on a
// phone. On Schedule that put roughly 150px of filter chrome above the
// first fixture. A native <select> fixed the height (10 Aug 2026, Jay's
// call) but sat in the 2.0 chrome as an unstyled browser widget.
//
// The control is now the same pill language as Upcoming / Training: one
// pill that opens a list. Eighteen squads stay one line; they never wrap
// back into a wall of pills. Do not restore the pill row without a new
// reason — the size problem has not gone away.
//
// ⚠️ THE COUNTS SURVIVED. They are the reason the Roster row was tolerable
// at all — "which squads actually have anybody" — so they still suffix the
// option labels.
//
// PillButton stays exported from this file: Schedule's Upcoming/Results/
// Calendar sub-tabs and its event-type row are both still pill rows, and
// correctly so — four options each, which is what the pattern is for.
//
// An empty (or missing) teams array renders nothing at all, rather than a
// control with one option in it. The screens already hide this whole block
// when there is only one visible squad (design-system.md §5.2/§5.3); this
// guard covers the zero case for the same reason.

export const ALL_TEAMS_ID = 'all'

// Exported so the Schedule's Upcoming/Results/Calendar sub-tab row reuses
// this styling instead of re-declaring it — design-system.md §4.8 is
// explicit that the same .pill component serves both rows. It stays a plain
// toggle button with aria-pressed rather than an ARIA tablist: a tablist
// owes the user roving tabindex and arrow-key navigation, and a half-built
// tablist is worse for screen-reader users than an honest toggle button.
export function PillButton({ active, onClick, children }) {
  const classes = [
    'shrink-0 whitespace-nowrap rounded-[20px] px-[14px] py-[7px] text-[13px] font-bold outline-none transition',
    'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    active ? 'bg-chrome text-white' : 'bg-surface-card text-ink-faint shadow-[inset_0_0_0_1.5px_theme(colors.line.DEFAULT)]',
  ].join(' ')

  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={classes}>
      {children}
    </button>
  )
}

function Chevron({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

// `counts`, when given, is a Map from team id (plus ALL_TEAMS_ID for the All
// pill) to a number, and suffixes each label with it — "U10 · 9", the live
// count design-system.md §4.8 specifies for the roster filter. It is its own
// prop rather than something the caller bakes into `team.name`, because a
// team's name is domain data: overwriting it to smuggle a count through also
// rewrites the pill's accessible name via a field whose job is to say what
// the squad is called. A team with no entry in the map renders its bare name,
// so callers with no counts to show (the Schedule's filter) pass nothing and
// are unaffected.
export function TeamFilter({
  teams,
  selected,
  onChange,
  allLabel = 'All age groups',
  counts,
  label = 'Age group',
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  const labelId = useId()
  const listId = useId()

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function onPointerDown(event) {
      if (triggerRef.current?.contains(event.target)) return
      if (panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  if (!teams || teams.length === 0) return null

  const optionLabel = (text, key) => {
    const count = counts?.get(key)
    return count == null ? text : `${text} · ${count}`
  }

  const selectedTeam = teams.find((team) => team.id === selected)
  const selectedText = selected === ALL_TEAMS_ID || !selectedTeam ? allLabel : selectedTeam.name
  const filtered = selected !== ALL_TEAMS_ID && Boolean(selectedTeam)

  const options = [
    { id: ALL_TEAMS_ID, text: allLabel },
    ...teams.map((team) => ({ id: team.id, text: team.name })),
  ]

  const pick = (id) => {
    onChange(id)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="relative inline-flex min-w-0 items-center gap-2">
      {/* ⚠️ A REAL VISIBLE LABEL, NOT aria-label alone. A pill reading "U10"
          said what it did; a closed dropdown shows only its current value, so
          without the word beside it a squad name sitting on a schedule is
          ambiguous: filter, or heading? */}
      <span id={labelId} className="shrink-0 text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((was) => !was)}
        className={[
          'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-[20px] px-[14px] py-[7px] text-[13px] font-bold outline-none transition',
          'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
          filtered || open
            ? 'bg-chrome text-white'
            : 'bg-surface-card text-ink-faint shadow-[inset_0_0_0_1.5px_theme(colors.line.DEFAULT)]',
        ].join(' ')}
      >
        <span className="truncate">{optionLabel(selectedText, selected)}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <ul
          ref={panelRef}
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 top-[calc(100%+6px)] z-30 max-h-64 min-w-[12rem] overflow-y-auto rounded-[12px] border border-line bg-surface-card py-1 shadow-card"
        >
          {options.map((option) => {
            const isSelected = option.id === selected
            return (
              <li key={option.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(option.id)}
                  className={[
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] font-semibold transition',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
                    isSelected ? 'bg-surface-mute text-ink' : 'text-ink hover:bg-surface-mute',
                  ].join(' ')}
                >
                  {optionLabel(option.text, option.id)}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default TeamFilter
