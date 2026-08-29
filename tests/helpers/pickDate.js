import { screen, within } from '@testing-library/react'

// Set a DatePicker's value in a test the way a person would: open it, jump the
// month/year <select>s, and click the day. Replaces the `type` into the old
// native `<input type="date">`. `iso` is 'yyyy-mm-dd'; `label` is the field's
// accessible name (the <label htmlFor> text).
//
// Only one DatePicker calendar is ever open at a time (opening one closes the
// rest via outside-click), so the Year/Month selects and day buttons are
// unambiguous while a picker is open.
export async function pickDate(user, iso, label = 'Date') {
  const [year, month] = iso.split('-').map(Number) // month is 1-12 in the string
  await user.click(screen.getByLabelText(label)) // open the calendar
  const cal = screen.getByTestId('date-picker-calendar')
  await user.selectOptions(within(cal).getByLabelText('Year'), String(year))
  await user.selectOptions(within(cal).getByLabelText('Month'), String(month - 1)) // 0-based value
  await user.click(within(cal).getByRole('button', { name: iso })) // pick the day; closes
}
