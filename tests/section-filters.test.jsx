import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TeamFilter, { ALL_TEAMS_ID } from '../src/components/TeamFilter.jsx'
import { isSectionFilter, sectionGroups, teamIdsForFilter } from '../src/lib/section.js'

// Phase 2 of the senior section (claude/plans/2026-09-03-senior-section.md):
// "Senior men" and "Senior women" as choices on the Roster and Schedule
// filters, beside the individual squads.

const TEAMS = [
  { id: 'u10', name: 'U10 Mixed', section: null },
  { id: 'men1', name: 'Senior Men - 1st XV', section: 'senior_men' },
  { id: 'men2', name: 'Senior Men - 2nd XV', section: 'senior_men' },
  { id: 'women', name: 'Senior Women', section: 'senior_women' },
]

describe('section filter choices', () => {
  it('offers one choice per section that has a squad in scope, with those squads', () => {
    expect(sectionGroups(TEAMS)).toEqual([
      { id: 'section:senior_men', text: 'Senior men', teamIds: ['men1', 'men2'] },
      { id: 'section:senior_women', text: 'Senior women', teamIds: ['women'] },
    ])
    // A scope with no senior squads offers nothing — an empty filter is a dead end.
    expect(sectionGroups([TEAMS[0]])).toEqual([])
  })

  it('resolves a choice to team ids: all → null, a squad → itself, a section → its squads', () => {
    expect(teamIdsForFilter(ALL_TEAMS_ID, TEAMS, ALL_TEAMS_ID)).toBeNull()
    expect(teamIdsForFilter('u10', TEAMS, ALL_TEAMS_ID)).toEqual(['u10'])
    expect(teamIdsForFilter('section:senior_men', TEAMS, ALL_TEAMS_ID)).toEqual(['men1', 'men2'])
    // A stale section choice with no squads in scope reads as "all", never as "nothing".
    expect(teamIdsForFilter('section:senior_women', [TEAMS[0]], ALL_TEAMS_ID)).toBeNull()
    expect(isSectionFilter('section:senior_men')).toBe(true)
    expect(isSectionFilter('men1')).toBe(false)
  })
})

describe('TeamFilter with section groups', () => {
  it('lists the sections between All and the squads, and shows the chosen section on the pill', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const counts = new Map([[ALL_TEAMS_ID, 30], ['section:senior_men', 26], ['men1', 14], ['men2', 12], ['women', 4], ['u10', 0]])
    render(<TeamFilter teams={TEAMS} groups={sectionGroups(TEAMS)} selected="section:senior_men" onChange={onChange} counts={counts} />)

    const pill = screen.getByRole('combobox', { name: /age group/i })
    expect(pill).toHaveTextContent('Senior men · 26')
    await user.click(pill)
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toMatch(/^All age groups/)
    expect(options[1]).toMatch(/^Senior men/)
    expect(options[2]).toMatch(/^Senior women/)
    expect(options[3]).toMatch(/^U10 Mixed/)

    // Exact case: the SECTION is "Senior women", the squad is "Senior Women".
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Senior women' }))
    expect(onChange).toHaveBeenCalledWith('section:senior_women')
  })

  it('CONTROL: with no groups the filter is exactly what it was', async () => {
    const user = userEvent.setup()
    render(<TeamFilter teams={TEAMS} selected={ALL_TEAMS_ID} onChange={vi.fn()} />)
    await user.click(screen.getByRole('combobox', { name: /age group/i }))
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options).toHaveLength(5)
    expect(options[1]).toHaveTextContent('U10 Mixed')
  })
})
