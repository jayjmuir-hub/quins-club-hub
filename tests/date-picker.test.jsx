import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// src/components/DatePicker.jsx — the app's own date control, replacing the
// native `<input type="date">` whose OS calendar committed a date on month
// navigation (Jay, 29 Aug 2026). Same 'yyyy-mm-dd' value contract as the native
// input, so callers and the database are unchanged.
//
// PROCESS ZONE: month arithmetic is club-time (UAE, no DST); a runner four hours
// the other side of UTC must still land the right cell.
process.env.TZ = 'America/New_York'

import DatePicker from '../src/components/DatePicker.jsx'

function setup(props = {}) {
  const onChange = vi.fn()
  render(
    <>
      <label htmlFor="d">Date</label>
      <DatePicker id="d" value="" onChange={onChange} {...props} />
    </>,
  )
  return { onChange, user: userEvent.setup() }
}

describe('DatePicker', () => {
  it('shows the value formatted and opens the calendar on click', async () => {
    const { user } = setup({ value: '2026-08-11' })
    expect(screen.getByLabelText('Date')).toHaveTextContent('11 Aug 2026')
    expect(screen.queryByTestId('date-picker-calendar')).toBeNull()
    await user.click(screen.getByLabelText('Date'))
    expect(screen.getByTestId('date-picker-calendar')).toBeInTheDocument()
  })

  it('⚠️ navigating months does NOT commit a date; clicking a day does', async () => {
    const { onChange, user } = setup({ value: '2026-08-11' })
    await user.click(screen.getByLabelText('Date'))
    const cal = screen.getByTestId('date-picker-calendar')

    onChange.mockClear()
    await user.click(within(cal).getByRole('button', { name: 'Next month' }))
    // The whole reason this control exists.
    expect(onChange).not.toHaveBeenCalled()

    await user.click(cal.querySelector('[data-date="2026-09-15"]'))
    expect(onChange).toHaveBeenCalledWith('2026-09-15')
    // Picking closes the calendar.
    expect(screen.queryByTestId('date-picker-calendar')).toBeNull()
  })

  it('jumps years and months by <select> — the birthday case', async () => {
    // A birthday is dozens of months back; the year/month selects make it fast
    // instead of paging one month at a time.
    const { onChange, user } = setup({ value: '', min: '1900-01-02', max: '2026-08-29' })
    await user.click(screen.getByLabelText('Date'))
    const cal = screen.getByTestId('date-picker-calendar')

    await user.selectOptions(within(cal).getByLabelText('Year'), '2015')
    await user.selectOptions(within(cal).getByLabelText('Month'), '7') // August (0-based)
    await user.click(cal.querySelector('[data-date="2015-08-15"]'))

    expect(onChange).toHaveBeenCalledWith('2015-08-15')
  })

  it('calls a day out as a spoken date, not an ISO string', async () => {
    const { user } = setup({ value: '2026-09-17' })
    await user.click(screen.getByLabelText('Date'))
    const cal = screen.getByTestId('date-picker-calendar')
    expect(within(cal).getByRole('button', { name: 'Thursday 17 September 2026' })).toHaveAttribute('data-date', '2026-09-17')
    expect(within(cal).queryByRole('button', { name: '2026-09-17' })).toBeNull()
  })

  it('disables days outside min/max', async () => {
    const { user } = setup({ value: '2026-08-15', min: '2026-08-10', max: '2026-08-20' })
    await user.click(screen.getByLabelText('Date'))
    const cal = screen.getByTestId('date-picker-calendar')
    expect(cal.querySelector('[data-date="2026-08-09"]')).toBeDisabled()
    expect(cal.querySelector('[data-date="2026-08-21"]')).toBeDisabled()
    expect(cal.querySelector('[data-date="2026-08-15"]')).toBeEnabled()
  })

  it('closes on Escape', async () => {
    const { user } = setup({ value: '2026-08-11' })
    await user.click(screen.getByLabelText('Date'))
    expect(screen.getByTestId('date-picker-calendar')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('date-picker-calendar')).toBeNull()
  })
})
