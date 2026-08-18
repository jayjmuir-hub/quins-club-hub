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
const setMembershipHeadCoachMock = vi.fn()

vi.mock('../src/data/staff.js', () => ({
  listSquadStaff: (...args) => listSquadStaffMock(...args),
  setMembershipTitle: (...args) => setMembershipTitleMock(...args),
  setMembershipHeadCoach: (...args) => setMembershipHeadCoachMock(...args),
}))

// The photo half (15 Aug 2026). Mocked so this file stays network-free; the
// picker's own behaviour is covered by tests/photo-positioner.test.jsx.
const uploadStaffPhotoMock = vi.fn()
const setStaffPhotoMock = vi.fn()
const signStaffPhotoUrlMock = vi.fn()
const deleteStaffPhotoMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../src/data/photos.js', () => ({
  uploadStaffPhoto: (...args) => uploadStaffPhotoMock(...args),
  setStaffPhoto: (...args) => setStaffPhotoMock(...args),
  signStaffPhotoUrl: (...args) => signStaffPhotoUrlMock(...args),
  deleteStaffPhoto: (...args) => deleteStaffPhotoMock(...args),
}))

import AdminStaff from '../src/screens/AdminStaff.jsx'

// ⚠️ TITLED 'Head Coach' AND NOT FLAGGED, ON PURPOSE. That combination is the
// exact drift memberships.is_head_coach was added to end: the label reads right
// on the squad card while the approval e-mails still do not know who to tell.
// A fixture where the two agree could not tell the title and the flag apart.
const COACH = {
  membershipId: 'm-coach',
  profileId: 'p-coach',
  role: 'coach',
  title: 'Head Coach',
  isHeadCoach: false,
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
  { id: 't-u13', name: 'U13 Mixed', staff: [COACH, MEDIC] },
  { id: 't-u14', name: 'U14B', staff: [] },
  { id: 't-u16', name: 'U16B', staff: [] },
]

function renderStaff() {
  const user = userEvent.setup()
  return { user, ...render(<AdminStaff />) }
}

// ⚠️ EVERY SQUAD IS COLLAPSED ON ARRIVAL SINCE 16 Aug 2026, so anything that
// asserts on a staff row has to open one first. That is the design rather than
// an obstacle: the collapsed list IS the answer to the question this screen is
// usually asked — "which squads have nobody" — and fifteen open squads was the
// wall of near-identical cards the redesign replaced.
async function openSquad(user, squadName = 'U13 Mixed') {
  await user.click(await screen.findByRole('button', { name: new RegExp(squadName, 'i') }))
}

// Name-agnostic: opens every squad. Used by the photo block, whose fixtures
// name their squad differently in almost every case and whose subject is the
// upload wiring rather than which squad the person is in.
async function openEverySquad(user) {
  const rows = await screen.findAllByTestId('squad-card')
  for (const row of rows) {
    await user.click(within(row).getAllByRole('button')[0])
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  listSquadStaffMock.mockResolvedValue(SQUADS)
  setMembershipTitleMock.mockResolvedValue({ id: 'm-coach', title: 'Assistant Coach' })
})

describe('AdminStaff — the squads with nobody', () => {
  it('lists every squad, including the ones with no staff', async () => {
    renderStaff()

    expect(await screen.findByText('U13 Mixed')).toBeInTheDocument()
    expect(screen.getByText('U14B')).toBeInTheDocument()
    expect(screen.getByText('U16B')).toBeInTheDocument()
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

  it('an empty squad is flagged while collapsed, and says what to do when opened', async () => {
    const { user } = renderStaff()

    const cards = await screen.findAllByTestId('squad-card')
    const u14 = cards.find((card) => within(card).queryByText('U14B'))
    // ⚠️ THE GAP READS WITHOUT OPENING ANYTHING — the point of the collapsed
    // row. Said in WORDS as well as colour and a chip, never colour alone
    // (claude/specs/accessibility.md).
    expect(within(u14).getByText(/No coach, manager or medic/)).toBeInTheDocument()
    expect(within(u14).getByText('Gap')).toBeInTheDocument()

    await openSquad(user, 'U14B')
    expect(within(u14).getByText(/No coach, team manager or medic yet/)).toBeInTheDocument()
  })
})

describe('AdminStaff — a person', () => {
  it('shows the role label, not the raw role', async () => {
    const { user } = renderStaff()
    await openSquad(user)

    expect(await screen.findByText('Coach')).toBeInTheDocument()
    expect(screen.getByText('Medic')).toBeInTheDocument()
    expect(screen.queryByText('medic')).not.toBeInTheDocument()
  })

  it('shows contact details, and says when there is no phone number', async () => {
    const { user } = renderStaff()
    await openSquad(user)

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
    await openSquad(user)

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
    await openSquad(user)

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
    await openSquad(user)

    const input = await screen.findByLabelText('Title', { selector: '#title-m-coach' })
    await user.clear(input)
    await user.type(input, 'Assistant Coach')
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent('You may not have permission.')
    await waitFor(() => expect(input).toHaveValue('Head Coach'))
  })

  it('offers the suggested titles without forcing them', async () => {
    const { user } = renderStaff()
    await openSquad(user)

    await screen.findByText('U13 Mixed')
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

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)

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

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
    expect(await screen.findByTestId('staff-photo-open')).toHaveTextContent(/change photo/i)
  })

  it('opens a drop zone naming the person, so an admin cannot lose track of whose photo it is', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [COACH] }])

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
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

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
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

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
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

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
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

// ── Changing a photo that is already there (15 Aug 2026) ────────────────────
//
// ⚠️ THESE EXIST BECAUSE THE FIRST VERSION SHIPPED WITHOUT THEM AND JAY HIT THE
// BUG WITHIN MINUTES: "put an U18 head coach photo, saved, tried to change
// photo and nothing happens". With a photo already stored, opening the editor
// always rendered the POSITIONER — the stored URL was truthy, so the drop zone
// was unreachable — and "Choose a different photo" cleared only the LOCAL
// preview, which the stored one immediately overruled.
//
// The original tests all started from a staff member with NO photo, so every
// one of them passed. That is the shape of the gap worth remembering: the
// happy path was covered and the second use of the same control was not.

describe('AdminStaff — changing a photo that already exists', () => {
  const WITH_PHOTO = {
    ...COACH,
    photoPath: 'p-coach/1.jpg',
    photoUrl: 'https://example.invalid/stored.jpg',
  }

  beforeEach(() => {
    uploadStaffPhotoMock.mockReset().mockResolvedValue('p-coach/999.jpg')
    setStaffPhotoMock.mockReset().mockResolvedValue({
      id: 'p-coach',
      photo_path: 'p-coach/999.jpg',
      photo_focus_x: 50,
      photo_focus_y: 50,
    })
    signStaffPhotoUrlMock.mockReset().mockResolvedValue('https://example.invalid/new.jpg')
  })

  it('opens on the positioner, because repositioning is the common case', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [WITH_PHOTO] }])

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))

    expect(screen.getByTestId('photo-stage')).toBeInTheDocument()
  })

  // ⚠️ THE BUG, EXACTLY AS REPORTED. Before the fix this button cleared the
  // local preview and the stored photo won straight back, so the panel did not
  // change and there was no way to reach a file picker at all.
  it('reaches a file picker via "Choose a different photo"', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [WITH_PHOTO] }])

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))
    await userEvent.click(screen.getByTestId('staff-photo-replace'))

    expect(screen.getByTestId('photo-drop-zone')).toBeInTheDocument()
    expect(screen.queryByTestId('photo-stage')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Add a photo for Alex Morgan/i)).toBeInTheDocument()
  })

  it('uploads the replacement and records the new key', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [WITH_PHOTO] }])

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))
    await userEvent.click(screen.getByTestId('staff-photo-replace'))

    const file = new File(['x'], 'new.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText(/Add a photo for Alex Morgan/i), file)
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => expect(uploadStaffPhotoMock).toHaveBeenCalledWith('p-coach', file))
    expect(setStaffPhotoMock).toHaveBeenCalledWith('p-coach', 'p-coach/999.jpg', { x: 50, y: 50 })
  })

  // ⚠️ SAVE MUST NOT SILENTLY RE-SAVE THE OLD PHOTO. Mid-replacement with no
  // file chosen there is nothing to save, and an enabled button that quietly
  // keeps the existing photo would look like the replacement had worked.
  it('disables Save while replacing until a file is chosen', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [WITH_PHOTO] }])

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))
    await userEvent.click(screen.getByTestId('staff-photo-replace'))

    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled()
  })
})


// ── The review findings (15 Aug 2026) ───────────────────────────────────────
//
// ⚠️ NONE OF THESE COULD HAVE BEEN CAUGHT BY THE EARLIER TESTS, because the
// suite mocks the data layer — an orphaned STORAGE OBJECT is invisible to it.
// What is pinned instead is the calls and their ordering, which is the part
// the component can get wrong.

describe('AdminStaff — replacement does not strand storage objects', () => {
  const WITH_PHOTO = {
    ...COACH,
    photoPath: 'p-coach/old.jpg',
    photoUrl: 'https://example.invalid/old.jpg',
  }

  beforeEach(() => {
    uploadStaffPhotoMock.mockReset().mockResolvedValue('p-coach/new.jpg')
    setStaffPhotoMock.mockReset().mockResolvedValue({
      id: 'p-coach', photo_path: 'p-coach/new.jpg', photo_focus_x: 50, photo_focus_y: 50,
    })
    signStaffPhotoUrlMock.mockReset().mockResolvedValue('https://example.invalid/new.jpg')
    deleteStaffPhotoMock.mockReset().mockResolvedValue(undefined)
  })

  async function replaceWith(file) {
    const user = userEvent.setup()
    render(<AdminStaff />)
    await openEverySquad(user)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))
    await userEvent.click(screen.getByTestId('staff-photo-replace'))
    await userEvent.upload(screen.getByLabelText(/Add a photo for Alex Morgan/i), file)
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }))
  }

  it('deletes the OLD object after the new key is recorded', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [WITH_PHOTO] }])

    await replaceWith(new File(['x'], 'new.jpg', { type: 'image/jpeg' }))

    await waitFor(() => expect(deleteStaffPhotoMock).toHaveBeenCalledWith('p-coach/old.jpg'))
    // ⚠️ AFTER the record, never before — deleting first would, on a failed
    // record, leave the profile pointing at a file that no longer exists.
    expect(setStaffPhotoMock.mock.invocationCallOrder[0]).toBeLessThan(
      deleteStaffPhotoMock.mock.invocationCallOrder[0],
    )
  })

  it('deletes the NEW object when recording it fails, and keeps the old one', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [WITH_PHOTO] }])
    setStaffPhotoMock.mockRejectedValue(new Error('network'))

    await replaceWith(new File(['x'], 'new.jpg', { type: 'image/jpeg' }))

    await waitFor(() => expect(deleteStaffPhotoMock).toHaveBeenCalledWith('p-coach/new.jpg'))
    expect(deleteStaffPhotoMock).not.toHaveBeenCalledWith('p-coach/old.jpg')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  // ⚠️ THE UX DEAD END: the RPC always allowed clearing a photo and the UI
  // never offered it — a wrong photo on the wrong person could only be fixed by
  // overwriting it with another photo.
  it('offers Remove, clears the row first and the object second', async () => {
    listSquadStaffMock.mockResolvedValue([{ id: 't1', name: 'U12 Boys', staff: [WITH_PHOTO] }])
    setStaffPhotoMock.mockResolvedValue({
      id: 'p-coach', photo_path: null, photo_focus_x: null, photo_focus_y: null,
    })

    const user = userEvent.setup()

    render(<AdminStaff />)

    await openEverySquad(user)
    await userEvent.click(await screen.findByTestId('staff-photo-open'))
    await userEvent.click(screen.getByTestId('staff-photo-remove'))

    await waitFor(() =>
      expect(setStaffPhotoMock).toHaveBeenCalledWith('p-coach', null, null),
    )
    await waitFor(() => expect(deleteStaffPhotoMock).toHaveBeenCalledWith('p-coach/old.jpg'))
    expect(setStaffPhotoMock.mock.invocationCallOrder[0]).toBeLessThan(
      deleteStaffPhotoMock.mock.invocationCallOrder[0],
    )
  })
})

// ── the head-coach flag (18 Aug 2026) ───────────────────────────────────────
//
// The approval e-mails go to the head coach, and "head coach" used to mean
// matching `title` against '%head coach%' — free text, no constraints, and
// production already holds 'Assistant Coach/Medic'. The flag is the
// machine-readable half. These assert the SCREEN's half of that.
describe('the head-coach flag', () => {
  const headCoachBox = () => screen.getByRole('checkbox', { name: /head coach/i })

  it('offers the flag to a coach and not to a medic', async () => {
    const { user } = renderStaff()
    await openEverySquad(user)

    // ⚠️ THE MEDIC IS THE CONTROL, and without it this asserts almost nothing:
    // a checkbox rendered for every staff row would pass the coach half. The
    // database refuses the flag on a non-coach, so offering it there would be a
    // control that always fails.
    expect(headCoachBox()).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: /head coach/i })).toHaveLength(1)
  })

  it('is unticked for a coach TITLED head coach but not flagged', async () => {
    const { user } = renderStaff()
    await openEverySquad(user)

    // The fixture's title says "Head Coach". The flag says otherwise, and the
    // flag is what the e-mails read.
    expect(headCoachBox()).not.toBeChecked()
  })

  it('saves the flag and keeps it ticked', async () => {
    setMembershipHeadCoachMock.mockResolvedValue({ id: 'm-coach', is_head_coach: true })
    const { user } = renderStaff()
    await openEverySquad(user)

    await user.click(headCoachBox())

    await waitFor(() =>
      expect(setMembershipHeadCoachMock).toHaveBeenCalledWith({
        membershipId: 'm-coach',
        isHeadCoach: true,
      }),
    )
    await waitFor(() => expect(headCoachBox()).toBeChecked())
  })

  // ⚠️ THIS IS THE ONE WORTH HAVING. The commonest real failure is the unique
  // index refusing a SECOND head coach on a squad — the write fails and the
  // squad is unchanged. A checkbox left ticked would tell the admin they had
  // moved the job when they had not, and the next thing they would notice is
  // an approval e-mail that never arrived.
  it('puts the box BACK when the database refuses the save', async () => {
    setMembershipHeadCoachMock.mockRejectedValue(
      new Error('We couldn’t save that — the squad already has a head coach.'),
    )
    const { user } = renderStaff()
    await openEverySquad(user)

    await user.click(headCoachBox())

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(headCoachBox()).not.toBeChecked()
  })
})
