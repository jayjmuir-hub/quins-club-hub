import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/components/NoticeComposer.jsx: WHO a notice is sent to.
//
// ⚠️ THIS FILE EXISTS BECAUSE NOTHING COVERED THIS AT ALL. On 21 Aug 2026 the
// scope picker was rewritten from a single `<select>` into a checkbox group,
// and the full suite — 146 files, 2,972 tests — stayed green without noticing.
// Not one test asserted who a notice reaches. That is the control deciding
// which families get a message on their phone.
//
// `createNotice` is mocked, so this exercises the component's own behaviour and
// never a real write. What the DATABASE does with several rows is
// db/tests/notice-push.sql's job; the two together are the feature.

const createNoticeMock = vi.fn()

vi.mock('../src/data/announcements.js', () => ({
  createNotice: (...args) => createNoticeMock(...args),
}))

import NoticeComposer from '../src/components/NoticeComposer.jsx'

// ⚠️ SQUAD NAMES INVENTED, AND DELIBERATELY NOT THIS CLUB'S. A test that names
// real squads goes stale the day one is renamed, and the helpers below find the
// group by its LEGEND rather than by any squad name — the lesson 55 broken
// tests taught on 20 Aug 2026.
const TEAMS = [
  { id: 't-a', name: 'U10 Reds' },
  { id: 't-b', name: 'U12 Blues' },
  { id: 't-c', name: 'U14 Greens' },
]

function setup(props = {}) {
  const onPosted = vi.fn()
  const onClose = vi.fn()
  render(
    <NoticeComposer
      open
      onClose={onClose}
      onPosted={onPosted}
      teams={TEAMS}
      clubWide
      {...props}
    />,
  )
  return { onPosted, onClose, user: userEvent.setup() }
}

function scopeGroup() {
  return screen.getByRole('group', { name: /who sees it/i })
}

function squadBox(name) {
  return within(scopeGroup()).getByRole('checkbox', { name })
}

async function writeNotice(user) {
  await user.type(screen.getByLabelText(/title/i), 'Kit collection')
  await user.type(screen.getByLabelText(/^notice$|body|message/i), 'Bring your kit on Saturday.')
}

async function post(user) {
  await user.click(screen.getByRole('button', { name: /post/i }))
}

beforeEach(() => {
  createNoticeMock.mockReset()
  createNoticeMock.mockResolvedValue({ id: 'a1' })
})

describe('who a notice is sent to', () => {
  it('opens with the first squad ticked and nothing else', () => {
    setup()
    expect(squadBox('U10 Reds')).toBeChecked()
    expect(squadBox('U12 Blues')).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /whole club/i })).not.toBeChecked()
  })

  it('sends any number of age groups in ONE call', async () => {
    const { user } = setup()
    await user.click(squadBox('U12 Blues'))
    await user.click(squadBox('U14 Greens'))
    await writeNotice(user)
    await post(user)

    await waitFor(() => expect(createNoticeMock).toHaveBeenCalledTimes(1))
    const { teamIds } = createNoticeMock.mock.calls[0][0]
    expect([...teamIds].sort()).toEqual(['t-a', 't-b', 't-c'])
  })

  // ⚠️ ONE CALL, NOT THREE. The push trigger is STATEMENT-level: it sends one
  // notification per group per statement. A component that looped would post
  // three statements and buzz anyone in two of those squads twice, which is the
  // whole reason the group exists.
  it('does not call createNotice once per squad', async () => {
    const { user } = setup()
    await user.click(squadBox('U12 Blues'))
    await writeNotice(user)
    await post(user)
    await waitFor(() => expect(createNoticeMock).toHaveBeenCalledTimes(1))
  })

  it('greys out the age groups when the whole club is chosen', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('checkbox', { name: /whole club/i }))
    for (const team of TEAMS) {
      expect(squadBox(team.name)).toBeDisabled()
    }
  })

  it('sends no squads at all when the whole club is chosen', async () => {
    const { user } = setup()
    await user.click(squadBox('U12 Blues'))
    await user.click(screen.getByRole('checkbox', { name: /whole club/i }))
    await writeNotice(user)
    await post(user)

    await waitFor(() => expect(createNoticeMock).toHaveBeenCalledTimes(1))
    expect(createNoticeMock.mock.calls[0][0].teamIds).toEqual([])
  })

  // ⚠️ THE POINT OF DISABLING RATHER THAN CLEARING. Somebody who ticks three
  // squads, taps Whole club to see what it says, then taps it off, has not
  // asked to lose their three ticks.
  it('gives the squad ticks back when the whole club is turned off again', async () => {
    const { user } = setup()
    await user.click(squadBox('U12 Blues'))
    const whole = screen.getByRole('checkbox', { name: /whole club/i })
    await user.click(whole)
    await user.click(whole)

    expect(squadBox('U10 Reds')).toBeChecked()
    expect(squadBox('U12 Blues')).toBeChecked()
    expect(squadBox('U14 Greens')).not.toBeChecked()
  })

  // ⚠️ THE FAILURE THIS COMPONENT IS MOST ABLE TO CAUSE. An empty set must not
  // quietly widen to the whole club.
  it('refuses to post with nothing chosen, and says so', async () => {
    const { user } = setup()
    await user.click(squadBox('U10 Reds'))
    await writeNotice(user)

    expect(screen.getByRole('button', { name: /post/i })).toBeDisabled()
    expect(createNoticeMock).not.toHaveBeenCalled()
  })

  it('offers no whole-club option to somebody who may not post club-wide', () => {
    setup({ clubWide: false })
    expect(screen.queryByRole('checkbox', { name: /whole club/i })).not.toBeInTheDocument()
    expect(squadBox('U10 Reds')).toBeInTheDocument()
  })

  it('warns that people in two of the chosen squads are only notified once', async () => {
    const { user } = setup()
    await user.click(squadBox('U12 Blues'))
    expect(screen.getByTestId('scope-hint')).toHaveTextContent(/once, not twice/i)
  })
})
