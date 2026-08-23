import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// src/components/StorageCard.jsx — the measured storage readout on the Club
// tab. The admin gate is the database's (db/tests/storage-usage.sql); this
// proves the arithmetic and that a member (empty list) or a failure costs the
// screen nothing.

const usage = vi.fn()
vi.mock('../src/data/storage.js', async (orig) => ({ ...(await orig()), storageUsage: () => usage() }))

import StorageCard from '../src/components/StorageCard.jsx'
import { formatBytes } from '../src/data/storage.js'

beforeEach(() => vi.clearAllMocks())

describe('StorageCard', () => {
  it('shows database and files against the plan, and a line per bucket', async () => {
    usage.mockResolvedValue([
      { kind: 'database', label: 'postgres', bytes: 22020096, objects: null },
      { kind: 'bucket', label: 'player-photos', bytes: 1617920, objects: 17 },
      { kind: 'bucket', label: 'staff-photos', bytes: 1001472, objects: 12 },
    ])
    render(<StorageCard />)
    expect(await screen.findByTestId('storage-database')).toHaveTextContent('21 MB of 8.0 GB (0.3%)')
    expect(screen.getByTestId('storage-files')).toHaveTextContent('2.5 MB of 100.0 GB (0.1%)')
    expect(screen.getByText('player-photos')).toBeInTheDocument()
    expect(screen.getByText('1.5 MB · 17 files')).toBeInTheDocument()
  })

  it('renders nothing for an empty answer (a member) and nothing on failure', async () => {
    usage.mockResolvedValue([])
    const { unmount } = render(<StorageCard />)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('storage-card')).toBeNull()
    unmount()
    usage.mockRejectedValue(new Error('boom'))
    render(<StorageCard />)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByTestId('storage-card')).toBeNull()
  })

  it('formatBytes', () => {
    expect(formatBytes(500)).toBe('1 kB')
    expect(formatBytes(152 * 1024)).toBe('152 kB')
    expect(formatBytes(2.6 * 1024 ** 2)).toBe('2.6 MB')
    expect(formatBytes(8 * 1024 ** 3)).toBe('8.0 GB')
  })
})
