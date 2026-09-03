import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ChatBubble from '../src/components/ChatBubble.jsx'

// 2 Sep 2026 UX review, extra findings: in selecting mode the bubble's only
// route was a div onClick. A real checkbox gives the keyboard one.
function bubble(props) {
  return render(
    <MemoryRouter>
      <ChatBubble mine={false} messageId="m1" body="hello" createdAt={new Date().toISOString()} {...props} />
    </MemoryRouter>,
  )
}

describe('ChatBubble selecting', () => {
  it('renders a checkbox only while selecting, and it toggles the message', async () => {
    const onSelect = vi.fn()
    const { unmount } = bubble({})
    expect(screen.queryByRole('checkbox', { name: 'Select message' })).toBeNull()
    unmount()

    bubble({ onSelect, selected: false })
    const box = screen.getByRole('checkbox', { name: 'Select message' })
    box.focus()
    await userEvent.setup().keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
