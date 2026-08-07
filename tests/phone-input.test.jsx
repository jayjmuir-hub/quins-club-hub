import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PhoneInput from '../src/components/PhoneInput.jsx'

// Jay, 7 Aug 2026, from a phone screenshot of the Edit player sheet: the
// country control read "+971+971", the two overlapping.
//
// CAUSE: `appearance-none` removes a <select>'s dropdown arrow but NOT the
// selected option's text. The option text is "+971 United Arab Emirates", and
// a separate overlay span paints "+971" on top to keep the collapsed control
// tidy. Both were visible, and at 124px wide they collided.
//
// ⚠️ jsdom applies no CSS, so no test can see the overlap itself. These pin
// the two class tokens the fix depends on — the same approach the masthead
// breakpoint regression uses.

function renderPhone(props = {}) {
  return render(
    <PhoneInput
      label="Phone"
      country="AE"
      national="503617261"
      onCountryChange={vi.fn()}
      onNationalChange={vi.fn()}
      {...props}
    />,
  )
}

describe('PhoneInput — the +971+971 overlap', () => {
  it('hides the select’s own text so only the overlay shows', () => {
    renderPhone()
    const select = screen.getByRole('combobox', { name: /phone country/i })
    expect(select.className).toMatch(/(^|\s)text-transparent(\s|$)/)
  })

  it('⚠️ keeps the OPTIONS readable, which text-transparent would otherwise eat', () => {
    // The injected fault for the test above. Firefox and some Chromium builds
    // inherit the select's colour into its options — hiding the collapsed
    // value would then hide all 245 countries in the open list too.
    renderPhone()
    const option = screen.getByRole('option', { name: /United Arab Emirates/i })
    expect(option.className).toMatch(/(^|\s)text-ink(\s|$)/)
    expect(option.className).not.toMatch(/text-transparent/)
  })

  it('shows the dial code exactly once', () => {
    // The bug in one assertion: two elements rendered "+971" over each other.
    renderPhone()
    const shown = screen.getAllByText('+971')
    expect(shown).toHaveLength(1)
  })

  it('puts the dial code where the hidden text would have been, not the far edge', () => {
    renderPhone()
    const dial = screen.getByText('+971')
    // pl-11 on the select; left-11 on the overlay. Matching values are what
    // make it sit directly after the flag rather than across the control.
    expect(dial.className).toMatch(/(^|\s)left-11(\s|$)/)
    expect(dial.className).not.toMatch(/right-/)
  })
})

describe('PhoneInput — still works', () => {
  it('keeps the country searchable by name in the open list', () => {
    // The whole reason the option text is "+971 United Arab Emirates" rather
    // than just the dial code: typing "uni" jumps to it natively.
    renderPhone()
    expect(screen.getByRole('option', { name: '+971 United Arab Emirates' })).toBeInTheDocument()
  })

  it('reports a country change', async () => {
    const onCountryChange = vi.fn()
    renderPhone({ onCountryChange })
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /phone country/i }),
      'GB',
    )
    expect(onCountryChange).toHaveBeenCalledWith('GB')
  })

  it('labels the country picker separately from the number', () => {
    renderPhone()
    expect(screen.getByRole('combobox', { name: 'Phone country' })).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
  })

  it('renders no dial code in the overlay when no country is set', () => {
    // ⚠️ Scoped to the overlay element. A bare queryByText(/^\+\d/) also
    // matches the 245 <option> elements, which always carry a dial code —
    // that version failed for the wrong reason.
    const { container } = renderPhone({ country: '' })
    const overlay = container.querySelector('span.left-11')
    expect(overlay).not.toBeNull()
    expect(overlay.textContent).toBe('')
  })
})
