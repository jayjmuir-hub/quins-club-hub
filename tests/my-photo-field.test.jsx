import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// MyPhotoField — the upload half of phase 4 of
// claude/plans/2026-08-13-squad-staff-on-home.md.
//
// ⚠️ THE INTERESTING ASSERTIONS ARE THE FAILURE PATHS, not "does it upload".
// This control uploads IMMEDIATELY, unlike PhotoField, because there is no
// surrounding form to defer to — and that creates a way to orphan an object
// that PhotoField structurally cannot: the file lands, and then the row write
// fails. Two of the tests below exist only to prove that object is cleaned up.

const uploadStaffPhoto = vi.fn()
const setMyPhoto = vi.fn()
const deleteStaffPhoto = vi.fn()
const signStaffPhotoUrl = vi.fn()

const setMyPhotoFocusMock = vi.fn().mockResolvedValue({})

vi.mock('../src/data/photos.js', () => ({
  uploadStaffPhoto: (...a) => uploadStaffPhoto(...a),
  setMyPhoto: (...a) => setMyPhoto(...a),
  deleteStaffPhoto: (...a) => deleteStaffPhoto(...a),
  signStaffPhotoUrl: (...a) => signStaffPhotoUrl(...a),
  setMyPhotoFocus: (...args) => setMyPhotoFocusMock(...args),
}))

import MyPhotoField from '../src/components/MyPhotoField.jsx'

const PROFILE = { id: 'prof-1', full_name: 'Rosa Ferreira', photo_path: null }
const WITH_PHOTO = { ...PROFILE, photo_path: 'prof-1/111.jpg' }

function file(name = 'face.jpg') {
  return new File(['x'], name, { type: 'image/jpeg' })
}

beforeEach(() => {
  uploadStaffPhoto.mockReset()
  setMyPhoto.mockReset()
  deleteStaffPhoto.mockReset()
  signStaffPhotoUrl.mockReset()
  signStaffPhotoUrl.mockResolvedValue('https://example.invalid/signed.jpg')
  deleteStaffPhoto.mockResolvedValue(true)
})

describe('MyPhotoField', () => {
  it('uploads, then records the key', async () => {
    uploadStaffPhoto.mockResolvedValue('prof-1/222.jpg')
    setMyPhoto.mockResolvedValue('prof-1/222.jpg')

    render(<MyPhotoField profile={PROFILE} userId="prof-1" />)
    await userEvent.upload(screen.getByLabelText(/choose a photo/i), file())

    await waitFor(() => expect(setMyPhoto).toHaveBeenCalledWith('prof-1/222.jpg'))
    // ⚠️ THE KEY IS BUILT FROM THE PROFILE ID. The database refuses anything
    // else twice over — the storage policy's with_check and set_my_photo's own
    // 42501 — but sending the wrong one would surface as a permission error
    // the person cannot act on.
    expect(uploadStaffPhoto).toHaveBeenCalledWith('prof-1', expect.any(File))
  })

  it('deletes the uploaded object when recording the key fails', async () => {
    uploadStaffPhoto.mockResolvedValue('prof-1/222.jpg')
    setMyPhoto.mockRejectedValue(new Error('nope'))

    render(<MyPhotoField profile={PROFILE} userId="prof-1" />)
    await userEvent.upload(screen.getByLabelText(/choose a photo/i), file())

    // ⚠️ THE ORPHAN CASE, AND THE ONLY REASON THIS COMPONENT NEEDS A TEST.
    // The object landed and nothing points at it; without this every failed
    // save leaves a file in the bucket forever, and nothing in the app lists
    // them.
    await waitFor(() => expect(deleteStaffPhoto).toHaveBeenCalledWith('prof-1/222.jpg'))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('does not delete anything when the upload itself fails', async () => {
    uploadStaffPhoto.mockRejectedValue(new Error('too big'))

    render(<MyPhotoField profile={PROFILE} userId="prof-1" />)
    await userEvent.upload(screen.getByLabelText(/choose a photo/i), file())

    await screen.findByRole('alert')
    // There is no object to tidy up, and calling remove() on a key that was
    // never created would be a pointless round trip on every rejected file.
    expect(deleteStaffPhoto).not.toHaveBeenCalled()
    expect(setMyPhoto).not.toHaveBeenCalled()
  })

  it('replaces: records the NEW key before deleting the OLD object', async () => {
    uploadStaffPhoto.mockResolvedValue('prof-1/333.jpg')
    setMyPhoto.mockResolvedValue('prof-1/333.jpg')

    render(<MyPhotoField profile={WITH_PHOTO} userId="prof-1" />)
    await userEvent.upload(screen.getByLabelText(/choose a photo/i), file())

    await waitFor(() => expect(deleteStaffPhoto).toHaveBeenCalledWith('prof-1/111.jpg'))
    // ⚠️ ORDER IS THE WHOLE POINT. Deleting the old object first would leave
    // the profile pointing at a file that no longer exists if the write then
    // failed — a broken image rather than an old one.
    //
    // `invocationCallOrder` rather than a toHaveBeenCalledBefore matcher,
    // which is jest-extended and not part of Vitest.
    expect(setMyPhoto.mock.invocationCallOrder[0]).toBeLessThan(
      deleteStaffPhoto.mock.invocationCallOrder[0],
    )
  })

  it('removing clears the row first, then the object', async () => {
    setMyPhoto.mockResolvedValue(null)

    render(<MyPhotoField profile={WITH_PHOTO} userId="prof-1" />)
    await userEvent.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(setMyPhoto).toHaveBeenCalledWith(null))
    expect(deleteStaffPhoto).toHaveBeenCalledWith('prof-1/111.jpg')
    expect(setMyPhoto.mock.invocationCallOrder[0]).toBeLessThan(
      deleteStaffPhoto.mock.invocationCallOrder[0],
    )
  })

  it('offers Remove only when there is a photo', () => {
    // ⚠️ TWO SEPARATE RENDERS, NOT A rerender WITH A DIFFERENT PROFILE, AND
    // THE FIRST ATTEMPT AT THIS TEST WAS WRONG FOR AN INSTRUCTIVE REASON. The
    // component seeds its state ONCE PER PROFILE ID and then owns it, so
    // re-rendering with the same id and a different photo_path deliberately
    // changes nothing — that guard is what stops a stale cached profile
    // wiping an upload the moment anything else re-renders /more. Asserting
    // against a rerender was testing the guard and calling it a bug.
    const first = render(<MyPhotoField profile={PROFILE} userId="prof-1" />)
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add a photo/i })).toBeInTheDocument()
    first.unmount()

    render(<MyPhotoField profile={WITH_PHOTO} userId="prof-1" />)
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change photo/i })).toBeInTheDocument()
  })

  it('says who can see it', () => {
    render(<MyPhotoField profile={PROFILE} userId="prof-1" />)
    // ⚠️ A photo upload with no stated audience is one somebody adds without
    // knowing where it appears. The sentence must match what
    // private.can_see_staff_photo actually enforces.
    expect(screen.getByText(/families of that squad/i)).toBeInTheDocument()
  })
})

// ── Positioning (15 Aug 2026) ───────────────────────────────────────────────
//
// ⚠️ POSITIONING IS A SECOND ACTION, NOT PART OF THE UPLOAD, and these tests
// exist mostly to keep it that way. The upload path here is immediate and its
// ordering is argued for at the top of MyPhotoField.jsx for reasons that have
// nothing to do with where a face is.

describe('MyPhotoField — positioning', () => {
  it('offers Position only once there is a photo', async () => {
    const { unmount } = render(<MyPhotoField profile={PROFILE} userId="prof-1" />)
    expect(screen.queryByRole('button', { name: /^Position$/ })).not.toBeInTheDocument()
    unmount()

    render(<MyPhotoField profile={WITH_PHOTO} userId="prof-1" />)
    expect(await screen.findByRole('button', { name: /^Position$/ })).toBeInTheDocument()
  })

  // ⚠️ THE RESET IS BEST-EFFORT AND OUTSIDE THE ROLLBACK, and this is the test
  // that says why. Awaited inside the upload's try block, a failure here would
  // land in the catch and DELETE A PHOTO THAT HAD ALREADY SAVED — turning a
  // cosmetic problem into data loss. A stale focal point is the lesser harm.
  it('does not undo a saved upload when resetting the focal point fails', async () => {
    setMyPhotoFocusMock.mockRejectedValueOnce(new Error('network'))
    uploadStaffPhoto.mockResolvedValue('prof-1/222.jpg')
    setMyPhoto.mockResolvedValue('prof-1/222.jpg')

    render(<MyPhotoField profile={PROFILE} userId="prof-1" />)

    await userEvent.upload(await screen.findByLabelText(/add a photo/i), file())

    await waitFor(() => expect(setMyPhoto).toHaveBeenCalledWith('prof-1/222.jpg'))
    // The uploaded object must NOT be cleaned up — the save succeeded.
    expect(deleteStaffPhoto).not.toHaveBeenCalledWith('prof-1/222.jpg')
  })
})
