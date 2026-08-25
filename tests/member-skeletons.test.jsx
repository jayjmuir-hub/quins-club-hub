import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Shape-matched loading placeholders for the member screens whose first load
// used to be a spinner: Notices, Squad Hub, and the Home squad-contacts block
// that joined DashboardSkeleton when the glossy tiles retired.

import {
  DashboardSkeleton,
  NoticesSkeleton,
  SquadHubPickerSkeleton,
  SquadHubSkeleton,
} from '../src/components/Skeleton.jsx'

function tokens(el) {
  return el.className.split(/\s+/)
}

describe('NoticesSkeleton', () => {
  it('is three notice cards — stripe, circular face, body — not a pulse block', () => {
    render(<NoticesSkeleton />)
    const root = screen.getByTestId('notices-skeleton')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    const cards = [...root.querySelectorAll('.rounded-card')]
    expect(cards).toHaveLength(3)
    expect(tokens(cards[0])).toContain('border-line')
    expect(tokens(cards[0])).toContain('bg-surface-card')
    expect(cards[0].querySelector('.rounded-full')).toBeTruthy()
    expect(cards[0].querySelector('.bg-surface-sunk')).toBeTruthy()
  })
})

describe('SquadHubPickerSkeleton', () => {
  it('is a card of circular-face rows, not the hub dashboard skeleton', () => {
    render(<SquadHubPickerSkeleton />)
    const root = screen.getByTestId('squad-hub-picker-skeleton')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    const faces = [...root.querySelectorAll('.rounded-full')]
    expect(faces.length).toBe(4)
    const card = faces[0].closest('.rounded-card')
    expect(tokens(card)).toContain('border-line')
    expect(tokens(card)).toContain('bg-surface-card')
  })
})

describe('SquadHubSkeleton', () => {
  it('mirrors the loaded hub: calendar card, door cards, tracking card', () => {
    render(<SquadHubSkeleton />)
    const root = screen.getByTestId('squad-hub-skeleton')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    const cards = [...root.querySelectorAll('.rounded-card')]
    expect(cards.length).toBeGreaterThanOrEqual(5)
    expect(cards.every((card) => tokens(card).includes('border-line'))).toBe(true)
    expect(cards.every((card) => tokens(card).includes('bg-surface-card'))).toBe(true)
  })
})

describe('DashboardSkeleton — squad contacts', () => {
  it('holds a contacts card of circular faces after the fixture rows', () => {
    render(<DashboardSkeleton />)
    const root = screen.getByTestId('dashboard-skeleton')
    const faces = [...root.querySelectorAll('.rounded-full')]
    expect(faces.length).toBeGreaterThanOrEqual(2)
    const contacts = faces[0].closest('.rounded-card')
    expect(tokens(contacts)).toContain('border-line')
    expect(tokens(contacts)).toContain('bg-surface-card')
  })
})
