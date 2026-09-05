import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import useScreenChrome from '../src/lib/useScreenChrome.js'
import { CLUB_NAME } from '../src/lib/screenTitle.js'

// UX review item 7 (2 Sep 2026): on every route change the tab title
// changes, <main> takes focus and the page scrolls to the top — except on
// first render (nothing to move away from) and except on screens pinned to
// the bottom (a conversation).

function Chrome({ pinnedToBottom }) {
  useScreenChrome({ pinnedToBottom })
  return null
}

function Go({ to, label }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to)}>{label}</button>
}

function App({ start = '/', pinnedToBottom }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <Chrome pinnedToBottom={pinnedToBottom} />
      <a href="#main-content">skip</a>
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <Go to="/roster" label="to roster" />
                <Go to="/?open=x" label="open sheet" />
                <Go to="/settings#notifications" label="to notifications" />
                <Go to="/settings" label="to settings" />
              </>
            }
          />
          <Route path="/roster" element={<Go to="/chat/dm/c1" label="to dm" />} />
          <Route path="/chat/dm/:id" element={<span>dm</span>} />
          <Route
            path="/settings"
            element={
              <div id="notifications" tabIndex={-1}>
                Notifications
              </div>
            }
          />
        </Routes>
      </main>
    </MemoryRouter>
  )
}

let scrollTo

beforeEach(() => {
  scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  document.title = ''
})

afterEach(() => {
  scrollTo.mockRestore()
})

describe('useScreenChrome', () => {
  it('sets the title on first render but does NOT steal focus or scroll', () => {
    render(<App />)
    expect(document.title).toBe(`Home · ${CLUB_NAME}`)
    expect(document.activeElement).toBe(document.body)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('on navigation: new title, focus on <main>, scroll to the top', async () => {
    render(<App />)
    await act(async () => {
      screen.getByText('to roster').click()
    })
    expect(document.title).toBe(`Roster · ${CLUB_NAME}`)
    expect(document.activeElement).toBe(document.getElementById('main-content'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('⚠️ a search-only change (a sheet opening) moves nothing', async () => {
    render(<App />)
    await act(async () => {
      screen.getByText('open sheet').click()
    })
    expect(document.activeElement).toBe(document.body)
    expect(scrollTo).not.toHaveBeenCalled()
  })

  // ⚠️ THE REAL FAILURE MODE JAY HIT ON THE PHONE, not "scrollIntoView was
  // called". Home "Turn them on" goes to /settings#notifications. Item 7's
  // pathname-only chrome then focuses <main> and scrollTo(0, 0). On iOS,
  // focus on <main> ignores preventScroll and jumps the page to the top
  // AFTER More's hash scroll has already run — so the suite's
  // scrollIntoView spy stayed green while parents landed on You, not the
  // push toggle. Hash deep-links own the landing; chrome must not reset.
  it('⚠️ a hash deep-link is not reset to the top of the new screen', async () => {
    const order = []
    scrollTo.mockImplementation((...args) => {
      order.push({ type: 'scrollTo', args })
    })
    const intoView = vi.fn(function intoView() {
      order.push({ type: 'scrollIntoView', id: this.id })
    })
    Element.prototype.scrollIntoView = intoView
    try {
      render(<App />)
      await act(async () => {
        screen.getByText('to notifications').click()
      })
      expect(document.title).toBe(`Settings · ${CLUB_NAME}`)
      expect(scrollTo).not.toHaveBeenCalled()
      expect(document.activeElement).not.toBe(document.getElementById('main-content'))
      expect(document.activeElement?.id).toBe('notifications')
      const lastTopReset = [...order].reverse().find((e) => e.type === 'scrollTo')
      expect(lastTopReset).toBeUndefined()
    } finally {
      delete Element.prototype.scrollIntoView
    }
  })

  it('control: a bare /settings visit still scrolls to the top', async () => {
    render(<App />)
    await act(async () => {
      screen.getByText('to settings').click()
    })
    expect(document.activeElement).toBe(document.getElementById('main-content'))
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('⚠️ a screen pinned to the bottom is not scrolled to the top', async () => {
    render(<App pinnedToBottom={(p) => p.startsWith('/chat/dm/')} />)
    await act(async () => {
      screen.getByText('to roster').click()
    })
    expect(scrollTo).toHaveBeenCalledTimes(1)
    await act(async () => {
      screen.getByText('to dm').click()
    })
    // Title and focus still happen; only the scroll is left to the pin.
    expect(document.title).toBe(`Direct messages · ${CLUB_NAME}`)
    expect(document.activeElement).toBe(document.getElementById('main-content'))
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })
})
