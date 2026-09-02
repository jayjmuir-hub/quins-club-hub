import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useState } from 'react'
import { Sheet } from '../src/components/Sheet.jsx'

// 2 Sep 2026 UX review, pattern 7: on Android the system Back with a sheet
// open used to leave the whole screen. Opening a sheet now pushes one history
// entry; Back pops it and closes the sheet; closing any other way pops the
// entry itself, so the history is exactly as long as before.

function Host({ dismissible = true }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="A sheet" dismissible={dismissible}>
        <button onClick={() => setOpen(false)}>done</button>
      </Sheet>
    </>
  )
}

let pushState, back

beforeEach(() => {
  pushState = vi.spyOn(window.history, 'pushState')
  // jsdom's history.back() is asynchronous and does not always fire popstate
  // in a test; stub it and fire popstate by hand where the test needs it.
  back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
})

afterEach(() => {
  pushState.mockRestore()
  back.mockRestore()
})

describe('Sheet — Back closes the sheet', () => {
  it('pushes one tagged history entry on open, and none while closed', async () => {
    render(<Host />)
    expect(pushState).not.toHaveBeenCalled()
    await act(async () => {
      screen.getByText('open').click()
    })
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState.mock.calls[0][0]).toEqual(expect.objectContaining({ __sheet: expect.any(String) }))
  })

  it('⚠️ Back (popstate) closes the sheet without popping a second entry', async () => {
    render(<Host />)
    await act(async () => {
      screen.getByText('open').click()
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    // The user's Back already consumed our entry; we must not go back again.
    expect(back).not.toHaveBeenCalled()
  })

  it('closing by the sheet’s own controls pops our entry back off', async () => {
    // pushState is spied, not stubbed, so history.state carries the marker.
    render(<Host />)
    await act(async () => {
      screen.getByText('open').click()
    })
    await act(async () => {
      screen.getByText('done').click()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('a non-dismissible sheet re-pushes on Back and stays open', async () => {
    render(<Host dismissible={false} />)
    await act(async () => {
      screen.getByText('open').click()
    })
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(pushState).toHaveBeenCalledTimes(2)
  })
})
