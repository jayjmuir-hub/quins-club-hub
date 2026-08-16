import { describe, it, expect, vi, beforeEach } from 'vitest'

// Deleting your account takes your photograph with it.
//
// ⚠️ UNTIL 16 Aug 2026 IT DID NOT. `delete_my_account` removes the auth user and
// `profiles` cascades from it — but a storage object is not a row and cannot
// cascade, and `storage.objects` refuses direct SQL deletion outright
// (`protect_delete`, 42501). So the database could not clean up after itself
// however much it wanted to, and a departed member's head shot stayed in a
// private bucket with nothing pointing at it.
//
// ⚠️ THE ORDER IS THE OPPOSITE OF EVERY OTHER CLEANUP HERE, AND IT IS FORCED.
// `deletePlayer` deletes the row first and the object second, so a failed
// tidy-up leaves a recoverable orphan rather than a live row pointing at a
// missing file. That is not available here: deleting the account destroys the
// SESSION, and the storage policy authorises the delete by `auth.uid()`. After
// the RPC there is no caller left who is permitted to remove the file. It is
// now or never — which is exactly the kind of reasoning that gets "tidied" into
// the house order by a later reader, so it is pinned by the first test below.

const rpc = vi.fn()
const maybeSingle = vi.fn()
const getUser = vi.fn()
const signOut = vi.fn()
const deleteStaffPhotoMock = vi.fn()

// Records what happened in what order — the only way to assert "before".
let order = []

vi.mock('../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: (...a) => getUser(...a),
      signOut: (...a) => signOut(...a),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: (...a) => maybeSingle(...a) }) }),
    }),
    rpc: (...a) => {
      order.push('rpc')
      return rpc(...a)
    },
  },
}))

vi.mock('../src/data/photos.js', () => ({
  deleteStaffPhoto: (...a) => {
    order.push('deleteStaffPhoto')
    return deleteStaffPhotoMock(...a)
  },
}))

import { deleteMyAccount } from '../src/data/account.js'

beforeEach(() => {
  order = []
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  maybeSingle.mockResolvedValue({ data: { photo_path: 'u1/1699999999999.jpg' } })
  rpc.mockResolvedValue({ error: null })
  signOut.mockResolvedValue({})
  deleteStaffPhotoMock.mockResolvedValue(true)
})

describe('deleteMyAccount — the photo goes too', () => {
  it('removes the photo BEFORE the account, because afterwards there is no session to do it with', async () => {
    await deleteMyAccount()

    expect(deleteStaffPhotoMock).toHaveBeenCalledWith('u1/1699999999999.jpg')
    expect(order).toEqual(['deleteStaffPhoto', 'rpc'])
  })

  it('deletes nothing when the person has no photo', async () => {
    maybeSingle.mockResolvedValue({ data: { photo_path: null } })

    await deleteMyAccount()

    expect(deleteStaffPhotoMock).not.toHaveBeenCalled()
    expect(order).toEqual(['rpc'])
  })

  // ⚠️ A FILE THAT WILL NOT DELETE MUST NEVER BLOCK A DELETION REQUEST. Somebody
  // asking for their account to be removed does not get told "no" because
  // storage was unavailable; the orphan is left for the nightly scan to report,
  // which is the whole reason that scan exists.
  it('deletes the account anyway when the photo will not delete', async () => {
    deleteStaffPhotoMock.mockRejectedValue(new Error('storage unavailable'))

    await expect(deleteMyAccount()).resolves.toBeUndefined()
    expect(order).toEqual(['deleteStaffPhoto', 'rpc'])
  })

  it('deletes the account anyway when the profile cannot be read', async () => {
    maybeSingle.mockRejectedValue(new Error('network down'))

    await expect(deleteMyAccount()).resolves.toBeUndefined()
    expect(order).toEqual(['rpc'])
  })

  // ⚠️ THE COST OF THE FORCED ORDERING, STATED OUT LOUD. The photo is already
  // gone by the time the RPC refuses, and that is accepted: a head shot can be
  // uploaded again, whereas the alternative ordering means it can never be
  // deleted at all. The refusal must still reach the caller intact.
  it('still surfaces the last-admin refusal, with the photo already gone', async () => {
    rpc.mockResolvedValue({ error: new Error('you are the only admin of this club') })

    await expect(deleteMyAccount()).rejects.toThrow(/only admin/i)
    expect(deleteStaffPhotoMock).toHaveBeenCalled()
  })

  it('surfaces any other error rather than swallowing it', async () => {
    rpc.mockResolvedValue({ error: new Error('network down') })

    await expect(deleteMyAccount()).rejects.toThrow('network down')
  })
})
