import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for the Task 9 shared UI primitives (src/components/{Card,Chip,
// Sheet,Badge,TeamFilter,Empty,Spinner}.jsx). These are pure
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
import TeamFilter, { ALL_TEAMS_ID } from '../src/components/TeamFilter.jsx'
import Empty from '../src/components/Empty.jsx'
import Spinner from '../src/components/Spinner.jsx'

function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

describe('Card', () => {
  it('renders children inside a card with the design-system radius and shadow tokens', () => {
    render(<Card>Card content</Card>)
    const el = screen.getByText('Card content')
    expect(hasClassToken(el, 'rounded-card')).toBe(true)
    expect(hasClassToken(el, 'shadow-card')).toBe(true)
  })

  it('accepts a className passthrough without clobbering the base classes', () => {
    render(<Card className="p-4">Padded</Card>)
    const el = screen.getByText('Padded')
    expect(hasClassToken(el, 'p-4')).toBe(true)
    expect(hasClassToken(el, 'rounded-card')).toBe(true)
  })
})

describe('Chip', () => {
  it('renders the match variant (maroon bg, white text) per design-system.md §4.7', () => {
    render(<Chip type="match">MATCH</Chip>)
    const el = screen.getByText('MATCH')
    expect(hasClassToken(el, 'bg-brand')).toBe(true)
    expect(hasClassToken(el, 'text-white')).toBe(true)
  })

  it('renders the training variant (green-bg, sky-deep text)', () => {
    render(<Chip type="training">TRAINING</Chip>)
    const el = screen.getByText('TRAINING')
    expect(hasClassToken(el, 'bg-accent-bg')).toBe(true)
    expect(hasClassToken(el, 'text-accent-ink')).toBe(true)
  })

  it('renders the social variant (warn-bg, darkened warn text for AA contrast)', () => {
    render(<Chip type="social">SOCIAL</Chip>)
    const el = screen.getByText('SOCIAL')
    expect(hasClassToken(el, 'bg-warn-bg')).toBe(true)
    // The design system's literal --warn text (#c9861a) on --warn-bg
    // measures ~2.71:1 and fails AA — see Chip.jsx's contrast note. This
    // asserts the darkened, AA-passing foreground actually ships.
    expect(hasClassToken(el, 'text-warn-ink')).toBe(true)
  })

  it('falls back to the neutral variant for an unknown type instead of crashing or rendering nothing', () => {
    render(<Chip type="not-a-real-type">MYSTERY</Chip>)
    const el = screen.getByText('MYSTERY')
    expect(hasClassToken(el, 'bg-surface-mute')).toBe(true)
    // The design system's literal --muted text (#77726e) on this bg
    // measures 4.07:1 and falls short of AA at this size — see Chip.jsx's
    // contrast note. This asserts the darkened, AA-passing foreground.
    expect(hasClassToken(el, 'text-ink-muted')).toBe(true)
  })

  it('falls back to the neutral variant when no type is given at all', () => {
    render(<Chip>NO TYPE</Chip>)
    const el = screen.getByText('NO TYPE')
    expect(hasClassToken(el, 'bg-surface-mute')).toBe(true)
  })

  // Result variants, added in Task 11 for the Schedule's Results rows. They
  // are part of the same design-system.md §4.7 variant list, so they belong
  // on Chip rather than in a near-identical screen-local component.
  it('renders the win variant (good-bg, sky-deep text for AA contrast)', () => {
    render(<Chip type="win">Won</Chip>)
    const el = screen.getByText('Won')
    expect(hasClassToken(el, 'bg-accent-bg')).toBe(true)
    // The literal --good text (#2F9E4F) on --good-bg measures 3.06:1 and
    // fails AA — see Chip.jsx's contrast note for the substitution.
    expect(hasClassToken(el, 'text-accent-ink')).toBe(true)
  })

  it('renders the loss variant (bad-bg, darkened text for AA contrast)', () => {
    render(<Chip type="loss">Lost</Chip>)
    const el = screen.getByText('Lost')
    expect(hasClassToken(el, 'bg-danger-bg')).toBe(true)
    // The literal --bad text (#d1483b) on --bad-bg measures 3.84:1.
    expect(hasClassToken(el, 'text-brand-deep')).toBe(true)
  })

  it('renders the draw variant with the design system colours verbatim', () => {
    render(<Chip type="draw">Drew</Chip>)
    const el = screen.getByText('Drew')
    expect(hasClassToken(el, 'bg-surface-mute')).toBe(true)
    // This pair already measures ~5.3:1, so no substitution was needed.
    expect(hasClassToken(el, 'text-ink-muted')).toBe(true)
  })
})

describe('Badge', () => {
  it('renders the admin tone (maroon bg, white text)', () => {
    render(<Badge tone="admin">Club admin</Badge>)
    const el = screen.getByText('Club admin')
    expect(hasClassToken(el, 'bg-brand')).toBe(true)
    expect(hasClassToken(el, 'text-white')).toBe(true)
  })

  it('renders the captain tone (darkened warn colours) distinctly from Chip — smaller radius token', () => {
    render(<Badge tone="captain">Capt</Badge>)
    const el = screen.getByText('Capt')
    expect(hasClassToken(el, 'bg-warn-bg')).toBe(true)
    expect(hasClassToken(el, 'text-warn-ink')).toBe(true)
    expect(hasClassToken(el, 'rounded-[6px]')).toBe(true)
  })

  it('falls back to a neutral tone for an unrecognised tone, using the darkened AA-passing muted text', () => {
    render(<Badge tone="not-a-real-tone">Mystery</Badge>)
    const el = screen.getByText('Mystery')
    expect(hasClassToken(el, 'bg-surface-mute')).toBe(true)
    expect(hasClassToken(el, 'text-ink-muted')).toBe(true)
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

describe('TeamFilter', () => {
  const teams = [
    { id: 'u10', name: 'U10' },
    { id: 'u12', name: 'U12' },
  ]

  // ⚠️ REPOINTED, NOT REWRITTEN. This block asserted a pill row - aria-pressed
  // on buttons, one click per squad. The control became a <select> on 10 Aug
  // 2026 because the row reached four wrapped lines at 18 squads (see the
  // header of src/components/TeamFilter.jsx). Every assertion below is the
  // same question asked of the new control: what is selected, what does
  // choosing do, and do the counts still reach the labels.

  it('shows the selected squad as the select value', () => {
    render(<TeamFilter teams={teams} selected="u10" onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /age group/i })).toHaveValue('u10')
  })

  it('shows the sentinel as the value when nothing is filtered', () => {
    render(<TeamFilter teams={teams} selected={ALL_TEAMS_ID} onChange={() => {}} />)
    expect(screen.getByRole('combobox', { name: /age group/i })).toHaveValue(ALL_TEAMS_ID)
  })

  // ⚠️ A REAL LABEL, NOT aria-label. A pill reading "U10" said what it did; a
  // select shows only its current value, so without the word beside it a squad
  // name sitting on a schedule is ambiguous - filter, or heading?
  it('is labelled, so the value is not mistaken for a heading', () => {
    render(<TeamFilter teams={teams} selected="u10" onChange={() => {}} />)
    expect(screen.getByLabelText('Age group')).toBeInTheDocument()
  })

  it('calls onChange with the chosen team id', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TeamFilter teams={teams} selected="u10" onChange={onChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: /age group/i }), 'u12')

    expect(onChange).toHaveBeenCalledWith('u12')
  })

  it('calls onChange with the ALL_TEAMS_ID sentinel when the all option is chosen', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TeamFilter teams={teams} selected="u10" onChange={onChange} />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: /age group/i }),
      ALL_TEAMS_ID,
    )

    expect(onChange).toHaveBeenCalledWith(ALL_TEAMS_ID)
  })

  // The counts are why the Roster row was tolerable at 18 squads - "which
  // squads actually have anybody", answered at a glance. They had to survive.
  it('suffixes each option with its count when a counts map is given', () => {
    const counts = new Map([
      [ALL_TEAMS_ID, 12],
      ['u10', 9],
      ['u12', 3],
    ])
    render(<TeamFilter teams={teams} selected={ALL_TEAMS_ID} onChange={() => {}} counts={counts} />)

    expect(screen.getByRole('option', { name: 'All age groups · 12' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'U10 · 9' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'U12 · 3' })).toBeInTheDocument()
  })

  it('shows a zero count rather than treating it as absent', () => {
    render(
      <TeamFilter
        teams={teams}
        selected={ALL_TEAMS_ID}
        onChange={() => {}}
        counts={new Map([['u10', 0]])}
      />,
    )

    expect(screen.getByRole('option', { name: 'U10 · 0' })).toBeInTheDocument()
    // No entry in the map at all means a bare label - not "· 0".
    expect(screen.getByRole('option', { name: 'U12' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All age groups' })).toBeInTheDocument()
  })

  it('leaves every label bare when no counts are given', () => {
    render(<TeamFilter teams={teams} selected={ALL_TEAMS_ID} onChange={() => {}} />)

    expect(screen.getByRole('option', { name: 'U10' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'All age groups' })).toBeInTheDocument()
  })

  it('renders no broken control for an empty teams array', () => {
    const { container } = render(
      <TeamFilter teams={[]} selected={ALL_TEAMS_ID} onChange={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  })

  it('renders no broken control when teams is missing entirely', () => {
    const { container } = render(<TeamFilter selected={ALL_TEAMS_ID} onChange={() => {}} />)
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

  // On mobile the panel's bottom edge is flush with the viewport bottom, so
  // without the inset the last row of content — a contact link, or the Save
  // button on every add/edit form from Task 14 on — lands in an iPhone's
  // home-indicator zone. jsdom resolves no env() and applies no CSS, so the
  // class token is the only assertable thing; the real spacing was checked in
  // a browser.
  it('pads its body clear of the mobile home-indicator zone', () => {
    render(
      <Sheet open onClose={() => {}} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )
    const body = screen.getByText('Body content').parentElement
    expect(hasClassToken(body, 'pb-[calc(16px+env(safe-area-inset-bottom))]')).toBe(true)
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

  it('renders the mobile drag-handle grip, hidden at the desktop breakpoint', () => {
    render(
      <Sheet open onClose={() => {}} title="Event details">
        <p>Body content</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    // The grip is decorative (aria-hidden) so it isn't reachable via an
    // accessible query — assert on the structure/class tokens instead.
    const grip = dialog.querySelector('[aria-hidden="true"] > span')
    expect(grip).not.toBeNull()
    expect(hasClassToken(grip, 'w-[38px]')).toBe(true)
    expect(hasClassToken(grip.parentElement, 'desktop:hidden')).toBe(true)
  })

  // Regression test for a real bug caught in review: a controlled field
  // inside an open Sheet, with the (very common) pattern of an inline
  // onClose={() => setOpen(false)} on the parent. Every keystroke re-renders
  // the parent, which recreates onClose with a new identity. Before the
  // fix, that new identity was a dependency of Sheet's internal effect, so
  // the effect re-ran on every keystroke — its cleanup fired
  // triggerRef.current?.focus?.(), yanking focus out of the input mid-word.
  // Typing "Tom" produced "T". This is exactly the shape Tasks 14/15's
  // add/edit forms will use, so it isn't a hypothetical.
  function ControlledFieldHarness() {
    const [open, setOpen] = useState(true)
    const [name, setName] = useState('')
    return (
      <Sheet open={open} onClose={() => setOpen(false)} title="Add a player">
        <label htmlFor="player-name">Full name</label>
        <input id="player-name" value={name} onChange={(event) => setName(event.target.value)} />
      </Sheet>
    )
  }

  it('does not lose focus or drop keystrokes when the parent passes an inline onClose and the field it controls re-renders on every keystroke', async () => {
    const user = userEvent.setup()
    render(<ControlledFieldHarness />)

    const input = screen.getByLabelText('Full name')
    await user.click(input)
    await user.keyboard('Tom')

    expect(input).toHaveValue('Tom')
    expect(document.activeElement).toBe(input)
  })
})
