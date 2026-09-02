import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { pickDate } from './helpers/pickDate.js'

// Task 6 of claude/plans/2026-09-02-senior-squads-2a-implementation.md — an
// adult signing up to PLAY sees senior squads first in the player row, with
// no "your child" wording, and a senior squad forces self-registration.
// Scaffolded from tests/parent-self-registration.test.jsx.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED (CLAUDE.md rule 9) — squad names are
// harness fixtures ("Harness Senior A"), never a real Quins squad.
//
// Two layers:
//   * PlayerRegistrationForm, driven directly — the partition and the
//     senior-squad forcing/copy are its logic, and a direct render pins that
//     down without also depending on the wizard's who-step.
//   * SignupWizard, end to end — the brief's own acceptance case: an adult
//     who ticks "I play here myself" alone reaches a player row with seniors
//     first, and the control (child ticked) reaches youth first with "your
//     child" copy.

// ⚠️ MUTABLE, not a fixed `{ profile: null }` — the review-finding test below
// (needsName / "About you" fieldset) needs a profile with `id` set and
// `name_confirmed_at: null` to make `needsName` true, while every other test
// in this file wants the ordinary signed-out/no-profile case. Reset in
// afterEach so one test's profile never leaks into the next.
let mockProfile = { profile: null }
vi.mock('../src/lib/useMyProfile.js', () => ({
  default: () => mockProfile,
  primeMyProfileCache: vi.fn(),
}))
vi.mock('../src/data/members.js', () => ({
  registerMyPlayer: vi.fn(),
  updateProfileNames: vi.fn(),
}))
vi.mock('../src/data/players.js', () => ({ setPlayerDob: vi.fn() }))

import PlayerRegistrationForm from '../src/components/PlayerRegistrationForm.jsx'

// sort_order deliberately out of squad-kind order, like every fixture list in
// this repo — the partition has to do real work, not just preserve input order.
const SENIOR_A = {
  id: 't-sr-a',
  name: 'Harness Senior A',
  sort_order: 10,
  is_senior: true,
  self_registration_allowed: true,
}
const SENIOR_B = {
  id: 't-sr-b',
  name: 'Harness Senior B',
  sort_order: 11,
  is_senior: true,
  self_registration_allowed: true,
}
const YOUTH_U14 = {
  id: 't-u14',
  name: 'Harness U14',
  sort_order: 4,
  is_senior: false,
  self_registration_allowed: true,
}
const YOUTH_U16 = {
  id: 't-u16',
  name: 'Harness U16',
  sort_order: 6,
  is_senior: false,
  self_registration_allowed: true,
}
const TEAMS = [SENIOR_A, YOUTH_U16, SENIOR_B, YOUTH_U14]

function squadOptionNames() {
  const options = within(screen.getByLabelText(/age group/i)).getAllByRole('option')
  return options.map((option) => option.textContent).filter((text) => text !== 'Choose an age group…')
}

describe('PlayerRegistrationForm — senior squads first for a self-registering adult', () => {
  it('puts senior squads first, in sort_order, when the row defaults to self-register', () => {
    render(<PlayerRegistrationForm teams={TEAMS} collectOnly onCollect={vi.fn()} defaultSelfRegister />)

    expect(squadOptionNames()).toEqual([
      'Harness Senior A',
      'Harness Senior B',
      'Harness U14',
      'Harness U16',
    ])
  })

  // CONTROL for the assertion above: without defaultSelfRegister the row is
  // the ordinary child-registration case, and the partition must not fire —
  // proves the ordering above is really about self-registration, not just
  // "is_senior squads always come first".
  it('CONTROL: keeps the plain sort_order — youth first — for an ordinary child row', () => {
    render(<PlayerRegistrationForm teams={TEAMS} collectOnly onCollect={vi.fn()} />)

    expect(squadOptionNames()).toEqual([
      'Harness U14',
      'Harness U16',
      'Harness Senior A',
      'Harness Senior B',
    ])
  })

  it('has no "child" wording in the row while self-registering', () => {
    render(<PlayerRegistrationForm teams={TEAMS} collectOnly onCollect={vi.fn()} defaultSelfRegister />)

    const row = screen.getByTestId('player-row')
    expect(row.textContent).not.toMatch(/child/i)
  })

  // CONTROL for the assertion above: the same row, ordinary child mode, does
  // say "your child" — proves the negative check can find the word when it is
  // really there, rather than the query itself being broken.
  it('CONTROL: says "your child" in the row for an ordinary child row', () => {
    render(<PlayerRegistrationForm teams={TEAMS} collectOnly onCollect={vi.fn()} />)

    const row = screen.getByTestId('player-row')
    expect(row.textContent).toMatch(/your child/i)
  })

  it('forces self-register and hides the who control once a senior squad is chosen', async () => {
    const user = userEvent.setup()
    const onCollect = vi.fn()
    // Not defaultSelfRegister — this is the case where a parent ticked
    // "child" but then picked a senior squad for the row anyway (e.g. an
    // 18-year-old on the roll-call's "child" tick), and the squad itself
    // must still force it.
    render(<PlayerRegistrationForm teams={TEAMS} collectOnly onCollect={onCollect} />)

    await user.type(screen.getByLabelText(/player's first name/i), 'Amara')
    await user.type(screen.getByLabelText(/player's family name/i), 'Bello')
    await pickDate(user, '1995-05-01', /date of birth/i)
    await user.selectOptions(screen.getByLabelText(/age group/i), SENIOR_A.id)

    expect(screen.queryByRole('radio', { name: /i'm the player/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /my child/i })).not.toBeInTheDocument()
    expect(
      screen.getByText(/senior squads are for players registering themselves/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /add my player/i }))

    expect(onCollect).toHaveBeenCalledWith([
      expect.objectContaining({ teamId: SENIOR_A.id, selfRegister: true }),
    ])
  })

  // CONTROL for the force above: the SAME squad list, a youth squad chosen
  // instead — the who control is there, and selfRegister is NOT forced.
  it('CONTROL: leaves the who control in place for a youth squad in the same list', async () => {
    const user = userEvent.setup()
    render(<PlayerRegistrationForm teams={TEAMS} collectOnly onCollect={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText(/age group/i), YOUTH_U14.id)

    expect(screen.getByRole('radio', { name: /i'm the player/i })).toBeInTheDocument()
    expect(
      screen.queryByText(/senior squads are for players registering themselves/i),
    ).not.toBeInTheDocument()
  })
})

// ── SignupWizard, end to end — the brief's own acceptance case ─────────────

vi.mock('../src/data/signupSquads.js', () => ({
  listSignupSquads: vi.fn(async () => TEAMS),
}))

import SignupWizard from '../src/components/SignupWizard.jsx'

async function reachPlayersStep(user, { tick }) {
  render(<SignupWizard busy={false} error={null} onError={vi.fn()} onSubmitAccount={vi.fn()} />)

  await user.type(screen.getByLabelText(/your first name/i), 'Sam')
  await user.type(screen.getByLabelText(/your family name/i), 'Okonkwo-Reyes')
  await user.click(screen.getByRole('checkbox', { name: tick }))

  // A squad is required on the who step (20 Aug 2026 rule) — any one will do,
  // the players step re-lists them all regardless of which was ticked here.
  const group = await screen.findByRole('group', { name: /age groups/i })
  await user.click(within(group).getAllByRole('checkbox')[0])

  await user.click(screen.getByRole('button', { name: /^continue$/i }))
  // Lands on the players step.
  await screen.findAllByTestId('player-row')
}

describe('SignupWizard — an adult reaches senior squads first', () => {
  it('with "I play here myself" ticked alone, the player row lists senior squads first', async () => {
    const user = userEvent.setup()
    await reachPlayersStep(user, { tick: /i play here myself/i })

    expect(squadOptionNames()).toEqual([
      'Harness Senior A',
      'Harness Senior B',
      'Harness U14',
      'Harness U16',
    ])
    const row = screen.getByTestId('player-row')
    expect(row.textContent).not.toMatch(/child/i)
  })

  // CONTROL: the brief's own control case — "I have a child playing here"
  // ticked instead reaches youth squads first, with "your child" copy.
  it('CONTROL: with "I have a child playing here" ticked, youth squads come first and the copy says "your child"', async () => {
    const user = userEvent.setup()
    await reachPlayersStep(user, { tick: /i have a child playing here/i })

    expect(squadOptionNames()).toEqual([
      'Harness U14',
      'Harness U16',
      'Harness Senior A',
      'Harness Senior B',
    ])
    const row = screen.getByTestId('player-row')
    expect(row.textContent).toMatch(/your child/i)
  })
})

// ── Review finding: the "About you" fieldset on a self-register path ───────
//
// AddYourPlayer.jsx renders PlayerRegistrationForm WITHOUT collectOnly and
// passes defaultSelfRegister from the roll-call's "I play here myself" tick.
// A signed-in adult on that path whose name is not yet confirmed
// (name_confirmed_at: null) sees the "About you" fieldset — needsName is
// true — and until this fix it always said "This is your name, not your
// child's", which is wrong for someone who has no child in the form at all.

describe('PlayerRegistrationForm — the "About you" fieldset on a self-register path', () => {
  afterEach(() => {
    mockProfile = { profile: null }
  })

  it('says the self sentence, and never "child", when the row defaults to self-register', () => {
    mockProfile = { profile: { id: 'user-1', name_confirmed_at: null } }

    render(
      <PlayerRegistrationForm teams={TEAMS} collectOnly={false} defaultSelfRegister onDone={vi.fn()} />,
    )

    const fieldset = screen.getByText('About you').closest('fieldset')
    expect(fieldset.textContent).toMatch(/this is your own name, as the club should show it/i)
    expect(fieldset.textContent).not.toMatch(/child/i)
  })

  // CONTROL for the assertion above: the ordinary (non-self) path through the
  // same fieldset still says "not your child's" — proves the branch is
  // really about defaultSelfRegister, not that the sentence vanished.
  it('CONTROL: says "not your child\'s" when the row is not self-register', () => {
    mockProfile = { profile: { id: 'user-1', name_confirmed_at: null } }

    render(<PlayerRegistrationForm teams={TEAMS} collectOnly={false} onDone={vi.fn()} />)

    const fieldset = screen.getByText('About you').closest('fieldset')
    expect(fieldset.textContent).toMatch(/not your child's/i)
  })
})
