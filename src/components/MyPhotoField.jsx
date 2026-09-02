import { useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import Card from './Card.jsx'
import { initials } from '../lib/playerFormat.js'
import {
  deleteStaffPhoto,
  setMyPhoto,
  setMyPhotoFocus,
  signStaffPhotoUrl,
  uploadStaffPhoto,
} from '../data/photos.js'
import PhotoPositioner, {
  PhotoDropZone,
  clampFocus,
  focusToObjectPosition,
} from './PhotoPositioner.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'

// "Your photo" on /more — the upload half of phase 4 of
// claude/plans/2026-08-13-squad-staff-on-home.md.
//
// ⚠️ EVERY MEMBER GETS THIS CARD, NOT ONLY STAFF, and that is deliberate. The
// alternative is deciding who is "staff" in the UI, which means a second copy
// of a rule the database already owns — and it would take the card away from
// somebody the moment an admin changed their role, losing a photo they had
// already uploaded. What the ROLE decides is who can SEE it
// (`private.can_see_staff_photo`), which is the database's job. A parent who
// uploads one has simply put a face next to their own name for nobody.
//
// ⚠️ IT IS NOT A SECOND PLACE TO EDIT YOUR NAME. YouCard above is deliberately
// read-only until "Edit" is pressed (Jay, 9 Aug 2026) because /more is mostly
// opened for other reasons. This card follows the same instinct: no live text
// input, and the only controls are two buttons.

/**
 * ⚠️ UPLOADS IMMEDIATELY, UNLIKE `PhotoField`, AND THE DIFFERENCE IS THAT THERE
 * IS NO FORM HERE.
 *
 * PhotoField defers the upload until the surrounding PlayerForm is saved, so
 * that abandoning the form leaves no orphaned photograph of a child in the
 * bucket. This card has no save button to defer to, so the upload IS the
 * action — which means an orphan is possible in a different way: the object
 * lands and then `set_my_photo` fails, leaving a file nothing points at.
 *
 * So the order is: upload, record, and **delete the just-uploaded object if
 * recording fails**. That is the opposite order to a replacement, where the OLD
 * object is deleted only after the NEW key is safely recorded — in both cases
 * the rule is that a failure never leaves the profile pointing at nothing.
 */
export default function MyPhotoField({ profile, userId }) {
  const inputRef = useRef(null)
  const [photoPath, setPhotoPath] = useState(profile?.photo_path ?? null)
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // ⚠️ POSITIONING IS A SECOND ACTION, NOT PART OF THE UPLOAD. The upload here
  // is immediate and its ordering is argued for at the top of this file for
  // reasons that have nothing to do with where a face is; folding the focal
  // point into it would entangle the two. `set_my_photo_focus` is a separate
  // RPC for the same reason.
  const [positioning, setPositioning] = useState(false)
  const [focus, setFocus] = useState(clampFocus(
    profile?.photo_focus_x == null && profile?.photo_focus_y == null
      ? null
      : { x: profile?.photo_focus_x, y: profile?.photo_focus_y },
  ))

  const profileId = profile?.id ?? userId ?? null
  const ready = Boolean(profileId)

  // ⚠️ SEEDED WHEN THE PROFILE ARRIVES, THEN OWNED LOCALLY. useMyProfile
  // resolves asynchronously and is cached at module level with no reload, so
  // re-seeding on every profile object would undo an upload the moment
  // anything else re-rendered this screen.
  const seededFor = useRef(null)
  useEffect(() => {
    if (!profile?.id || seededFor.current === profile.id) return
    seededFor.current = profile.id
    setPhotoPath(profile.photo_path ?? null)
    setFocus(
      clampFocus(
        profile.photo_focus_x == null && profile.photo_focus_y == null
          ? null
          : { x: profile.photo_focus_x, y: profile.photo_focus_y },
      ),
    )
  }, [profile])

  useEffect(() => {
    let mounted = true
    if (!photoPath) {
      setUrl(null)
      return undefined
    }
    signStaffPhotoUrl(photoPath).then((value) => {
      if (mounted) setUrl(value)
    })
    return () => {
      mounted = false
    }
  }, [photoPath])

  async function upload(file) {
    if (!file || !profileId) return
    setBusy(true)
    setError(null)
    const previous = photoPath
    let uploaded = null
    try {
      uploaded = await uploadStaffPhoto(profileId, file)
      await setMyPhoto(uploaded)
      setPhotoPath(uploaded)
      // ⚠️ A NEW PHOTO RESETS THE FOCAL POINT. Keeping the old one would apply
      // a position chosen for a DIFFERENT picture, which is worse than the
      // centre because it looks deliberate.
      //
      // ⚠️ BEST-EFFORT, AND OUTSIDE THE ROLLBACK, AND THE EXISTING TEST IS WHAT
      // FORCED THAT. Awaited inside the try above, a failure here would land in
      // the catch and DELETE A PHOTO THAT HAD ALREADY SAVED SUCCESSFULLY —
      // turning a cosmetic problem into data loss. A stale focal point on a
      // saved photo is the lesser harm by a wide margin, and the person can
      // reposition it.
      setFocus(clampFocus(null))
      setMyPhotoFocus(null).catch(() => {})
      setPositioning(true)
      // Only now is the old object unreferenced. Best-effort: an orphan in a
      // private bucket is untidy, and failing here must not turn a successful
      // save into a visible error.
      if (previous) await deleteStaffPhoto(previous)
    } catch (err) {
      // ⚠️ THE OBJECT LANDED AND THE ROW DID NOT. Tidy it up, or the bucket
      // accumulates a file per failed save that nothing will ever point at.
      if (uploaded) await deleteStaffPhoto(uploaded)
      setError(friendlyMessage(err, 'That photo could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  async function savePosition() {
    setBusy(true)
    setError(null)
    try {
      await setMyPhotoFocus(focus)
      setPositioning(false)
    } catch (err) {
      setError(friendlyMessage(err, 'That position could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  // ⚠️ THE COMMENTS THAT USED TO LIVE HERE MOVED INTO `upload()` WITH THE CODE.
  // This is now only the input's adapter: take the file, clear the input so the
  // SAME photo can be picked again after a failure — which is exactly the photo
  // somebody retries with — and hand it on.
  async function choose(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    await upload(file)
  }

  async function remove() {
    if (!photoPath) return
    setBusy(true)
    setError(null)
    const previous = photoPath
    try {
      // ⚠️ THE ROW FIRST, THE OBJECT SECOND — the opposite order to the social
      // ideas delete, and for the opposite reason. There, deleting the row
      // first would orphan an image nobody can reach. Here the row is the only
      // thing anyone reads, so clearing it is what makes the photo gone; a
      // failure to delete the object then leaves an unreferenced file rather
      // than a profile pointing at a missing one.
      await setMyPhoto(null)
      setPhotoPath(null)
      setUrl(null)
      await deleteStaffPhoto(previous)
    } catch (err) {
      setError(friendlyMessage(err, 'That photo could not be removed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-[14px]" data-testid="my-photo">
      <div className="flex items-center gap-3.5">
        {url ? (
          <img
            src={url}
            alt=""
            style={{ objectPosition: focusToObjectPosition(focus) }}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-[16px] bg-brand/10 object-cover"
          />
        ) : (
          <div
            className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[16px] bg-brand/10 text-[20px] font-extrabold tracking-[.5px] text-danger-ink"
            aria-hidden="true"
          >
            {initials(profile?.full_name)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {/* ⚠️ SAYS WHO CAN SEE IT, AND THAT IS THE POINT OF THE SENTENCE.
                A photo upload with no audience stated is a photo somebody
                uploads without knowing where it appears. The rule stated here
                is exactly what private.can_see_staff_photo enforces. */}
            If you coach, manage or look after a squad, this appears next to your
            name for the families of that squad.
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {/* ⚠️ ONLY WHEN THERE IS ALREADY A PHOTO. With none, the drop zone
                below IS the control — it is tappable and says so. Rendering both
                gave two buttons with the SAME accessible name doing the same
                thing, which a screen reader reports as a duplicate and the test
                caught as "Found multiple elements with the role button". */}
            {photoPath && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !ready}
                onClick={() => inputRef.current?.click()}
              >
                Change photo
              </Button>
            )}
            {photoPath && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setPositioning((was) => !was)}
              >
                {positioning ? 'Done' : 'Position'}
              </Button>
            )}
            {photoPath && (
              <Button type="button" variant="secondary" disabled={busy} onClick={remove}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ⚠️ THE DROP ZONE IS AN ADDITION, NOT A REPLACEMENT. The buttons above
          stay the primary route because this app is opened on a phone, and a
          phone has no drag. This is for the desktop admin sitting with a folder
          of headshots. */}
      {!photoPath && ready && (
        <div className="mt-3">
          <PhotoDropZone onFile={upload} disabled={busy} label="Add a photo" />
        </div>
      )}

      {positioning && url && (
        <div className="mt-3" data-testid="my-photo-positioner">
          <PhotoPositioner url={url} focus={focus} onFocusChange={setFocus} disabled={busy} />
          <div className="mt-2.5">
            <Button type="button" disabled={busy} onClick={savePosition}>
              {busy ? 'Saving…' : 'Save position'}
            </Button>
          </div>
        </div>
      )}

      {/* Visually hidden but a real, focusable input — the same arrangement
          PhotoField uses, and for the same reason: a bare <input type="file">
          is an unstyleable native control reading "No file chosen". */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        aria-label="Choose a photo of yourself"
        onChange={choose}
      />

      {busy && <p className="mt-2 text-[12.5px] text-ink-faint">Saving…</p>}
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-bold text-brand-ink">
          {error}
        </p>
      )}
    </Card>
  )
}
