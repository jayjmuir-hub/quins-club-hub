import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The event-type marks. Jay, 12 Aug 2026: "need better icons for training,
// match, and social in their event chip" — and, picking from drawn options,
// solid rugby ball / rounded-tip cone / two people, replacing whistle / shirt
// / trophy.
//
// ⚠️ WHAT THESE TESTS ARE FOR. Nothing here can judge whether an icon LOOKS
// right — jsdom does not draw. What they can do, and what has actually gone
// wrong in this codebase, is guard the RULES around the icons: that one
// definition feeds every screen, that only event types get one, that they are
// decorative to a screen reader, and that a chip which never had an icon has
// not silently gained a gap. Each was checked by breaking the source and
// confirming it goes red.

vi.mock('../src/data/availability.js', () => ({
  listAvailability: async () => [],
  subscribeAvailability: () => () => {},
}))
vi.mock('../src/data/events.js', () => ({
  countSeriesFrom: async () => 0,
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
}))

import Chip from '../src/components/Chip.jsx'
import EventTypeIcon, { EVENT_TYPE_ICONS } from '../src/components/EventTypeIcon.jsx'
import FixtureRow from '../src/components/FixtureRow.jsx'
import EventDetail from '../src/screens/EventDetail.jsx'

const svgIn = (el) => el.querySelector('svg')

describe('EventTypeIcon', () => {
  it('has a mark for each of the three event types', () => {
    // Keyed by the events.type column's own vocabulary, so it cannot disagree
    // with Chip's colour map about which types exist.
    expect(Object.keys(EVENT_TYPE_ICONS).sort()).toEqual(['match', 'social', 'training'])
  })

  it('⚠️ renders NOTHING for an unknown or missing type', () => {
    // Never a fallback mark. Giving an unrecognised value a rugby ball would
    // assert a fixture is a match on the strength of a value nothing
    // recognised — the same reasoning behind Chip's neutral pill.
    const { container: unknown } = render(<EventTypeIcon type="fundraiser" />)
    expect(svgIn(unknown)).toBeNull()
    const { container: missing } = render(<EventTypeIcon type={undefined} />)
    expect(svgIn(missing)).toBeNull()
  })

  it('⚠️ is decorative — a screen reader must not say the type twice', () => {
    // Every place it renders, the word it marks is right beside it.
    const { container } = render(<EventTypeIcon type="training" />)
    expect(svgIn(container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('⚠️ gives each rendered ball its OWN mask id', () => {
    // The ball's seam is a mask, not stroked lines, because the chip's solid
    // red and the hero's translucent box have no shared colour to stroke in.
    // A fixed id would collide the moment two match chips render — which is
    // the NORMAL case, a Saturday of age-group fixtures — and then which mask
    // applies is decided by document order.
    const { container } = render(
      <div>
        <EventTypeIcon type="match" />
        <EventTypeIcon type="match" />
      </div>,
    )
    const ids = [...container.querySelectorAll('mask')].map((m) => m.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    // And the shape must actually reference the mask it was given.
    const ellipses = [...container.querySelectorAll('ellipse')]
    expect(ellipses.map((e) => e.getAttribute('mask'))).toEqual(ids.map((id) => `url(#${id})`))
  })
})

describe('Chip — which pills get a mark', () => {
  it.each(['match', 'training', 'social'])('gives the %s chip one', (type) => {
    const { container } = render(<Chip type={type}>Label</Chip>)
    expect(svgIn(container)).not.toBeNull()
    expect(container.firstChild.className).toMatch(/\bgap-1\b/)
  })

  it.each(['win', 'loss', 'draw'])('⚠️ gives the %s RESULT chip none', (type) => {
    // A result is not an event type, and a row where every pill carries a
    // picture stops being scannable — which is the whole point of the mark.
    const { container } = render(<Chip type={type}>Result</Chip>)
    expect(svgIn(container)).toBeNull()
  })

  it('⚠️ gives the neutral squad-name chip none, and no dead gap', () => {
    // The gap is the discriminating half. `<EventTypeIcon />` is a truthy
    // React element even when it renders null, so a version that tested the
    // ELEMENT rather than the map would put gap-1 on every text-only chip in
    // the app — and every screen has one.
    const { container } = render(<Chip>U14B Contact</Chip>)
    expect(svgIn(container)).toBeNull()
    expect(container.firstChild.className).not.toMatch(/\bgap-1\b/)
  })

  it('⚠️ keeps its colours — the marks were the change, not the palette', () => {
    // Every pairing in VARIANTS was chosen to clear AA at 11.5px bold and
    // several are deliberately NOT the brand tokens.
    const { container: match } = render(<Chip type="match">Match</Chip>)
    expect(match.firstChild.className).toMatch(/bg-brand\b/)
    const { container: training } = render(<Chip type="training">Training</Chip>)
    expect(training.firstChild.className).toMatch(/bg-accent-bg\b/)
    const { container: social } = render(<Chip type="social">Social</Chip>)
    expect(social.firstChild.className).toMatch(/bg-warn-bg\b/)
  })
})

describe('One definition, every screen', () => {
  const EVENT = {
    id: 'e-1',
    type: 'training',
    title: 'U14 Contact & Conditioning',
    team_id: 't-u14b',
    starts_at: '2026-09-08T14:00:00.000Z',
    ends_at: '2026-09-08T15:30:00.000Z',
    venue: 'Zayed Sports City, Abu Dhabi',
    pitch: 'A2',
    series_id: null,
  }

  it('the fixture row draws the mark through the chip', () => {
    render(<FixtureRow event={EVENT} teamName="U14B Contact" onSelect={vi.fn()} />)
    const chip = screen.getByText('Training').closest('span')
    expect(svgIn(chip)).not.toBeNull()
  })

  it('the detail sheet hero draws the SAME mark, not its own copy', () => {
    // ⚠️ THE POINT OF THE SHARED MODULE. Until 12 Aug 2026 the hero's icons
    // were three local functions inside EventDetail.jsx; the moment the chip
    // wanted the same marks, a screen was the wrong home. This asserts the
    // hero renders the cone's path data — so a second, drifting copy inside
    // the screen would fail here.
    const { container } = render(
      <EventDetail event={EVENT} team={{ id: 't-u14b', name: 'U14B Contact' }} onClose={vi.fn()} />,
    )
    const conePath = EVENT_TYPE_ICONS.training({}).props.children[0].props.d
    const heroPaths = [...container.querySelectorAll('svg path')].map((p) => p.getAttribute('d'))
    expect(heroPaths).toContain(conePath)
  })

  it('⚠️ the hero keeps its 56px box even for a type with no mark', () => {
    // The hero's proportions are built around that square. Dropping it too
    // would make the title jump up by 68px on a row nothing recognised — an
    // empty tinted square is the quieter wrong answer.
    const { container } = render(
      <EventDetail
        event={{ ...EVENT, type: 'fundraiser' }}
        team={{ id: 't-u14b', name: 'U14B Contact' }}
        onClose={vi.fn()}
      />,
    )
    expect(container.querySelector('.h-14.w-14')).not.toBeNull()
  })
})
