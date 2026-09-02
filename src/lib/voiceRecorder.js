import { friendlyMessage } from './friendlyError.js'
// The voice-note recorder — a thin, testable wrapper over the browser's
// MediaRecorder. No React here on purpose: the state machine (idle → recording →
// stopped/cancelled, plus the five-minute auto-stop and format negotiation) is
// proved in tests with a mocked recorder, while the gesture and the live meter
// live in the composer. Spec: claude/plans/2026-08-28-voice-messages.md.

// The cap (claude/decisions/2026-08-28-voice-notes-open.md). Enforced here so a
// forgotten recording sends itself rather than filling storage; the bucket's
// 10 MB ceiling is the second line (db/migrations/20260828_chat_voice.sql).
export const MAX_MS = 5 * 60 * 1000

// ⚠️ ORDER MATTERS: Opus-in-WebM is the small, wide choice (Chrome/Android);
// mp4 is the ONLY one iOS Safari records (AAC in an mp4 container). The first
// the device admits wins; an empty string lets the browser pick its default.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']

/** Is recording even possible here? The composer hides the mic when not. */
export function voiceSupported() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined'
  )
}

/** First candidate the device supports, or '' to defer to the browser. */
export function pickMimeType(isSupported) {
  const supported =
    isSupported ??
    ((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t))
  for (const t of MIME_CANDIDATES) {
    try {
      if (supported(t)) return t
    } catch {
      // isTypeSupported can throw on odd strings; treat as unsupported
    }
  }
  return ''
}

/** The object-key extension for a chosen mime — chat-media keys off this. */
export function extForMime(mimeType) {
  const m = (mimeType || '').toLowerCase()
  if (m.includes('webm')) return 'webm'
  if (m.includes('mp4') || m.includes('aac')) return 'm4a' // AAC/mp4 plays as .m4a everywhere
  if (m.includes('mpeg')) return 'mp3'
  if (m.includes('ogg')) return 'ogg'
  return 'webm'
}

/**
 * A person-facing reason a recording could not START, mapped from whatever
 * getUserMedia / MediaRecorder threw. The composer shows this instead of
 * failing silently: a blocked mic is indistinguishable from a dead button
 * otherwise, and on Android a prior "block" makes getUserMedia reject with no
 * prompt at all — the single most common reason the mic "does nothing".
 */
export function describeRecorderError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone blocked. Allow microphone access in your browser or phone settings, then try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found on this device.'
    case 'NotReadableError':
    case 'AbortError':
      return 'Your microphone is busy or unavailable — close other apps using it, then try again.'
    default:
      return friendlyMessage(err, 'Could not start recording. Please try again.')
  }
}

/** ms → "m:ss", for the recording timer and the playback duration. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000))
  const mm = Math.floor(total / 60)
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/**
 * Ask for the mic and start recording. Resolves — once permission is granted
 * and recording has actually begun — with a controller:
 *   { done, stop(), cancel(), elapsed(), mimeType }
 * `done` is a Promise that settles to `{ blob, ext, ms }` when the note is
 * kept, or `null` when it was cancelled. Rejects if the mic is denied or absent.
 *
 * The browser globals are injected so the whole thing is unit-testable.
 */
export async function startRecording({
  maxMs = MAX_MS,
  onTick, // (elapsedMs) => void — drives the timer; called ~5×/second
  onCap, // () => void — the cap auto-stopped; the composer should then send
  now = () => Date.now(),
  media,
  Recorder,
} = {}) {
  const mediaDevices = media ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : null)
  const RecorderImpl = Recorder ?? (typeof window !== 'undefined' ? window.MediaRecorder : null)
  if (!mediaDevices?.getUserMedia || !RecorderImpl) {
    throw new Error('This device cannot record audio.')
  }

  const mimeType = pickMimeType((t) => RecorderImpl.isTypeSupported(t))
  const stream = await mediaDevices.getUserMedia({ audio: true })
  const rec = new RecorderImpl(stream, mimeType ? { mimeType } : undefined)

  const chunks = []
  const started = now()
  let reason = null // 'stop' | 'cancel' | 'cap'
  let ticker = null
  let capTimer = null

  const release = () => {
    if (ticker) clearInterval(ticker)
    if (capTimer) clearTimeout(capTimer)
    for (const track of stream.getTracks?.() ?? []) track.stop() // let go of the mic
  }

  rec.ondataavailable = (event) => {
    if (event?.data && event.data.size) chunks.push(event.data)
  }

  const done = new Promise((resolve) => {
    rec.onstop = () => {
      release()
      if (reason === 'cancel') {
        resolve(null)
        return
      }
      const type = rec.mimeType || mimeType || 'audio/webm'
      resolve({ blob: new Blob(chunks, { type }), ext: extForMime(type), ms: now() - started })
    }
  })

  rec.start()
  if (onTick) ticker = setInterval(() => onTick(now() - started), 200)
  capTimer = setTimeout(() => {
    reason = 'cap'
    onCap?.()
    if (rec.state !== 'inactive') rec.stop()
  }, maxMs)

  const trigger = (why) => {
    if (reason == null) reason = why
    if (rec.state !== 'inactive') rec.stop()
    return done
  }

  return {
    mimeType,
    done,
    stop: () => trigger('stop'),
    cancel: () => trigger('cancel'),
    elapsed: () => now() - started,
  }
}
