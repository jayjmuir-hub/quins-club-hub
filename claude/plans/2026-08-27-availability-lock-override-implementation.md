# Per-event Availability Lock Override — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**STATUS: NOT YET SHIPPED** — plan written 27 Aug 2026. Design spec:
`claude/plans/2026-08-27-availability-lock-override.md`. Builds on the shipped
self-edit lock (`db/migrations/20260827_availability_self_lock.sql`).

**Goal:** Give coach/manager/admin a per-event `availability_override` of
`auto` / `open` / `locked` — set from both the event form and the Availability
sheet — that overrides the calendar-day self-edit lock, enforced in RLS.

**Architecture:** One `text` column on `events` (default `auto`) drives both the
RLS helper (`private.availability_self_editable` gains an override branch) and
the client (`isAvailabilitySelfLocked` gains the same branch). Two UI controls
write the single column, so they can't disagree. Staff are never locked.

**Tech Stack:** Vite + React, Tailwind, Vitest + Testing Library, Supabase
Postgres 17 RLS, `node-postgres` harnesses via `scripts/db-check.mjs`.

## Global Constraints

- **`npm install --include=dev`** — an ambient `NODE_ENV=production` drops Vitest/`pg`.
- Feedback loop: `npm run test:related -- <file>`; full `npm test` (~40s) before a task-final commit.
- **Never `git add -A`.** Stage explicit paths.
- **Override precedence:** `open` → always editable; `locked` → always frozen (even a social, even a distant match); `auto`/`null`/`undefined` → the existing calendar rule (5d match / 1d training / never social). Default column value is `'auto'`.
- **Staff (`can_edit_team` = admin, coach/manager/medic active) are NEVER locked** and are the only ones who may set the override. Writing the column is an events UPDATE, already governed by the events write policy — **no new policy, and no column grant** (`events` has table-level ALL for `authenticated`, verified 27 Aug 2026 — a new column is auto-covered; prior events-column migrations add no grant).
- Event `type` ∈ {`match`,`training`,`social`}.
- `db:check` runs against PRODUCTION with rollback: harnesses must `begin;`…`rollback;`, no `commit;`, ≥1 `raise exception`; executed via `node-postgres` (no `\i`).
- Production migration + Netlify deploy (15 credits) are gated on Jay's explicit yes — NOT in the automated loop.
- Changelog: never cite your own branch SHA; the next PR cites the squash SHA.

---

### Task 1: Lock helper — the override branch

**Files:**
- Modify: `src/lib/availabilityLock.js` (`isAvailabilitySelfLocked`, ~L38-41)
- Test: `tests/availabilityLock.test.js` (add a describe block)

**Interfaces:**
- `isAvailabilitySelfLocked(event, now)` now reads `event.availability_override`
  first; `availabilityLockInstant` is unchanged (it stays "when the *auto* rule
  locks").

- [ ] **Step 1: Add the failing tests** — append to `tests/availabilityLock.test.js`:

```js
describe('isAvailabilitySelfLocked — per-event override', () => {
  const inWindowMatch = { type: 'match', starts_at: '2026-09-13T12:00:00Z' } // auto-locks 2026-09-07T20:00Z
  const distantMatch = { type: 'match', starts_at: '2026-12-01T12:00:00Z' }  // auto-locks 2026-11-26T20:00Z
  const social = { type: 'social', starts_at: '2026-09-13T12:00:00Z' }
  const afterAutoCut = new Date('2026-09-10T00:00:00Z')  // past inWindowMatch's auto cutoff
  const early = new Date('2026-09-01T00:00:00Z')         // before every cutoff here

  it('open is never locked, even past the auto window', () => {
    expect(isAvailabilitySelfLocked({ ...inWindowMatch, availability_override: 'open' }, afterAutoCut)).toBe(false)
  })

  it('locked is always locked — a distant match and a social', () => {
    expect(isAvailabilitySelfLocked({ ...distantMatch, availability_override: 'locked' }, early)).toBe(true)
    expect(isAvailabilitySelfLocked({ ...social, availability_override: 'locked' }, early)).toBe(true)
  })

  it('auto and undefined fall through to the calendar rule', () => {
    expect(isAvailabilitySelfLocked({ ...inWindowMatch, availability_override: 'auto' }, afterAutoCut)).toBe(true)
    expect(isAvailabilitySelfLocked({ ...distantMatch, availability_override: 'auto' }, early)).toBe(false)
    expect(isAvailabilitySelfLocked({ ...social }, early)).toBe(false)
  })
})
```

- [ ] **Step 2: Run and watch fail**

Run: `npm run test:related -- tests/availabilityLock.test.js`
Expected: FAIL — override is ignored, so `open`/`locked` cases give the auto answer.

- [ ] **Step 3: Add the override branch** — replace `isAvailabilitySelfLocked` in `src/lib/availabilityLock.js`:

```js
/**
 * True when self-service editing is closed for this event at `now`.
 *
 * A per-event override wins over the calendar rule: 'open' is never locked,
 * 'locked' always is (even a social, even a distant match). 'auto', null, or a
 * missing value fall through to availabilityLockInstant (the calendar rule).
 */
export function isAvailabilitySelfLocked(event, now = new Date()) {
  if (event?.availability_override === 'open') return false
  if (event?.availability_override === 'locked') return true
  const instant = availabilityLockInstant(event)
  return instant != null && now.getTime() >= instant.getTime()
}
```

- [ ] **Step 4: Run and watch pass**

Run: `npm run test:related -- tests/availabilityLock.test.js`
Expected: PASS — new block green, existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/availabilityLock.js tests/availabilityLock.test.js
git commit -m "feat(availability): lock helper honours a per-event override

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `setAvailabilityOverride` data fn + harness stub

**Files:**
- Modify: `src/data/events.js` (add fn near `upsertEvent`, ~L218)
- Modify: `harness/stubs/events.js` (add matching stub near `upsertEvent`, ~L315)
- Test: `tests/events-override-data.test.js`

**Interfaces:**
- Produces: `setAvailabilityOverride(eventId, value) → Promise<eventRow>` — updates
  just `events.availability_override`, throws on error, throws `REFUSED` when RLS
  refused (no row back), throws if `eventId` missing.

- [ ] **Step 1: Write the failing test** — `tests/events-override-data.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '../src/lib/supabase.js'
import { setAvailabilityOverride } from '../src/data/events.js'

function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['update', 'eq', 'select', 'maybeSingle']) {
    b[name] = vi.fn((...args) => { ;(calls[name] ??= []).push(args); return b })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

beforeEach(() => supabase.from.mockReset())

describe('setAvailabilityOverride', () => {
  it('updates only availability_override on the event and returns the row', async () => {
    const { b, calls } = builder({ data: { id: 'e-1', availability_override: 'open' }, error: null })
    supabase.from.mockReturnValue(b)

    const out = await setAvailabilityOverride('e-1', 'open')

    expect(supabase.from).toHaveBeenCalledWith('events')
    expect(calls.update).toEqual([[{ availability_override: 'open' }]])
    expect(calls.eq).toEqual([['id', 'e-1']])
    expect(out).toEqual({ id: 'e-1', availability_override: 'open' })
  })

  it('throws when RLS refuses (no row back)', async () => {
    const { b } = builder({ data: null, error: null })
    supabase.from.mockReturnValue(b)
    await expect(setAvailabilityOverride('e-1', 'locked')).rejects.toThrow(/permission/i)
  })

  it('throws on a real error', async () => {
    const { b } = builder({ data: null, error: new Error('boom') })
    supabase.from.mockReturnValue(b)
    await expect(setAvailabilityOverride('e-1', 'auto')).rejects.toThrow('boom')
  })

  it('throws without an event id, before touching supabase', async () => {
    await expect(setAvailabilityOverride('', 'open')).rejects.toThrow(/event id/i)
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and watch fail**

Run: `npm run test:related -- tests/events-override-data.test.js`
Expected: FAIL — `setAvailabilityOverride` is not exported.

- [ ] **Step 3: Add the fn to `src/data/events.js`** (after `upsertEvent`, reuse the existing `REFUSED` constant at L194):

```js
/**
 * Sets one event's per-event availability override ('auto' | 'open' | 'locked').
 * A targeted UPDATE of just that column — the Availability sheet flips it live
 * without re-sending the whole event. RLS (the events write policy) is the gate:
 * only staff who can_edit_team may change it, so a refused write comes back as no
 * row and is reported as REFUSED, matching upsertEvent.
 */
export async function setAvailabilityOverride(eventId, value) {
  if (!eventId) throw new Error('setAvailabilityOverride needs an event id.')

  const { data, error } = await supabase
    .from('events')
    .update({ availability_override: value })
    .eq('id', eventId)
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED)
  return data
}
```

- [ ] **Step 4: Add the stub to `harness/stubs/events.js`** (after `upsertEvent`):

```js
export async function setAvailabilityOverride(eventId, value) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'update', table: 'events', payload: { id: eventId, availability_override: value } })
  return { id: eventId, availability_override: value }
}
```

- [ ] **Step 5: Run and watch pass**

Run: `npm run test:related -- tests/events-override-data.test.js`
Expected: PASS — 4 assertions green.

- [ ] **Step 6: Commit**

```bash
git add src/data/events.js harness/stubs/events.js tests/events-override-data.test.js
git commit -m "feat(events): setAvailabilityOverride writes the per-event override

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Availability sheet — staff control + override-aware notice

**Files:**
- Modify: `src/screens/Availability.jsx`
- Modify: `tests/availability.test.jsx`

**Interfaces:**
- Consumes: `setAvailabilityOverride` (Task 2), `isAvailabilitySelfLocked` (Task 1).

- [ ] **Step 1: Add the failing tests** — edit `tests/availability.test.jsx`.

  (a) Register an events mock. After the other `vi.mock` blocks:

```js
const setAvailabilityOverrideMock = vi.fn()
vi.mock('../src/data/events.js', () => ({
  setAvailabilityOverride: (...args) => setAvailabilityOverrideMock(...args),
}))
```

  Default it in `beforeEach` (with the other defaults):

```js
  setAvailabilityOverrideMock.mockResolvedValue({ id: 'e-1', availability_override: 'open' })
```

  (b) Add a fixture beside `EVENT` (a distant/open match so the auto rule does not itself lock):

```js
const OVERRIDE_LOCKED = { ...EVENT, availability_override: 'locked' }
const OVERRIDE_OPEN_INWINDOW = {
  ...EVENT,
  availability_override: 'open',
  starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 1 day out: auto would lock a match
}
```

  (c) Append a describe block:

```js
describe('Availability — per-event override', () => {
  it('shows the staff override control and writes on change', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))
    const { user } = setup()

    await screen.findByText('Ana Silva')
    const group = screen.getByRole('group', { name: /self-service availability/i })
    await user.click(within(group).getByRole('button', { name: /^open$/i }))

    expect(setAvailabilityOverrideMock).toHaveBeenCalledWith('e-1', 'open')
  })

  it('does not show the override control to a parent', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    setup()
    await screen.findByText('Tom Fletcher')
    expect(screen.queryByRole('group', { name: /self-service availability/i })).not.toBeInTheDocument()
  })

  it('a parent on a manually-locked event sees disabled buttons and the manual notice', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    const { user } = setup({ event: OVERRIDE_LOCKED })
    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    expect(within(tomRow).getByRole('button', { name: /^in$/i })).toBeDisabled()
    expect(screen.getByText(/availability is closed for this event/i)).toBeInTheDocument()
    await user.click(within(tomRow).getByRole('button', { name: /^in$/i }))
    expect(setAvailabilityMock).not.toHaveBeenCalled()
  })

  it('a parent on an open override inside the auto window can still RSVP', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT_OF_TOM))
    const { user } = setup({ event: OVERRIDE_OPEN_INWINDOW })
    await screen.findByText('Tom Fletcher')
    const tomRow = screen.getByText('Tom Fletcher').closest('li')
    const inBtn = within(tomRow).getByRole('button', { name: /^in$/i })
    expect(inBtn).not.toBeDisabled()
    expect(screen.queryByText(/availability is closed/i)).not.toBeInTheDocument()
    await user.click(inBtn)
    expect(setAvailabilityMock).toHaveBeenCalledWith('e-1', 'p-tom', 'in')
  })
})
```

- [ ] **Step 2: Run and watch the new tests fail**

Run: `npm run test:related -- tests/availability.test.jsx`
Expected: FAIL — no override control; parent notice/lock does not honour the override.

- [ ] **Step 3: Edit `src/screens/Availability.jsx`.**

  (a) Import the data fn (extend the events import — there is none yet, add it):

```js
import { setAvailabilityOverride } from '../data/events.js'
```

  (b) Add the override option list beside `STATUSES` (after L38):

```js
const AVAILABILITY_OVERRIDES = [
  { value: 'auto', label: 'Auto' },
  { value: 'open', label: 'Open' },
  { value: 'locked', label: 'Locked' },
]

const OVERRIDE_HINT = {
  auto: 'Auto — locks 5 days before a match, 1 before training.',
  open: 'Parents can RSVP right up to the event.',
  locked: 'Closed to parents now.',
}
```

  (c) Add a staff-only control component (after `PlayerRow`, before the default export):

```jsx
function OverrideControl({ value, disabled, onChange }) {
  return (
    <div className="mb-3.5 rounded-[11px] bg-surface-mute px-3 py-2.5">
      <p className="mb-1.5 text-[12px] font-bold text-ink-muted">Self-service availability</p>
      <div className="flex gap-1.5" role="group" aria-label="Self-service availability">
        {AVAILABILITY_OVERRIDES.map((option) => {
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={[
                'rounded-[9px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
                active ? 'border-brand bg-brand/10 text-ink' : 'border-line bg-surface-card text-ink-muted hover:bg-surface-mute',
              ].join(' ')}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-muted">{OVERRIDE_HINT[value]}</p>
    </div>
  )
}
```

  (d) Add local override state + handler inside the `Availability` component (after `selfLocked`, ~L122):

```jsx
  const [override, setOverride] = useState(event.availability_override ?? 'auto')
  const [overrideSaving, setOverrideSaving] = useState(false)

  function handleOverrideChange(value) {
    const previous = override
    setOverride(value)                    // optimistic
    setOverrideSaving(true)
    setSaveError(null)
    setAvailabilityOverride(event.id, value)
      .catch((err) => {
        setOverride(previous)             // revert on refusal/failure
        setSaveError(err)
      })
      .finally(() => setOverrideSaving(false))
  }
```

  (e) Render the control (staff only) just under the header block, before the
  `{selfLocked && …}` notice (before L240):

```jsx
      {canOverrideAll && (
        <OverrideControl value={override} disabled={overrideSaving} onChange={handleOverrideChange} />
      )}
```

  (f) Make the parent notice override-aware — replace the existing
  `{selfLocked && myPlayerIds.size > 0 && (…)}` block (L240-246) with:

```jsx
      {selfLocked && myPlayerIds.size > 0 && (
        <p className="mb-3.5 rounded-[11px] bg-surface-mute px-3 py-2.5 text-[13px] font-semibold text-ink-muted">
          {event.availability_override === 'locked' ? (
            <>Availability is closed for this event. Ask a coach if it needs to change.</>
          ) : (
            <>
              Availability is closed for this {event.type === 'match' ? 'match' : 'session'} —
              changes lock {event.type === 'match' ? 'five days before a match' : 'the day before training'}.
              Ask a coach if it needs to change.
            </>
          )}
        </p>
      )}
```

  (Note: `selfLocked` already reads `isAvailabilitySelfLocked(event)`, which after
  Task 1 honours `event.availability_override`, so a parent on `open`/`locked` is
  handled without further change. The staff control's local `override` state is
  only for the staff view's own display — a parent never sees that control.)

- [ ] **Step 4: Run and watch pass**

Run: `npm run test:related -- tests/availability.test.jsx`
Expected: PASS — new block green, existing tests still green.

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/screens/Availability.jsx tests/availability.test.jsx
git commit -m "feat(availability): staff per-event lock override on the sheet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: EventForm — the Auto/Open/Locked field

**Files:**
- Modify: `src/screens/EventForm.jsx`
- Modify: `tests/event-form.test.jsx`

**Interfaces:**
- The event object built in `handleSubmit`'s `common` gains
  `availability_override`, carried through the existing `upsertEvent`/`insertEvents`.

- [ ] **Step 1: Add the failing test** — append to `tests/event-form.test.jsx` (match its existing render/mock harness; it already mocks `../src/data/events.js` and asserts `upsertEvent` payloads — follow the file's own pattern for rendering the form and submitting):

```js
it('defaults availability to Auto and sends the chosen override in the payload', async () => {
  const { user } = renderForm() // use the file's existing helper to mount EventForm for a NEW event
  // default:
  const group = screen.getByRole('group', { name: /self-service availability/i })
  expect(within(group).getByRole('radio', { name: /auto/i })).toBeChecked()
  // choose Locked, fill the required fields the file's other tests fill, submit:
  await user.click(within(group).getByRole('radio', { name: /locked/i }))
  await fillRequiredAndSubmit(user) // use the file's existing submit helper
  expect(upsertEventMock).toHaveBeenCalledWith(expect.objectContaining({ availability_override: 'locked' }))
})
```

  ⚠️ `event-form.test.jsx` has established helpers for mounting and submitting the
  form and a `upsertEventMock`. USE THEM — do not invent a new harness. If the
  Segmented renders as `radio` roles, assert `radio`; if as `button`, assert
  `button` (check how the Type control is queried in the same file and mirror it).

- [ ] **Step 2: Run and watch fail**

Run: `npm run test:related -- tests/event-form.test.jsx`
Expected: FAIL — no such control; payload has no `availability_override`.

- [ ] **Step 3: Edit `src/screens/EventForm.jsx`.**

  (a) Add the option list near `TYPES` (after L163):

```js
const AVAILABILITY_OVERRIDES = [
  { value: 'auto', label: 'Auto' },
  { value: 'open', label: 'Open' },
  { value: 'locked', label: 'Locked' },
]
```

  (b) Add the default to BOTH initial-values returns. In the new-event return
  (after L241 `type: 'match',`):

```js
      availabilityOverride: 'auto',
```

  In the editing/duplicate return (after L282 `type: event.type ?? 'match',`):

```js
    availabilityOverride: event.availability_override ?? 'auto',
```

  (c) Add it to the `common` payload (inside the `common` object, after L875 `type: values.type,`):

```js
      // A fact about the EVENT (true of every squad in a fan-out and every week
      // of a series), so it lives in `common`. Default 'auto' keeps the calendar
      // lock; 'open'/'locked' override it. Enforced in RLS.
      availability_override: values.availabilityOverride,
```

  (d) Render the control after the Type `<Segmented>` block (after L1086):

```jsx
        <Segmented
          legend="Self-service availability"
          name="availability-override"
          options={AVAILABILITY_OVERRIDES}
          value={values.availabilityOverride}
          onChange={set('availabilityOverride')}
        />
        <p className="mb-4 mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          Auto locks RSVPs 5 days before a match, 1 day before training (never for a
          social). Choose <strong>Open</strong> to keep them open right up to the event,
          or <strong>Locked</strong> to close them to parents now.
        </p>
```

- [ ] **Step 4: Run and watch pass**

Run: `npm run test:related -- tests/event-form.test.jsx`
Expected: PASS.

- [ ] **Step 5: Full suite, then commit**

Run: `npm test`
Expected: PASS.

```bash
git add src/screens/EventForm.jsx tests/event-form.test.jsx
git commit -m "feat(events): per-event availability override on the event form

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: The migration

**Files:**
- Create: `db/migrations/20260827_availability_override.sql`

This writes the canonical migration; it is NOT applied here (proven by Task 6's
rolled-back harness, applied to production later on Jay's yes).

- [ ] **Step 1: Write the migration** — `db/migrations/20260827_availability_override.sql`:

```sql
-- ⚠️ APPLIES TO PRODUCTION as `availability_override`.
--
-- A per-event override of the self-edit lock: coach/manager/admin set
-- events.availability_override to 'auto' (the calendar rule), 'open' (always
-- editable by parents), or 'locked' (always frozen). Overrides win over the
-- calendar rule; staff are never locked. Design:
-- claude/plans/2026-08-27-availability-lock-override.md
--
-- No grant: events has table-level ALL for authenticated, so the new column is
-- covered (verified 27 Aug 2026). RLS (the events write policy, can_edit_team)
-- remains the gate on who may set it.

alter table public.events
  add column availability_override text not null default 'auto'
    check (availability_override in ('auto','open','locked'));

-- The lock helper now consults the override before the calendar rule.
create or replace function private.availability_self_editable(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select case
    when e.availability_override = 'open'   then true
    when e.availability_override = 'locked' then false
    when e.starts_at is null then true
    when e.type not in ('match','training') then true
    else now() < (
      date_trunc('day', (e.starts_at at time zone 'Asia/Dubai'))
      - make_interval(days => case e.type
                                when 'match' then 5
                                when 'training' then 1
                              end)
    ) at time zone 'Asia/Dubai'
  end
  from public.events e
  where e.id = p_event_id
$$;
-- create or replace preserves the existing grant from 20260827_availability_self_lock;
-- re-assert it so this migration is self-contained and a fresh replay is correct.
revoke all on function private.availability_self_editable(uuid) from public;
grant execute on function private.availability_self_editable(uuid) to authenticated;

-- ── Verify (a migration that changed nothing must fail) ────────────────────
do $$
declare has_col boolean; auth_exec boolean;
begin
  select exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='events'
       and column_name='availability_override'
  ) into has_col;
  if not has_col then
    raise exception 'VERIFY: events.availability_override was not added';
  end if;

  if to_regprocedure('private.availability_self_editable(uuid)') is null then
    raise exception 'VERIFY: helper missing after replace';
  end if;

  select has_function_privilege('authenticated','private.availability_self_editable(uuid)','execute')
    into auth_exec;
  if not auth_exec then
    raise exception 'VERIFY: authenticated lost EXECUTE on the helper';
  end if;
end $$;
```

- [ ] **Step 2: Sanity-parse (no DB):**

Run: `node -e "const s=require('fs').readFileSync('db/migrations/20260827_availability_override.sql','utf8'); if(!/add column availability_override/.test(s)||!/when e\.availability_override = 'open'/.test(s)) throw new Error('shape wrong'); if(/\bcommit\b/i.test(s)) throw new Error('unexpected commit'); console.log('shape ok, '+s.length+' bytes')"`
Expected: `shape ok, …`.

- [ ] **Step 3: docs:check, then commit** (no markdown/grant change; only branch-coverage failures for this branch's own commits are expected):

Run: `npm run docs:check`
Expected: every check passes except possibly "changelog SHAs and coverage" for this branch's own commits (expected; do NOT add SHAs).

```bash
git add db/migrations/20260827_availability_override.sql
git commit -m "feat(db): per-event availability override column + helper (migration)

Not yet applied. Adds events.availability_override; helper consults it before
the calendar rule.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Extend the RLS rot-anchor for the override

**Files:**
- Modify: `db/tests/rls-availability-equivalence.sql`

The harness installs the new policy set in its rolled-back transaction. It
already installs the lock helper and drives `pg_temp.configure`. Extend both to
carry the override, prove `open` unlocks a locked-window match and `locked`
freezes an otherwise-open one, and keep the inversion self-test.

**Prerequisite:** `SUPABASE_DB_URL` in `.env`, `npm install --include=dev`.

- [ ] **Step 1: Update the harness's installed helper** so it matches the new
  migration (the install block's `create or replace function
  private.availability_self_editable`). Add the two override arms at the top of
  its `case`, identical to the migration:

```sql
    when e.availability_override = 'open'   then true
    when e.availability_override = 'locked' then false
```
  (Insert them as the first two `when`s, before the `starts_at is null` arm.)

  ⚠️ The harness runs against production, which after Task 5 is applied will have
  the `availability_override` column — but BEFORE it is applied the column does
  not exist, so referencing `e.availability_override` would error. Guard the
  harness so it works either way: at the top of the transaction (after `begin;`,
  before the fixtures), add the column if missing so the rolled-back tx always
  has it:

```sql
-- Ensure the override column exists inside this rolled-back tx, so the harness
-- proves the new logic whether or not production has the migration yet.
alter table public.events add column if not exists availability_override text
  not null default 'auto' check (availability_override in ('auto','open','locked'));
```

- [ ] **Step 2: Extend `pg_temp.configure`** (currently `(_type, _in)`) to take an
  override, defaulting to 'auto':

```sql
create function pg_temp.configure(_type text, _in interval, _override text default 'auto') returns void
language plpgsql as $fn$
begin
  update public.events e
     set type = _type, starts_at = now() + _in, ends_at = null, availability_override = _override
    from fx where e.id = fx.event_id;
end $fn$;
```

- [ ] **Step 3: Add override probes + assertions** after the existing matrix
  probes (before the existing main assertion `do $$` block), then extend the
  assertion. Add:

```sql
-- OVERRIDE OPEN: a match 2 days out (auto-LOCKED) but override='open' → editable.
select pg_temp.configure('match', interval '2 days', 'open');
select pg_temp.probe('ovopen/3_parent_active', '0a000000-0000-4000-8000-000000000003');

-- OVERRIDE LOCKED: a match 8 days out (auto-OPEN) but override='locked' → frozen.
select pg_temp.configure('match', interval '8 days', 'locked');
select pg_temp.probe('ovlocked/3_parent_active', '0a000000-0000-4000-8000-000000000003');

-- OVERRIDE LOCKED on a social (never auto-locks) → frozen.
select pg_temp.configure('social', interval '2 hours', 'locked');
select pg_temp.probe('ovlocked_social/3_parent_active', '0a000000-0000-4000-8000-000000000003');
```

  And in the main assertion `do $$ … end $$;` block, add:

```sql
  -- override 'open' unlocks a parent inside the auto window
  select * into r from _m where caller = 'ovopen/3_parent_active';
  if not (r.ins = 'ALLOWED' and r.upd = 'ALLOWED' and r.del = 'ALLOWED') then
    raise exception 'OVERRIDE: open should unlock an in-window match — got ins=% upd=% del=%', r.ins, r.upd, r.del;
  end if;

  -- override 'locked' freezes an otherwise-open match
  select * into r from _m where caller = 'ovlocked/3_parent_active';
  if not (r.upd = 'NO ROWS' and r.del = 'NO ROWS' and r.ins <> 'ALLOWED') then
    raise exception 'OVERRIDE: locked should freeze an open-window match — got ins=% upd=% del=%', r.ins, r.upd, r.del;
  end if;

  -- override 'locked' freezes a social too
  select * into r from _m where caller = 'ovlocked_social/3_parent_active';
  if not (r.upd = 'NO ROWS' and r.del = 'NO ROWS') then
    raise exception 'OVERRIDE: locked should freeze a social — got upd=% del=%', r.upd, r.del;
  end if;
```

- [ ] **Step 4: Update the header** — add a dated line noting the override arms
  and that `configure` now takes an override.

- [ ] **Step 5: Run and watch pass**

Run: `npm run db:check -- availability`
Expected: `ok  rls-availability-equivalence.sql`, the `_m` matrix, the notices, `All harnesses passed.`

- [ ] **Step 6: Prove it can fail** — temporarily change the installed helper's
  first arm to `when e.availability_override = 'open' then false`, run
  `npm run db:check -- availability`, confirm the `OVERRIDE: open …` assertion
  FAILS, then REVERT and re-run green. Do NOT commit the broken version.

- [ ] **Step 7: Commit**

```bash
git add db/tests/rls-availability-equivalence.sql
git commit -m "test(db): extend availability RLS anchor for the per-event override

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Documentation

**Files:**
- Modify: `claude/decisions/2026-08-27-availability-self-edit-lock.md`
- Modify: `claude/changelog.md`

- [ ] **Step 1: Update the decision record.** Its Rejected section lists "a stored
  per-event `locks_at` column (YAGNI until per-event overrides are actually asked
  for)". Replace that bullet with a note that per-event overrides were asked for
  27 Aug 2026 and shipped as a tri-state `availability_override` (auto/open/locked),
  pointing to `claude/plans/2026-08-27-availability-lock-override.md` and
  `db/migrations/20260827_availability_override.sql`. Keep the reasoning that a
  free-form `locks_at` was still rejected in favour of three states.

- [ ] **Step 2: Add a changelog entry** at the top of `claude/changelog.md`,
  **without a SHA**, matching the file's format:

```markdown
- Availability: coaches/managers can override the self-edit lock per event —
  Auto (the calendar rule), Open (parents can RSVP right up to the event), or
  Locked (closed to parents now) — from both the event form and the Availability
  sheet, enforced in RLS. Staff are never locked.
```

- [ ] **Step 3: docs:check, then commit**

Run: `npm run docs:check`
Expected: passes (decision file paths resolve; only branch-coverage failures for this branch's own commits, which are expected).

```bash
git add claude/decisions/2026-08-27-availability-self-edit-lock.md claude/changelog.md
git commit -m "docs: record the per-event availability override

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Rollout (NOT automated — Jay's explicit yes)

1. `npm test` green; `npm run db:check -- availability` green (Task 6).
2. Show Jay the full diff + migration SQL; explicit yes.
3. Apply `db/migrations/20260827_availability_override.sql` to production
   (Supabase SQL editor or `apply_migration`). ⚠️ Order: deploy the code FIRST
   (an old client sending no `availability_override` writes nothing — the column
   defaults to 'auto', so old writes are safe), then apply the migration, OR
   apply the migration first (safe: the column defaults 'auto', old clients keep
   working). Either order is safe here because the default is the current
   behaviour — unlike the first lock, there is no error-banner window.
4. Merge → deploy (15 credits); verify the deploy id moves.
5. Verify live: as a coach set an in-window match to Open (a parent can now RSVP)
   and a distant match to Locked (a parent is frozen); confirm the event form and
   the sheet agree; confirm staff are never blocked.

## Self-review notes

- **Spec coverage:** column + default (Task 5), helper override branch (Tasks 1,5),
  client mirror (Task 1), two controls (Tasks 3,4), data fn (Task 2), RLS anchor
  (Task 6), docs (Task 7), no-grant correction (Global Constraints + Task 5). All mapped.
- **Type consistency:** `availability_override` (DB/payload), `availabilityOverride`
  (form values), `setAvailabilityOverride(eventId, value)`, override values
  `auto|open|locked` used identically everywhere.
- **Ordering safety:** the `'auto'` default means old and new clients coexist with
  no confusing state, so migration/deploy order is not load-bearing (unlike the
  first lock).
