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
