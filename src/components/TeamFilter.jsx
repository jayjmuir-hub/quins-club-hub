// The squad filter, for the Schedule and Roster screens. `selected` is either
// a team id or the ALL_TEAMS_ID sentinel; `onChange` is called with whichever
// was chosen.
//
// ══ ⚠️ A SELECT SINCE 10 Aug 2026. IT WAS A ROW OF PILLS. ═══════════════
// design-system.md §4.8 specifies a `.pill-row` here and this component
// rendered one for months. It stopped working at this club's real size, and
// the failure is worth recording because the pill row was not wrong when it
// was written — it was written against four age groups.
//
// At 18 squads the row wrapped to FOUR lines on a laptop and three on a phone.
// On Schedule that put roughly 150px of filter chrome — sub-tabs, then four
// lines of squad pills, then the event-type row — above the first fixture.
// The controls occupied more of the screen than the thing being controlled.
//
// ⚠️ AND MOST OF THEM LED NOWHERE. Two squads had any events; thirteen pills
// opened an empty list. On Roster the same row said so out loud: "U6 Tag · 0",
// "U7 Tag · 0", and so on down four lines.
//
// A select is one line at any club size, which is the property that matters —
// this club is heading for 600-700 players and the squad list only grows.
//
// ⚠️ WHAT THE PILLS DID BETTER, so nobody re-litigates it without knowing the
// cost: one tap to switch squad, versus tap-choose-dismiss. That is a real
// loss on a phone, and it was judged worth it because the row had stopped
// being scannable — fifteen pills over three lines is not a control anyone
// reads, it is a wall you hunt through. Jay's call, 10 Aug 2026.
//
// ⚠️ THE COUNTS SURVIVED THE CHANGE. They are the reason the Roster row was
// tolerable at all — "which squads actually have anybody" answered at a
// glance — so they moved into the option labels rather than being dropped.
//
// PillButton stays exported from this file: Schedule's Upcoming/Results/
// Calendar sub-tabs and its event-type row are both still pill rows, and
// correctly so — four options each, which is what the pattern is for.
//
// An empty (or missing) teams array renders nothing at all, rather than a
// select with one option in it. The screens already hide this whole block
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
  if (!teams || teams.length === 0) return null

  const optionLabel = (text, key) => {
    const count = counts?.get(key)
    return count == null ? text : `${text} · ${count}`
  }

  return (
    // ⚠️ A REAL <label>, NOT aria-label. The pills carried their own meaning —
    // a button reading "U10" says what it does. A select shows only its
    // CURRENT VALUE, so without a label beside it "U16B Contact" sitting on a
    // schedule is ambiguous: is that a filter, or a heading telling me whose
    // schedule this is? The word costs one short line and removes the
    // question. It is also the difference between a screen reader announcing
    // "Age group, combo box" and announcing a squad name with no context.
    <label className="inline-flex items-center gap-2.5">
      <span className="text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
        {label}
      </span>
      {/* Content-width, not full-width: this is a filter, and a select
          stretched across a desktop content column reads as a form field
          somebody forgot to fill in. */}
      <select
        value={selected}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[14px] font-semibold text-ink outline-none transition hover:border-line-strong focus:border-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <option value={ALL_TEAMS_ID}>{optionLabel(allLabel, ALL_TEAMS_ID)}</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {optionLabel(team.name, team.id)}
          </option>
        ))}
      </select>
    </label>
  )
}

export default TeamFilter
