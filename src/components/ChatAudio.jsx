import { useEffect, useRef, useState } from 'react'
import { signChatVoiceUrl } from '../data/chatMedia.js'
import { formatDuration } from '../lib/voiceRecorder.js'

// A voice note in a chat bubble — plain-bar scrubber (Jay chose the bar over a
// real waveform for v1), play/pause, a 1×/1.5×/2× speed toggle, and an unplayed
// dot on incoming notes. Rendered by ChatBubble in place of ChatPhoto when the
// attachment is audio. Spec: claude/plans/2026-08-28-voice-messages.md.

const SPEEDS = [1, 1.5, 2]

// Per-viewer, per-device "have I played this" — a convenience, not a receipt,
// so localStorage is right and a failure just shows the dot (best-effort).
function readPlayed(messageId) {
  if (!messageId) return false
  try {
    return localStorage.getItem(`voice-played:${messageId}`) === '1'
  } catch {
    return false
  }
}
function writePlayed(messageId) {
  if (!messageId) return
  try {
    localStorage.setItem(`voice-played:${messageId}`, '1')
  } catch {
    // private mode / blocked storage — the dot simply stays; harmless
  }
}

export default function ChatAudio({ path, messageId, mine = false }) {
  const audioRef = useRef(null)
  const [url, setUrl] = useState(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0) // seconds
  const [position, setPosition] = useState(0) // seconds
  const [speedIdx, setSpeedIdx] = useState(0)
  const [played, setPlayed] = useState(() => readPlayed(messageId))

  useEffect(() => {
    let live = true
    if (path) signChatVoiceUrl(path).then((s) => live && setUrl(s)).catch(() => {})
    return () => {
      live = false
    }
  }, [path])

  // MediaRecorder WebM blobs often report duration = Infinity until the element
  // is nudged to the end; the seek-to-huge-time trick forces a real value. Only
  // fires when needed, and resets the play head.
  function onLoadedMetadata() {
    const el = audioRef.current
    if (!el) return
    if (el.duration === Infinity || Number.isNaN(el.duration)) {
      el.currentTime = 1e101
    } else {
      setDuration(el.duration)
    }
  }
  function onDurationChange() {
    const el = audioRef.current
    if (el && Number.isFinite(el.duration)) {
      setDuration(el.duration)
      if (el.currentTime > el.duration) el.currentTime = 0
    }
  }

  function toggle() {
    const el = audioRef.current
    if (!el || !url) return
    if (el.paused) {
      el.playbackRate = SPEEDS[speedIdx]
      const p = el.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
      if (!played) {
        setPlayed(true)
        writePlayed(messageId)
      }
    } else {
      el.pause()
    }
  }

  function seek(event) {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    el.currentTime = fraction * duration
    setPosition(el.currentTime)
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length
    setSpeedIdx(next)
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next]
  }

  const pct = duration > 0 ? Math.min(100, (100 * position) / duration) : 0
  const showUnplayed = !mine && !played
  const remaining = playing || position > 0 ? Math.max(0, duration - position) : duration

  const sub = mine ? 'text-white/75' : 'text-ink-faint'
  const track = mine ? 'bg-white/20' : 'bg-surface-sunk'
  const fill = mine ? 'bg-white' : 'bg-brand'
  const btn = mine ? 'bg-white text-brand-ink' : 'bg-brand text-ink-invert'

  return (
    <div className="mt-1 flex items-center gap-2.5" data-testid="chat-audio">
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${btn} disabled:opacity-60`}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={seek}
          aria-label="Seek"
          className={`block h-1.5 w-full overflow-hidden rounded-full ${track}`}
        >
          <span className={`block h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
        </button>
        <div className={`mt-1 flex items-center gap-1.5 text-[11.5px] ${sub}`}>
          <span className="tabular-nums" data-testid="audio-time">{formatDuration(remaining * 1000)}</span>
          {showUnplayed && <span aria-label="Unplayed" className={`h-1.5 w-1.5 rounded-full ${mine ? 'bg-white' : 'bg-brand'}`} />}
        </div>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        aria-label="Playback speed"
        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${sub} ${mine ? 'bg-white/15' : 'bg-surface-sunk'}`}
        data-testid="audio-speed"
      >
        {SPEEDS[speedIdx]}×
      </button>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          onDurationChange={onDurationChange}
          onTimeUpdate={() => setPosition(audioRef.current?.currentTime ?? 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false)
            setPosition(0)
            if (audioRef.current) audioRef.current.currentTime = 0
          }}
          className="hidden"
        >
          <track kind="captions" />
        </audio>
      )}
    </div>
  )
}
