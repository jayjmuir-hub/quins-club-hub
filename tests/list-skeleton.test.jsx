import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ListSkeleton } from '../src/components/Skeleton.jsx'

// The generic list placeholder — item 6 of the 2 Sep 2026 UX review. What
// matters is that it HOLDS HEIGHT: rows × rowHeight, before the data lands.

describe('ListSkeleton', () => {
  it('renders exactly the rows asked for, each at the height asked for', () => {
    render(<ListSkeleton rows={7} rowHeight={68} />)
    const rows = screen.getAllByTestId('list-skeleton-row')
    expect(rows).toHaveLength(7)
    for (const row of rows) expect(row).toHaveStyle({ height: '68px' })
  })

  it('is hidden from assistive tech; the caller announces', () => {
    render(<ListSkeleton rows={2} />)
    expect(screen.getByTestId('list-skeleton')).toHaveAttribute('aria-hidden', 'true')
  })

  it('offers a square lead for date tiles and none at all', () => {
    const { rerender, container } = render(<ListSkeleton rows={1} lead="square" />)
    expect(container.querySelector('.rounded-\\[11px\\]')).not.toBeNull()
    rerender(<ListSkeleton rows={1} lead="none" />)
    expect(container.querySelector('.hidden')).not.toBeNull()
  })
})
