// Downscales and re-encodes a photo in the browser before it is uploaded.
//
// WHY THIS EXISTS: a phone camera produces a 3–5 MB, 4000px JPEG. It is
// displayed in this app at 40–80 CSS pixels. Uploading the original means
// every coach on pitch-side 4G pushes several megabytes to record one head
// shot, and every roster load pulls thirty of them back down to render them
// the size of a postage stamp. Resizing to 600px square costs a few hundred
// milliseconds on the device and turns ~4 MB into ~40 KB — a 50–100×
// reduction in both directions.
//
// This matters far more than any storage-bucket setting: private vs public
// buckets move zero bytes either way, whereas this moves nearly all of them.
//
// SQUARE CROP, CENTRED: every place a photo is shown is a square or rounded
// square (roster row, detail hero). Cropping here rather than with CSS
// object-fit means the bytes of the discarded edges are never uploaded at
// all. Centre-crop is the right default for a head shot, where the face is
// almost always central; it is not smart cropping and will clip a badly
// framed photo, which is visible immediately in the form's preview.

const TARGET_SIZE = 600 // px, square. ~7.5× the largest on-screen size, so it
                        // stays sharp on a 3× density phone screen.
const QUALITY = 0.82 // JPEG quality: visually indistinguishable from 0.95 at
                     // this size, roughly half the bytes.

/**
 * Resizes a File/Blob to a square JPEG and resolves with a new File.
 *
 * Resolves with the ORIGINAL file if anything goes wrong — an unreadable
 * image, a canvas that refuses to encode, a browser without the APIs. A
 * failure here should cost efficiency, not the coach's ability to save a
 * photo at all, and the bucket's own 5 MB limit is the backstop.
 */
export async function resizePhoto(file) {
  if (!file || typeof document === 'undefined') return file

  try {
    const bitmap = await loadBitmap(file)
    if (!bitmap) return file

    const canvas = document.createElement('canvas')
    canvas.width = TARGET_SIZE
    canvas.height = TARGET_SIZE
    const context = canvas.getContext('2d')
    if (!context) return file

    // Centre-crop: take the largest square that fits the source, from the
    // middle, and scale it to fill the canvas.
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY)
    })
    if (!blob) return file

    // Always .jpg: the canvas re-encode discards the source format, and
    // uploadPlayerPhoto derives the object key's extension from the MIME
    // type, so these must agree.
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// ══ THE KEEP-THE-SHAPE MODE ═══════════════════════════════════════════════
// (claude/plans/2026-08-26-photo-pipeline-and-positioner.md)
//
// resizePhoto above was built for HEAD SHOTS and every upload path ran it —
// which centre-cropped chat photos (a landscape team photo lost both ends)
// and threw away the edges of profile photos BEFORE the focal-point picker
// ever saw them. This mode keeps the aspect ratio and caps the longest edge:
// a 4000×3000 camera original becomes 1600×1200 at ~200–400 KB.

const FIT_MAX_EDGE = 1600 // px. ~WhatsApp's default-quality output; sharp on
                          // a phone screen, and enough headroom that the
                          // largest avatar (112px) can never look soft.

/**
 * Resizes a File/Blob preserving its shape and resolves with a new JPEG File.
 *
 * ⚠️ RESOLVES WITH NULL ON FAILURE — NOT THE ORIGINAL. That is the opposite
 * of resizePhoto's contract, on purpose: falling back to the original is safe
 * for JPEG/PNG/WebP (displayable anyway) and WRONG for HEIC, which half the
 * club's phones cannot render. The caller decides what a null means — see
 * preparePhotoUpload below, which is the only intended caller.
 */
export async function resizePhotoFit(file) {
  if (!file || typeof document === 'undefined') return null

  try {
    const bitmap = await loadBitmap(file)
    if (!bitmap) return null

    // Never upscale: a photo already smaller than the cap is re-encoded at
    // its own size (still worth doing — a small PNG screenshot re-encodes to
    // a much smaller JPEG, and the output type becomes predictable).
    const scale = Math.min(1, FIT_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', QUALITY)
    })
    if (!blob) return null

    return new File([blob], 'photo.jpg', { type: 'image/jpeg' })
  } catch {
    return null
  }
}

// The types a picker offers and the gate accepts. HEIC/HEIF are Apple's
// camera formats: Safari can decode them, so on the devices that produce
// them the re-encode above turns them into JPEG — and on devices that
// cannot decode them the gate refuses rather than uploading a file half
// the club's phones cannot display.
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
const HEIC_TYPES = ['image/heic', 'image/heif']
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // every photo bucket's file_size_limit

/**
 * The one upload gate every photo path shares: type first, RESIZE SECOND,
 * size LAST — so the 5 MB judgment falls on what would actually be uploaded.
 *
 * ⚠️ THE ORDER IS THE FIX. The old paths checked size BEFORE resizing, so
 * the 5–8 MB files modern phone cameras produce were refused with "too
 * large" while the resizer one line later would have made them ~200 KB.
 *
 * Throws user-facing messages; resolves with the File to upload (always
 * image/jpeg when the resize ran; the untouched original only when the
 * resize failed on a type that is safe to store as-is).
 */
export async function preparePhotoUpload(file, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!file) throw new Error('Choose a photo first.')
  if (!UPLOAD_TYPES.includes(file.type)) {
    throw new Error('That file is not a photo. Use a JPEG, PNG or WebP image.')
  }

  const resized = await resizePhotoFit(file)
  if (resized) {
    // A 1600px JPEG at this quality is ~200–400 KB; this only trips on
    // pathological input, and then the message is at least true.
    if (resized.size > maxBytes) throw new Error('That photo is too large. The limit is 5 MB.')
    return resized
  }

  // The resize failed. An undecodable HEIC must be refused — uploading it
  // would store a photo most members' phones render as a broken square.
  if (HEIC_TYPES.includes(file.type)) {
    throw new Error('Could not read that photo. Try saving it as a JPEG first.')
  }
  if (file.size > maxBytes) throw new Error('That photo is too large. The limit is 5 MB.')
  return file
}

/**
 * Decodes a file into something drawable. createImageBitmap is the fast path
 * (off the main thread, no DOM node); the <img> fallback covers Safari
 * versions that lack it for certain sources.
 */
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // fall through to the <img> path
    }
  }

  if (typeof URL?.createObjectURL !== 'function') return null

  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Could not read that image.'))
      image.src = url
    })
  } catch {
    return null
  } finally {
    // Revoked in a finally so a decode failure cannot leak the object URL.
    URL.revokeObjectURL(url)
  }
}
