// Turn a DOM element into a PNG and hand it to the OS share sheet.
//
// ⚠️ EXTRACTED FROM src/screens/MatchSheet.jsx ON 14 Aug 2026, NOT WRITTEN
// FRESH. That screen has shared the RCM sheet this way since 12 Aug and the
// reasoning below is its, kept verbatim in substance. The lineup screen needs
// exactly the same thing, and this codebase is explicit that two copies of one
// behaviour drift — the duplications it does tolerate (`leagueLabel`,
// `locationFor`) are duplicated because a Vite bundle and a Deno function have
// no shared build. This one has no such excuse.
//
// ⚠️ WHATSAPP CANNOT BE SENT A FILE BY A LINK. `wa.me/?text=` carries text only,
// so a one-click share has to PRODUCE a file. That is the whole reason the
// ~194KB html2canvas dependency was accepted (Jay, 12 Aug 2026), overturning the
// match-sheet plan's "no new dependency" line.
//
// ⚠️ IMPORTED LAZILY, AND THAT MUST NOT CHANGE. It is a fifth of a megabyte used
// by one button on a few screens; a static import here would put it in the bundle
// every PARENT downloads just to look at a fixture list.

/**
 * @typedef {'shared'|'downloaded'|'cancelled'} ShareOutcome
 */

/**
 * @param {HTMLElement} element  what to photograph
 * @param {{ filename: string, title?: string, text?: string, url?: string }} options
 * @returns {Promise<ShareOutcome>}
 *
 * ⚠️ RETURNS AN OUTCOME RATHER THAN THROWING ON CANCEL. An aborted share is the
 * person changing their mind, not a failure, and every caller was going to have
 * to special-case `AbortError` otherwise — which is precisely the kind of detail
 * that gets remembered on one screen and forgotten on the next.
 *
 * ⚠️ 'downloaded' IS NOT AN ERROR PATH. Desktop browsers largely cannot
 * file-share, so the download is the NORMAL desktop route. A caller that words
 * it as a failure is wrong.
 */
export async function shareElementAsImage(element, { filename, title, text, url } = {}) {
  if (!element) throw new Error('There was nothing to share.')

  const { default: html2canvas } = await import('html2canvas')
  // scale: 2 so the PNG is legible when WhatsApp re-compresses it; an explicit
  // white background because the element may be transparent and a transparent
  // PNG renders black in some chat clients.
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' })
  return shareCanvas(canvas, { filename, title, text, url })
}

/**
 * Share a canvas that the caller drew itself — the same OS share sheet / desktop
 * download as shareElementAsImage, but skipping html2canvas.
 *
 * ⚠️ THIS IS THE CRISP-TEXT PATH. html2canvas re-implements a text renderer and
 * mangled the pitch-layout picture's small labels into dashes; the pitch share
 * (src/screens/Allocation.jsx) draws its own canvas (src/lib/pitchShareCanvas.js)
 * and hands it here, so the browser's native text engine draws the glyphs. The
 * DOM callers (match sheet, lineup, session plan) still go through
 * shareElementAsImage, which carries cross-origin images the canvas path does not.
 *
 * @param {HTMLCanvasElement} canvas  already-drawn artwork
 * @param {{ filename: string, title?: string, text?: string, url?: string }} options
 * @returns {Promise<ShareOutcome>}
 */
export async function shareCanvas(canvas, { filename, title, text, url } = {}) {
  if (!canvas) throw new Error('There was nothing to share.')

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('That could not be turned into an image.')

  const file = new File([blob], filename, { type: 'image/png' })
  const caption = text || url || undefined

  // ⚠️ `canShare({ files })` IS THE CHECK, NOT `navigator.share` EXISTING.
  // Plenty of browsers expose share() for text/urls and refuse files; calling
  // share() on those throws after the user has already tapped.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, ...(caption ? { text: caption } : {}) })
      return 'shared'
    } catch (failure) {
      if (failure?.name === 'AbortError') return 'cancelled'
      throw failure
    }
  }

  // Desktop (and browsers that will not file-share): copy the deep link if we
  // have one, then still offer the PNG as a download. The download is the
  // NORMAL desktop route, not an error — see the typedef above.
  if (caption && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(caption)
    } catch {
      // Clipboard access is refused in plenty of ordinary situations. The
      // image download still happens; the URL is in the caption the caller
      // already composed.
    }
  }

  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = file.name
  link.click()
  URL.revokeObjectURL(objectUrl)
  return 'downloaded'
}
