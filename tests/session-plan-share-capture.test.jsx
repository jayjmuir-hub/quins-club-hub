import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { eventDate, eventPitchLabel, eventTimeLabel, eventTitle, formatLongDate } from '../src/lib/eventFormat.js'
import { writeSessionPlanCapturePng } from './helpers/write-session-plan-capture-png.js'

// QC gate for Session Plan Share. #463 mocked shareElementAsImage and only
// inspected session-plan-capture innerText, so WhatsApp still got the live
// BlockRow <ol> (How it runs, Chip concat, overlapped notes).
// This file spies the element html2canvas / shareElementAsImage photographs.
// Spec: claude/specs/2026-08-27-session-plan-share.md
//
// ⚠️ EVERY NAME HERE IS INVENTED. CLAUDE.md rule 9.

const getSessionMock = vi.fn()
const listFocusMock = vi.fn()
const listAvailabilityMock = vi.fn()
const html2canvasMock = vi.hoisted(() => vi.fn())
const shareElementAsImageMock = vi.hoisted(() => vi.fn())

vi.mock('../src/data/trainingPlans.js', () => ({
  getSession: (...args) => getSessionMock(...args),
  saveSessionBlocks: async () => {},
  listFocus: (...args) => listFocusMock(...args),
  listDrills: async () => [],
  listTemplates: async () => [],
  createSession: async () => ({ id: 's-new' }),
  setSessionVisibility: async () => ({}),
  saveSquadTemplate: async () => ({ id: 'tpl-new' }),
  upsertDrill: async () => ({ id: 'd-new' }),
  submitDrillToClub: async () => ({}),
  submitTemplateToClub: async () => ({}),
  listSessionsForEvents: async () => new Map(),
}))
vi.mock('../src/data/availability.js', () => ({
  listAvailability: (...args) => listAvailabilityMock(...args),
  subscribeAvailability: () => () => {},
}))
vi.mock('../src/data/events.js', () => ({
  deleteEvent: async () => {},
  deleteSeriesFrom: async () => [],
  countSeriesFrom: async () => 0,
  listEvents: async () => [],
}))
vi.mock('../src/components/TrainingShelf.jsx', () => ({
  default: () => <div data-testid="training-shelf-stub" />,
}))
vi.mock('../src/components/PitchRequest.jsx', () => ({
  default: () => null,
}))
vi.mock('../src/data/pitches.js', () => ({ PITCH_TBD: 'Pitch TBD' }))
vi.mock('../src/data/messages.js', () => ({
  getEventThread: async () => null,
}))
vi.mock('html2canvas', () => ({
  default: (...args) => html2canvasMock(...args),
}))
vi.mock('../src/lib/shareImage.js', async (importOriginal) => {
  const actual = await importOriginal()
  shareElementAsImageMock.mockImplementation((...args) => actual.shareElementAsImage(...args))
  return { ...actual, shareElementAsImage: shareElementAsImageMock }
})

import EventDetail from '../src/screens/EventDetail.jsx'

const TEAM = { id: 't-u16', name: 'U16 Mixed', club_id: 'club-1', requires_contact: true }
const EVENT = {
  id: 'e-preseason-1',
  team_id: 't-u16',
  type: 'training',
  title: 'U14/U16/U18 Combined Preseason',
  opponent: null,
  home: null,
  venue: null,
  pitch: 'D1',
  competition: null,
  starts_at: '2026-08-25T14:00:00.000Z',
  ends_at: null,
  notes: null,
  series_id: null,
  result_us: null,
  result_them: null,
}

const PIGGYBACK_NOTE =
  'Pairs, one carries. Twenty metres out, twenty back. Swap. Then a sprint to the far cone and walk the recovery. Keep the line honest — if the carrier dumps early, restart that pair.'
const TOUCH_NOTE =
  'Attack two, defence two. Four touches then off. Reset from the near cone. Last two lines of this note are the ones a short next header used to sit on top of.'
const PLUS_ONE_NOTE =
  'Same grid, plus one defender arriving late. Catch them before the extra body lands. The header after this used to cover the last two lines.'

function preseasonDrill(id, title, category, summary) {
  return {
    id,
    title,
    summary,
    body: `${title} body — coaches tap How it runs for this, WhatsApp must not.`,
    minutes: 10,
    category,
    requires_contact: false,
    min_age: 14,
    max_age: 18,
    is_active: true,
  }
}

const PRESEASON_HOUR = {
  id: 's-preseason',
  event_id: 'e-preseason-1',
  visibility: 'squad',
  notes: 'U14/U16/U18 Combined Preseason. Water bottles at the far cone.',
  coach_edited_at: null,
  blocks: [
    {
      id: 'b-act',
      position: 1,
      drill_id: 'd-act',
      minutes: 5,
      coach_note: 'Squad run it',
      drill: preseasonDrill('d-act', 'Activate (player-led)', 'warm_up', 'Player-led pulse raiser.'),
    },
    {
      id: 'b-pig',
      position: 2,
      drill_id: 'd-pig',
      minutes: 10,
      coach_note: PIGGYBACK_NOTE,
      drill: preseasonDrill('d-pig', 'Piggyback fitness', 'conditioning', 'Carry and sprint.'),
    },
    {
      id: 'b-water',
      position: 3,
      drill_id: 'd-water',
      minutes: 5,
      coach_note: null,
      drill: preseasonDrill('d-water', 'Water and stretch', 'cool_down', 'Drink, then stretch.'),
    },
    {
      id: 'b-32',
      position: 4,
      drill_id: 'd-32',
      minutes: 10,
      coach_note: TOUCH_NOTE,
      drill: preseasonDrill('d-32', '3 v 2 touch', 'game', 'Two-on-one into two-on-two.'),
    },
    {
      id: 'b-plus',
      position: 5,
      drill_id: 'd-plus',
      minutes: 15,
      coach_note: PLUS_ONE_NOTE,
      drill: preseasonDrill('d-plus', 'Touch +1', 'game', 'Late extra defender.'),
    },
    {
      id: 'b-cool',
      position: 6,
      drill_id: 'd-cool',
      minutes: 15,
      coach_note: null,
      drill: preseasonDrill('d-cool', 'Cool down', 'cool_down', 'Walk and stretch.'),
    },
    {
      id: 'b-stretch',
      position: 7,
      drill_id: 'd-stretch',
      minutes: 5,
      coach_note: 'Hamstrings and hips. No bouncing.',
      drill: preseasonDrill('d-stretch', 'Stretch cool-down', 'cool_down', 'Static stretch.'),
    },
  ],
}

function photographedElement() {
  expect(shareElementAsImageMock).toHaveBeenCalledTimes(1)
  expect(html2canvasMock).toHaveBeenCalledTimes(1)
  const fromShare = shareElementAsImageMock.mock.calls[0][0]
  const fromCanvas = html2canvasMock.mock.calls[0][0]
  expect(fromShare).toBe(fromCanvas)
  expect(fromCanvas).toBeInstanceOf(HTMLElement)
  return fromCanvas
}

function displayOf(node) {
  return (node.getAttribute('style') ?? '') + (node.className ?? '')
}

function normalizedCaptureHtml(html, when) {
  return html.replaceAll(when, 'WHEN')
}

beforeEach(() => {
  vi.clearAllMocks()
  getSessionMock.mockResolvedValue(PRESEASON_HOUR)
  listFocusMock.mockResolvedValue([])
  listAvailabilityMock.mockResolvedValue([])
  html2canvasMock.mockImplementation(async (element) => ({
    toBlob: (cb) => cb(new Blob(['fake-png'], { type: 'image/png' })),
    _element: element,
  }))
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    value: vi.fn(() => true),
  })
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  })
})

afterEach(() => {
  delete navigator.canShare
  delete navigator.share
})

describe('Session Plan Share — html2canvas photographs the capture tree', () => {
  it(
    'on Combined Preseason, Share hands html2canvas a stacked capture — not the live BlockRow ol',
    async () => {
    const user = userEvent.setup()
    render(
      <EventDetail event={EVENT} team={TEAM} onClose={vi.fn()} canEdit onDeleted={vi.fn()} />,
    )

    await user.click(await screen.findByRole('button', { name: /^share$/i }))

    const element = photographedElement()
    expect(element).toHaveAttribute('data-testid', 'session-plan-capture')

    // Live card (inside the sheet) still has How it runs + numbered list.
    const dialog = screen.getByRole('dialog')
    const liveList = dialog.querySelector('ol')
    expect(liveList).not.toBeNull()
    expect(within(liveList).getAllByText('How it runs').length).toBe(7)
    expect(liveList.querySelector('.flex-wrap')).not.toBeNull()
    expect(element.contains(liveList)).toBe(false)

    // Photographed node is NOT that list, and is not trapped in the Sheet
    // containing block (backdrop-filter / transform / overflow) that made
    // Lineup's fixed -left-[9999px] photograph BlockRow.
    expect(element.querySelector('ol')).toBeNull()
    expect(element.querySelector('ul')).toBeNull()
    expect(element.querySelector('details')).toBeNull()
    expect(element.closest('[role="dialog"]')).toBeNull()
    expect(element.parentElement.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['pointer-events-none', 'fixed', '-left-[9999px]', 'top-0']),
    )

    expect(element.textContent).not.toMatch(/How it runs/)
    expect(element.textContent).not.toMatch(/Player-led pulse raiser/)
    expect(element.textContent).not.toMatch(/WhatsApp must not/)
    expect(element.textContent).not.toMatch(/\bAdjust\b/)
    expect(element.textContent).not.toMatch(/\bEdit\b/)
    expect(element.textContent).not.toMatch(/\bDelete\b/)
    expect(element.querySelector('.inline-flex')).toBeNull()
    expect(displayOf(element)).toMatch(/Inter/)

    const squad = element.querySelector('[data-testid="session-plan-share-squad"]')
    const title = element.querySelector('[data-testid="session-plan-share-title"]')
    const whenEl = element.querySelector('[data-testid="session-plan-share-when"]')
    const pitchEl = element.querySelector('[data-testid="session-plan-share-pitch"]')
    expect(squad.textContent.trim()).toBe(TEAM.name)
    expect(displayOf(squad)).toMatch(/uppercase/i)
    expect(displayOf(squad)).toMatch(/letter-spacing|tracking/i)
    expect(title.textContent.trim()).toBe(eventTitle(EVENT))
    expect(displayOf(title)).toMatch(/font-weight:\s*(800|extrabold)|font-extrabold/)
    expect(whenEl.textContent).toContain(formatLongDate(eventDate(EVENT)))
    expect(whenEl.textContent).toContain(eventTimeLabel(EVENT))
    expect(displayOf(whenEl)).toMatch(/ink-muted|#565c67|muted/i)
    expect(pitchEl.textContent.trim()).toBe(eventPitchLabel(EVENT))
    expect(pitchEl.textContent.trim()).toBe('D1')
    expect(element.textContent).not.toMatch(/Pitch 2/)
    expect(within(dialog).getByText('D1')).toBeInTheDocument()

    const shareBlocks = [...element.querySelectorAll('[data-testid="session-plan-share-block"]')]
    expect(shareBlocks).toHaveLength(7)

    const touch = shareBlocks.find((block) => block.textContent.includes('3 v 2 touch'))
    expect(touch).toBeTruthy()
    const titleLine = touch.querySelector('[data-testid="session-plan-share-title-line"]')
    expect(titleLine.textContent.trim()).toBe('10 min · 3 v 2 touch')
    expect(titleLine.textContent).not.toMatch(/Game/)
    const pill = touch.querySelector('[data-testid="session-plan-share-category"]')
    expect(pill.textContent.trim()).toBe('Game')
    expect(titleLine.contains(pill)).toBe(false)
    expect(displayOf(touch)).toMatch(/display:\s*block/)
    expect(displayOf(titleLine)).toMatch(/display:\s*block/)
    expect(displayOf(pill.parentElement)).toMatch(/display:\s*block/)
    expect(displayOf(pill)).toMatch(/inline-block/)
    expect(displayOf(pill)).toMatch(/border-radius/)
    expect(displayOf(pill)).toMatch(/padding/)
    expect(touch.className.split(/\s+/)).not.toContain('flex-wrap')
    expect(touch.querySelector('.flex-wrap')).toBeNull()

    const fitness = shareBlocks.find((block) => block.textContent.includes('Piggyback fitness'))
    expect(fitness.querySelector('[data-testid="session-plan-share-title-line"]').textContent.trim()).toBe(
      '10 min · Piggyback fitness',
    )
    expect(fitness.querySelector('[data-testid="session-plan-share-title-line"]').textContent).not.toMatch(
      /Conditioning/,
    )
    expect(fitness.querySelector('[data-testid="session-plan-share-category"]').textContent.trim()).toBe(
      'Conditioning',
    )
    expect(fitness.textContent).toContain(PIGGYBACK_NOTE)
    expect(fitness.nextElementSibling.textContent).not.toMatch(PIGGYBACK_NOTE)

    const stretch = shareBlocks.find((block) => block.textContent.includes('Stretch cool-down'))
    expect(stretch.querySelector('[data-testid="session-plan-share-title-line"]').textContent.trim()).toBe(
      '5 min · Stretch cool-down',
    )
    expect(stretch.querySelector('[data-testid="session-plan-share-title-line"]').textContent).not.toMatch(
      /Cool-down/,
    )
    expect(stretch.querySelector('[data-testid="session-plan-share-category"]').textContent.trim()).toBe(
      'Cool-down',
    )

    expect(element.textContent).toContain('Total 65 min')
    expect(element.textContent).toContain(PRESEASON_HOUR.notes)

    const html = element.outerHTML
    expect(html).not.toMatch(/How it runs/)
    expect(html).not.toMatch(/<ol/i)
    expect(html).not.toMatch(/<details/i)
    expect(html).not.toMatch(/inline-flex/)
    expect(html).not.toMatch(/flex-wrap/)
    writeFileSync(
      resolve('tests/session-plan-share-combined-preseason.html'),
      `${html.replaceAll('><', '>\n<')}\n`,
      'utf8',
    )
    const when = `${formatLongDate(eventDate(EVENT))} · ${eventTimeLabel(EVENT)}`
    expect(normalizedCaptureHtml(html, when)).toMatchSnapshot()

    const png = writeSessionPlanCapturePng(
      element,
      resolve('tests/session-plan-share-combined-preseason.png'),
    )
    expect(png.lines[0]).toBe(TEAM.name)
    expect(png.lines).toContain('10 min · 3 v 2 touch')
    expect(png.lines).toContain('Game')
    expect(png.lines.join('\n')).not.toMatch(/How it runs/)
    expect(png.lines.join('\n')).not.toMatch(/touchGame/)
    expect(png.lines.join('\n')).not.toMatch(/fitnessConditioning/)
    expect(png.lines.join('\n')).not.toMatch(/stretchCool-down/)
  })

  it('omits pitch from the photographed tree when the event has none', async () => {
    const user = userEvent.setup()
    render(
      <EventDetail
        event={{ ...EVENT, pitch: null }}
        team={TEAM}
        onClose={vi.fn()}
        canEdit
        onDeleted={vi.fn()}
      />,
    )
    await user.click(await screen.findByRole('button', { name: /^share$/i }))
    const element = photographedElement()
    expect(element.textContent).toContain(TEAM.name)
    expect(element.textContent).not.toMatch(/Pitch 2/)
    expect(element.textContent).not.toMatch(/\bD1\b/)
    expect(element.querySelector('[data-testid="session-plan-share-pitch"]')).toBeNull()
  })
})
