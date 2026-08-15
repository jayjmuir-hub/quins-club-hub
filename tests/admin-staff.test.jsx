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

// The photo half (15 Aug 2026). Mocked so this file stays network-free; the
// picker's own behaviour is covered by tests/photo-positioner.test.jsx.
const uploadStaffPhotoMock = vi.fn()
const setStaffPhotoMock = vi.fn()
const signStaffPhotoUrlMock = vi.fn()

vi.mock('../src/data/photos.js', () => ({
  uploadStaffPhoto: (...args) => uploadStaffPhotoMock(...args),
  setStaffPhoto: (...args) => setStaffPhotoMock(...args),
  signStaffPhotoUrl: (...args) => signStaffPhotoUrlMock(...args),
}))

import AdminStaff from '../src/screens/AdminStaff.jsx'

const COACH = {
  membershipId: 'm-coach',
  profileId: 'p-coach',
  role: 'coach',
  title: 'Head Coach',
  name: 'Alex Morgan',
  email: 'alex@example.com',
  phone: '+971500000001',
}

const MEDIC = {
  membershipId: 'm-medic',
  profileId: 'p-medic',
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


// ── The photo control (15 Aug 2026) ─────────────────────────────────────────
//
// ⚠️ THIS SCREEN COULD NOT DO THIS UNTIL A RULING WAS REVERSED. Staff photos
// were own-photo-only until 15 Aug; see
// claude/decisions/2026-08-15-admin-may-set-staff-photos.md. The tests below
// are about the WIRING — that the upload key and the focal point reach the
// right functions — because the permission itself lives in the database and is
// not something this screen can get right or wrong.

describe('AdminStaff — setting a photo for somebody else', () => {
  beforeEach(() => {
    uploadStaffPhotoMock.mockReset()
    setStaffPhotoMock.mockReset()
    signStaffPhotoUrlMock.mockReset()
    uploadStaffPhotoMock.mockResolvedValue('p-coach/1234.jpg')
    setStaffPhotoMock.mockResolvedValue({
      id: 'p-coach',
      photo_path: 'p-coach/1234.jpg',
      photo_focus_x: 50,
      photo_focus_y: 50,
    })
    signStaffPhotoUrlMock.mockResolvedValue('https://example.invalid/signed.jpg')
  })

  it('offers a photo control on every staff row', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [COACH, MEDIC] }])

    render(<AdminStaff />)

    const buttons = await screen.findAllByTestId('staff-photo-open')
    expect(buttons).toHaveLength(2)
    expect(buttons[0]).toHaveTextContent(/add photo/i)
  })

  it('says "Change photo" when there already is one', async () => {
    listSquadStaffMock.mockResolvedValue([
      {
        id: 't1',
        name: 'U12 Boys',
        staff: [{ ...COACH, photoPath: 'p-coach/1.jpg', photoUrl: 'https://example.invalid/a.jpg' }],
      },
    ])

    render(<AdminStaff />)
    expect(await screen.findByTestId('staff-photo-open')).toHaveTextContent(/change photo/i)
  })

  it('opens a drop zone naming the person, so an admin cannot lose track of whose photo it is', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [COACH] }])

    render(<AdminStaff />)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))

    expect(screen.getByTestId('staff-photo-editor')).toBeInTheDocument()
    expect(screen.getByLabelText(/Add a photo for Alex Morgan/i)).toBeInTheDocument()
  })

  // ⚠️ THE KEY IS BUILT FROM THE PROFILE ID, NOT THE MEMBERSHIP ID. A photo key
  // is `<profile-id>/<timestamp>` and `set_staff_photo` refuses one that is not
  // — so passing the wrong id here produces a permission error at the database
  // rather than a wrong-looking screen, which is exactly the sort of thing a
  // unit test should catch first.
  it('uploads against the profile id and records the key with the focal point', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [COACH] }])

    render(<AdminStaff />)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))

    const file = new File(['x'], 'face.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText(/Add a photo for Alex Morgan/i)
    await userEvent.upload(input, file)

    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => expect(uploadStaffPhotoMock).toHaveBeenCalledWith('p-coach', file))
    expect(setStaffPhotoMock).toHaveBeenCalledWith('p-coach', 'p-coach/1234.jpg', {
      x: 50,
      y: 50,
    })
  })

  // ⚠️ THE URL HAS TO BE RE-SIGNED. `staff-photos` is private, so the RPC's
  // return value carries only the KEY. Reusing the local object URL would show
  // the right face until the next reload and then break.
  it('re-signs the stored key rather than trusting the local preview', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [COACH] }])

    render(<AdminStaff />)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))
    await userEvent.upload(
      screen.getByLabelText(/Add a photo for Alex Morgan/i),
      new File(['x'], 'face.jpg', { type: 'image/jpeg' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => expect(signStaffPhotoUrlMock).toHaveBeenCalledWith('p-coach/1234.jpg'))
  })

  it('says so when the upload fails, and leaves the editor open', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [COACH] }])
    uploadStaffPhotoMock.mockRejectedValue(new Error('That photo is too large. The limit is 5 MB.'))

    render(<AdminStaff />)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))
    await userEvent.upload(
      screen.getByLabelText(/Add a photo for Alex Morgan/i),
      new File(['x'], 'huge.jpg', { type: 'image/jpeg' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/5 MB/)
    expect(screen.getByTestId('staff-photo-editor')).toBeInTheDocument()
    expect(setStaffPhotoMock).not.toHaveBeenCalled()
  })
})
