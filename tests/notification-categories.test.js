import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { NOTIFICATION_CATEGORIES } from '../src/data/notificationPreferences'

// The one boundary in the notification feature that fails SILENTLY.
//
// ⚠️ WHAT THIS EXISTS TO CATCH, IN THE USER'S WORDS: the switch moves, and the
// notifications keep arriving. `notification_opt_outs.category` carries a CHECK
// constraint; a key the constraint rejects means the INSERT is refused, and the
// only place that refusal is visible is a network tab nobody has open. There is
// no error on screen, no missing row anybody looks for, and the person has
// explicitly asked not to be interrupted and is still being interrupted.
//
// ⚠️ SO THIS IS NOT A "keep two lists in sync" TIDINESS TEST. Both halves are
// already commented with a warning to change the other. Warnings are what we
// had; this is the thing that fails.
//
// ══ WHY IT SEARCHES EVERY MIGRATION RATHER THAN READING "THE LATEST" ═══════
//
// ⚠️ db/migrations/ IS NOT A REPLAYABLE, ORDERED SET, and assuming it was would
// make this test wrong rather than merely awkward. claude/schema-history.md is
// explicit: it is a PARTIAL historical record (Supabase holds more applied
// migrations than this folder holds files), applied in chronological order by
// hand. Filenames do not carry that order — within 19 Aug 2026 alone,
// `20260819_fixture_push.sql` sorts BEFORE `20260819_notice_push.sql` while
// notice_push is the file that CREATED the table fixture_push then alters.
//
// So "read the newest file" has no correct implementation here. What is true
// regardless of order is that the constraint is re-stated in full every time it
// changes — so the CURRENT list must appear, complete and exact, in exactly the
// file that last changed it. This asserts that some migration states precisely
// the set the app offers, which is order-independent and still fails in both
// directions:
//
//   * a category added to the app but no migration -> no list matches -> red
//   * a category added to a migration but not the app -> no list matches -> red

const MIGRATIONS = join(process.cwd(), 'db', 'migrations')

/**
 * Every `check (category in ('a','b',...))` written against
 * notification_opt_outs, as a set of keys, one entry per migration that states
 * it. Whitespace and newlines vary between files, so the match is deliberately
 * loose about layout and strict about the constraint's name.
 */
function constraintListsInMigrations() {
  const found = []
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    // Anchored on the constraint NAME so an unrelated `category in (...)`
    // elsewhere in the file cannot be mistaken for this one.
    for (const match of sql.matchAll(
      /notification_opt_outs_category_check[\s\S]{0,120}?check\s*\(\s*category\s+in\s*\(([^)]*)\)/gi,
    )) {
      const keys = [...match[1].matchAll(/'([a-z_]+)'/gi)].map((m) => m[1])
      if (keys.length > 0) found.push({ file, keys: keys.sort() })
    }
  }
  return found
}

describe('notification categories match the database constraint', () => {
  // ⚠️ THE CONTROL. A regex that matched nothing would make every assertion
  // below pass by vacuous truth — `some()` over an empty list is false, but a
  // reader would blame the app rather than the search. Fail loudly instead.
  it('finds the constraint in the migrations at all', () => {
    const lists = constraintListsInMigrations()
    expect(
      lists.length,
      'no notification_opt_outs_category_check found in db/migrations — this test is searching for nothing',
    ).toBeGreaterThan(0)
  })

  it('has a migration stating exactly the categories the app offers', () => {
    const appKeys = NOTIFICATION_CATEGORIES.map((c) => c.key).sort()
    const lists = constraintListsInMigrations()

    const match = lists.find(
      (l) => l.keys.length === appKeys.length && l.keys.every((k, i) => k === appKeys[i]),
    )

    expect(
      match,
      'No migration states exactly the categories in NOTIFICATION_CATEGORIES.\n' +
        `  the app offers:            ${JSON.stringify(appKeys)}\n` +
        `  the migrations state:      ${JSON.stringify(lists.map((l) => `${l.file}: ${l.keys.join(',')}`), null, 2)}\n` +
        'Adding a category means adding it to the CHECK constraint in the same commit.\n' +
        'Without that the opt-out INSERT is refused, the switch still moves, and the\n' +
        'notifications keep arriving — see db/migrations/20260819_approval_push.sql.',
    ).toBeDefined()
  })

  // Cheap, and it pins the shape the UI depends on.
  it('gives every category a key, a label and a hint', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(category.key, 'a category with no key').toBeTruthy()
      expect(category.label, `${category.key} has no label`).toBeTruthy()
      expect(category.hint, `${category.key} has no hint`).toBeTruthy()
    }
  })

  it('has no duplicate keys', () => {
    const keys = NOTIFICATION_CATEGORIES.map((c) => c.key)
    expect(new Set(keys).size, `duplicate category key in ${JSON.stringify(keys)}`).toBe(keys.length)
  })
})
