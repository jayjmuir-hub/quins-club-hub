import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Button from '../src/components/Button.jsx'

describe('Button — behaviour that has bitten this app before', () => {
  it('defaults to type="button" so it cannot silently submit a form', async () => {
    // ⚠️ THE REASON THIS DEFAULT EXISTS. A <button> with no type inside a
    // <form> is type="submit". Every ad-hoc button in this app had to
    // remember that; several are inside forms.
    const onSubmit = vi.fn((e) => e.preventDefault())
    const onClick = vi.fn()
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick}>Cancel</Button>
      </form>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClick).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('still allows an explicit submit button', async () => {
    // The injected fault for the test above: if the default were ignored
    // rather than defaulted, this would pass while that one failed.
    const onSubmit = vi.fn((e) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Save</Button>
      </form>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not fire when disabled', async () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Button — the arrow badge', () => {
  it('is absent unless asked for', () => {
    // Most buttons in this app are Save and Cancel. An arrow on Cancel would
    // be nonsense, so the badge is opt-in.
    const { container } = render(<Button>Cancel</Button>)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('rotates on hover when present', () => {
    const { container } = render(<Button arrow>Join</Button>)
    const badge = container.querySelector('span[aria-hidden="true"]')
    expect(badge).not.toBeNull()
    expect(badge.className).toMatch(/group-hover:rotate-45/)
  })

  it('never reaches a screen reader', () => {
    // The arrow is decoration. The button already says where it goes.
    render(<Button arrow>Join the club</Button>)
    expect(screen.getByRole('button').textContent).toBe('Join the club')
    expect(screen.getByRole('button', { name: 'Join the club' })).toBeInTheDocument()
  })

  it('tints itself for the variant it sits on', () => {
    // ⚠️ A white wash is invisible on the white secondary fill.
    const primary = render(<Button arrow variant="primary">A</Button>)
    expect(primary.container.querySelector('span[aria-hidden="true"]').className)
      .toMatch(/bg-white/)
    // Each render() gets its OWN container, so this is index 0, not 1 —
    // querying [1] here found nothing and failed on first run.
    const secondary = render(<Button arrow variant="secondary">B</Button>)
    expect(secondary.container.querySelector('span[aria-hidden="true"]').className)
      .toMatch(/bg-brand/)
  })
})

describe('Button — variants and rendering', () => {
  it('carries the group class the badge depends on', () => {
    // Without `group` on the control, `group-hover:` on the badge is inert —
    // a silent failure that looks like a working button.
    render(<Button arrow>Go</Button>)
    expect(screen.getByRole('button').className).toMatch(/(^|\s)group(\s|$)/)
  })

  it('renders as another element when asked, without a type attribute', () => {
    // type="button" on an <a> is invalid HTML.
    render(<Button as="a" href="/somewhere">Link</Button>)
    const link = screen.getByRole('link', { name: 'Link' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('type')).toBeNull()
  })

  it('falls back to primary for an unknown variant rather than rendering unstyled', () => {
    render(<Button variant="nonsense">X</Button>)
    expect(screen.getByRole('button').className).toMatch(/bg-brand/)
  })

  it('adds no press classes of its own', () => {
    // ⚠️ Press lives in index.css as a global rule. A second active:scale
    // here would compose into a double transform.
    render(<Button>Press</Button>)
    expect(screen.getByRole('button').className).not.toMatch(/active:scale/)
  })
})
