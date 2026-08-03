import { useEffect, useRef, useState } from 'react'
import { signPhotoUrl } from '../data/photos.js'
import { initials } from '../lib/playerFormat.js'

// The head-shot field in PlayerForm: current photo (or a monogram), a button
// to choose a new one, and a button to remove it.
//
// PREVIEWS ARE LOCAL, NOT UPLOADED. Choosing a file shows an object URL made
// from the file itself; nothing reaches storage until the form is saved. That
// keeps "I picked the wrong photo, let me pick again" free, and — more
// importantly — means abandoning the form uploads nothing, so there are no
// orphaned photographs of children left in the bucket by a coach who changed
// their mind.
//
// The file input is visually hidden and driven by a real button. A bare
// <input type="file"> renders as an unstyleable native control with a
// "No file chosen" label; hiding it and clicking it from a button keeps the
// house style while leaving a genuine, focusable, keyboard-operable input in
// the DOM.

export default function PhotoField({
  player,
  file,
  removed,
  onFileChange,
  onRemove,
  disabled = false,
}) {
  const inputRef = useRef(null)
  const [storedUrl, setStoredUrl] = useState(null)
  const [localUrl, setLocalUrl] = useState(null)

  // The already-saved photo, signed for viewing.
  useEffect(() => {
    let mounted = true
    if (!player?.photo_path) {
      setStoredUrl(null)
      return undefined
    }
    signPhotoUrl(player.photo_path).then((url) => {
      if (mounted) setStoredUrl(url)
    })
    return () => {
      mounted = false
    }
  }, [player?.photo_path])

  // The just-chosen file. Revoked on change and on unmount — an object URL
  // pins the whole file in memory until it is released, and a coach working
  // through a squad would otherwise accumulate every photo they previewed.
  useEffect(() => {
    if (!file) {
      setLocalUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setLocalUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // A newly chosen file wins over the stored one; "removed" beats both.
  const preview = localUrl ?? (removed ? null : storedUrl)
  const hasPhoto = Boolean(preview)

  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
        Photo
      </span>

      <div className="flex items-center gap-3.5">
        {preview ? (
          <img
            src={preview}
            alt=""
            className="h-20 w-20 shrink-0 rounded-[18px] bg-surface-mute object-cover"
          />
        ) : (
          <div
            className="grid h-20 w-20 shrink-0 place-items-center rounded-[18px] bg-surface-mute text-[26px] font-extrabold tracking-[.5px] text-ink-faint"
            aria-hidden="true"
          >
            {initials(player?.full_name)}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              onFileChange?.(event.target.files?.[0] ?? null)
              // Clear the input's own value so choosing the SAME file twice
              // still fires a change event (e.g. after pressing Remove).
              event.target.value = ''
            }}
            aria-label="Choose a photo"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2 text-sm font-bold text-brand transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {hasPhoto ? 'Change photo' : 'Add photo'}
          </button>

          {hasPhoto && (
            <button
              type="button"
              onClick={() => onRemove?.()}
              disabled={disabled}
              className="rounded-[11px] px-4 py-2 text-sm font-bold text-brand-deep transition hover:bg-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-[12.5px] text-ink-muted">
        A head shot. It&apos;s resized on your device before uploading, so a photo straight from
        your camera is fine.
      </p>
    </div>
  )
}
