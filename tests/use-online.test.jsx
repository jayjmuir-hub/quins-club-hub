import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import useOnline from '../src/lib/useOnline.js'

// 2 Sep 2026 UX review (parents, Medium): at the pitch with no signal a
// cached screen showed day-old data with no hint. The shell now says so.

function Probe() {
  const online = useOnline()
  return <output data-testid="online">{String(online)}</output>
}

let spy

afterEach(() => {
  spy?.mockRestore()
  spy = null
})

describe('useOnline', () => {
  it('starts from navigator.onLine and follows the online/offline events', async () => {
    spy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true)
    render(<Probe />)
    expect(screen.getByTestId('online')).toHaveTextContent('true')
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('online')).toHaveTextContent('false')
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.getByTestId('online')).toHaveTextContent('true')
  })

  it('starts offline when the browser says so', () => {
    spy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    render(<Probe />)
    expect(screen.getByTestId('online')).toHaveTextContent('false')
  })

  it('the shell renders the banner from this hook (rot detector)', () => {
    const shell = readFileSync(resolve(import.meta.dirname, '..', 'src/components/AppShell.jsx'), 'utf8')
    expect(shell).toContain("import useOnline from '../lib/useOnline.js'")
    expect(shell).toContain('data-testid="offline-banner"')
    expect(shell).toMatch(/offline — showing what was last loaded/)
  })
})
