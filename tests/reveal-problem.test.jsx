import { describe, it, expect, vi, afterEach } from 'vitest'
import { revealProblem } from '../src/lib/revealProblem.js'

// Item 3 of the 2 Sep 2026 UX review: after a failed submit the first
// invalid field (or, failing that, the alert) is scrolled into view and
// focused. jsdom has no scrollIntoView, so it is stubbed per element here —
// which is also what proves the helper tolerates its absence.

function mount(html) {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('revealProblem', () => {
  it('focuses the FIRST invalid control, not the alert, when there is one', () => {
    const root = mount(`
      <form>
        <p role="alert" tabindex="-1">Fill in the highlighted fields.</p>
        <input id="ok" />
        <input id="bad-1" aria-invalid="true" />
        <input id="bad-2" aria-invalid="true" />
      </form>`)
    const scroll = vi.fn()
    root.querySelector('#bad-1').scrollIntoView = scroll
    const target = revealProblem(root)
    expect(target.id).toBe('bad-1')
    expect(document.activeElement.id).toBe('bad-1')
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
  })

  it('falls back to the alert when nothing is marked invalid', () => {
    const root = mount(`
      <form>
        <input id="ok" />
        <p id="why" role="alert" tabindex="-1">That did not save.</p>
      </form>`)
    expect(revealProblem(root).id).toBe('why')
    expect(document.activeElement.id).toBe('why')
  })

  it('prefers the form\'s marked error region over an earlier standing warning', () => {
    const root = mount(`
      <form>
        <p id="standing" role="alert">This child would be playing up an age group.</p>
        <input id="ok" />
        <p id="fired" role="alert" data-reveal="problem" tabindex="-1">That did not save.</p>
      </form>`)
    expect(revealProblem(root).id).toBe('fired')
  })

  it('does nothing, quietly, with no container or nothing to reveal', () => {
    expect(revealProblem(null)).toBeNull()
    const root = mount('<form><input id="ok" /></form>')
    expect(revealProblem(root)).toBeNull()
  })

  it('survives an element with no scrollIntoView (jsdom) and still focuses it', () => {
    const root = mount('<form><input id="bad" aria-invalid="true" /></form>')
    expect(typeof root.querySelector('#bad').scrollIntoView).not.toBe('function')
    expect(revealProblem(root).id).toBe('bad')
    expect(document.activeElement.id).toBe('bad')
  })
})
