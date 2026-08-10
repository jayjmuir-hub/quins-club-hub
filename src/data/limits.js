// Row caps for the unbounded list reads, and the loud failure that replaces a
// quietly-short answer.
//
// WHY THIS EXISTS. `claude/state-of-play.md` has carried this for days:
//
//     No query in `src/data/` is paginated, `src/screens/Schedule.jsx` loads
//     every event in scope and filters in memory, and realtime triggers a full
//     refetch on any change in scope. All three were right at six players and
//     stop being right somewhere between 100 and 700. They will show as a slow
//     screen long before anything errors.
//
// ⚠️ THE LAST SENTENCE IS THE PART THAT IS WRONG, AND IT IS WRONG IN THE
// DANGEROUS DIRECTION. A slow screen is a nuisance you can see. What actually
// waits at the end of an unbounded `select('*')` is a SHORT ANSWER THAT LOOKS
// COMPLETE: PostgREST applies a `db-max-rows` ceiling and returns the first N
// rows with HTTP 200 and no indication that anything was left out. A roster
// missing a child, a schedule missing a fixture — and nothing anywhere says so.
//
// That is the same failure this codebase has already been bitten by twice, and
// both times the fix was to make the silence impossible rather than to make the
// query faster:
//   - a zero-row 200 when the bearer had silently downgraded to the anon key
//     (`src/lib/supabase.js`, the session guard);
//   - an empty search result read as proof of absence, twice, per CLAUDE.md
//     rule 6.
//
// So this file does NOT make anything faster. It makes the truncation LOUD.
//
// ⚠️ WHAT IS DELIBERATELY NOT DONE HERE. Pagination, and a date window on
// events. Both change what a person sees on screen — "how far back should the
// schedule go" is Jay's call, not a data-layer detail — and at six players
// neither is needed yet. The 10 Aug lesson was that a schedule restructure was
// designed, agreed and then dropped because real data made the existing screen
// read fine. This is the part that is right whatever those decisions turn out
// to be: nothing may return a short list and call it the whole list.

/**
 * The cap, chosen against PostgREST's ceiling rather than against taste.
 *
 * ⚠️ IT MUST STAY BELOW `db-max-rows`, AND THAT IS THE WHOLE REASON FOR THE
 * NUMBER. The detection below works by asking for one row MORE than the cap and
 * seeing whether it arrives. If the cap were at or above PostgREST's own
 * ceiling, PostgREST would trim the response first, the extra row would never
 * come back, and the check would report "complete" on a truncated list — a
 * detector that reads as green precisely when it should fire.
 *
 * Supabase's documented default `db-max-rows` is 1000, so 900 leaves the
 * request (901) comfortably underneath it.
 *
 * ⚠️ `db-max-rows` HAS NOT BEEN MEASURED ON THIS PROJECT — it is a PostgREST
 * setting and does not appear in `pg_roles`, so no query in this repo can read
 * it. It is in the dashboard under Settings → API → Max rows. If it has been
 * lowered below 901, raise it or lower this; if it has been raised, this is
 * simply more conservative than it needs to be. Measured 10 Aug: `authenticated`
 * carries `statement_timeout=8s`, so the other end of this is an 8-second
 * failure, not an unbounded wait.
 */
export const MAX_ROWS = 900

/**
 * Applies the cap, asking for one more row than we are willing to accept.
 *
 * The extra row is never returned to a caller — it exists only so that
 * `unwrapCapped` can tell "exactly at the cap" from "more than the cap", which
 * a plain `.limit(MAX_ROWS)` cannot.
 */
export function withCap(query, limit = MAX_ROWS) {
  return query.limit(limit + 1)
}

/**
 * Throws when the extra row arrived, meaning there were more rows than we asked
 * for and this list is NOT the whole answer.
 *
 * @param {Array} rows   what came back, including the sentinel row
 * @param {string} what  what was being listed, for the message
 * @param {string} hint  the specific thing to do about it
 */
export function unwrapCapped(rows, what, hint, limit = MAX_ROWS) {
  const list = rows ?? []
  if (list.length <= limit) return list

  // ⚠️ A THROW, NOT A CONSOLE WARNING AND NOT A SILENT SLICE. Every screen that
  // calls these helpers already has an error state that offers "Try again", so
  // this surfaces as a visible failure with a message somebody can act on.
  // Returning the first 900 with a warning would put a truncated roster on
  // screen looking exactly like a complete one, which is the entire thing being
  // guarded against.
  throw new Error(
    `Too many ${what} to show at once (more than ${limit}). ` +
      `${hint} This is a deliberate limit, not a database error: ` +
      `beyond it the server silently returns a partial list, and a partial ` +
      `roster or schedule that looks complete is worse than this message.`,
  )
}
