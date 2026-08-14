import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NoticeBoard from '../src/components/NoticeBoard.jsx'

// The Home card. Its job is small and two of its rules are easy to "fix" back:
// it renders NOTHING when nothing is pinned, and it always offers the link to
// the full list.

const teamsById = new Map([['t1', { id: 't1', name: 'U16B Contact' }]])

function notice(overrides = {}) {
  return {
    id: 'n1',
    team_id: null,
    title: 'Zayed Sports City closed Saturday',
    body: 'All Saturday sessions move to Al Bateen.',
    pinned: true,
    expires_at: null,
    created_at: new Date().toISOString(),
    author: { full_name: 'Jay Muir' },
    ...overrides,
  }
}

function draw(props) {
  return render(
    <MemoryRouter>
      <NoticeBoard teamsById={teamsById} readIds={new Set()} {...props} />
    </MemoryRouter>,
  )
}

describe('NoticeBoard', () => {
  it('draws a pinned notice with its scope and author', () => {
    draw({ notices: [notice()] })
    expect(screen.getByText('Zayed Sports City closed Saturday')).toBeInTheDocument()
    expect(screen.getByText('Whole club')).toBeInTheDocument()
    expect(screen.getByText('Jay Muir')).toBeInTheDocument()
  })

  it('names the squad for a squad notice', () => {
    draw({ notices: [notice({ team_id: 't1' })] })
    expect(screen.getByText('U16B Contact')).toBeInTheDocument()
  })

  // ⚠️ THE RULE THAT KEEPS THIS OFF EVERY DASHBOARD. It sits ABOVE the fixture
  // hero — a knowing departure from design-system.md §5.1 — and that is only
  // survivable because on the ordinary week where nobody has posted, this
  // component contributes no pixels at all. If it ever starts rendering a
  // placeholder, the placement decision has to be re-made.
  it('renders nothing at all when nothing is pinned', () => {
    const { container } = draw({ notices: [notice({ pinned: false })] })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while the notices are still loading', () => {
    const { container } = draw({ notices: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when the only pinned notice has expired', () => {
    const past = new Date(Date.now() - 3600 * 1000).toISOString()
    const { container } = draw({ notices: [notice({ expires_at: past })] })
    expect(container).toBeEmptyDOMElement()
  })

  // ⚠️ ALWAYS OFFERED, EVEN WHEN EVERY PINNED NOTICE IS ALREADY ON SCREEN.
  // Pinned notices are a subset of the board by definition, and this link is
  // the only route to an unpinned one — hiding it when the card looks
  // "complete" would strand every ordinary notice behind a condition nobody
  // could discover.
  it('always offers the way through to the full list', () => {
    draw({ notices: [notice()] })
    expect(screen.getByRole('link', { name: 'All notices' })).toHaveAttribute(
      'href',
      '/notices',
    )
  })

  // Shape as well as colour (claude/specs/accessibility.md): the dot is
  // decorative and the word is what a screen reader gets.
  it('marks an unread notice in words, not only in colour', () => {
    draw({ notices: [notice()], readIds: new Set() })
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('says nothing about a notice already read', () => {
    draw({ notices: [notice()], readIds: new Set(['n1']) })
    expect(screen.queryByText('New')).not.toBeInTheDocument()
  })

  // A coach who put the meeting point on its own line meant it to be on its
  // own line.
  it('preserves the line breaks somebody typed', () => {
    draw({ notices: [notice({ body: 'Line one\nLine two' })] })
    const body = screen.getByText(/Line one/)
    expect(body).toHaveClass('whitespace-pre-line')
  })
})
