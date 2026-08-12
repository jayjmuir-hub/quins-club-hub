import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The super-admin control for assigning admin rights.
//
// ⚠️ NONE OF THIS IS THE ENFORCEMENT, and a green run here says nothing about
// whether an ordinary admin can actually change anything. What refuses them is
// the column grant on `memberships` plus the set_admin_rights RPC, proved
// against the live database in db/tests/rls-super-admin.sql. These tests cover
// the half that harness cannot see: that the screen tells the truth.
//
// The failure worth guarding is a lying UI — a tick that stays put after the
// write was refused, leaving somebody certain that an account holds Pitch
// Management when the database disagrees.

const setAdminRightsMock = vi.fn()

vi.mock('../src/data/members.js', () => ({
  setAdminRights: (...args) => setAdminRightsMock(...args),
}))

const AdminRightsEditor = (await import('../src/components/AdminRightsEditor.jsx')).default

const membership = (extra = {}) => ({
  id: 'memb-1',
  role: 'admin',
  status: 'active',
  is_super: false,
  admin_rights: [],
  ...extra,
})

function setup(props = {}) {
  const onChanged = vi.fn()
  render(<AdminRightsEditor membership={membership()} label="Test Admin" onChanged={onChanged} {...props} />)
  return { onChanged, user: userEvent.setup() }
}

beforeEach(() => {
  setAdminRightsMock.mockReset()
  setAdminRightsMock.mockImplementation((id, isSuper, rights) =>
    Promise.resolve({ id, is_super: isSuper, admin_rights: rights }),
  )
})

describe('assigning admin rights', () => {
  it('shows every right, none ticked for a plain admin', async () => {
    setup()
    for (const label of ['Club Youth Manager', 'Social Media Management', 'Pitch Management']) {
      expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked()
    }
  })

  it('saves the right that was ticked, and only that one', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Pitch Management' }))

    await waitFor(() => expect(setAdminRightsMock).toHaveBeenCalled())
    expect(setAdminRightsMock).toHaveBeenCalledWith('memb-1', false, ['pitches'])
  })

  it('unticking removes just that right', async () => {
    const { user } = setup({ membership: membership({ admin_rights: ['youth', 'media'] }) })
    await user.click(screen.getByRole('checkbox', { name: 'Club Youth Manager' }))

    await waitFor(() => expect(setAdminRightsMock).toHaveBeenCalled())
    expect(setAdminRightsMock).toHaveBeenCalledWith('memb-1', false, ['media'])
  })

  it('⚠️ a super admin shows every right ticked and locked, not misleadingly empty', async () => {
    // A super admin holds all rights implicitly. Empty boxes would read as
    // "this person has no rights", which is the opposite of the truth.
    setup({ membership: membership({ is_super: true }) })
    for (const label of ['Club Youth Manager', 'Social Media Management', 'Pitch Management']) {
      const box = screen.getByRole('checkbox', { name: label })
      expect(box).toBeChecked()
      expect(box).toBeDisabled()
    }
  })

  it('⚠️ PUTS THE TICK BACK when the write is refused', async () => {
    // The lying-UI failure. Without the revert somebody walks away certain
    // that an account holds Pitch Management while the database says otherwise.
    setAdminRightsMock.mockRejectedValue(new Error('Only a super admin can change admin rights'))
    const { user } = setup()

    const box = screen.getByRole('checkbox', { name: 'Pitch Management' })
    await user.click(box)

    expect(await screen.findByText(/only a super admin/i)).toBeInTheDocument()
    await waitFor(() => expect(box).not.toBeChecked())
  })

  it('⚠️ does not report a change upward when the write failed', async () => {
    // onChanged triggers a refetch and, in Accounts, a re-render that would
    // otherwise paper over the failure.
    setAdminRightsMock.mockRejectedValue(new Error('nope'))
    const { onChanged, user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Club Youth Manager' }))

    await screen.findByRole('alert')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('promoting to super saves the flag, keeping the rights already held', async () => {
    const { user } = setup({ membership: membership({ admin_rights: ['media'] }) })
    await user.click(screen.getByRole('checkbox', { name: 'Super admin' }))

    await waitFor(() => expect(setAdminRightsMock).toHaveBeenCalled())
    expect(setAdminRightsMock).toHaveBeenCalledWith('memb-1', true, ['media'])
  })

  it('says out loud what the tiers mean', async () => {
    // The difference between an admin and a super admin appears nowhere else
    // on the screen, and "rights do not withhold data" is the thing most
    // likely to be assumed wrongly.
    setup()
    expect(screen.getByText(/only person who can change this/i)).toBeInTheDocument()
    expect(screen.getByText(/already see the whole club/i)).toBeInTheDocument()
  })
})
