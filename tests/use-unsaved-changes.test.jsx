import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import useUnsavedChanges from '../src/lib/useUnsavedChanges.js'

// The one native prompt this app allows: the browser's own "Leave site?" on
// reload, tab close or typed navigation, while a form holds unsaved work.
// claude/plans/2026-09-02-ux-unsaved-work.md, Task 1.

function Probe({ dirty }) {
  useUnsavedChanges(dirty)
  return null
}

function fireBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('useUnsavedChanges', () => {
  it('asks the browser to warn while dirty', () => {
    render(<Probe dirty />)
    expect(fireBeforeUnload().defaultPrevented).toBe(true)
  })

  it('does nothing while clean, and stops once clean again', () => {
    const { rerender } = render(<Probe dirty={false} />)
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
    rerender(<Probe dirty />)
    expect(fireBeforeUnload().defaultPrevented).toBe(true)
    rerender(<Probe dirty={false} />)
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })

  it('removes its listener on unmount', () => {
    const { unmount } = render(<Probe dirty />)
    unmount()
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })
})
