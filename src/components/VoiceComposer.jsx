import { useEffect, useRef, useState } from 'react'
import { formatDuration, startRecording, voiceSupported } from '../lib/voiceRecorder.js'

// The record control that sits where the Send button does when the draft is
// empty (WhatsApp). Tap the mic to record; a bar takes over the composer row
// with a live timer, Cancel and Send; the five-minute cap auto-sends.
//
// ⚠️ TAP-TO-RECORD, NOT HOLD-TO-RECORD — the approved fallback
// (claude/plans/2026-08-28-voice-messages.md). Hold-to-record / slide-to-cancel
// is fiddliest exactly where it matters least reliably (an iPhone PWA), and a
// note that records every time beats a gesture that sometimes drops the audio.
// The recorder state machine (src/lib/voiceRecorder.js) is gesture-agnostic, so
// layering the hold gesture on later is a UI change, not a rewrite.
//
// The overlay is absolute over the composer form (which is `relative`), so this
// component owns the whole recording experience without the composer needing to
// know its state.

export default function VoiceComposer({ onSend, disabled = false }) {
  const [recording, setRecording] = useState(false)
  const [ms, setMs] = useState(0)
  const [busy, setBusy] = useState(false)
  const ctrlRef = useRef(null)
  const finishRef = useRef(null)

  // Let the cap's onCap reach the latest finish() without re-creating the
  // recorder; the controller is made once per recording.
  async function finish() {
    const ctrl = ctrlRef.current
    if (!ctrl || busy) return
    setBusy(true)
    let result = null
    try {
      result = await ctrl.stop()
    } finally {
      ctrlRef.current = null
      setRecording(false)
      setBusy(false)
      setMs(0)
    }
    if (result?.blob?.size) await onSend(result.blob, result.ext, result.ms)
  }
  finishRef.current = finish

  async function begin() {
    if (disabled || busy || recording) return
    try {
      const ctrl = await startRecording({
        onTick: setMs,
        onCap: () => finishRef.current?.(), // hit five minutes → send what we have
      })
      ctrlRef.current = ctrl
      setMs(0)
      setRecording(true)
    } catch {
      // mic denied or unavailable — nothing to record, leave the composer as is
    }
  }

  async function cancel() {
    const ctrl = ctrlRef.current
    ctrlRef.current = null
    setRecording(false)
    setMs(0)
    if (ctrl) await ctrl.cancel()
  }

  // Never leave the mic hot if the thread unmounts mid-recording.
  useEffect(() => () => ctrlRef.current?.cancel?.(), [])

  if (!voiceSupported()) return null

  if (!recording) {
    return (
      <button
        type="button"
        aria-label="Record a voice message"
        onClick={begin}
        disabled={disabled}
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-mute disabled:opacity-50"
        data-testid="voice-button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </button>
    )
  }

  return (
    <div
      className="absolute inset-0 z-10 flex items-center gap-2 rounded-[12px] bg-surface px-1"
      data-testid="voice-recording"
    >
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancel recording"
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-mute"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
        </svg>
      </button>
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brand" />
      <span className="flex-1 text-[14px] font-semibold tabular-nums text-ink" data-testid="voice-timer">
        {formatDuration(ms)}
      </span>
      <span className="text-[11.5px] text-ink-faint">Recording…</span>
      <button
        type="button"
        onClick={finish}
        disabled={busy}
        aria-label="Send voice message"
        className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full text-brand-ink hover:bg-surface-mute disabled:opacity-60"
        data-testid="voice-send"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12l16-8-6 16-3-7-7-1z" />
        </svg>
      </button>
    </div>
  )
}
