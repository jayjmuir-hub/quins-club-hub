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
 * ✅ **MEASURED 10 Aug 2026: `db-max-rows` IS 1000 on this project.** So a request
 * for 901 sits under it and the detector below can fire. Read off the dashboard,
 * because no query can reach it — it is a PostgREST setting and appears in no
 * catalogue including `pg_roles`. ⚠️ **THE SETTING HAS MOVED** and is no longer
 * under Settings → API: it is **Integrations → Data API → Settings → Max rows**.
 * If it is ever lowered below 901 this stops working SILENTLY — the sentinel row
 * would be trimmed before it arrived, and every truncated list would then report
 * itself as complete, which is the exact failure the cap exists to prevent.
 *
 * Also measured: `authenticated` carries `statement_timeout=8s`, so the other end
 * of this is an 8-second failure, not an unbounded wait.
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
/**
 * The ceiling on a PAGED read — the point at which we stop fetching and say so
 * rather than pulling an unbounded amount into a phone's memory.
 *
 * ⚠️ THIS IS NOT `MAX_ROWS` AND THE DIFFERENCE MATTERS. `MAX_ROWS` is a
 * PostgREST constraint: one request cannot exceed `db-max-rows`, so a single
 * query is capped at 900 and the 901st row is the tripwire. This is a PRODUCT
 * constraint: paging removes the per-request wall, so something else has to
 * decide when "a lot of fixtures" becomes "something is wrong". Nothing about
 * the database changes at 5,000; it is the number past which no human is
 * reading a schedule and the answer is a narrower filter.
 *
 * Sized against the measurement that motivated paging (10 Aug 2026): a squad
 * running 2.0–2.3 events per active week is ~75 a season, so fifteen squads
 * over the app's 18-month window is ~1,690. 5,000 is roughly three times the
 * whole club's realistic worst case — high enough that no legitimate read
 * meets it, low enough to be a real backstop.
 */
export const MAX_TOTAL_ROWS = 5000

/**
 * Reads every row matching a query, one page at a time.
 *
 * ⚠️ WHY PAGING EXISTS AT ALL, given `withCap` already refuses to truncate.
 * `withCap` makes a too-large answer LOUD, which was the right first move —
 * a short list that looks complete is the worst outcome. But loud is still
 * broken: an admin viewing all fifteen squads over the default 18-month window
 * is ~1,690 rows, so the cap turned their Schedule into an error screen with
 * no action that fixes it short of filtering to one squad. Paging removes the
 * per-request wall while keeping the guarantee: **this either returns
 * everything, or throws. It never returns some of it.**
 *
 * ⚠️ THE ORDER ARGUMENT IS NOT OPTIONAL AND IS THE EASIEST THING TO GET WRONG.
 * `.range()` is OFFSET/LIMIT. Postgres does not promise a stable row order
 * between two queries that do not fully specify one, so paging an
 * under-specified sort silently returns the same row on two pages and never
 * returns another — a schedule with one fixture twice and one missing, and no
 * error anywhere. Callers therefore pass the sort, and it MUST end in a unique
 * column: `starts_at` alone is not enough because two events can start at the
 * same instant, which is exactly what a Saturday morning of age-group matches
 * looks like.
 *
 * @param {() => object} buildQuery  returns a FRESH PostgREST query each call —
 *   a builder is single-use once awaited, so reusing one silently re-sends the
 *   first page's range
 * @param {Array<[string, {ascending?: boolean}]>} order  sort columns, last one unique
 */
export async function fetchAllPages(buildQuery, order, what, hint, { page = MAX_ROWS, max = MAX_TOTAL_ROWS } = {}) {
  const rows = []

  for (let offset = 0; ; offset += page) {
    let query = buildQuery()
    for (const [column, options] of order) query = query.order(column, options)

    const { data, error } = await query.range(offset, offset + page - 1)
    if (error) throw error

    const batch = data ?? []
    rows.push(...batch)

    // A short page means the end of the rows. An exactly-full one is
    // ambiguous, so it costs one more request to find out — cheaper than
    // guessing wrong and dropping the tail.
    if (batch.length < page) return rows

    if (rows.length >= max) {
      throw new Error(
        `Too many ${what} to show at once (more than ${max}). ${hint} ` +
          `This is a deliberate limit, not a database error: past this point the ` +
          `list is no longer something anyone reads, and loading it would cost ` +
          `more than it tells you.`,
      )
    }
  }
}

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
