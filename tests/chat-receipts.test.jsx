import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// WhatsApp-style ticks and online status (26 Aug 2026). Jay: "we need an
// online status in chat" and "delivered and viewed check marks for messages
// like whatsapp has".
//
// The three states carry WhatsApp's exact vocabulary because every parent
// already reads it: one tick = sent, two grey = delivered to their device,
// two accent = viewed. The DATA rules live in receiptState() and are tested
// here as a pure function; the policies that let an author see receipt rows
// at all are db/migrations/20260826_chat_delivery_receipts.sql.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
}))

import ChatBubble from '../src/components/ChatBubble.jsx'
import { receiptState } from '../src/data/messages.js'

const receipt = (delivered = [], read = []) => ({ delivered: new Set(delivered), read: new Set(read) })

describe('receiptState — WhatsApp’s rules as a pure function', () => {
  it('is sent until EVERY recipient has the message', () => {
    expect(receiptState(receipt(['a']), ['a', 'b'])).toBe('sent')
  })

  it('is delivered when all devices have it and viewed when all have read it', () => {
    expect(receiptState(receipt(['a', 'b']), ['a', 'b'])).toBe('delivered')
    expect(receiptState(receipt(['a', 'b'], ['a', 'b']), ['a', 'b'])).toBe('read')
  })

  it('⚠️ one group member reading does NOT turn the ticks accent — all of them must', () => {
    expect(receiptState(receipt(['a', 'b'], ['a']), ['a', 'b'])).toBe('delivered')
  })

  it('no receipts yet, or no recipients known, reads as sent — never as an error', () => {
    expect(receiptState(undefined, ['a'])).toBe('sent')
    expect(receiptState(receipt(), [])).toBe('sent')
  })
})

describe('ChatBubble — the ticks', () => {
  const base = {
    mine: true,
    messageId: 'm1',
    testId: 'bubble',
    createdAt: '2026-08-26T08:00:00Z',
    body: 'Zz on my way',
    selfId: 'me',
  }

  it.each([
    ['sent', 'Sent'],
    ['delivered', 'Delivered'],
    ['read', 'Viewed'],
  ])('draws %s with its word for a screen reader, not colour alone', (state, label) => {
    render(<ChatBubble {...base} receipt={state} />)
    const ticks = screen.getByTestId('message-ticks')
    expect(ticks).toHaveAttribute('data-state', state)
    expect(ticks).toHaveAttribute('aria-label', label)
  })

  it('sent is a single check; delivered and read are double', () => {
    const { rerender } = render(<ChatBubble {...base} receipt="sent" />)
    expect(screen.getByTestId('message-ticks').querySelectorAll('path')).toHaveLength(1)
    rerender(<ChatBubble {...base} receipt="delivered" />)
    expect(screen.getByTestId('message-ticks').querySelectorAll('path')).toHaveLength(2)
    rerender(<ChatBubble {...base} receipt="read" />)
    const ticks = screen.getByTestId('message-ticks')
    expect(ticks.querySelectorAll('path')).toHaveLength(2)
    // The accent class is the read signal for sighted readers; the
    // aria-label above is the one for everyone else.
    expect(ticks.className.split(/\s+/)).toContain('text-sky-300')
  })

  it('never draws ticks on an incoming bubble, a deleted one, or with no receipt', () => {
    const { rerender } = render(<ChatBubble {...base} mine={false} receipt="read" />)
    expect(screen.queryByTestId('message-ticks')).toBeNull()
    rerender(<ChatBubble {...base} deleted receipt="read" />)
    expect(screen.queryByTestId('message-ticks')).toBeNull()
    rerender(<ChatBubble {...base} receipt={null} />)
    expect(screen.queryByTestId('message-ticks')).toBeNull()
  })
})
