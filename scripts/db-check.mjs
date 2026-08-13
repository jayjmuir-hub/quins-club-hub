#!/usr/bin/env node
// Run every SQL harness in db/tests/ against the live database.
//
// WHY THIS EXISTS. On 13 Aug 2026 `db/tests/grants.sql` was found to have been
// FAILING against live since 10 Aug — three days — and nobody had seen it,
// because nobody had run it. Its check said "these five are the only
// column-level grants in the schema" and that became false the same day it was
// written, when super_admin_and_rights added six more.
//
// ⚠️ THE FAILURE WAS NOT THE CHECK BEING WRONG. It was that running the checks
// meant opening the Supabase SQL editor and pasting thirteen files by hand, so
// it happened roughly never. `claude/state-of-play.md` records the lesson as
// the sibling of CLAUDE.md rule 6: **a check nobody RUNS is not a check, in
// exactly the way a check that has never FAILED is not a check.** This file is
// the friction removed.
//
//   npm run db:check            -- every harness
//   npm run db:check -- grants  -- only the ones whose name contains "grants"
//
// ⚠️ IT RUNS AGAINST PRODUCTION, because that is the only database there is —
// Supabase branching does not work on this project (the migration history has
// duplicate rows and cannot be replayed, which is the same thing that failed
// with MIGRATIONS_FAILED on 13 Aug). That is safe ONLY because of the invariant
// enforced below, and the enforcement is the point: every harness in this
// directory opens a transaction and rolls it back, several of them INJECT A
// REAL FAULT on the way through, and one of those faults is "any club admin may
// rewrite any member's login email".

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DIR = 'db/tests'

// ── The connection string ──────────────────────────────────────────────────
//
// ⚠️ NEVER COMMITTED, NEVER PASTED INTO A CHAT, NEVER IN A TOOL CALL. This repo
// is PUBLIC. Supabase → Project Settings → Database → Connection string. `.env`
// is gitignored and is the right home for it locally; in CI it is an encrypted
// Actions secret, which a fork's pull request cannot read.
function connectionString() {
  const fromEnv = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (fromEnv) return fromEnv

  // Convenience only. Read directly rather than adding a dotenv dependency for
  // one line, and deliberately NOT merged into process.env — nothing else in
  // this script should be able to pick up a credential by accident.
  const envFile = join(ROOT, '.env')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const m = /^\s*(SUPABASE_DB_URL|DATABASE_URL)\s*=\s*(.+?)\s*$/.exec(line)
      if (m) return m[2].replace(/^["']|["']$/g, '')
    }
  }
  return null
}

// ── The safety gate ────────────────────────────────────────────────────────
//
// ⚠️ THIS IS WHAT MAKES RUNNING THESE UNATTENDED DEFENSIBLE, and it is checked
// rather than trusted. Every harness must open a transaction and roll it back,
// and none may commit. As of 13 Aug 2026 all thirteen already satisfy this — so
// the gate costs nothing today and exists for the fourteenth, which somebody
// will write in a hurry.
//
// A file with a COMMIT is not merely untidy: db/tests/grants.sql really does
// `grant update (email) on public.profiles to authenticated` in the middle, to
// prove its own assertions are not vacuous. Committing that would hand every
// club admin the ability to rewrite any member's login email, on production,
// with nothing failing and nothing in the app looking different.
// ── ⚠️ THE SECOND GATE: A HARNESS MUST BE ABLE TO FAIL ─────────────────────
//
// Found 13 Aug 2026, hours after this runner was written to fix "a check nobody
// RUNS is not a check". **NINE of the fifteen harnesses could not FAIL.**
//
// `client.query(sql)` below throws on a SQL ERROR and returns result sets for
// everything else — and the result sets were discarded. So a harness whose
// assertions are SELECTs, e.g.
//
//     select count(*) as other_squads_coach_leaked_expect_0 from ...;
//
// reported `ok` whichever number came back. The zero was never compared to
// anything; nobody ever saw it. Nine files, every one of them guarding an RLS
// boundary, and the list included the one written the same afternoon.
//
// ⚠️ THAT IS THE SAME BUG ONE LAYER UP, and it is worth stating plainly: this
// runner removed the friction that stopped people RUNNING the checks, and left
// most of them unable to report a wrong answer. **A check that runs and cannot
// fail is not a check either.**
//
// So a harness must now contain at least one `raise exception` — a statement of
// what it expects, in a form the database can act on. `raise notice` does not
// count: a notice is printed and execution continues, which is exactly the
// silence this gate exists to end. The rows are printed as well (see below), so
// a human still sees everything; the exception is what makes it enforceable.
function inspect(sql) {
  const withoutComments = sql.replace(/^\s*--.*$/gm, '')
  return {
    opens: /^\s*begin\s*;/im.test(withoutComments),
    rollsBack: /^\s*rollback\s*;/im.test(withoutComments),
    commits: /^\s*commit\s*;/im.test(withoutComments),
    canFail: /raise\s+exception/i.test(withoutComments),
  }
}

// ── Reading what a harness actually measured ───────────────────────────────

/**
 * Every row from every statement in the file, flattened.
 *
 * node-postgres returns an ARRAY of result objects when the query text holds
 * more than one statement, and a single object when it holds one. Harnesses in
 * this directory are always multi-statement, but a one-statement file must not
 * silently print nothing.
 */
function collectRows(out) {
  const sets = Array.isArray(out) ? out : [out]
  const rows = []
  for (const set of sets) {
    if (!set || !Array.isArray(set.rows)) continue
    for (const row of set.rows) rows.push(row)
  }
  return rows
}

/** One `key=value` line per row, truncated so a wide row cannot flood a log. */
function formatRows(rows) {
  return rows.map((row) =>
    Object.entries(row)
      .map(([k, v]) => {
        const text = v === null ? 'null' : String(v)
        return `${k}=${text.length > 80 ? `${text.slice(0, 77)}...` : text}`
      })
      .join('  '),
  )
}

// ── Run ────────────────────────────────────────────────────────────────────

const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const files = readdirSync(join(ROOT, DIR))
  .filter((n) => n.endsWith('.sql'))
  .filter((n) => filter.length === 0 || filter.some((f) => n.includes(f)))
  .sort()

if (files.length === 0) {
  console.error(`db-check: no harness in ${DIR} matches ${filter.join(', ')}`)
  process.exit(1)
}

// Gate every file BEFORE connecting, so an unsafe one cannot be reached by a
// run that has already started and is part way down the list.
const unsafe = []
const silent = []
for (const name of files) {
  const { opens, rollsBack, commits, canFail } = inspect(readFileSync(join(ROOT, DIR, name), 'utf8'))
  if (commits) unsafe.push(`${name}: contains COMMIT — a harness must never commit against production`)
  else if (!opens || !rollsBack) unsafe.push(`${name}: must open with BEGIN and end with ROLLBACK`)
  if (!canFail) silent.push(name)
}
if (unsafe.length) {
  console.error('db-check: REFUSING TO RUN. These harnesses are not safe to run unattended:\n')
  for (const line of unsafe) console.error(`  ${line}`)
  console.error('\nSeveral harnesses inject a real fault to prove they are not vacuous.')
  console.error('Without a guaranteed rollback, that fault stays on production.\n')
  process.exit(1)
}
if (silent.length) {
  console.error('db-check: REFUSING TO RUN. These harnesses cannot FAIL:\n')
  for (const name of silent) console.error(`  ${name}: no "raise exception" anywhere`)
  console.error('\nA harness whose assertions are SELECTs reports `ok` whatever number comes')
  console.error('back — this runner throws on a SQL error and on nothing else. Wrap each')
  console.error('expectation in a `do $$ ... raise exception ... end $$;` block so a wrong')
  console.error('answer stops the run. `raise notice` is not enough: it prints and carries on.\n')
  process.exit(1)
}

const url = connectionString()
if (!url) {
  console.error(
    'db-check: no connection string.\n\n' +
      '  Supabase -> Project Settings -> Database -> Connection string (URI).\n' +
      '  Put it in .env as SUPABASE_DB_URL=... (.env is gitignored), or pass it\n' +
      '  as an environment variable for one run.\n\n' +
      '  It is a credential. This repo is PUBLIC: never commit it, never paste it\n' +
      '  into a chat, and rotate it if it is ever disclosed.\n',
  )
  process.exit(1)
}

let pg
try {
  pg = await import('pg')
} catch {
  console.error(
    'db-check: the `pg` package is missing. Run `npm install --include=dev`.\n\n' +
      '  ⚠️ --include=dev is not optional on either PC: an ambient NODE_ENV=production\n' +
      '  makes a plain `npm install` drop devDependencies silently.\n',
  )
  process.exit(1)
}
const { Client } = pg.default ?? pg

console.log(`db-check: ${files.length} harness file(s), against the live database\n`)

const results = []
for (const name of files) {
  const sql = readFileSync(join(ROOT, DIR, name), 'utf8')

  // ⚠️ ONE CONNECTION PER FILE, CLOSED AFTERWARDS. Belt and braces on the
  // rollback: if a harness dies part way through, the server rolls its
  // transaction back when the connection drops, so nothing a harness injected
  // can outlive the file that injected it.
  const client = new Client({ connectionString: url })
  const notices = []
  client.on('notice', (n) => notices.push(n.message))

  let rows = []
  try {
    await client.connect()
    // ⚠️ THE RETURN VALUE WAS DISCARDED UNTIL 13 Aug 2026, and that is how nine
    // harnesses came to be unable to report a wrong answer. node-postgres hands
    // back an ARRAY of results for a multi-statement string and a single object
    // for one statement, so both shapes are handled.
    const out = await client.query(sql)
    rows = collectRows(out)
    results.push({ name, ok: true, notices, rows })
    console.log(`  ok    ${name}`)
  } catch (error) {
    results.push({ name, ok: false, notices, error: error.message })
    console.log(`  FAIL  ${name}`)
  } finally {
    await client.end().catch(() => {})
  }

  // ⚠️ PRINTED EVEN ON A PASS. The `raise exception` gate above is what makes a
  // wrong answer STOP the run; this is what lets a human read the numbers and
  // notice one that is technically within its assertion and still wrong. The
  // two are complementary — the gate catches what somebody thought to assert,
  // the print is how the next surprise gets spotted at all.
  for (const line of formatRows(rows)) console.log(`          ${line}`)

  // ⚠️ NOTICES ARE THE OUTPUT, NOT DECORATION. These harnesses report a pass
  // with `raise notice` — "SELF-TEST PASSED — the check caught it: ..." is how
  // a file says its assertions are not vacuous. A runner that swallowed them
  // would turn the most valuable line into silence.
  for (const line of notices) console.log(`          ${line}`)
}

const failed = results.filter((r) => !r.ok)
console.log()
if (failed.length) {
  console.error(`${failed.length} harness(es) failed:\n`)
  for (const r of failed) console.error(`  ${r.name}\n    ${r.error}\n`)
  // ⚠️ A RED RUN MEANS PRODUCTION DRIFTED, NOT THAT YOUR BRANCH IS BAD. These
  // assert against live. That is why this must never become a required check on
  // a pull request: it would block every unrelated merge until somebody fixed
  // the database.
  console.error('These assert against LIVE. A failure is a statement about production,')
  console.error('not about the branch you are on.\n')
  process.exit(1)
}
console.log('All harnesses passed.')
