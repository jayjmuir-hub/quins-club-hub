import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MAX_MS,
  describeRecorderError,
  extForMime,
  formatDuration,
  pickMimeType,
  startRecording,
  voiceSupported,
} from '../src/lib/voiceRecorder.js'

// The recorder state machine, proved with a fake MediaRecorder and getUserMedia.
// The browser globals are injected, so nothing here needs a real microphone.

describe('pure helpers', () => {
  it('picks the first supported mime, preferring Opus/WebM', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
    // iOS: only mp4 admitted
    expect(pickMimeType((t) => t === 'audio/mp4')).toBe('audio/mp4')
    expect(pickMimeType(() => false)).toBe('')
  })

  it('maps a mime to the object-key extension', () => {
    expect(extForMime('audio/webm;codecs=opus')).toBe('webm')
    expect(extForMime('audio/mp4')).toBe('m4a')
    expect(extForMime('audio/aac')).toBe('m4a')
    expect(extForMime('audio/mpeg')).toBe('mp3')
    expect(extForMime('')).toBe('webm')
  })

  it('formats a duration as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(9000)).toBe('0:09')
    expect(formatDuration(75000)).toBe('1:15')
  })

  it('reports no voice support in jsdom (no MediaRecorder)', () => {
    expect(voiceSupported()).toBe(false)
  })

  it('caps at five minutes', () => {
    expect(MAX_MS).toBe(300000)
  })

  it('turns a getUserMedia error into a person-facing reason', () => {
    // The Android case: a prior block makes getUserMedia reject NotAllowedError.
    expect(describeRecorderError({ name: 'NotAllowedError' })).toMatch(/blocked/i)
    expect(describeRecorderError({ name: 'SecurityError' })).toMatch(/blocked/i)
    expect(describeRecorderError({ name: 'NotFoundError' })).toMatch(/no microphone/i)
    expect(describeRecorderError({ name: 'NotReadableError' })).toMatch(/busy|unavailable/i)
    // The explicit "cannot record" throw keeps its own message through the default.
    expect(describeRecorderError(new Error('This device cannot record audio.'))).toMatch(
      /cannot record/i,
    )
    // A shapeless failure still yields a usable sentence, never blank.
    expect(describeRecorderError(undefined)).toMatch(/try again/i)
  })
})

// A minimal fake MediaRecorder that records nothing but drives the state machine.
function makeFakes() {
  const tracks = [{ stop: vi.fn() }]
  const stream = { getTracks: () => tracks }
  const media = { getUserMedia: vi.fn(async () => stream) }
  class FakeRecorder {
    static isTypeSupported(t) {
      return t === 'audio/webm;codecs=opus'
    }
    constructor(_stream, opts) {
      this.mimeType = opts?.mimeType ?? ''
      this.state = 'inactive'
      this.ondataavailable = null
      this.onstop = null
    }
    start() {
      this.state = 'recording'
    }
    stop() {
      this.state = 'inactive'
      this.ondataavailable?.({ data: new Blob(['x'], { type: this.mimeType }) })
      this.onstop?.()
    }
  }
  return { media, Recorder: FakeRecorder, tracks }
}

describe('startRecording', () => {
  let clock = 0
  const now = () => clock
  beforeEach(() => {
    clock = 0
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('records and stop() resolves a blob, extension and duration; the mic is released', async () => {
    const { media, Recorder, tracks } = makeFakes()
    const ctrl = await startRecording({ media, Recorder, now })
    expect(ctrl.mimeType).toBe('audio/webm;codecs=opus')
    clock = 4200
    const result = await ctrl.stop()
    expect(result.ext).toBe('webm')
    expect(result.ms).toBe(4200)
    expect(result.blob.size).toBeGreaterThan(0)
    expect(tracks[0].stop).toHaveBeenCalled() // let go of the mic
  })

  it('cancel() resolves null and keeps no audio', async () => {
    const { media, Recorder } = makeFakes()
    const ctrl = await startRecording({ media, Recorder, now })
    const result = await ctrl.cancel()
    expect(result).toBeNull()
  })

  it('auto-stops at the cap and calls onCap', async () => {
    const { media, Recorder } = makeFakes()
    const onCap = vi.fn()
    const ctrl = await startRecording({ media, Recorder, now, onCap, maxMs: 1000 })
    clock = 1000
    vi.advanceTimersByTime(1000)
    const result = await ctrl.done
    expect(onCap).toHaveBeenCalledTimes(1)
    expect(result.ms).toBe(1000)
  })

  it('throws when the device cannot record', async () => {
    await expect(startRecording({ media: {}, Recorder: null })).rejects.toThrow(/cannot record/i)
  })
})
