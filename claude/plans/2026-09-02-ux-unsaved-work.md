# UX review, item 1: stop losing unsaved work

**Status: SHIPPED as `2d227af` (PR #631), 2 Sep 2026.** The recorded gap
(leaving the team sheet via the dock) is still open; see
`claude/plans/2026-09-02-ux-review-programme.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach, manager or parent never loses typed work to a back-swipe, a
stray click on the scrim, an Escape press, a tab switch or a page reload, on the
four forms where the 2 Sep 2026 UX review found it happening.

**Architecture:** One tiny hook registers a `beforeunload` handler while a form
is dirty. Each form derives its own `dirty` flag from state it already has and
uses the app's existing two-step inline confirm (never a native `confirm()`)
where an in-app exit would discard work. The match sheet, which has no in-app
Back button of its own, keeps a draft in `sessionStorage` instead, so every exit
route is covered without touching the router.

**Tech Stack:** React 19, react-router-dom 7 with `BrowserRouter` (so
`useBlocker` is NOT available; do not reach for it), vitest + Testing Library.

## Global constraints

- Never a native `confirm()`, `alert()` or `prompt()` (RESTORE.md; `Button.jsx:90-96`).
- `dangerQuiet` arms, `danger` confirms. The first tap is never solid red.
- Every assertion is run red first against the injected fault (CLAUDE.md rule 6).
- No real person's name in any fixture (CLAUDE.md rule 9).
- `npm run test:related -- <file>` while editing; `npm test` before push.
- The four forms are large; add to them, do not restructure them.

## Why these four, and what was argued against

The review (2 Sep 2026) found no `beforeunload` and no route blocker anywhere in
`src/`, and four places where that costs real work: the team sheet
(`Lineup.jsx`), the RCM match sheet (`MatchSheet.jsx`), the event form
(`EventForm.jsx`, dismissed by scrim click or Escape via `Sheet.jsx`), and the
sign-up wizard (`SignupWizard.jsx`, whose Back remounts the children form from a
blank row).

**Against a router-level blocker:** `useBlocker` needs a data router and the
app is on `BrowserRouter`. Migrating the router for this is out of proportion,
and intercepting every dock and sidebar link by hand to show a non-native
confirm is a second navigation system. Not built.

**Against autosaving the team sheet:** `createLineup` deliberately writes the
row on first Save, not on mount, so that "did anyone pick a team?" stays
answerable (`Lineup.jsx:498-503`). Autosaving would break that ruling. So the
team sheet gets a confirm on its own Back button, a visible "Unsaved changes"
marker, and `beforeunload`. **Known gap, recorded on purpose:** leaving the team
sheet via the dock or sidebar still discards. A `sessionStorage` draft like the
match sheet's would close it and is the follow-up if coaches hit it.

**Against a draft for the event form:** it is a modal with a clear close, so a
discard confirm at the close is enough and simpler than restoring a half-typed
sheet later.

## File map

| File | Change |
|---|---|
| `src/lib/useUnsavedChanges.js` | New. `useUnsavedChanges(dirty)` adds/removes a `beforeunload` listener. |
| `tests/use-unsaved-changes.test.jsx` | New. Proves the listener fires only while dirty. |
| `src/screens/EventForm.jsx` | `dirty` from a snapshot of `values`, `repeatDays`, `extraTeamIds`, `applyToSeries`; `requestClose` shows an inline discard confirm; `beforeunload`. |
| `tests/event-form-unsaved.test.jsx` | New. |
| `src/screens/Lineup.jsx` | `dirty` state set wherever `setSaved(false)` marks an edit; "Unsaved changes" text by the title; Back confirms while dirty; `beforeunload`. |
| `tests/lineup-unsaved.test.jsx` | New. |
| `src/screens/MatchSheet.jsx` | Draft of `fields`, `slots`, `cardRows`, `score` in `sessionStorage` under `match-sheet-draft:<eventId>`; restored on load with a status line; cleared on successful persist; `beforeunload`. |
| `tests/match-sheet-draft.test.jsx` | New. |
| `src/components/PlayerRegistrationForm.jsx` | New optional prop `initialRows`. |
| `src/components/SignupWizard.jsx` | Pass `initialRows={players}` so Back keeps the children. |
| `tests/signup-wizard-back.test.jsx` | New. |
| `claude/changelog.md` | Entry under 2 Sep 2026, no SHA. |

---

### Task 1: the `beforeunload` hook

**Files:** create `src/lib/useUnsavedChanges.js`, `tests/use-unsaved-changes.test.jsx`.

**Produces:** `export default function useUnsavedChanges(dirty: boolean): void`.

- [ ] Write the failing test:

```jsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import useUnsavedChanges from '../src/lib/useUnsavedChanges.js'

function Probe({ dirty }) {
  useUnsavedChanges(dirty)
  return null
}

function fireBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('useUnsavedChanges', () => {
  it('asks the browser to warn while dirty', () => {
    render(<Probe dirty />)
    const event = fireBeforeUnload()
    expect(event.defaultPrevented).toBe(true)
  })

  it('does nothing while clean, and stops once clean again', () => {
    const { rerender } = render(<Probe dirty={false} />)
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
    rerender(<Probe dirty />)
    expect(fireBeforeUnload().defaultPrevented).toBe(true)
    rerender(<Probe dirty={false} />)
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })
})
```

- [ ] Run `npx.cmd vitest run tests/use-unsaved-changes.test.jsx` — expect FAIL, module not found.
- [ ] Implement:

```js
import { useEffect } from 'react'

/**
 * While `dirty` is true, the browser's own "Leave site?" dialog guards reload,
 * tab close and typed navigation. That dialog is the ONE native prompt this
 * app allows, because nothing else can intercept those exits.
 *
 * It does NOT cover in-app navigation (dock, sidebar, navigate()). Each form
 * handles its own in-app exits — see claude/plans/2026-09-02-ux-unsaved-work.md
 * for what each one does and the gap that is left on purpose.
 */
export default function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return undefined
    function warn(event) {
      event.preventDefault()
      // Legacy browsers read returnValue; modern ones ignore the text.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
}
```

- [ ] Run the test — expect PASS. Commit: `feat(forms): useUnsavedChanges guards reload while a form is dirty`.

### Task 2: event form discard confirm

**Files:** modify `src/screens/EventForm.jsx` (state near :569-710, Sheet at :1518, submit button block :2613), create `tests/event-form-unsaved.test.jsx`.

**Consumes:** `useUnsavedChanges`.

- [ ] Write the failing tests, using the same mocks as `tests/event-form.test.jsx` (copy its `vi.mock` block for memberships, events and availability verbatim, plus the `renderForm` helper that renders `<MemoryRouter><EventForm event={event} onClose={onClose} onSaved={onSaved} /></MemoryRouter>` with an admin membership):

```jsx
describe('EventForm — unsaved changes', () => {
  it('closes at once when nothing was typed', async () => {
    const { onClose } = renderForm()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('asks before discarding typed work, and keeps editing on request', async () => {
    const { onClose } = renderForm()
    await userEvent.type(screen.getByLabelText(/opponent/i), 'Dubai Exiles')
    await userEvent.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    const ask = await screen.findByRole('alertdialog', { name: /discard/i })
    await userEvent.click(within(ask).getByRole('button', { name: /keep editing/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByLabelText(/opponent/i)).toHaveValue('Dubai Exiles')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('discards on the second tap', async () => {
    const { onClose } = renderForm()
    await userEvent.type(screen.getByLabelText(/opponent/i), 'D')
    await userEvent.keyboard('{Escape}')
    const ask = await screen.findByRole('alertdialog', { name: /discard/i })
    await userEvent.click(within(ask).getByRole('button', { name: /^discard$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] Run — expect the second and third to FAIL (closes immediately, no alertdialog).
- [ ] Implement in `EventForm.jsx`:
  1. Import `useUnsavedChanges`.
  2. After `applyToSeries` state (:704) add a snapshot and the flag:

```jsx
  // ⚠️ DIRTY IS A COMPARISON, NOT A COUNTER. Any keystroke that is then undone
  // leaves the form clean again, which is what a person expects when they
  // press Escape on a form they only glanced at.
  const [initialSnapshot] = useState(() =>
    JSON.stringify({ values, repeatDays: [], extraTeamIds: [], applyToSeries: false }),
  )
  const dirty =
    JSON.stringify({ values, repeatDays, extraTeamIds, applyToSeries }) !== initialSnapshot
  useUnsavedChanges(dirty && !saving)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  function requestClose() {
    if (dirty) setConfirmingDiscard(true)
    else onClose?.()
  }
```

  3. Change BOTH `<Sheet open onClose={onClose} …>` (:1033 and :1518) to `onClose={requestClose}`.
  4. Directly inside the `<form>` at :1522, before the first field, render the confirm:

```jsx
        {confirmingDiscard && (
          <div
            role="alertdialog"
            aria-labelledby="event-discard-title"
            className="mb-3.5 rounded-[11px] border border-line bg-surface-mute px-3 py-2.5"
          >
            <p id="event-discard-title" className="text-sm font-bold text-ink">
              Discard your changes?
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-muted">
              Nothing has been saved yet.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => onClose?.()}>Discard</Button>
              <Button variant="ghost" onClick={() => setConfirmingDiscard(false)}>
                Keep editing
              </Button>
            </div>
          </div>
        )}
```

  Both buttons must be `type="button"` (check `Button` defaults; if it defaults to submit, pass it explicitly) so neither submits the form.

- [ ] Run `tests/event-form-unsaved.test.jsx` then `npm run test:related -- src/screens/EventForm.jsx` — all PASS.
- [ ] Commit: `feat(events): the event form asks before discarding typed work`.

### Task 3: team sheet Back confirm and marker

**Files:** modify `src/screens/Lineup.jsx` (:226, every `setSaved(false)` at :395,407,414,428,439,472,776,812,1081, header :743-753, save :493-540), create `tests/lineup-unsaved.test.jsx`.

- [ ] Write the failing tests, copying the mock block and `renderScreen` from `tests/lineup.test.jsx`, but with `useNavigate: () => navigateMock` where `const navigateMock = vi.fn()`:

```jsx
describe('Lineup — unsaved changes', () => {
  it('Back leaves at once when nothing changed', async () => {
    renderScreen()
    await screen.findByText('Rory Aldenbrook')
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  it('marks the sheet unsaved after a pick and asks before leaving', async () => {
    renderScreen()
    await screen.findByText('Rory Aldenbrook')
    await userEvent.click(screen.getAllByRole('button', { name: /start/i })[0])
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }))
    expect(navigateMock).not.toHaveBeenCalled()
    const ask = await screen.findByRole('alertdialog', { name: /leave without saving/i })
    await userEvent.click(within(ask).getByRole('button', { name: /stay/i }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: /leave/i }),
    )
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  it('clears the marker after a save', async () => {
    createLineupMock.mockResolvedValue({ id: 'l-1' })
    saveLineupPlayersMock.mockResolvedValue([])
    renderScreen()
    await screen.findByText('Rory Aldenbrook')
    await userEvent.click(screen.getAllByRole('button', { name: /start/i })[0])
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await screen.findByText('Saved')
    expect(screen.queryByText(/unsaved changes/i)).toBeNull()
  })
})
```

  The exact accessible name of the pool's pick button must be read from `Lineup.jsx:654-673` before running; adjust the `/start/i` matcher to it.

- [ ] Run — expect FAIL on the second and third.
- [ ] Implement: add `const [dirty, setDirty] = useState(false)` and `const [confirmingLeave, setConfirmingLeave] = useState(false)` beside `saved`; call `useUnsavedChanges(dirty && !saving)`; add `setDirty(true)` next to every edit-site `setSaved(false)` (NOT the one inside `save()` at :496); set `setDirty(false)` after `setSaved(true)` at :536. Replace the Back button:

```jsx
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-[12.5px] font-semibold text-warn-ink">Unsaved changes</span>
          )}
          <button
            type="button"
            onClick={() => (dirty ? setConfirmingLeave(true) : navigate(-1))}
            className="min-h-[44px] px-3 text-[13px] font-bold text-brand-ink"
          >
            Back
          </button>
        </div>
```

  Check `text-warn-ink` exists in `tailwind.config.js`; if the token is named differently, use the amber pairing the accessibility spec approves (`#8a5a12` on the warn background). Under the header, when `confirmingLeave`:

```jsx
      {confirmingLeave && (
        <div role="alertdialog" aria-labelledby="lineup-leave-title" className="mb-3 rounded-[11px] border border-line bg-surface-mute px-3 py-2.5">
          <p id="lineup-leave-title" className="text-sm font-bold text-ink">Leave without saving?</p>
          <p className="mt-0.5 text-[12.5px] text-ink-muted">The team you picked will be lost.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => navigate(-1)}>Leave</Button>
            <Button variant="ghost" onClick={() => setConfirmingLeave(false)}>Stay</Button>
          </div>
        </div>
      )}
```

- [ ] Run `npm run test:related -- src/screens/Lineup.jsx` — all PASS (the existing `tests/page-header-wrap.test.js` must still pass; keep `flex-wrap` on the header row).
- [ ] Commit: `feat(lineup): the team sheet says when it is unsaved and asks before Back`.

### Task 4: match sheet draft

**Files:** modify `src/screens/MatchSheet.jsx` (state :354-374, load effect ~:390-460, edit setters :491-594, `persist` :640-711), create `tests/match-sheet-draft.test.jsx`.

Key: `match-sheet-draft:${eventId}`. Shape: `{ fields, slots, cardRows, score, savedAt }`.

- [ ] Write the failing tests, copying the mock block and the `MATCH`/`U14B`/`renderSheet` helpers from `tests/match-sheets.test.jsx` (whatever helper that file uses to mount `<MatchSheet>` inside `MemoryRouter` at `/match-sheet/e-1` with a coach membership and an empty `getMatchSheetMock` result):

```jsx
describe('MatchSheet — draft', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('keeps typing in a draft, and restores it on the next visit', async () => {
    renderSheet()
    const captain = await screen.findByLabelText(/captain/i)
    await userEvent.type(captain, 'Ari Fenwick')
    await waitFor(() =>
      expect(JSON.parse(window.sessionStorage.getItem('match-sheet-draft:e-1')).fields.captain_name)
        .toBe('Ari Fenwick'),
    )
    cleanup()
    renderSheet()
    expect(await screen.findByLabelText(/captain/i)).toHaveValue('Ari Fenwick')
    expect(screen.getByRole('status')).toHaveTextContent(/restored/i)
  })

  it('drops the draft once the sheet is saved', async () => {
    saveMatchSheetMock.mockResolvedValue({ id: 'ms-1' })
    saveSlotsMock.mockResolvedValue([])
    saveCardsMock.mockResolvedValue([])
    upsertEventMock.mockResolvedValue({})
    renderSheet()
    await userEvent.type(await screen.findByLabelText(/captain/i), 'A')
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }))
    await waitFor(() => expect(window.sessionStorage.getItem('match-sheet-draft:e-1')).toBeNull())
  })

  it('does not restore a draft over a sheet that already has content from the server', async () => {
    window.sessionStorage.setItem('match-sheet-draft:e-1', JSON.stringify({ fields: { captain_name: 'Old' }, slots: [], cardRows: [], score: {} }))
    getMatchSheetMock.mockResolvedValue({ id: 'ms-1', captain_name: 'Server' })
    renderSheet()
    expect(await screen.findByLabelText(/captain/i)).toHaveValue('Server')
  })
})
```

  The label text for the captain box and the exact "Save draft" button name must be read from the component first; adjust the matchers.

- [ ] Run — expect FAIL.
- [ ] Implement in `MatchSheet.jsx`:
  1. Add helpers above the component:

```js
const draftKey = (eventId) => `match-sheet-draft:${eventId}`
function readDraft(eventId) {
  try {
    const raw = window.sessionStorage.getItem(draftKey(eventId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
function writeDraft(eventId, draft) {
  try { window.sessionStorage.setItem(draftKey(eventId), JSON.stringify(draft)) } catch { /* private mode */ }
}
function clearDraft(eventId) {
  try { window.sessionStorage.removeItem(draftKey(eventId)) } catch { /* private mode */ }
}
```

  2. State: `const [dirty, setDirty] = useState(false)`, `const [restored, setRestored] = useState(false)`; `useUnsavedChanges(dirty && !saving)`.
  3. In the load effect, after the server row has been applied: if there was NO server sheet (`!row`) and `readDraft(eventId)` returns an object, apply its `fields`, `slots`, `cardRows`, `score` with the existing setters, then `setRestored(true)` and `setDirty(true)`. A server sheet always wins; the draft is only for a sheet that was never saved.
  4. Every edit setter (:491, :512, :517, :550, :594, and the lineup refill at :532) also calls `setDirty(true)`.
  5. A `useEffect` on `[dirty, fields, slots, cardRows, score]`: when `dirty`, `writeDraft(eventId, { fields, slots, cardRows, score, savedAt: Date.now() })`.
  6. In `persist`, after `setSaved(true)`: `clearDraft(eventId); setDirty(false)`.
  7. Render, above the form, when `restored`: `<p role="status" className="mb-3 text-[12.5px] font-semibold text-ink-muted">Restored what you typed last time. It is not saved yet.</p>`.

- [ ] Run `npm run test:related -- src/screens/MatchSheet.jsx` — all PASS.
- [ ] Commit: `feat(match-sheet): typing survives a tab switch or reload as a draft`.

### Task 5: sign-up Back keeps the children

**Files:** modify `src/components/PlayerRegistrationForm.jsx:539-552`, `src/components/SignupWizard.jsx:164-170`, create `tests/signup-wizard-back.test.jsx`.

- [ ] Write the failing test. `SignupWizard` needs `useSlowLoad` and the teams read; look at how `tests/` mounts `Login` in sign-up mode (`tests/login.test.jsx` sign-up section) and reuse its mocks; render `<SignupWizard busy={false} error={null} onError={vi.fn()} onSubmitAccount={vi.fn()} />`:

```jsx
it('keeps the typed children when the person goes Back from the account step', async () => {
  renderWizard()
  // "who" step: pick the child answer and continue (read the exact labels from SignupWizard.jsx).
  await userEvent.click(screen.getByLabelText(/my child plays/i))
  await userEvent.type(screen.getByLabelText(/first name/i), 'Sam')
  await userEvent.type(screen.getByLabelText(/last name/i), 'Okonkwo-Reyes')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  // players step
  const childFirst = await screen.findByLabelText(/player.s first name/i)
  await userEvent.type(childFirst, 'Teodora')
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  // account step
  await screen.findByLabelText(/email/i)
  await userEvent.click(screen.getByRole('button', { name: /^back$/i }))
  expect(await screen.findByLabelText(/player.s first name/i)).toHaveValue('Teodora')
})
```

  Every name above is invented. If the "who" step needs a squad picked, add that click; read `SignupWizard.jsx` for the field labels and validation before running.

- [ ] Run — expect FAIL (value is empty).
- [ ] Implement: in `PlayerRegistrationForm` add `initialRows = null` to the props and change the state init to

```jsx
  const [rows, setRows] = useState(() =>
    initialRows && initialRows.length > 0
      ? initialRows
      : [{ ...blankRow(), selfRegister: Boolean(defaultSelfRegister) }],
  )
```

  In `SignupWizard` add `initialRows={players}` to the `<PlayerRegistrationForm>` call. Check what `handlePlayersCollected` stores in `players`: if it is the validated rows in the same shape as `rows`, this is enough; if it maps them to a different shape, store the raw rows alongside (a second state `playerRows`) and pass that.

- [ ] Run `npm run test:related -- src/components/SignupWizard.jsx` — PASS.
- [ ] Commit: `fix(signup): Back from the account step keeps the children already typed`.

### Task 6: changelog, docs check, full suite, push

- [ ] Add under `## 2 Sep 2026` in `claude/changelog.md`, no SHA, above the existing entries: **fix(forms): typed work is no longer lost** — one sentence per form, and name the recorded gap (team sheet via dock).
- [ ] `node scripts/docs-check.mjs` — green.
- [ ] `npm test` — everything green except `tests/pwa-build.test.js` if this is a worktree without its own Vite (known trap; verify with `ls node_modules/vite/bin/vite.js`).
- [ ] Push the branch, open the PR, wait for CI. Merging is a live deploy: Jay's explicit yes.

## Self-review

- Spec coverage: four forms, hook, docs — all tasked.
- Types: `useUnsavedChanges(dirty)` used identically in Tasks 2-4; `initialRows` named the same in Task 5 and the file map.
- No placeholders: each step shows the code or the exact command.
