import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useState } from 'react'
import { Sheet } from '../src/components/Sheet.jsx'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

// 3 Sep 2026: "Take attendance" (and Availability) close the event sheet and
// open a second sheet in the same commit. The closing sheet's back() used to be
// queued before the new sheet pushed its entry, so it popped the NEW entry and
// the register closed itself the instant it opened.
function SwapHost() {
  const [which, setWhich] = useState(null)
  return (
    <>
      <button onClick={() => setWhich('a')}>open a</button>
      {which === 'a' && (
        <Sheet open onClose={() => setWhich(null)} title="Sheet A">
          <button onClick={() => setWhich('b')}>swap to b</button>
        </Sheet>
      )}
      {which === 'b' && (
        <Sheet open onClose={() => setWhich(null)} title="Sheet B">
          <button onClick={() => setWhich(null)}>done b</button>
        </Sheet>
      )}
    </>
  )
}

describe('Sheet — swapping one sheet for another in the same commit', () => {
  it('⚠️ hands the history entry over instead of popping it out from under the new sheet', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    render(<SwapHost />)
    await act(async () => {
      screen.getByText('open a').click()
    })
    expect(pushState).toHaveBeenCalledTimes(1)
    await act(async () => {
      screen.getByText('swap to b').click()
    })
    // B is open, A's entry is now B's, and nothing went back.
    expect(screen.getByRole('dialog', { name: 'Sheet B' })).toBeInTheDocument()
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(back).not.toHaveBeenCalled()
    // B owns the entry: closing it by its own control pops exactly once.
    await act(async () => {
      screen.getByText('done b').click()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(back).toHaveBeenCalledTimes(1)
    replaceState.mockRestore()
  })

  it('a sheet that closes with no replacement still pops its own entry', async () => {
    render(<SwapHost />)
    await act(async () => {
      screen.getByText('open a').click()
    })
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(back).toHaveBeenCalledTimes(1)
  })
})

describe('Sheet — size', () => {
  it('is the 520px dialog by default and min(760px, 94vw) when wide (2 Sep 2026 UX review, desktop)', () => {
    render(<Sheet open onClose={() => {}} title="Default"><p>x</p></Sheet>)
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveAttribute('data-size', 'default')
    expect(panel.className).toContain('desktop:w-[min(520px,94vw)]')
    expect(panel.className).not.toContain('760px')
  })
  it('wide: the event form asks for it (rot detector)', () => {
    const form = readFileSync(resolve(import.meta.dirname, '..', 'src/screens/EventForm.jsx'), 'utf8')
    expect(form.match(/size="wide"/g)?.length).toBe(2)
  })
})
