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

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'p-coach' } }),
}))

vi.mock('../src/data/trainingPlans.js', () => ({
  listTemplates: (...args) => listTemplatesMock(...args),
  listDrills: (...args) => listDrillsMock(...args),
  getSession: (...args) => getSessionMock(...args),
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
}

beforeEach(() => {
  vi.clearAllMocks()
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
  it('browse-by-coach groups on created_by; null is Club / World Rugby', async () => {
    const user = userEvent.setup()
    listDrillsMock.mockResolvedValue([
      CLAMP,
      { id: 'd-club', title: 'Activate', created_by: null, minutes: 10, category: 'warm_up' },
    ])
    showShelf()
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
