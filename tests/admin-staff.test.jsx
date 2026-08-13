import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// /admin/staff — every squad and who looks after it.
//
// ⚠️ THE SCREEN EXISTS TO SHOW THE GAPS, so the tests that matter are about
// squads with NOBODY. A directory that quietly dropped empty squads would look
// correct and would be useless, which is why the discriminating test below
// separates "no staff" from "the read failed".
//
// Nothing here is security. The rows come back through
// `profile read club admin`, which the Accounts screen has always used, and the
// screen is mounted inside AdminDashboard's admin gate.

const listSquadStaffMock = vi.fn()
const setMembershipTitleMock = vi.fn()

vi.mock('../src/data/staff.js', () => ({
  listSquadStaff: (...args) => listSquadStaffMock(...args),
  setMembershipTitle: (...args) => setMembershipTitleMock(...args),
}))

import AdminStaff from '../src/screens/AdminStaff.jsx'

const COACH = {
  membershipId: 'm-coach',
  role: 'coach',
  title: 'Head Coach',
  name: 'Alex Morgan',
  email: 'alex@example.com',
  phone: '+971500000001',
}

const MEDIC = {
  membershipId: 'm-medic',
  role: 'medic',
  title: null,
  name: 'Sam Patel',
  email: 'sam@example.com',
  phone: null,
}

const SQUADS = [
  { id: 't-u13', name: 'U13 Mixed Contact', staff: [COACH, MEDIC] },
  { id: 't-u14', name: 'U14B Contact', staff: [] },
  { id: 't-u16', name: 'U16B Contact', staff: [] },
]

function renderStaff() {
  const user = userEvent.setup()
  return { user, ...render(<AdminStaff />) }
}

beforeEach(() => {
  vi.clearAllMocks()
  listSquadStaffMock.mockResolvedValue(SQUADS)
  setMembershipTitleMock.mockResolvedValue({ id: 'm-coach', title: 'Assistant Coach' })
})

describe('AdminStaff — the squads with nobody', () => {
  it('lists every squad, including the ones with no staff', async () => {
    renderStaff()

    expect(await screen.findByText('U13 Mixed Contact')).toBeInTheDocument()
    expect(screen.getByText('U14B Contact')).toBeInTheDocument()
    expect(screen.getByText('U16B Contact')).toBeInTheDocument()
    expect(screen.getAllByTestId('squad-card')).toHaveLength(3)
  })

  it('counts the unstaffed squads in the summary, not the staff', async () => {
    renderStaff()

    expect(await screen.findByTestId('staff-summary')).toHaveTextContent(
      '2 of 3 squads have nobody attached yet.',
    )
  })

  it('says so plainly when every squad has someone', async () => {
    listSquadStaffMock.mockResolvedValue([SQUADS[0]])
    renderStaff()

    expect(await screen.findByTestId('staff-summary')).toHaveTextContent('Every squad has someone.')
  })

  // ⚠️ THE DISCRIMINATING TEST. "No staff" and "the read failed" must not look
  // the same: a failed load rendering as a tidy "0 squads have nobody" is the
  // exact bug this screen would be worthless for having.
  it('a failed load shows an error and does NOT report zero gaps', async () => {
    listSquadStaffMock.mockRejectedValue(new Error('Could not reach the database.'))
    renderStaff()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the database.')
    expect(screen.queryByTestId('staff-summary')).not.toBeInTheDocument()
    expect(screen.queryByTestId('squad-card')).not.toBeInTheDocument()
  })

  it('an empty squad says what to do about it', async () => {
    renderStaff()

    const cards = await screen.findAllByTestId('squad-card')
    const u14 = cards.find((card) => within(card).queryByText('U14B Contact'))
    expect(within(u14).getByText(/No coach, team manager or medic yet/)).toBeInTheDocument()
    expect(within(u14).getByText('Nobody yet')).toBeInTheDocument()
  })
})

describe('AdminStaff — a person', () => {
  it('shows the role label, not the raw role', async () => {
    renderStaff()

    expect(await screen.findByText('Coach')).toBeInTheDocument()
    expect(screen.getByText('Medic')).toBeInTheDocument()
    expect(screen.queryByText('medic')).not.toBeInTheDocument()
  })

  it('shows contact details, and says when there is no phone number', async () => {
    renderStaff()

    expect(await screen.findByText('alex@example.com')).toBeInTheDocument()
    expect(screen.getByText('+971500000001')).toBeInTheDocument()
    // ⚠️ Said out loud rather than left blank — a missing number is a thing an
    // admin has to chase, so it must be readable rather than absent.
    expect(screen.getByText('No phone number')).toBeInTheDocument()
  })
})

describe('AdminStaff — setting a title', () => {
  it('saves on blur and keeps the new value on screen', async () => {
    const { user } = renderStaff()

    const input = await screen.findByLabelText('Title', { selector: '#title-m-coach' })
    await user.clear(input)
    await user.type(input, 'Assistant Coach')
    await user.tab()

    await waitFor(() => expect(setMembershipTitleMock).toHaveBeenCalledWith({
      membershipId: 'm-coach',
      title: 'Assistant Coach',
    }))
    await waitFor(() => expect(input).toHaveValue('Assistant Coach'))
  })

  it('does not write when the title has not changed', async () => {
    const { user } = renderStaff()

    const input = await screen.findByLabelText('Title', { selector: '#title-m-coach' })
    await user.click(input)
    await user.tab()

    expect(setMembershipTitleMock).not.toHaveBeenCalled()
  })

  // ⚠️ A REFUSED WRITE MUST NOT LEAVE THE TYPED VALUE ON SCREEN. RLS answers a
  // refusal with a successful empty result, so the data module turns that into
  // a throw — and the screen has to put the field back rather than showing a
  // value the database never accepted.
  it('puts the field back and says why when the save is refused', async () => {
    setMembershipTitleMock.mockRejectedValue(new Error('You may not have permission.'))
    const { user } = renderStaff()

    const input = await screen.findByLabelText('Title', { selector: '#title-m-coach' })
    await user.clear(input)
    await user.type(input, 'Assistant Coach')
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent('You may not have permission.')
    await waitFor(() => expect(input).toHaveValue('Head Coach'))
  })

  it('offers the suggested titles without forcing them', async () => {
    renderStaff()

    await screen.findByText('U13 Mixed Contact')
    const options = document.querySelectorAll('#staff-titles option')
    const values = Array.from(options).map((option) => option.value)
    expect(values).toContain('Head Coach')
    expect(values).toContain('Assistant Coach')
    // A datalist suggests; it does not constrain. The input is a plain text
    // field, so a club can type "Forwards Coach" and nothing stops them.
    const input = screen.getByLabelText('Title', { selector: '#title-m-coach' })
    expect(input.tagName).toBe('INPUT')
    expect(input).toHaveAttribute('list', 'staff-titles')
  })
})
