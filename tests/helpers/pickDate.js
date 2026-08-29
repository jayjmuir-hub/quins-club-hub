import { screen, within } from '@testing-library/react'

// Set a DatePicker's value in a test the way a person would: open it, jump the
// month/year <select>s, and click the day. Replaces `type` into the old native
// `<input type="date">`. `iso` is 'yyyy-mm-dd'.
//
// Only one DatePicker calendar is ever open at a time (opening one closes the
// rest via outside-click), so the Year/Month selects and day buttons under the
// `date-picker-calendar` testid are unambiguous while a picker is open.

async function fillOpen(user, iso) {
  const [year, month] = iso.split('-').map(Number) // month is 1-12 in the string
  const cal = screen.getByTestId('date-picker-calendar')
  await user.selectOptions(within(cal).getByLabelText('Year'), String(year))
  await user.selectOptions(within(cal).getByLabelText('Month'), String(month - 1)) // 0-based value
  await user.click(within(cal).getByRole('button', { name: iso })) // pick the day; closes
}

/** Open by the field's accessible name (its <label>). `label` may be a regex. */
export async function pickDate(user, iso, label = 'Date') {
  await user.click(screen.getByLabelText(label))
  await fillOpen(user, iso)
}

/** Open by the trigger's data-testid — for fields addressed by testId in tests. */
export async function pickDateByTestId(user, iso, testId) {
  await user.click(screen.getByTestId(testId))
  await fillOpen(user, iso)
}
