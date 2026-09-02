import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Squad Training shelf — chips, likes, library browse.
// Spec: claude/specs/2026-08-27-training-shelf.md
//
// ⚠️ EVERY NAME IS INVENTED. CLAUDE.md rule 9.

const listTemplatesMock = vi.fn()
const listDrillsMock = vi.fn()
const getSessionMock = vi.fn()
const applyChipHourMock = vi.fn()
const appendDrillsToSessionMock = vi.fn()
const listLikesMock = vi.fn()
const listCoachNamesMock = vi.fn()
const listRecentTrainingUsageMock = vi.fn()
const toggleDrillLikeMock = vi.fn()
const toggleDrillFavoriteMock = vi.fn()
const toggleTemplateLikeMock = vi.fn()
const toggleTemplateFavoriteMock = vi.fn()
const publishMock = vi.fn()
const listPendingSuggestionsMock = vi.fn()
const decideSuggestionMock = vi.fn()

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'p-coach' } }),
}))

const submitTemplateToClubMock = vi.fn(async () => ({}))
vi.mock('../src/data/trainingPlans.js', () => ({
  listTemplates: (...args) => listTemplatesMock(...args),
  listDrills: (...args) => listDrillsMock(...args),
  getSession: (...args) => getSessionMock(...args),
  submitTemplateToClub: (...args) => submitTemplateToClubMock(...args),
  listPendingSuggestions: (...args) => listPendingSuggestionsMock(...args),
  decideSuggestion: (...args) => decideSuggestionMock(...args),
}))

vi.mock('../src/data/trainingShelf.js', () => ({
  applyChipHour: (...args) => applyChipHourMock(...args),
  appendDrillsToSession: (...args) => appendDrillsToSessionMock(...args),
  listLikes: (...args) => listLikesMock(...args),
  listCoachNames: (...args) => listCoachNamesMock(...args),
  listRecentTrainingUsage: (...args) => listRecentTrainingUsageMock(...args),
  toggleDrillLike: (...args) => toggleDrillLikeMock(...args),
  toggleDrillFavorite: (...args) => toggleDrillFavoriteMock(...args),
  toggleTemplateLike: (...args) => toggleTemplateLikeMock(...args),
  toggleTemplateFavorite: (...args) => toggleTemplateFavoriteMock(...args),
  likeCounts: (rows, col) => {
    const counts = new Map()
    for (const row of rows ?? []) counts.set(row[col], (counts.get(row[col]) ?? 0) + 1)
    return counts
  },
  idsForProfile: (rows, col, profileId) =>
    new Set((rows ?? []).filter((row) => row.profile_id === profileId).map((row) => row[col])),
  usedThisWeekById: (usage, kind, id) =>
    new Set((usage ?? []).filter((row) => row.kind === kind && row.id === id).map((row) => row.eventId)).size,
}))

import DrillCard from '../src/components/DrillCard.jsx'
import TrainingShelf from '../src/components/TrainingShelf.jsx'

const TAG_SQUAD = { id: 't-u12g-qr', name: 'U12G QR', requires_contact: false, club_id: 'club-1' }
const TONIGHT = { id: 'e-tue', team_id: 't-u12g-qr', type: 'training', starts_at: '2099-01-05T15:00:00Z' }

const TACKLE = {
  id: 'tpl-tackle',
  name: 'Tackle hour',
  chip_label: 'Tackle',
  requires_contact: true,
  min_age: 9,
  max_age: 18,
  total_minutes: 60,
  created_by: 'p-row',
  blocks: [
    { position: 1, drill_id: 'd-act', minutes: 15, coach_note: null, drill: { title: 'Activate' } },
    { position: 2, drill_id: 'd-live', minutes: 15, coach_note: null, drill: { title: 'Live Tackle' } },
  ],
}

const PASSING = {
  id: 'tpl-pass',
  name: 'Passing hour',
  chip_label: 'Passing',
  requires_contact: false,
  min_age: null,
  max_age: null,
  total_minutes: 60,
  created_by: null,
  blocks: [],
}

const CHIP_LABELS = ['Tackle', 'Passing', 'Ruck', 'Attack', 'Defence']

function contactPack(min, max) {
  return CHIP_LABELS.map((chip_label) => ({
    id: `tpl-${chip_label}-${min}-${max}`,
    name: `${chip_label} hour U${min}–U${max}`,
    chip_label,
    requires_contact: true,
    min_age: min,
    max_age: max,
    total_minutes: 60,
    created_by: null,
    blocks: [],
  }))
}

const THREE_CONTACT_PACKS = [...contactPack(9, 10), ...contactPack(11, 14), ...contactPack(16, 18)]
const U18_SQUAD = { id: 't-u18b', name: 'U18B', requires_contact: true, club_id: 'club-1' }

const TOUCH_COPIES = [
  {
    id: 'd-touch-u16',
    title: '4 v 2 Continuous Touch',
    created_by: null,
    minutes: 8,
    category: 'game',
    min_age: 16,
    max_age: 18,
    requires_contact: true,
  },
  {
    id: 'd-touch-u9',
    title: '4 v 2 Continuous Touch',
    created_by: null,
    minutes: 8,
    category: 'game',
    min_age: 9,
    max_age: 10,
    requires_contact: true,
  },
  {
    id: 'd-touch-u11',
    title: '4 v 2 Continuous Touch',
    created_by: null,
    minutes: 8,
    category: 'game',
    min_age: 11,
    max_age: 14,
    requires_contact: true,
  },
]

const CLAMP = {
  id: 'd-clamp',
  title: 'Climb In Drill',
  summary: 'Finish on top, no daylight in the clamp',
  created_by: 'p-row',
  minutes: 12,
  category: 'skill',
  min_age: 16,
  max_age: 18,
  requires_contact: true,
  diagram_url: 'https://example.org/diagrams/climb-in.svg',
}

beforeEach(() => {
  vi.clearAllMocks()
  listPendingSuggestionsMock.mockResolvedValue([])
  decideSuggestionMock.mockResolvedValue(null)
  listTemplatesMock.mockResolvedValue([TACKLE, PASSING])
  listDrillsMock.mockResolvedValue([CLAMP])
  getSessionMock.mockResolvedValue(null)
  applyChipHourMock.mockResolvedValue({ applied: true, needsConfirm: false })
  appendDrillsToSessionMock.mockResolvedValue({})
  listLikesMock.mockImplementation(async (table) => {
    if (table === 'drill_likes') {
      return Array.from({ length: 18 }, (_, i) => ({ drill_id: 'd-clamp', profile_id: `p-${i}` }))
    }
    return []
  })
  listCoachNamesMock.mockResolvedValue(new Map([['p-row', 'Coach Rowan']]))
  listRecentTrainingUsageMock.mockResolvedValue([
    { kind: 'drill', id: 'd-clamp', eventId: 'e1', startsAt: '2099-01-04T15:00:00Z' },
    { kind: 'drill', id: 'd-clamp', eventId: 'e2', startsAt: '2099-01-03T15:00:00Z' },
  ])
  toggleDrillLikeMock.mockResolvedValue(undefined)
  toggleDrillFavoriteMock.mockResolvedValue(undefined)
})

describe('DrillCard', () => {
  it('toggles a like and the count; a star does not change that count', async () => {
    const user = userEvent.setup()
    let liked = false
    let likeCount = 18
    let favorited = false
    const onLike = vi.fn(() => {
      liked = !liked
      likeCount += liked ? 1 : -1
    })
    const onFavorite = vi.fn(() => {
      favorited = !favorited
    })

    const { rerender } = render(
      <DrillCard
        title="Climb In Drill"
        summary="Finish on top"
        coachName="Coach Rowan"
        likeCount={likeCount}
        liked={liked}
        favorited={favorited}
        onLike={onLike}
        onFavorite={onFavorite}
      />,
    )

    expect(screen.getByTestId('like-count')).toHaveTextContent('18')
    await user.click(screen.getByTestId('like-button'))
    expect(onLike).toHaveBeenCalledTimes(1)
    rerender(
      <DrillCard
        title="Climb In Drill"
        summary="Finish on top"
        coachName="Coach Rowan"
        likeCount={likeCount}
        liked={liked}
        favorited={favorited}
        onLike={onLike}
        onFavorite={onFavorite}
      />,
    )
    expect(screen.getByTestId('like-count')).toHaveTextContent('19')

    await user.click(screen.getByTestId('favorite-button'))
    expect(onFavorite).toHaveBeenCalledTimes(1)
    rerender(
      <DrillCard
        title="Climb In Drill"
        summary="Finish on top"
        coachName="Coach Rowan"
        likeCount={likeCount}
        liked={liked}
        favorited={true}
        onLike={onLike}
        onFavorite={onFavorite}
      />,
    )
    expect(screen.getByTestId('like-count')).toHaveTextContent('19')
  })

  it('has no 1–5 control on a drill card', () => {
    render(<DrillCard title="Climb In Drill" likeCount={6} onLike={() => {}} onFavorite={() => {}} />)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/rating|stars out of/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('allows title, summary and coach name; no players field and no img of a player', () => {
    render(
      <DrillCard
        title="Climb In Drill"
        summary="Finish on top, no daylight in the clamp"
        coachName="Coach Rowan"
      />,
    )
    const card = screen.getByTestId('drill-card')
    expect(within(card).getByText('Climb In Drill')).toBeInTheDocument()
    expect(within(card).getByText(/Finish on top/)).toBeInTheDocument()
    expect(within(card).getByText('Coach Rowan')).toBeInTheDocument()
    expect(within(card).queryByRole('img')).not.toBeInTheDocument()
    expect(card.textContent).not.toMatch(/player/i)
  })

  it('does not draw a list thumbnail even when a diagram URL is passed', () => {
    render(
      <DrillCard
        title="Climb In Drill"
        summary="Finish on top"
        diagramUrl="https://example.org/diagrams/climb-in.svg"
        likeCount={6}
        onLike={() => {}}
        onFavorite={() => {}}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

function showShelf(team = TAG_SQUAD, tonight = TONIGHT) {
  return render(
    <TrainingShelf team={team} tonight={tonight} onOpenTonight={vi.fn()} onApplied={vi.fn()} />,
  )
}

describe('focus chips', () => {
  it('disables a contact Tackle hour for a tag squad with the Publish-tab sentence', async () => {
    showShelf()
    const chip = await screen.findByRole('button', { name: /Tackle, Contact template; this squad is tag/i })
    expect(chip).toBeDisabled()
    expect(screen.getByText('Contact template; this squad is tag')).toBeInTheDocument()
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('applying a chip copies via applyChipHour and does not call publish_training', async () => {
    const user = userEvent.setup()
    const contactSquad = { ...TAG_SQUAD, name: 'U16B', requires_contact: true }
    showShelf(contactSquad)
    const chip = await screen.findByRole('button', { name: /^Tackle$/i })
    expect(chip).not.toBeDisabled()
    await user.click(chip)
    await waitFor(() => expect(applyChipHourMock).toHaveBeenCalled())
    const arg = applyChipHourMock.mock.calls[0][0]
    expect(arg.template.id).toBe('tpl-tackle')
    expect(arg.eventId).toBe('e-tue')
    expect(arg.confirmed).toBe(false)
    expect(publishMock).not.toHaveBeenCalled()
  })

  it('U18 contact squad sees one enabled chip per focus from the 16–18 pack, never U9 or U11 copies', async () => {
    listTemplatesMock.mockResolvedValue(THREE_CONTACT_PACKS)
    showShelf(U18_SQUAD)
    const row = await screen.findByTestId('focus-chips')
    const chips = within(row).getAllByRole('button')
    expect(chips.map((el) => el.textContent)).toEqual(CHIP_LABELS)
    expect(chips.every((el) => !el.disabled)).toBe(true)
    expect(row.textContent).not.toMatch(/outside this template/i)
    expect(row.textContent).not.toMatch(/U9–U10|U11–U14/)
  })

  it('U12G QR shows Tackle once, disabled for contact, and never an enabled U16 contact hour', async () => {
    listTemplatesMock.mockResolvedValue(THREE_CONTACT_PACKS)
    showShelf()
    const row = await screen.findByTestId('focus-chips')
    const tackles = within(row)
      .getAllByRole('button')
      .filter((el) => el.textContent === 'Tackle')
    expect(tackles).toHaveLength(1)
    expect(tackles[0]).toBeDisabled()
    expect(tackles[0]).toHaveAccessibleName(/Contact template; this squad is tag/i)
    expect(within(row).queryByText(/outside this template/i)).not.toBeInTheDocument()
    const enabled = within(row)
      .getAllByRole('button')
      .filter((el) => !el.disabled)
    expect(enabled).toHaveLength(0)
  })

  it('applying a chip over an already-edited session is gated on confirm; cancel leaves blocks untouched', async () => {
    const user = userEvent.setup()
    getSessionMock.mockResolvedValue({
      id: 's-1',
      coach_edited_at: '2026-08-21T05:00:00.000Z',
      blocks: [{ id: 'b1', drill_id: 'd-keep', minutes: 20, drill: { title: 'Keep me' } }],
    })
    const contactSquad = { ...TAG_SQUAD, name: 'U16B', requires_contact: true }
    showShelf(contactSquad)
    await screen.findByText(/Keep me/)
    await user.click(screen.getByRole('button', { name: /^Tackle$/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Replace your edits with the Tackle hour?')
    expect(applyChipHourMock).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(applyChipHourMock).not.toHaveBeenCalled()
    expect(screen.getByText(/Keep me/)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('library list has no photos', () => {
  it('does not put a pitch diagram on a shelf or browse row', async () => {
    const user = userEvent.setup()
    showShelf(U18_SQUAD)
    const shelf = await screen.findByTestId('library-shelf')
    expect(within(shelf).getByText('Climb In Drill')).toBeInTheDocument()
    expect(within(shelf).queryByRole('img')).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /see all/i })[1])
    const browse = await screen.findByTestId('library-browse')
    expect(within(browse).getByText('Climb In Drill')).toBeInTheDocument()
    expect(within(browse).queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('empty library', () => {
  it('does not crash when there are no featured hours or drills', async () => {
    listTemplatesMock.mockResolvedValue([])
    listDrillsMock.mockResolvedValue([])
    showShelf()
    expect(await screen.findByTestId('training-shelf')).toBeInTheDocument()
    expect(screen.getByText(/No focus hours yet/i)).toBeInTheDocument()
    expect(screen.getByText(/library is empty/i)).toBeInTheDocument()
  })
})

describe('library browse', () => {
  // ⚠️ AGE IS GUIDANCE, NOT A GATE — since 2 Sep 2026 (a coach, via Jay:
  // "should not be age group locked"). Until then the shelf hid the other age
  // packs and a "Show all ages" toggle revealed them. Now every copy this
  // squad may run is listed, in-band first, and the toggle is gone because
  // all ages IS the list.
  it('lists every copy this squad may run, the in-band one first', async () => {
    listDrillsMock.mockResolvedValue(TOUCH_COPIES)
    showShelf(U18_SQUAD)
    const shelf = await screen.findByTestId('library-shelf')
    expect(within(shelf).getAllByText('4 v 2 Continuous Touch')).toHaveLength(3)
    const bands = within(shelf).getAllByText(/U16–U18|U9–U10|U11–U14/).map((el) => el.textContent)
    expect(bands[0]).toMatch(/U16–U18/)
    expect(bands).toHaveLength(3)
  })

  it('library browse lists every copy too, and has no show-all-ages toggle', async () => {
    const user = userEvent.setup()
    listDrillsMock.mockResolvedValue(TOUCH_COPIES)
    showShelf(U18_SQUAD)
    await user.click(screen.getAllByRole('button', { name: /see all/i })[1])
    const browse = await screen.findByTestId('library-browse')
    expect(within(browse).getAllByText('4 v 2 Continuous Touch')).toHaveLength(3)
    expect(within(browse).queryByRole('button', { name: /show all ages/i })).not.toBeInTheDocument()
  })

  it('browse-by-coach groups on created_by; null is Club / World Rugby', async () => {
    const user = userEvent.setup()
    listDrillsMock.mockResolvedValue([
      CLAMP,
      { id: 'd-club', title: 'Activate', created_by: null, minutes: 10, category: 'warm_up' },
    ])
    // A contact squad: CLAMP is a contact drill, and contact is still the one
    // refusal — on the tag squad it would (rightly) not be listed at all.
    showShelf(U18_SQUAD)
    await screen.findByTestId('library-shelf')
    await user.click(screen.getAllByRole('button', { name: /see all/i })[1])
    const browse = await screen.findByTestId('library-browse')
    await user.click(within(browse).getByRole('button', { name: /by coach/i }))
    const groups = within(browse).getAllByTestId('coach-group')
    expect(groups.map((g) => g.querySelector('h3').textContent)).toEqual([
      'Coach Rowan',
      'Club / World Rugby',
    ])
  })

  it('From coaches lists every hour this squad may run, the in-band one first', async () => {
    listTemplatesMock.mockResolvedValue([
      {
        id: 'tpl-coach-u16',
        name: 'Rowan Passing U16–U18',
        created_by: 'p-row',
        requires_contact: true,
        min_age: 16,
        max_age: 18,
        total_minutes: 60,
        blocks: [],
      },
      {
        id: 'tpl-coach-u9',
        name: 'Rowan Passing U9–U10',
        created_by: 'p-row',
        requires_contact: true,
        min_age: 9,
        max_age: 10,
        total_minutes: 60,
        blocks: [],
      },
    ])
    showShelf(U18_SQUAD)
    const coaches = await screen.findByTestId('from-coaches')
    const names = within(coaches).getAllByText(/Rowan Passing/).map((el) => el.textContent)
    expect(names).toEqual(['Rowan Passing U16–U18', 'Rowan Passing U9–U10'])
  })

  it('lets a coach suggest their OWN saved hour to the club, any time, without re-saving', async () => {
    const user = userEvent.setup()
    listTemplatesMock.mockResolvedValue([
      // Mine, not yet suggested → offers "Suggest to the club".
      { id: 'tpl-mine', name: 'My tag hour', created_by: 'p-coach', requires_contact: false, min_age: null, max_age: null, total_minutes: 60, submitted_at: null, blocks: [] },
      // Someone else's → no suggest control on it.
      { id: 'tpl-theirs', name: 'Rowan hour', created_by: 'p-row', requires_contact: false, min_age: null, max_age: null, total_minutes: 60, submitted_at: null, blocks: [] },
    ])
    showShelf(TAG_SQUAD)
    const coaches = await screen.findByTestId('from-coaches')
    const suggestButtons = within(coaches).getAllByTestId('suggest-template')
    expect(suggestButtons).toHaveLength(1) // only mine
    await user.click(suggestButtons[0])
    await waitFor(() => expect(submitTemplateToClubMock).toHaveBeenCalledWith('tpl-mine'))
  })

  it('shows "Suggested" on my hour already in the Director queue, with no re-suggest', async () => {
    listTemplatesMock.mockResolvedValue([
      { id: 'tpl-mine', name: 'My tag hour', created_by: 'p-coach', requires_contact: false, min_age: null, max_age: null, total_minutes: 60, submitted_at: '2026-08-28T00:00:00Z', blocks: [] },
    ])
    showShelf(TAG_SQUAD)
    const coaches = await screen.findByTestId('from-coaches')
    expect(within(coaches).getByTestId('suggested-template')).toBeInTheDocument()
    expect(within(coaches).queryByTestId('suggest-template')).toBeNull()
  })

  it('used this week is a count, not a 1–5 control, on an hour row', async () => {
    const contactSquad = { ...TAG_SQUAD, name: 'U16B', requires_contact: true }
    listRecentTrainingUsageMock.mockResolvedValue([
      { kind: 'template', id: 'tpl-tackle', eventId: 'e1', startsAt: '2099-01-04T15:00:00Z' },
    ])
    showShelf(contactSquad)
    const coaches = await screen.findByTestId('from-coaches')
    expect(within(coaches).getByTestId('used-this-week')).toHaveTextContent('Used this week · 1')
    expect(within(coaches).queryByRole('slider')).not.toBeInTheDocument()
    expect(within(coaches).queryByRole('spinbutton')).not.toBeInTheDocument()
  })
})

describe("the director's suggestions on the shelf", () => {
  // Since 2 Sep 2026 a publish lands as pending suggestions on the squad's
  // upcoming training. The shelf lists them, one tap each or Accept all, and
  // every decision goes to the server; the shelf reloads and tells Squad
  // Training (onApplied) so the date strip catches up. No card when there are
  // none — the shelf must not grow an empty labelled block.
  const ROWS = [
    { id: 'sg-1', event_id: 'e-tue', status: 'pending', event: { id: 'e-tue', team_id: 't-u18b', starts_at: '2026-09-08T16:00:00.000Z', title: 'Training' }, template: { id: 'tpl-tackle', name: 'Tackle hour', total_minutes: 60 } },
    { id: 'sg-2', event_id: 'e-thu', status: 'pending', event: { id: 'e-thu', team_id: 't-u18b', starts_at: '2026-09-10T16:00:00.000Z', title: 'Training' }, template: { id: 'tpl-passing', name: 'Passing hour', total_minutes: 60 } },
  ]

  it('shows nothing when there are none', async () => {
    showShelf(U18_SQUAD)
    await screen.findByTestId('tonight-hour')
    expect(screen.queryByTestId('director-suggestions')).not.toBeInTheDocument()
  })

  it('lists them with the date and the hour, and Accept all decides every one then reloads', async () => {
    const user = userEvent.setup()
    listPendingSuggestionsMock.mockResolvedValueOnce(ROWS).mockResolvedValue([])
    const onApplied = vi.fn()
    render(<TrainingShelf team={U18_SQUAD} tonight={TONIGHT} onOpenTonight={vi.fn()} onApplied={onApplied} />)
    const card = await screen.findByTestId('director-suggestions')
    expect(card).toHaveTextContent('2 suggestions from the director')
    expect(card).toHaveTextContent('2026-09-08 · Tackle hour · 60 min')
    expect(card).toHaveTextContent('2026-09-10 · Passing hour · 60 min')

    await user.click(within(card).getByRole('button', { name: 'Accept all' }))
    await waitFor(() => expect(decideSuggestionMock).toHaveBeenCalledTimes(2))
    expect(decideSuggestionMock).toHaveBeenNthCalledWith(1, 'sg-1', true, null)
    expect(decideSuggestionMock).toHaveBeenNthCalledWith(2, 'sg-2', true, null)
    expect(onApplied).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId('director-suggestions')).not.toBeInTheDocument())
  })

  it('declines one on its own row', async () => {
    const user = userEvent.setup()
    listPendingSuggestionsMock.mockResolvedValueOnce(ROWS).mockResolvedValue([ROWS[1]])
    showShelf(U18_SQUAD)
    const card = await screen.findByTestId('director-suggestions')
    await user.click(within(card).getAllByRole('button', { name: 'Decline' })[0])
    await waitFor(() => expect(decideSuggestionMock).toHaveBeenCalledWith('sg-1', false, null))
    await waitFor(() => expect(screen.getByTestId('director-suggestions')).toHaveTextContent('1 suggestion from the director'))
  })
})
