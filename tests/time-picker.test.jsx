import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TimePicker, { parseTime } from '../src/components/TimePicker.jsx'

// The app's own time control (29 Aug 2026), replacing the native
// `<input type="time">` that is a cramped spinner on desktop and undrivable in
// a test. It must do two things: accept TYPED input (any minute), and let a
// person TAP hour/minute columns and quick-pick chips — staying in sync — while
// keeping the native 'HH:MM' value contract so EventForm and the feed are
// unchanged.

// A controlled harness: the parent owns the value, as EventForm does.
function Harness({ initial = '', ...rest }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <label htmlFor="t">Time</label>
      <TimePicker id="t" testId="t" value={value} onChange={setValue} {...rest} />
      <output data-testid="val">{value}</output>
    </>
  )
}

const val = () => screen.getByTestId('val').textContent

describe('parseTime — the pure parser', () => {
  it.each([
    ['18:45', '18:45'],
    ['1845', '18:45'],
    ['18.45', '18:45'],
    ['6', '06:00'],
    ['630', '06:30'],
    ['09:05', '09:05'],
    ['0', '00:00'],
    ['23:59', '23:59'],
    ['18:47', '18:47'], // any minute, not just the :00/:15/:30/:45 grid
  ])('reads %s as %s', (input, expected) => {
    expect(parseTime(input)).toBe(expected)
  })

  it.each(['', '  ', 'x', '25:00', '18:60', '99', null, undefined])(
    'rejects %s',
    (input) => {
      expect(parseTime(input)).toBeNull()
    },
  )
})

describe('TimePicker — typing', () => {
  it('shows the value it is given', () => {
    render(<Harness initial="18:30" />)
    expect(screen.getByLabelText('Time')).toHaveValue('18:30')
  })

  it('accepts a typed time, any minute', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('Time'), '18:47')
    expect(val()).toBe('18:47')
  })

  it('accepts bare digits and normalises them on blur', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const field = screen.getByLabelText('Time')
    await user.type(field, '1845')
    expect(val()).toBe('18:45')
    await user.tab() // blur
    expect(field).toHaveValue('18:45') // canonicalised for display
  })

  it('clears to empty when the field is emptied', async () => {
    const user = userEvent.setup()
    render(<Harness initial="18:00" />)
    await user.clear(screen.getByLabelText('Time'))
    expect(val()).toBe('')
  })

  it('discards unparseable text on blur and never commits it', async () => {
    const user = userEvent.setup()
    render(<Harness initial="" />)
    const field = screen.getByLabelText('Time')
    await user.type(field, 'z')
    expect(field).toHaveValue('z') // shown while typing…
    expect(val()).toBe('') // …but never committed to the value
    await user.tab()
    expect(field).toHaveValue('') // and cleared on blur
  })

  it('keeps the last good value when edited to something unparseable, then blurred', async () => {
    const user = userEvent.setup()
    render(<Harness initial="18:00" />)
    const field = screen.getByLabelText('Time')
    // Append a stray letter: parseTime strips it, so the value holds at 18:00.
    await user.type(field, 'x')
    await user.tab()
    expect(field).toHaveValue('18:00')
    expect(val()).toBe('18:00')
  })
})

describe('TimePicker — tapping', () => {
  it('opens the panel on focus and commits hour then minute', async () => {
    const user = userEvent.setup()
    render(<Harness initial="18:00" />)
    await user.click(screen.getByLabelText('Time'))
    const panel = screen.getByTestId('time-picker-panel')

    await user.click(within(within(panel).getByRole('listbox', { name: 'Hour' })).getByText('07'))
    expect(val()).toBe('07:00')
    await user.click(within(within(panel).getByRole('listbox', { name: 'Minute' })).getByText('30'))
    expect(val()).toBe('07:30')
  })

  it('fills from a quick-pick chip', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByLabelText('Time'))
    await user.click(screen.getByRole('button', { name: '17:30' }))
    expect(val()).toBe('17:30')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<Harness initial="18:00" />)
    await user.click(screen.getByLabelText('Time'))
    expect(screen.getByTestId('time-picker-panel')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByTestId('time-picker-panel')).toBeNull()
  })

  it('closes on an outside click', async () => {
    const user = userEvent.setup()
    render(<Harness initial="18:00" />)
    await user.click(screen.getByLabelText('Time'))
    expect(screen.getByTestId('time-picker-panel')).toBeInTheDocument()
    await user.click(document.body)
    expect(screen.queryByTestId('time-picker-panel')).toBeNull()
  })
})

describe('TimePicker — plumbing', () => {
  it('marks itself invalid for the form', () => {
    render(<Harness initial="" invalid />)
    expect(screen.getByLabelText('Time')).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not open when disabled', async () => {
    const user = userEvent.setup()
    render(<Harness initial="18:00" disabled />)
    await user.click(screen.getByLabelText('Time'))
    expect(screen.queryByTestId('time-picker-panel')).toBeNull()
  })

  it('never calls onChange with a half-typed, unparseable value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TimePicker id="t2" value="" onChange={onChange} />)
    // 'z' is unparseable; the only calls must be valid 'HH:MM' or ''.
    await user.type(screen.getByRole('textbox'), 'z')
    expect(onChange.mock.calls.every(([v]) => v === '' || /^\d{2}:\d{2}$/.test(v))).toBe(true)
  })
})
