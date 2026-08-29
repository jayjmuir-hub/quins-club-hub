import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// src/components/RepeatUntilField.jsx — the control that replaced the native
// "Repeat until" date picker (29 Aug 2026). The native OS calendar committed a
// date when you navigated to the next MONTH; this proves the replacement does
// NOT, and that both ways of setting the end date resolve to the right string.
//
// PROCESS ZONE like the EventForm files — the arithmetic is club-zone (UAE,
// no DST), so it must hold under a runner four hours the other side of UTC.
process.env.TZ = 'America/New_York'

import RepeatUntilField from '../src/components/RepeatUntilField.jsx'

function setup(props = {}) {
  const onChange = vi.fn()
  render(<RepeatUntilField startDate="2026-08-11" value="" onChange={onChange} {...props} />)
  return { onChange, user: userEvent.setup() }
}

describe('RepeatUntilField', () => {
  it('starts showing 0 (not blank), can step to 0, and resolves a week count', async () => {
    const { onChange, user } = setup()
    const weeks = screen.getByLabelText('Repeat weekly for')
    // Not a blank box — it says what it is for, and the spinner reaches 0.
    expect(weeks).toHaveValue(0)
    expect(weeks).toHaveAttribute('min', '0')
    // 2 weeks from Tue 11 Aug = Tue 25 Aug.
    await user.clear(weeks)
    await user.type(weeks, '2')
    expect(onChange).toHaveBeenLastCalledWith('2026-08-25')
  })

  it('recomputes a week-based end date when the start date moves', async () => {
    const { onChange, rerender } = (() => {
      const onChange = vi.fn()
      const utils = render(<RepeatUntilField startDate="2026-08-11" value="" onChange={onChange} />)
      return { onChange, rerender: utils.rerender }
    })()
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Repeat weekly for'), '2')
    expect(onChange).toHaveBeenLastCalledWith('2026-08-25')
    // Move the start a week later; the 2-week end must follow.
    rerender(<RepeatUntilField startDate="2026-08-18" value="2026-08-25" onChange={onChange} />)
    expect(onChange).toHaveBeenLastCalledWith('2026-09-01')
  })

  it('⚠️ navigating months in the inline calendar does NOT commit a date', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('button', { name: /or pick an end date/i }))
    expect(screen.getByTestId('repeat-calendar-month')).toHaveTextContent('August 2026')

    onChange.mockClear()
    await user.click(screen.getByRole('button', { name: 'Next month' }))

    // THE WHOLE REASON THIS CONTROL EXISTS: a month hop must not pick a date.
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByTestId('repeat-calendar-month')).toHaveTextContent('September 2026')

    // Clicking an actual day IS a commit.
    await user.click(screen.getByRole('button', { name: '2026-09-15' }))
    expect(onChange).toHaveBeenCalledWith('2026-09-15')
  })

  it('disables days before the start date', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /or pick an end date/i }))
    // 10 Aug is before the 11 Aug start.
    expect(screen.getByRole('button', { name: '2026-08-10' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '2026-08-12' })).toBeEnabled()
  })
})
