// Team filter pill row (design-system.md §4.8 .pill / .pill-row): a
// horizontally-scrollable row of single-select filter buttons — "All" plus
// one pill per visible team, used for both the schedule team filter and the
// roster team filter. `selected` is either a team id or the ALL_TEAMS_ID
// sentinel; `onChange` is called with whichever was clicked.
//
// aria-pressed (not aria-current): these pills behave like a segmented
// single-select toggle, not like a set of pages/steps a user moves through
// in sequence (the usual case for aria-current). aria-pressed communicates
// "this is the active state of a toggle button" — which is exactly what a
// filter pill is — without borrowing "current page" semantics that don't
// apply here.
//
// An empty (or missing) teams array renders nothing at all, rather than an
// "All" pill with nothing to filter against — a filter control with zero
// options to select between isn't a usable control, and the screens that
// consume this already hide the whole row when there's only one visible
// team (design-system.md §5.2/§5.3), so a component-level "nothing to show"
// guard for the zero case is consistent with that same pattern.

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
    'focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2',
    active ? 'bg-quinsBlack text-white' : 'bg-white text-[#77726e] shadow-[inset_0_0_0_1.5px_#e6e3e1]',
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
export function TeamPills({ teams, selected, onChange, allLabel = 'All', counts }) {
  if (!teams || teams.length === 0) return null

  const label = (text, key) => {
    const count = counts?.get(key)
    return count == null ? text : `${text} · ${count}`
  }

  return (
    <div className="flex gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <PillButton active={selected === ALL_TEAMS_ID} onClick={() => onChange(ALL_TEAMS_ID)}>
        {label(allLabel, ALL_TEAMS_ID)}
      </PillButton>
      {teams.map((team) => (
        <PillButton key={team.id} active={selected === team.id} onClick={() => onChange(team.id)}>
          {label(team.name, team.id)}
        </PillButton>
      ))}
    </div>
  )
}

export default TeamPills
