import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The playback bubble and the record control. Playback in jsdom has no audio
// engine, so these pin the wiring the UI owns: the speed cycle, the unplayed
// dot, and the record → send / cancel flow.

vi.mock('../src/data/chatMedia.js', async (orig) => ({
  ...(await orig()),
  signChatVoiceUrl: vi.fn(async () => 'blob:voice'),
}))
vi.mock('../src/lib/voiceRecorder.js', async (orig) => ({
  ...(await orig()),
  voiceSupported: () => true,
  startRecording: vi.fn(),
}))

import ChatAudio from '../src/components/ChatAudio.jsx'
import VoiceComposer from '../src/components/VoiceComposer.jsx'
import { startRecording } from '../src/lib/voiceRecorder.js'

beforeEach(() => {
  startRecording.mockReset()
  try {
    localStorage.clear()
  } catch {
    /* jsdom localStorage */
  }
})

describe('ChatAudio', () => {
  it('renders a play control and a speed toggle that cycles 1× → 1.5× → 2×', async () => {
    const user = userEvent.setup()
    render(<ChatAudio path="p1/a.webm" messageId="m1" mine={false} />)
    expect(await screen.findByLabelText('Play voice message')).toBeInTheDocument()
    const speed = screen.getByTestId('audio-speed')
    expect(speed).toHaveTextContent('1×')
    await user.click(speed)
    expect(speed).toHaveTextContent('1.5×')
    await user.click(speed)
    expect(speed).toHaveTextContent('2×')
    await user.click(speed)
    expect(speed).toHaveTextContent('1×')
  })

  it('shows an unplayed dot on an incoming note but not on my own', async () => {
    const { unmount } = render(<ChatAudio path="p1/a.webm" messageId="m1" mine={false} />)
    expect(await screen.findByLabelText('Unplayed')).toBeInTheDocument()
    unmount()
    render(<ChatAudio path="p1/a.webm" messageId="m2" mine />)
    await screen.findByTestId('audio-speed')
    expect(screen.queryByLabelText('Unplayed')).toBeNull()
  })
})

describe('VoiceComposer', () => {
  function fakeController(result = { blob: new Blob(['x']), ext: 'webm', ms: 3200 }) {
    const done = Promise.resolve(result)
    return { mimeType: 'audio/webm', done, stop: vi.fn(() => done), cancel: vi.fn(async () => null), elapsed: () => 0 }
  }

  it('records on tap and sends the blob on Send', async () => {
    const user = userEvent.setup()
    const ctrl = fakeController()
    startRecording.mockResolvedValue(ctrl)
    const onSend = vi.fn()
    render(<VoiceComposer onSend={onSend} />)

    await user.click(screen.getByTestId('voice-button'))
    expect(startRecording).toHaveBeenCalled()
    expect(await screen.findByTestId('voice-recording')).toBeInTheDocument()

    await user.click(screen.getByTestId('voice-send'))
    expect(ctrl.stop).toHaveBeenCalled()
    expect(onSend).toHaveBeenCalledWith(expect.any(Blob), 'webm', 3200)
  })

  it('discards on Cancel and sends nothing', async () => {
    const user = userEvent.setup()
    const ctrl = fakeController()
    startRecording.mockResolvedValue(ctrl)
    const onSend = vi.fn()
    render(<VoiceComposer onSend={onSend} />)

    await user.click(screen.getByTestId('voice-button'))
    await screen.findByTestId('voice-recording')
    await user.click(screen.getByLabelText('Cancel recording'))
    expect(ctrl.cancel).toHaveBeenCalled()
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByTestId('voice-recording')).toBeNull()
  })

  it('is disabled where the caller cannot post', async () => {
    render(<VoiceComposer onSend={vi.fn()} disabled />)
    expect(screen.getByTestId('voice-button')).toBeDisabled()
  })

  it('surfaces WHY the mic failed instead of a dead button (Android block)', async () => {
    const user = userEvent.setup()
    // A prior block: getUserMedia rejects with no prompt — the common Android case.
    startRecording.mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }))
    const onError = vi.fn()
    render(<VoiceComposer onSend={vi.fn()} onError={onError} />)

    await user.click(screen.getByTestId('voice-button'))
    expect(onError).toHaveBeenCalledWith(null) // cleared at the start of the attempt
    expect(onError).toHaveBeenLastCalledWith(expect.stringMatching(/blocked/i))
    // Nothing recorded, so the composer stays on the mic button.
    expect(screen.queryByTestId('voice-recording')).toBeNull()
  })
})
