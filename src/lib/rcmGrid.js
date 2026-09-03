// The RCM season grid, read from the text of the PDF the union circulates —
// claude/plans/2026-09-02-standings-and-results.md ("import a season").
//
// ⚠️ WHAT THE TEXT LOOKS LIKE, AND WHY THIS IS NOT A SPLIT-ON-WHITESPACE.
// The PDF is a grid: one column pair (Home, Away) per division, a header row
// per weekend naming the round in each column, then one row per game. Text
// extraction keeps the ROWS and loses the COLUMNS: a row reads
// "ADH TUS ADH TUS ADH DT" and nothing says which pair is which division. Two
// things survive and are enough:
//   1. a weekend header names which rounds are being played, in column order,
//      so a three-pair row maps left to right onto the divisions listed; and
//   2. a division's SIDES are a closed set, learnt from the rows where every
//      column is present, so a short row ("DT AAA" alone, one pair where the
//      header had three) is placed by asking which division both codes play in.
// A weekend where only some divisions play ("RD5 RD5 RD3 RD3" with three
// divisions in the sheet) is placed by ROUND CONTINUITY — each division's next
// round is one more than its last — with the side sets as the tie-break.
//
// ⚠️ THE LEGEND RIDES ON THE SAME LINES. The PDF prints "ADH Abu Dhabi
// Harlequins" in a column to the right of the grid, so a fixture row can end
// with a legend entry: "DT AAA DH Dubai Hurricanes". A code is 2–4 capitals;
// a club's name has lowercase letters; the code immediately before the first
// lowercase word is the legend's, the codes before that are the fixtures'.
//
// ⚠️ PURE. No React, no Supabase, no Date.now(). Everything here is a function
// of the text and the season's starting year, so tests/rcm-grid.test.js can
// run it against the real 2026–27 grid and check every one of our fixtures
// against what was loaded by hand on 3 Sep 2026.
//
// ⚠️ SATURDAY IS THE DAY. The grid gives a weekend ("2-3 Oct"); the fixture
// gets whichever of the two days is a Saturday, else the later day. Jay, 3 Sep
// 2026, on the JA game moving "to Friday instead of Saturday": Saturday is the
// default. Byes are not fixtures and are not returned as fixtures.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

const CODE = /^[A-Z]{2,4}$/
const ROUND = /^RD(\d{1,2})$/
const WEEKEND = /^(\d{1,2})[-/](\d{1,2})\s+([A-Za-z]{3,4})\b(.*)$/
const BYE = 'BYE'

/** ISO date (yyyy-mm-dd) in UTC calendar arithmetic. */
function iso(year, month, day) {
  const d = new Date(Date.UTC(year, month, day))
  return d.toISOString().slice(0, 10)
}

/**
 * The Saturday of a weekend like "2-3 Oct", in the season that starts in
 * `seasonStartYear`. Months July to December belong to the start year, January
 * to June to the next.
 */
export function weekendDate(first, second, monthName, seasonStartYear) {
  const month = MONTHS[monthName.toLowerCase()]
  if (month == null) return null
  const year = month >= 6 ? seasonStartYear : seasonStartYear + 1
  const a = new Date(Date.UTC(year, month, first))
  const b = new Date(Date.UTC(year, month, second))
  if (a.getUTCDay() === 6) return iso(year, month, first)
  if (b.getUTCDay() === 6) return iso(year, month, second)
  return iso(year, month, Math.max(first, second))
}

/** Splits a line into fixture codes and, if present, a legend entry. */
function readCodes(tokens) {
  const codes = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (CODE.test(token) || token === BYE) {
      codes.push(token)
      continue
    }
    if (/[a-z]/.test(token) && codes.length > 0) {
      const code = codes.pop()
      return { codes, legend: { code, name: tokens.slice(i).join(' ') } }
    }
    // Anything else (a stray number, punctuation) ends the fixture codes.
    return { codes, legend: null }
  }
  return { codes, legend: null }
}

function pairs(codes) {
  const out = []
  for (let i = 0; i + 1 < codes.length; i += 2) out.push({ home: codes[i], away: codes[i + 1] })
  return out
}

function combinations(items, k) {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [head, ...rest] = items
  return [
    ...combinations(rest, k - 1).map((c) => [head, ...c]),
    ...combinations(rest, k),
  ]
}

/**
 * @param {string} text  the PDF's extracted text
 * @param {{ seasonStartYear: number }} options
 * @returns {{
 *   legend: Record<string, string>,
 *   divisions: Array<{ code: string, sides: string[], rounds: Array<{ round: number, weekend: string, date: string|null, fixtures: Array<{ home: string, away: string }> }> }>,
 *   warnings: string[],
 * }}
 */
export function parseRcmGrid(text, { seasonStartYear }) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const warnings = []
  const legend = {}
  let columns = null

  // ── Pass 0: split into weekend blocks ─────────────────────────────────
  const blocks = []
  let current = null
  for (const line of lines) {
    const tokens = line.split(/\s+/)
    // "WAP WAP DIV1 DIV1 DIV2 DIV2" — every division named twice, in order.
    if (
      tokens.length >= 2 &&
      tokens.length % 2 === 0 &&
      tokens.every((t) => /^[A-Z][A-Z0-9]{1,4}$/.test(t) && !ROUND.test(t) && t !== BYE) &&
      tokens.every((t, i) => (i % 2 === 0 ? tokens[i + 1] === t : true)) &&
      new Set(tokens).size === tokens.length / 2
    ) {
      if (!columns) columns = tokens.filter((_, i) => i % 2 === 0)
      continue
    }
    if (/^home\b/i.test(line)) continue
    const weekend = WEEKEND.exec(line)
    if (weekend) {
      const [, a, b, monthName, rest] = weekend
      const restTokens = rest.trim() ? rest.trim().split(/\s+/) : []
      const rounds = restTokens.filter((t) => ROUND.test(t)).map((t) => Number(ROUND.exec(t)[1]))
      // The legend column reaches the header lines too ("9-10 Oct RD2 … DKI
      // Dubai Knights"), so the non-round remainder is read the same way as
      // a fixture row: codes first, then a legend entry if a name follows.
      const { codes: other, legend: headerLegend } = readCodes(restTokens.filter((t) => !ROUND.test(t)))
      if (headerLegend) legend[headerLegend.code] = headerLegend.name
      current = {
        weekend: `${a}-${b} ${monthName}`,
        date: weekendDate(Number(a), Number(b), monthName, seasonStartYear),
        rounds: pairs(rounds.map(String)).map((p) => Number(p.home)), // one label per pair
        rows: [],
        preseason: rounds.length === 0,
      }
      // A weekend with no round labels is pre-season friendlies ("25/26 Sept
      // TUS DEX"); its games are not league fixtures and are not read.
      if (other.length && !current.preseason) current.rows.push(pairs(other))
      blocks.push(current)
      continue
    }
    if (!current) continue
    const { codes, legend: entry } = readCodes(tokens)
    if (entry) legend[entry.code] = entry.name
    if (codes.length >= 2 && !current.preseason) current.rows.push(pairs(codes))
  }

  if (!columns) {
    return { legend, divisions: [], warnings: ['No division header (e.g. "WAP WAP DIV1 DIV1") was found.'] }
  }

  const divisions = columns.map((code) => ({ code, sides: new Set(), rounds: [], lastRound: 0 }))

  // ── Pass 1: learn each division's sides from the full-width blocks ────
  for (const block of blocks) {
    if (block.preseason || block.rounds.length !== columns.length) continue
    for (const row of block.rows) {
      if (row.length !== columns.length) continue
      row.forEach((pair, i) => {
        if (pair.home !== BYE) divisions[i].sides.add(pair.home)
        if (pair.away !== BYE) divisions[i].sides.add(pair.away)
      })
    }
  }

  const playsIn = (division, pair) =>
    (pair.home === BYE || division.sides.has(pair.home)) &&
    (pair.away === BYE || division.sides.has(pair.away))

  // ── Pass 2: place every block's rounds and rows ───────────────────────
  for (const block of blocks) {
    if (block.preseason) continue
    const k = block.rounds.length
    if (k === 0) continue
    // Which divisions play this weekend: the k-subset (in column order) that
    // best matches round continuity, then the sides seen in the full rows.
    let chosen = null
    let best = -1
    for (const subset of combinations(divisions.map((_, i) => i), k)) {
      let score = 0
      subset.forEach((di, j) => {
        if (divisions[di].lastRound + 1 === block.rounds[j]) score += 10
        for (const row of block.rows) {
          if (row.length === k && playsIn(divisions[di], row[j])) score += 1
        }
      })
      if (score > best) {
        best = score
        chosen = subset
      }
    }
    const targets = chosen.map((di, j) => {
      const division = divisions[di]
      const round = { round: block.rounds[j], weekend: block.weekend, date: block.date, fixtures: [], seen: new Set() }
      division.rounds.push(round)
      division.lastRound = Math.max(division.lastRound, block.rounds[j])
      return { division, round }
    })
    const place = (target, pair) => {
      if (pair.home !== BYE && pair.away !== BYE) target.round.fixtures.push({ home: pair.home, away: pair.away })
      target.round.seen.add(pair.home)
      target.round.seen.add(pair.away)
      if (pair.home !== BYE) target.division.sides.add(pair.home)
      if (pair.away !== BYE) target.division.sides.add(pair.away)
    }
    for (const row of block.rows) {
      if (row.length === k) {
        row.forEach((pair, j) => place(targets[j], pair))
        continue
      }
      // A short row: each pair goes to the one division on this weekend where
      // both sides play and neither has played this round yet.
      for (const pair of row) {
        const fits = targets.filter(
          (t) => playsIn(t.division, pair) && !t.round.seen.has(pair.home) && !t.round.seen.has(pair.away),
        )
        if (fits.length === 1) place(fits[0], pair)
        else warnings.push(`${block.weekend}: could not place ${pair.home} v ${pair.away} (${fits.length} divisions fit).`)
      }
    }
  }

  return {
    legend,
    divisions: divisions.map((d) => ({
      code: d.code,
      sides: [...d.sides].sort(),
      rounds: d.rounds.map(({ seen, ...round }) => round),
    })),
    warnings,
  }
}

/**
 * Our own side's fixtures in one division, as the schedule would show them:
 * `{ round, date, opponent, home }`, sorted by round.
 */
export function ownFixtures(division, ownCode) {
  const out = []
  for (const round of division.rounds) {
    for (const f of round.fixtures) {
      if (f.home === ownCode) out.push({ round: round.round, date: round.date, opponent: f.away, home: true })
      else if (f.away === ownCode) out.push({ round: round.round, date: round.date, opponent: f.home, home: false })
    }
  }
  return out.sort((a, b) => a.round - b.round)
}
