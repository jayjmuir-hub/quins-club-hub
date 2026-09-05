import { isInstalled } from './installPrompt.js'

/**
 * Save a Blob without ever putting a remote signed URL on an <a href>.
 *
 * Desktop Chrome/Firefox honour <a download> on a blob: URL. iOS Safari and
 * every iOS WebKit browser ignore `download` for most URLs; a blob: href with
 * target=_blank still opens the file (Share / Save to Files) and the status
 * bar / long-press never shows the Supabase signed query string.
 *
 * Last resort: an installed iOS PWA often swallows the programmatic <a> click
 * (popup-blocker rules). Then we window.open the blob: URL only — never the
 * signed storage URL.
 */

export function isIosWebKit() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iPadOnDesktopUA =
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
  return /iPad|iPhone|iPod/.test(ua) || iPadOnDesktopUA
}

export async function saveBlobAsFile(blob, filename, { openWindow } = {}) {
  const objectUrl = URL.createObjectURL(blob)
  const open =
    openWindow ??
    (typeof window !== 'undefined' && typeof window.open === 'function'
      ? window.open.bind(window)
      : () => null)

  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.rel = 'noopener noreferrer'
  const ios = isIosWebKit()
  if (ios) a.target = '_blank'
  document.body.appendChild(a)

  if (ios && isInstalled()) {
    open(objectUrl, '_blank', 'noopener,noreferrer')
  } else {
    a.click()
  }
  a.remove()

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}
