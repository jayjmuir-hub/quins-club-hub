import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for the Task 9 shared UI primitives (src/components/{Card,Chip,
// Sheet,Badge,TeamPills,ScopeNote,Empty,Spinner}.jsx). These are pure
// presentational components — no network, no router, no auth context.
//
// jsdom does not apply Tailwind's generated CSS, so assertions that a
// requirement is inherently visual (bottom sheet vs centered dialog,
// backdrop blur, colour contrast) are made against the literal class tokens
// the component emits, not against computed styles or "visibility". Real
// rendering is verified separately in a browser.

import Card from '../src/components/Card.jsx'
import Chip from '../src/components/Chip.jsx'
import Sheet from '../src/components/Sheet.jsx'
import Badge from '../src/components/Badge.jsx'
import TeamPills, { ALL_TEAMS_ID } from '../src/components/TeamPills.jsx'
import ScopeNote from '../src/components/ScopeNote.jsx'
import Empty from '../src/components/Empty.jsx'
import Spinner from '../src/components/Spinner.jsx'

function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

describe('Card', () => {
  it('renders children inside a card with the design-system radius and shadow tokens', () => {
    render(<Card>Card content</Card>)
    const el = screen.getByText('Card content')
    expect(hasClassToken(el, 'rounded-[16px]')).toBe(true)
    expect(hasClassToken(el, 'shadow-[0_6px_24px_rgba(20,20,20,0.10)]')).toBe(true)
  })

  it('accepts a className passthrough without clobbering the base classes', () => {
    render(<Card className="p-4">Padded</Card>)
    const el = screen.getByText('Padded')
    expect(hasClassToken(el, 'p-4')).toBe(true)
    expect(hasClassToken(el, 'rounded-[16px]')).toBe(true)
  })
})

describe('Chip', () => {
  it('renders the match variant (maroon bg, white text) per design-system.md §4.7', () => {
    render(<Chip type="match">MATCH</Chip>)
    const el = screen.getByText('MATCH')
    expect(hasClassToken(el, 'bg-quinsRed')).toBe(true)
    expect(hasClassToken(el, 'text-white')).toBe(true)
  })

  it('renders the training variant (green-bg, sky-deep text)', () => {
    render(<Chip type="training">TRAINING</Chip>)
    const el = screen.getByText('TRAINING')
    expect(hasClassToken(el, 'bg-[#eef7e6]')).toBe(true)
    expect(hasClassToken(el, 'text-[#2F7D3D]')).toBe(true)
  })

  it('renders the social variant (warn-bg, darkened warn text for AA contrast)', () => {
    render(<Chip type="social">SOCIAL</Chip>)
    const el = screen.getByText('SOCIAL')
    expect(hasClassToken(el, 'bg-[#fbf1dd]')).toBe(true)
    // The design system's literal --warn text (#c9861a) on --warn-bg
    // measures ~2.71:1 and fails AA — see Chip.jsx's contrast note. This
    // asserts the darkened, AA-passing foreground actually ships.
    expect(hasClassToken(el, 'text-[#8a5a12]')).toBe(true)
  })

  it('falls back to the neutral variant for an unknown type instead of crashing or rendering nothing', () => {
    render(<Chip type="not-a-real-type">MYSTERY</Chip>)
    const el = screen.getByText('MYSTERY')
    expect(hasClassToken(el, 'bg-[#f0ecf2]')).toBe(true)
    expect(hasClassToken(el, 'text-[#77726e]')).toBe(true)
  })

  it('falls back to the neutral variant when no type is given at all', () => {
    render(<Chip>NO TYPE</Chip>)
    const el = screen.getByText('NO TYPE')
    expect(hasClassToken(el, 'bg-[#f0ecf2]')).toBe(true)
  })
})

describe('Badge', () => {
  it('renders the admin tone (maroon bg, white text)', () => {
    render(<Badge tone="admin">Club admin</Badge>)
    const el = screen.getByText('Club admin')
    expect(hasClassToken(el, 'bg-quinsRed')).toBe(true)
    expect(hasClassToken(el, 'text-white')).toBe(true)
  })

  it('renders the captain tone (darkened warn colours) distinctly from Chip — smaller radius token', () => {
    render(<Badge tone="captain">Capt</Badge>)
    const el = screen.getByText('Capt')
    expect(hasClassToken(el, 'bg-[#fbf1dd]')).toBe(true)
    expect(hasClassToken(el, 'text-[#8a5a12]')).toBe(true)
    expect(hasClassToken(el, 'rounded-[6px]')).toBe(true)
  })

  it('falls back to a neutral tone for an unrecognised tone', () => {
    render(<Badge tone="not-a-real-tone">Mystery</Badge>)
    expect(screen.getByText('Mystery')).toBeInTheDocument()
  })
})

describe('Empty', () => {
  it('renders the message', () => {
    render(<Empty message="No players match." />)
    expect(screen.getByText('No players match.')).toBeInTheDocument()
  })

  it('renders no button when no action is given', () => {
    render(<Empty message="No fixtures yet." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders the action as a named button and calls it on click', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Empty message="No players match." action={{ label: 'Add a player', onClick }} />)

    const button = screen.getByRole('button', { name: 'Add a player' })
    await user.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('Spinner', () => {
  it('exposes an accessible name via role=status', () => {
    render(<Spinner />)
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
  })

  it('accepts a custom accessible label', () => {
    render(<Spinner label="Loading fixtures…" />)
    expect(screen.getByRole('status', { name: 'Loading fixtures…' })).toBeInTheDocument()
  })
})

describe('ScopeNote', () => {
  it('renders its message as passed children, without computing scope itself', () => {
    render(<ScopeNote tone="parent">You&apos;re seeing your squads only</ScopeNote>)
    expect(screen.getByText("You're seeing your squads only")).toBeInTheDocument()
  })

  it('defaults to the coach tone when no tone is given', () => {
    render(<ScopeNote>Some scope message</ScopeNote>)
    expect(screen.getByText('Some scope message')).toBeInTheDocument()
  })
})

describe('TeamPills', () => {
  const teams = [
    { id: 'u10', name: 'U10' },
    { id: 'u12', name: 'U12' },
  ]

  it('marks the selected pill with aria-pressed and leaves the others unpressed', () => {
    render(<TeamPills teams={teams} selected="u10" onChange={() => {}} />)

    expect(screen.getByRole('button', { name: 'U10' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'U12' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the All pill pressed when selected is the ALL_TEAMS_ID sentinel', () => {
    render(<TeamPills teams={teams} selected={ALL_TEAMS_ID} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onChange with the clicked team id', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TeamPills teams={teams} selected="u10" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'U12' }))

    expect(onChange).toHaveBeenCalledWith('u12')
  })

  it('calls onChange with the ALL_TEAMS_ID sentinel when All is clicked', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TeamPills teams={teams} selected="u10" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'All' }))

    expect(onChange).toHaveBeenCalledWith(ALL_TEAMS_ID)
  })

  it('renders no broken control for an empty teams array', () => {
    const { container } = render(<TeamPills teams={[]} selected={ALL_TEAMS_ID} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('renders no broken control when teams is missing entirely', () => {
    const { container } = render(<TeamPills selected={ALL_TEAMS_ID} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Sheet', () => {
  function Harness({ initialOpen = false }) {
    const [open, setOpen] = useState(initialOpen)
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Open sheet
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Event details">
          <button type="button">First field</button>
          <button type="button">Second field</button>
        </Sheet>
      </div>
    )
  }

  it('renders nothing at all when closed', () => {
    const { container } = render(<Sheet open={false} onClose={() => {}} title="Hidden" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders as a dialog labelled by its title when open', () => {
    render(
      <Sheet open onClose={() => {}} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Event details' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('is styled as a mobile bottom sheet with a desktop centred-dialog variant (class tokens only — real rendering verified in-browser)', () => {
    render(
      <Sheet open onClose={() => {}} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(hasClassToken(dialog, 'rounded-t-[22px]')).toBe(true)
    expect(hasClassToken(dialog, 'desktop:rounded-[20px]')).toBe(true)
    expect(hasClassToken(dialog, 'desktop:w-[min(520px,94vw)]')).toBe(true)
  })

  it('respects prefers-reduced-motion by disabling its entrance animation under motion-reduce', () => {
    render(
      <Sheet open onClose={() => {}} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(hasClassToken(dialog, 'animate-sheet-slide-up')).toBe(true)
    expect(hasClassToken(dialog, 'desktop:animate-sheet-scale-in')).toBe(true)
    expect(hasClassToken(dialog, 'motion-reduce:animate-none')).toBe(true)
  })

  it('closes on backdrop click', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )

    // The backdrop is the dialog's parent — click it directly, not the panel.
    const dialog = screen.getByRole('dialog')
    await user.click(dialog.parentElement)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when clicking inside the panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )

    await user.click(screen.getByText('Body content'))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('traps focus: Tab from the last focusable element wraps to the first', async () => {
    const user = userEvent.setup()
    render(
      <Sheet open onClose={() => {}} title="Event details">
        <button type="button">First field</button>
        <button type="button">Second field</button>
      </Sheet>,
    )

    const closeButton = screen.getByRole('button', { name: 'Close' })
    const second = screen.getByRole('button', { name: 'Second field' })

    second.focus()
    expect(document.activeElement).toBe(second)

    await user.tab()
    expect(document.activeElement).toBe(closeButton)
  })

  it('traps focus: Shift+Tab from the first focusable element wraps to the last', async () => {
    const user = userEvent.setup()
    render(
      <Sheet open onClose={() => {}} title="Event details">
        <button type="button">First field</button>
        <button type="button">Second field</button>
      </Sheet>,
    )

    const closeButton = screen.getByRole('button', { name: 'Close' })
    const second = screen.getByRole('button', { name: 'Second field' })

    closeButton.focus()
    expect(document.activeElement).toBe(closeButton)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(second)
  })

  it('restores focus to the trigger element on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: 'Open sheet' })
    await user.click(trigger)

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})
