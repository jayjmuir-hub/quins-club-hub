# Duplicate-at-approval flag — implementation plan

**STATUS: SHIPPED 31 Aug 2026** — both tasks, same day it was written. Design:
`claude/specs/2026-08-31-duplicate-at-approval-design.md`. The code is now the
authority; what follows is what was intended, and two places it was wrong.

⚠️ **TWO INSTRUCTIONS IN THIS PLAN WERE WRONG, AND BOTH ARE LEFT STANDING
BELOW SO THE CORRECTION HAS SOMETHING TO POINT AT.**

1. **Task 2 Step 5 says to match against the `players` state, and not to add it
   to the effect's dependency array.** Both halves are wrong. That state is
   loaded LAZILY, only when an access builder opens — it was `[]` when the
   effect ran, so the warning never appeared. What shipped reads the PENDING
   SQUADS' rosters inside the effect instead, which is narrower than either the
   plan's version or the club-wide read, because a duplicate is only ever
   sought within one squad.
2. **The twins fixture in Task 2 Step 1 was not a test.** Its two first names
   were five edits apart, so it passed with the matcher's ceiling widened to
   four — it would have passed against the exact bug it exists to catch. The
   shipped version is four apart, mirroring the real pair. **Keep a negative
   fixture just outside the threshold, never far outside it.**

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`
> to implement this task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** warn the person approving a registration that the child in front of
them may already be on the roster under a different spelling.

**Architecture:** one pure matcher module, called from the effect on the
Accounts screen that already builds the queue's other annotations. No
migration, no new RPC, no new network read beyond widening one existing call.

**Tech stack:** React, Vite, Vitest. Nothing new is installed.

## Global constraints

- ⚠️ **Invented names only** — in code, comments, fixtures and commit messages.
  This repo is public and its members are mostly children.
- ⚠️ **The Approve button stays live.** No task may disable, gate or delay it.
- ⚠️ **No new unscoped reads.** The queue's existing effect reads
  `player_private` for the pending rows and nothing else, deliberately. Task 2
  widens it by the matched candidates ONLY — see the note below.
- Match within one squad, never across the club.
- Run `npm run test:related -- <file>` while working; `npm test` before pushing.
- Never `git add -A`. Stage the exact paths each step names.

---

## ⚠️ One thing the design did not account for, decided here

The spec says an equal date of birth strengthens the wording. The screen cannot
see the existing player's birthday: `listPlayerPrivate(pendingPlayerIds)` reads
the PENDING rows only, and the comment above it says why in terms this plan
will not overrule — widening it pulls the club's children's birthdays into an
admin's browser to answer a question about a handful of cards.

**So the flag is raised on NAMES ALONE, and the birthday is fetched afterwards
for the matched candidates only.** Name-matching is free — the whole roster is
already in memory from `listPlayers()` — and a candidate the screen is about to
name on-screen is a row that approver can already read. The widening is one id
per flag, which is the principle the existing comment defends rather than an
exception to it.

---

### Task 1: the matcher

**Files:**
- Create: `src/lib/duplicateMatch.js`
- Test: `tests/duplicateMatch.test.js`

**Interfaces:**
- Consumes: nothing. Pure module, no imports.
- Produces: `findPossibleDuplicates({ player, roster })` → array of
  `{ id, full_name, reason }`, where `reason` is `'same-name'` or
  `'similar-name'`. Task 2 relies on these exact names.

- [ ] **Step 1: Write the failing test**

Create `tests/duplicateMatch.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { findPossibleDuplicates } from '../src/lib/duplicateMatch.js'

// ⚠️ EVERY NAME HERE IS INVENTED. The spellings reproduce the shape of the
// real 31 Aug case; the people do not exist. CLAUDE.md rule 9.
const U16 = 'team-u16'
const U12 = 'team-u12'

const roster = [
  { id: 'p1', team_id: U16, full_name: 'Hamza Tarek Nabil Alkhatib' },
  { id: 'p2', team_id: U16, full_name: 'Rowan Fairbairn' },
  { id: 'p3', team_id: U16, full_name: 'Reuben Fairbairn' },
  { id: 'p4', team_id: U12, full_name: 'Tom Smith' },
]

describe('findPossibleDuplicates', () => {
  it('flags a transliteration one letter apart — the case that got through', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Hamsa Alkhatib' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
    expect(found[0].reason).toBe('similar-name')
  })

  // ⚠️ THE FIXTURE THE WHOLE RULE TURNS ON. These two are twins on the live
  // roster: same surname, same birthday, and a matcher that keyed on the
  // birthday would nag about them forever. They must stay silent.
  it('does not flag twins who share a surname', () => {
    const found = findPossibleDuplicates({
      player: { id: 'p2', team_id: U16, full_name: 'Rowan Fairbairn' },
      roster,
    })
    expect(found).toEqual([])
  })

  it('does not flag the same name in a different squad', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Tom Smith' },
      roster,
    })
    expect(found).toEqual([])
  })

  it('flags an identical name in the same squad', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'hamza  ALKHATIB' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
    expect(found[0].reason).toBe('same-name')
  })

  it('flags a shortened first name', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Ham Alkhatib' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
  })

  it('ignores accents rather than mangling them', () => {
    const found = findPossibleDuplicates({
      player: { id: 'new', team_id: U16, full_name: 'Hámza Alkhâtib' },
      roster,
    })
    expect(found.map((row) => row.id)).toEqual(['p1'])
  })

  it('never matches a row against itself', () => {
    const found = findPossibleDuplicates({
      player: { id: 'p1', team_id: U16, full_name: 'Hamza Tarek Nabil Alkhatib' },
      roster,
    })
    expect(found).toEqual([])
  })

  it('returns nothing, and does not throw, for a nameless or punctuation-only row', () => {
    for (const full_name of [null, '', '   ', '—', '.']) {
      expect(
        findPossibleDuplicates({ player: { id: 'new', team_id: U16, full_name }, roster }),
      ).toEqual([])
    }
  })

  it('survives a roster row with no name', () => {
    expect(
      findPossibleDuplicates({
        player: { id: 'new', team_id: U16, full_name: 'Hamza Alkhatib' },
        roster: [{ id: 'x', team_id: U16, full_name: null }],
      }),
    ).toEqual([])
  })

  it('takes an absent roster as an empty one', () => {
    expect(
      findPossibleDuplicates({ player: { id: 'n', team_id: U16, full_name: 'A B' } }),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:related -- tests/duplicateMatch.test.js
```

Expected: FAIL — `Failed to resolve import "../src/lib/duplicateMatch.js"`.

- [ ] **Step 3: Write the module**

Create `src/lib/duplicateMatch.js`:

```js
// Is this pending registration a child the roster already holds?
//
// The second net, and the looser one. The FIRST is
// db/migrations/20260814_registration_duplicate_guards.sql, which refuses a
// registration whose first-and-last name key matches a player already in the
// squad. This one runs later, in front of somebody who can see the roster.
//
// ══ ⚠️ WHY A SECOND NET EXISTS AT ALL ═════════════════════════════════════
//
// 31 Aug 2026. A child registered himself weeks after a parent had registered
// him, and a second roster row appeared. The database guard could not have
// stopped it: it compares the tokens EXACTLY, and the two spellings were
// different transliterations of one name, a single letter apart. Exact
// equality sees through middle names and hyphens. It cannot see through
// spelling, and spelling is the variance this club actually produces.
//
// The guard is not loosened, because the person it talks to cannot see the
// roster — a pending membership fails `player read`. So it may not name what
// it matched, and a false positive there BLOCKS A REAL FAMILY FROM JOINING.
// The approver has neither problem. Full reasoning, including the argument
// against: claude/specs/2026-08-31-duplicate-at-approval-design.md.
//
// Pure, no imports, no React, no supabase — the same reasoning as
// src/lib/completeness.js. It must be testable with plain objects.

/** Fold to lowercase, drop accents, and split into word tokens. */
function tokens(name) {
  return (name ?? '')
    .normalize('NFD')
    // ⚠️ COMBINING MARKS ONLY (U+0300–U+036F). This is what makes 'Hámza'
    // compare equal to 'Hamza'. It deliberately does NOT touch Arabic or any
    // other script: the migration measured that a unicode-aware split keeps
    // non-Latin names intact, and mangling them here would be a step back.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Unicode letters and numbers, so a non-Latin name survives as one token.
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/**
 * First and last token, which is the shape the database guard also uses.
 * `null` when there is nothing to compare — a nameless row, or one that is
 * punctuation alone. A null key matches nothing, so it fails OPEN, which is
 * the direction the migration chose and this keeps.
 */
function nameKey(name) {
  const parts = tokens(name)
  if (parts.length === 0) return null
  return { first: parts[0], last: parts[parts.length - 1] }
}

/** Levenshtein distance, bailing out once it cannot matter. */
function distance(a, b, limit) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    let best = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost)
      if (row[j] < best) best = row[j]
    }
    if (best > limit) return limit + 1
    prev = row
  }
  return prev[b.length]
}

// How far apart two spellings of one first name are allowed to be.
// ⚠️ 2 IS A MEASURED CEILING, NOT A ROUND NUMBER. The pair that got through is
// 1 apart. The twins already on the roster are 4 apart. Raising this to 4 to
// "catch more" makes the twins a permanent false positive on a queue somebody
// has to read every week, which is how a warning gets ignored.
const MAX_FIRST_NAME_EDITS = 2

// A shortened first name only counts from three characters. Two would make
// every 'Jo' a possible 'Joseph', 'Joel' and 'Jonah' at once.
const MIN_PREFIX = 3

function firstNamesLookAlike(a, b) {
  if (a === b) return 'same-name'
  const shorter = a.length <= b.length ? a : b
  const longer = a.length <= b.length ? b : a
  if (shorter.length >= MIN_PREFIX && longer.startsWith(shorter)) return 'similar-name'
  if (distance(a, b, MAX_FIRST_NAME_EDITS) <= MAX_FIRST_NAME_EDITS) return 'similar-name'
  return null
}

/**
 * Roster rows that may be the same child as `player`.
 *
 * ⚠️ SCOPED TO THE SQUAD, NEVER THE CLUB. Brothers share a surname, and two
 * boys called Tom Smith in U12 and U16 are two boys — the migration's rule,
 * kept here deliberately.
 *
 * ⚠️ THE DATE OF BIRTH IS NOT AN INPUT. It corroborates the wording at the
 * call site and never raises a flag: the roster holds twins who share a
 * surname AND a birthday, and a matcher keyed on that would report them
 * forever.
 *
 * @param {{ id: string, team_id: string, full_name: string|null }} player
 * @param {Array<{ id: string, team_id: string, full_name: string|null }>} roster
 * @returns {Array<{ id: string, full_name: string, reason: 'same-name'|'similar-name' }>}
 */
export function findPossibleDuplicates({ player, roster }) {
  const key = nameKey(player?.full_name)
  if (!key || !player?.team_id) return []

  const found = []
  for (const row of roster ?? []) {
    if (!row || row.id === player.id) continue
    if (row.team_id !== player.team_id) continue
    const other = nameKey(row.full_name)
    if (!other || other.last !== key.last) continue
    const reason = firstNamesLookAlike(key.first, other.first)
    if (reason) found.push({ id: row.id, full_name: row.full_name, reason })
  }
  return found
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npm run test:related -- tests/duplicateMatch.test.js
```

Expected: PASS, every assertion.

- [ ] **Step 5: ⚠️ Prove the tests can fail — inject the fault, do not skip this**

`CLAUDE.md` rule 6: a check that has never failed is not a check.
**Commit nothing yet; `git checkout --` reverts to the last COMMIT.**

1. Change `MAX_FIRST_NAME_EDITS` from `2` to `4` and re-run.
   Expected: **the twins test FAILS**, and only that one. If it still passes,
   the matcher is not keying on what this plan thinks it is — stop and re-read.
2. Put it back to `2`; re-run; all green.
3. Change `row.team_id !== player.team_id` to `false` and re-run.
   Expected: **the different-squad test FAILS**. Put it back; re-run; green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/duplicateMatch.js tests/duplicateMatch.test.js
```

```bash
git commit -m "feat(accounts): a matcher for near-duplicate roster names"
```

---

### Task 2: show it on the pending card

**Files:**
- Modify: `src/screens/Accounts.jsx` — import beside the other `../lib/`
  imports; new state beside `gapsByPlayer`; the effect that builds it; the two
  `<PendingApprovals … />` call sites; the component's props and its render,
  immediately after the `missing-details` span.
- Test: `tests/accounts-duplicate-flag.test.jsx`

**Interfaces:**
- Consumes: `findPossibleDuplicates({ player, roster })` from Task 1, returning
  `[{ id, full_name, reason }]`.
- Produces: a `duplicatesByPlayer` Map — player id → `[{ full_name, sameDob }]`
  — passed to `PendingApprovals` as the prop `duplicatesByPlayer`.

- [ ] **Step 1: Write the failing test**

Create `tests/accounts-duplicate-flag.test.jsx`. Open `tests/accounts.test.jsx`
first and copy its mocking preamble verbatim — the same `vi.mock` calls for
`../src/data/*` and the same render helper. Do not invent a new harness. Then:

```jsx
// ⚠️ INVENTED NAMES. CLAUDE.md rule 9.
it('warns that a pending registration may already be on the roster', async () => {
  // The roster already holds the child, spelled as the parent typed it.
  // The pending row is the same child, spelled as he types it himself.
  renderAccounts({
    players: [
      { id: 'p1', team_id: 't1', full_name: 'Hamza Tarek Nabil Alkhatib' },
      { id: 'p2', team_id: 't1', full_name: 'Hamsa Alkhatib' },
    ],
    pending: [{ id: 'm1', player_id: 'p2', team_id: 't1', status: 'pending' }],
  })

  const warning = await screen.findByTestId('possible-duplicate')
  expect(warning).toHaveTextContent(/Hamza Tarek Nabil Alkhatib/)

  // ⚠️ THE HALF THAT MATTERS AS MUCH AS THE WARNING: approving is still one
  // click. A fuzzy match that stalls a real family is worse than the duplicate.
  expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled()
})

it('says nothing about twins', async () => {
  renderAccounts({
    players: [
      { id: 'p1', team_id: 't1', full_name: 'Rowan Fairbairn' },
      { id: 'p2', team_id: 't1', full_name: 'Reuben Fairbairn' },
    ],
    pending: [{ id: 'm1', player_id: 'p2', team_id: 't1', status: 'pending' }],
  })

  await screen.findByTestId('pending-membership')
  expect(screen.queryByTestId('possible-duplicate')).toBeNull()
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm run test:related -- tests/accounts-duplicate-flag.test.jsx
```

Expected: FAIL — `Unable to find an element by: [data-testid="possible-duplicate"]`.

- [ ] **Step 3: Import the matcher**

In `src/screens/Accounts.jsx`, beside the other `../lib/` imports:

```js
import { findPossibleDuplicates } from '../lib/duplicateMatch.js'
```

- [ ] **Step 4: Add the state, next to `gapsByPlayer`**

```js
// player id -> roster rows that may be the same child, from the shared rule in
// src/lib/duplicateMatch.js. `sameDob` corroborates the wording only — see the
// module header for why a birthday must never raise the flag itself.
const [duplicatesByPlayer, setDuplicatesByPlayer] = useState(() => new Map())
```

Add `setDuplicatesByPlayer(new Map())` to BOTH early-outs in the effect below —
the `pendingPlayerIds.length === 0` branch and the `.catch`. A stale warning
about a row that has gone is worse than no warning.

- [ ] **Step 5: Build the map inside the existing effect**

Names first, from `players`, which `listPlayers()` has already loaded for the
whole club. Then widen the ONE existing read by the matched ids so the wording
can mention a birthday. Keep everything already inside `.then` exactly as it
is, and add this after the `setGapsByPlayer(...)` call:

```js
// ⚠️ NAMES FIRST, BIRTHDAYS SECOND, AND THAT ORDER IS THE PRIVACY ARGUMENT.
// The comment above this effect refuses to widen its reads, and this keeps
// that promise: matching costs nothing (the roster is already in memory), so
// the only rows whose birthday is fetched are ones the screen is about to
// name on the card, in front of an approver who can already read them.
const matches = new Map()
for (const member of pendingMembers) {
  if (!member.player_id) continue
  const player = players.find((row) => row.id === member.player_id)
  if (!player) continue
  const found = findPossibleDuplicates({ player, roster: players })
  if (found.length > 0) matches.set(member.player_id, found)
}

const candidateIds = [...new Set([...matches.values()].flat().map((row) => row.id))]
const candidateDob = candidateIds.length
  ? new Map(
      (await listPlayerPrivate(candidateIds)).map((row) => [
        row.player_id,
        row.date_of_birth ?? null,
      ]),
    )
  : new Map()

setDuplicatesByPlayer(
  new Map(
    [...matches].map(([playerId, found]) => [
      playerId,
      found.map((row) => ({
        full_name: row.full_name,
        sameDob:
          Boolean(dobByPlayer.get(playerId)) &&
          dobByPlayer.get(playerId) === candidateDob.get(row.id),
      })),
    ]),
  ),
)
```

⚠️ This uses `await`, so the `.then((...) => {` callback must become
`.then(async (...) => {`. Leave the trailing `.catch` where it is — it still
covers this, and a failed read must leave the queue standing.

⚠️ Do NOT add `players` to the dependency array. It is keyed on
`pendingPlayerIds` on purpose and the eslint-disable line above it says why.
The roster is read at effect time, which is when the queue is built.

- [ ] **Step 6: Thread the prop through both call sites**

At each `<PendingApprovals`, beside `gapsByPlayer={gapsByPlayer}`:

```jsx
duplicatesByPlayer={duplicatesByPlayer}
```

And in the component signature, beside `gapsByPlayer = new Map(),`:

```js
duplicatesByPlayer = new Map(),
```

- [ ] **Step 7: Render the line**

Beside `const gaps = ...`:

```js
const duplicates = (member.player_id ? duplicatesByPlayer.get(member.player_id) : null) ?? []
```

And immediately AFTER the `missing-details` span closes:

```jsx
{/* ⚠️ POSSIBLY THE SAME CHILD, SAID WHERE SOMEBODY CAN CHECK IT. The
    database guard refuses an exact name match at registration; it cannot
    see a different transliteration of one name, which is what reached the
    roster on 31 Aug. The rule is src/lib/duplicateMatch.js.

    ⚠️ IT NAMES THE ROW IT MATCHED, and only here. At registration that
    would be an enumeration oracle — see the migration's disclosure note —
    but this reader can already open the roster and read every name on it.

    ⚠️ IT DOES NOT BLOCK APPROVAL, exactly like the gaps line above. Most
    flags will be right, and the admin is usually approving a real person
    whose record needs merging afterwards; leaving a family waiting on a
    fuzzy string match would be the worse failure. */}
{duplicates.length > 0 && (
  <span
    data-testid="possible-duplicate"
    className="mt-1 block text-[12.5px] font-semibold text-ink"
  >
    Possible duplicate:{' '}
    {duplicates
      .map(
        (row) =>
          `${row.full_name} is already in this squad${row.sameDob ? ', with the same date of birth' : ''}`,
      )
      .join('; ')}
  </span>
)}
```

- [ ] **Step 8: Run the tests and watch them pass**

```bash
npm run test:related -- tests/accounts-duplicate-flag.test.jsx
```

Expected: PASS, both.

- [ ] **Step 9: ⚠️ Inject the fault — commit nothing first**

1. In `src/lib/duplicateMatch.js`, set `MAX_FIRST_NAME_EDITS` to `4` and re-run
   this file's tests. Expected: **the twins test FAILS** — which is what proves
   the screen test reads the real rule rather than a coincidence. Put it back.
2. Delete the `duplicatesByPlayer={duplicatesByPlayer}` prop from the first
   call site and re-run. Expected: **the warning test FAILS**. Put it back.

- [ ] **Step 10: Whole suite, then commit**

```bash
npm test
```

Expected: green. `Accounts.jsx` is covered by several existing files and this
change threads a new prop through both queues — a pass here is the point.

```bash
git add src/screens/Accounts.jsx tests/accounts-duplicate-flag.test.jsx
```

```bash
git commit -m "feat(accounts): warn the approver when a registration may already be on the roster"
```

- [ ] **Step 11: Update the documents in the same breath**

- `claude/changelog.md` — one entry. Do NOT cite your own branch's SHA; the
  next pull request cites the squash SHA. Catch up any outstanding one-behind
  entry while you are there.
- This file's STATUS line — change it to shipped, with the date.

```bash
git add claude/changelog.md claude/plans/2026-08-31-duplicate-at-approval-implementation.md
```

```bash
git commit -m "docs: duplicate-at-approval shipped"
```

```bash
node scripts/docs-check.mjs
```

⚠️ Run `docs:check` AFTER committing, not only after staging — the changelog's
one-behind allowance is measured against `HEAD`. It takes a few minutes on
Windows because it shells out once per changelog SHA. It is not hung.

---

## Verifying it live

This ships a change to a screen only admins and coaches see, on a queue that is
usually empty. **A green suite is not a working site** (`CLAUDE.md` rule 6), so
after the deploy:

1. Sign in as an admin on https://adhquins-clubhub.com and open Accounts.
2. If the queue is empty there is nothing to see, and that is the honest
   outcome — say so rather than claiming it verified. The next real
   registration is the test.
3. ⚠️ Do NOT create a fake registration on production to see the warning fire.
   It writes a child-shaped row onto a live roster, and removing it again is
   the exact tidy-up this feature exists to avoid.
