// @vitest-environment node
// Nothing in this file touches the DOM. See vite.config.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Club Diary phase 2, task 6 — the calendar feed's all-day branch.
// claude/plans/2026-09-01-club-diary-phase-2-implementation.md.
//
// ⚠️ THIS IS A ROT DETECTOR, NOT A BEHAVIOUR TEST, exactly like
// tests/calendar-league-team.test.js and for the same reason: the feed is a
// Deno function with Deno.serve() at module scope, so importing it would start
// a server and the suite cannot execute it. What this file can do is fail when
// the source stops saying what the deployed function must say. The REAL
// verification is fetching the deployed /calendar.ics with a genuine all-day
// row and reading the bytes — including content-type, because the SPA
// catch-all answers any path with HTML and a 200 alone proves nothing.
//
// ⚠️ EVERY ASSERTION HERE CARRIES A CONTROL, because two fault injections
// against task 4 PASSED on first writing — the fixtures could not distinguish
// the fault from the fix. A source matcher that can silently match nothing is
// the same trap.

const SOURCE = readFileSync(
  resolve(import.meta.dirname, '../supabase/functions/calendar/index.ts'),
  'utf8',
)

describe('the calendar feed source (rot detector)', () => {
  it('CONTROL: the matcher can find things known to be present', () => {
    // If these fail, the file moved or the read is broken, and every negative
    // below is meaningless.
    expect(SOURCE).toContain('VALUE=DATE')
    expect(SOURCE).toContain('Kick-off time to be confirmed')
    expect(SOURCE).toContain('icsDatePlusOneDay')
  })

  it('separates all_day from time_tbd', () => {
    expect(SOURCE).toMatch(/const timeTbd = event\.time_tbd === true/)
    expect(SOURCE).toMatch(/const isAllDayEvent = event\.all_day === true/)
  })

  it('⚠️ the "to be confirmed" line fires on timeTbd alone', () => {
    // Printing it for a genuinely all-day event claims the time is undecided
    // when there is no time — the inverse of the mistake the line prevents.
    expect(SOURCE).toMatch(/if \(timeTbd\) description\.push\('Kick-off time to be confirmed'\)/)
    // And the old guard must be GONE, or both paths exist:
    expect(SOURCE).not.toMatch(/if \(allDay\) description\.push\('Kick-off/)
  })

  it('⚠️ a multi-day span ends the day AFTER ends_at — DTEND is exclusive', () => {
    // The boundary longhand: 17–18 Sep must produce DTEND:20260919. Dropping
    // the +1 shows one day; applying it to the wrong operand shows three. The
    // source must feed ends_at's club date THROUGH icsDatePlusOneDay.
    expect(SOURCE).toMatch(
      /icsDatePlusOneDay\(icsDate\(new Date\(event\.ends_at\)\)\)/,
    )
    // And only for a genuinely all-day event — a time_tbd fixture cannot carry
    // an ends_at (events_no_end_when_time_tbd) and keeps start-plus-one.
    expect(SOURCE).toMatch(/isAllDayEvent && event\.ends_at/)
  })

  it('the Event type declares both new fields as optional', () => {
    // Optional for the deploy-order reason: this function may run against a
    // database whose token function does not yet return the columns.
    expect(SOURCE).toMatch(/all_day\?: boolean \| null/)
    expect(SOURCE).toMatch(/info_only\?: boolean \| null/)
  })

  it('endFor and the duration guesses are untouched', () => {
    // The all-day branch must never reach them; their absence from it is
    // asserted by their continued presence in the timed branch.
    expect(SOURCE).toContain('DURATION_MINUTES')
    expect(SOURCE).toMatch(/function endFor\(/)
  })
})
