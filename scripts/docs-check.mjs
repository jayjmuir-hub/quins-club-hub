#!/usr/bin/env node
// Documentation integrity checks.
//
// WHY THIS EXISTS: on 7 Aug 2026 an audit of the docs found six wrong claims,
// three broken pointers, a `git add -A` sitting in the push example of the file
// that outranks the rule forbidding it, and a changelog three days out of date.
// Every one of them was found by hand, and every one would have been found by a
// script. Rules that live only in prose get broken; this file is the half of the
// documentation that can fail a build.
//
// Run: npm run docs:check
// Exit code 1 on any failure, so CI fails.

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const failures = []
const fail = (file, line, msg) => failures.push({ file, line, msg })

// ---------------------------------------------------------------- file sets

/** Every tracked markdown file, so an untracked scratch file never fails CI. */
function trackedMarkdown() {
  return execSync('git ls-files "*.md"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

/**
 * Docs a session is told to ACT on. Counts and stale terms are errors here.
 * `claude/handoffs/` and `claude/plans/` are deliberately excluded: CLAUDE.md
 * defines them as history, and history is allowed to describe its own moment.
 */
const INSTRUCTIONAL = (f) =>
  f === 'CLAUDE.md' ||
  f === 'RESTORE.md' ||
  f === 'claude/state-of-play.md' ||
  f === 'claude/schema-history.md' ||
  f.startsWith('claude/runbooks/') ||
  f.startsWith('claude/specs/')

/** Strip fenced code blocks, returning [lineNo, text] for prose lines only. */
function proseLines(text) {
  const out = []
  let fenced = false
  text.split('\n').forEach((l, i) => {
    if (l.startsWith('```')) { fenced = !fenced; return }
    if (!fenced) out.push([i + 1, l])
  })
  return out
}

/** The inverse: lines INSIDE fenced blocks, which is where examples live. */
function fencedLines(text) {
  const out = []
  let fenced = false
  text.split('\n').forEach((l, i) => {
    if (l.startsWith('```')) { fenced = !fenced; return }
    if (fenced) out.push([i + 1, l])
  })
  return out
}

// ---------------------------------------------------------------- 1. links

// Only treat a backticked string as a path if it starts with a real repo
// directory, so `useState` or `auth.uid()` is never mistaken for a file.
const PATH_PREFIXES = ['claude/', 'db/', 'src/', 'scripts/', 'harness/', 'supabase/', 'tests/', '.superpowers/', '.cursor/']
const ROOT_DOCS = ['CLAUDE.md', 'RESTORE.md', 'README.md', 'AGENTS.md']

/**
 * Archives of a COMPLETED build. Their references were true when written and
 * the code has moved since; rewriting them would falsify the record. Excluded
 * from the link check for that reason, not because links there do not matter.
 */
const ARCHIVED = (f) =>
  f.startsWith('.superpowers/') ||
  f.startsWith('claude/archive/') ||
  f.startsWith('claude/plans/') ||
  // Dated design specs record intent at a moment. The two UNdated specs -
  // design-system.md and accessibility.md - are living contracts and ARE checked.
  /^claude\/specs\/\d{4}-/.test(f)

function checkLinks(files) {
  for (const f of files.filter((f) => !ARCHIVED(f))) {
    const text = readFileSync(join(ROOT, f), 'utf8')
    for (const [n, line] of proseLines(text)) {
      for (const m of line.matchAll(/`([^`\s]+)`/g)) {
        // Strip a trailing line/range citation - `src/lib/scope.js:27` and
        // `Login.jsx:60-75` name a real file plus a location in it.
        const p = m[1].replace(/[.,;:)]+$/, '').replace(/:\d+(?:[-,]\d+)*$/, '')
        const isPath = PATH_PREFIXES.some((d) => p.startsWith(d)) || ROOT_DOCS.includes(p)
        if (!isPath) continue
        // A bare directory reference is fine if the directory exists.
        if (existsSync(join(ROOT, p))) continue
        // Allow glob-ish and placeholder references, which are illustrative.
        // "…" as well as "..." — an ellipsis marks an illustrative stand-in,
        // and this check flagged its own documentation for using one.
        if (/[*<>{}…]|\.\.\./.test(p)) continue
        // Some documents deliberately live in the Claude project and NOT in
        // this repo, because the repo is public and they hold tenant
        // configuration. Those lines say "(project)" and are not broken.
        if (/\(project\)/.test(line) || line.includes('link-ok')) continue
        fail(f, n, `broken path reference: ${p}`)
      }
    }
  }
}

// ---------------------------------------------------------------- 2. changelog

const CHANGELOG = 'claude/changelog.md'
// Oldest commit the changelog claims to cover. Everything after this must
// appear. Move it forward only if entries before it are deliberately dropped.
const CHANGELOG_BASELINE = '23cedc8'

/**
 * Does this SHA name a commit?
 *
 * ⚠️ DELIBERATELY NOT `git cat-file -e <sha>^{commit}`. On Windows, execSync
 * shells out through cmd.exe, where "^" is the ESCAPE character - the caret is
 * eaten, git receives "<sha>{commit}", and EVERY lookup fails. That version
 * passed on Linux CI and reported all 65 changelog SHAs as invalid on jay-pc.
 * `cat-file -t` needs no caret and behaves identically on both.
 */
function isCommit(sha) {
  try {
    return execSync(`git cat-file -t ${sha}`, { encoding: 'utf8' }).trim() === 'commit'
  } catch {
    return false
  }
}

// ⚠️ TWO WAYS TO CITE A COMMIT, since 3 Sep 2026. `- \`sha\` — …` is the
// original. `- #123 — …` cites the pull request instead, and covers whichever
// commit's subject ends in "(#123)" — the squash `main` produces. The number
// is known the moment `gh pr create` returns, BEFORE the merge, so the entry
// can be finished inside the same pull request instead of by the next one.
// On 3 Sep 2026 the SHA route cost a red docs-check on roughly half the day's
// pull requests, every time for the same reason: the squash did not exist
// yet, or the previous entry had been written in a shape a script could not
// find to prefix. A PR number is stable from the start and never needs
// prefixing later.
const PR_REF = /^-\s+#(\d+)\s+[—-]/
const SUBJECT_PR = /\(#(\d+)\)\s*$/

function checkChangelog() {
  if (!existsSync(join(ROOT, CHANGELOG))) return
  const text = readFileSync(join(ROOT, CHANGELOG), 'utf8')
  const listed = new Set()
  const listedPrs = new Set()

  text.split('\n').forEach((line, i) => {
    const pr = line.match(PR_REF)
    if (pr) {
      listedPrs.add(pr[1])
      return
    }
    const m = line.match(/^-\s+`([0-9a-f]{7,40})`/)
    if (!m) return
    const sha = m[1]
    listed.add(sha)
    if (!isCommit(sha)) {
      fail(CHANGELOG, i + 1, `changelog cites a SHA that is not a commit: ${sha}`)
    }
  })

  // Coverage: no commit after the baseline may be missing.
  // NOTE the ~1: a commit cannot cite its own SHA, because the SHA does not
  // exist until the commit is written. So the changelog is allowed to be
  // exactly one commit behind, and the NEXT commit must catch it up. Any
  // larger gap is the drift this check exists to stop.
  let range
  try {
    if (!isCommit(CHANGELOG_BASELINE)) throw new Error('baseline missing')
    range = execSync(`git log --format=%h ${CHANGELOG_BASELINE}..HEAD~1`, { encoding: 'utf8' })
  } catch {
    // A shallow clone cannot see the baseline. Say so rather than pass silently -
    // a check that quietly does nothing is worse than no check.
    console.error(
      `  ! changelog coverage SKIPPED: baseline ${CHANGELOG_BASELINE} not in this clone.\n` +
      `    CI must check out with fetch-depth: 0.`
    )
    return
  }
  for (const sha of range.split('\n').filter(Boolean)) {
    if (listed.has(sha)) continue
    const subject = execSync(`git log --format=%s -1 ${sha}`, { encoding: 'utf8' }).trim()
    const pr = subject.match(SUBJECT_PR)
    if (pr && listedPrs.has(pr[1])) continue
    fail(
      CHANGELOG, 0,
      `commit missing from changelog: ${sha} ${subject}` +
        (pr ? ` — cite it as "- #${pr[1]} — …" (or the squash SHA)` : ''),
    )
  }
}

// ---------------------------------------------------------------- 3. counts

// "944, 978, 1057 and 1157" - every test count ever written into these docs
// rotted within days. Opt out on a line with <!-- count-ok --> when the number
// IS the point, e.g. when quoting the history of this exact mistake.
// The negative lookbehind for ":" keeps a clock time out of it - "the 10:29
// test on 6 Aug bounced" is a timestamp, not a count, and flagging it taught
// me that a checker nobody trusts gets switched off.
const COUNT_RE = /(?<![\d:])\b\d{2,5}\s*(?:\/\s*\d{2,5}\s*)?(?:unit\s+)?(?:tests?|test files|specs?)\b|\btests?\s+(?:passing|passed)\b/i

function checkCounts(files) {
  for (const f of files.filter(INSTRUCTIONAL)) {
    const text = readFileSync(join(ROOT, f), 'utf8')
    for (const [n, line] of proseLines(text)) {
      if (line.includes('count-ok')) continue
      if (COUNT_RE.test(line)) {
        fail(f, n, `test count in an instructional doc - it will rot. Run npm test instead, or mark the line <!-- count-ok -->`)
      }
    }
  }
}

// ---------------------------------------------------------------- 4. git add -A

// CLAUDE.md rule 1. RESTORE.md's own worked example broke it until 7 Aug 2026.
function checkGitAddAll(files) {
  for (const f of files) {
    const text = readFileSync(join(ROOT, f), 'utf8')
    for (const [n, line] of fencedLines(text)) {
      // A shell comment inside a fence is prose, not a runnable step - the
      // warning against `git add -A` is itself written as a comment.
      if (/^\s*(#|\/\/)/.test(line)) continue
      if (/git\s+add\s+(-A|--all|\.)\b/.test(line)) {
        fail(f, n, `runnable example contains "git add -A" - CLAUDE.md rule 1 forbids it`)
      }
    }
  }
}

// ---------------------------------------------------------------- 5. plan status

// CLAUDE.md: "Feature plans, dated. Superseded by the code once shipped."
// A reader cannot tell WHICH shipped unless the plan says so.
function checkPlanStatus() {
  const dir = join(ROOT, 'claude/plans')
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const f = `claude/plans/${name}`
    const head = readFileSync(join(ROOT, f), 'utf8').split('\n').slice(0, 20).join('\n')
    if (!/\*\*STATUS:/i.test(head)) {
      fail(f, 0, `plan has no "**STATUS:" line in its first 20 lines - say whether it shipped`)
    }
  }
}

// ---------------------------------------------------------------- 6. stale terms

// Terms that describe a world this project has left. Allowed in history
// (handoffs, plans, archive) and where the doc is explicitly retiring the term.
const STALE_TERMS = [
  ['Wild Apricot', 'the club site is not on Wild Apricot and there is no Wild Apricot import'],
  ['app.adhjrt.com is production', 'production is adhquins-clubhub.com'],
  // ⚠️ Matched WITHOUT the hostname on purpose. Every doc writes it as
  // `app.adhjrt.com` in backticks, so a term containing both the hostname and
  // the verb can never match a real line - the backticks sit between them.
  // Three files said "is a working alias, deliberately kept" until 12 Aug 2026
  // and the phrase is what has to stop coming back, not the hostname, which is
  // still legitimately named by every tombstone pointing at its retirement.
  ['is a working alias', 'app.adhjrt.com was retired on 12 Aug 2026 and returns NXDOMAIN - nothing is a working alias now. See claude/decisions/2026-08-12-retire-app-alias.md'],
]

// ⚠️ THE NAMES OF THE THREE VOLUNTEERS, RETIRED 12 Aug 2026 (Jay: "we aren't
// going to use human names anymore, only Club Youth Manager, Pitch Management,
// Social Media Management from now on").
//
// ⚠️ REGEXES, NOT STRINGS, AND THE WORD BOUNDARIES ARE LOAD-BEARING. The plain
// substring matcher above would fail every line containing "nickname" the
// moment `Nick` were added as a string. `\b` is what makes the term usable at
// all - proved by planting "nickname" and confirming it stays green.
//
// ⚠️ SCANNED IN CODE AS WELL AS DOCS - Jay's call, 12 Aug. Every occurrence of
// a name in this repo outside the docs was a CODE COMMENT, so a
// markdown-only gate would have policed the one place the rule was not broken.
// claude/decisions/2026-08-12-jobs-not-people.md
const RETIRED_NAMES = [
  [/\bCandice\b/i, 'the job is Club Youth Manager - name the job, not the person'],
  [/\bTracy\b/i, 'the job is Pitch Management - name the job, not the person'],
  [/\bNick\b/i, 'the job is Social Media Management - name the job, not the person'],
]

/**
 * Tracked source files the name rule applies to.
 *
 * ⚠️ `db/migrations/` IS DELIBERATELY ABSENT, for the same reason
 * `claude/handoffs/` and `claude/plans/` are: a migration is a dated record of
 * what ran, and `apply_migration` strips `--` comments before executing, so the
 * database never held those words in the first place. `db/schema/` IS included
 * - it is a living capture, read as current truth.
 */
function trackedCode() {
  return execSync('git ls-files "src/*" "tests/*" "db/schema/*" "supabase/*"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

function checkStaleTerms(files) {
  const historical = (f) =>
    f.startsWith('claude/handoffs/') || f.startsWith('claude/plans/') ||
    f.startsWith('claude/archive/') || f.startsWith('.superpowers/')

  for (const f of files) {
    if (historical(f)) continue
    const text = readFileSync(join(ROOT, f), 'utf8')
    for (const [n, line] of proseLines(text)) {
      if (line.includes('stale-ok')) continue
      for (const [term, why] of STALE_TERMS) {
        if (line.toLowerCase().includes(term.toLowerCase())) {
          fail(f, n, `stale reference "${term}" - ${why}. Fix it, or mark the line <!-- stale-ok --> if it is deliberately retiring the term`)
        }
      }
      for (const [re, why] of RETIRED_NAMES) {
        if (re.test(line)) {
          fail(f, n, `retired name ${re.source} - ${why}. Fix it, or mark the line stale-ok if it is deliberately retiring the term`)
        }
      }
    }
  }

  // ⚠️ EVERY line of a source file, not proseLines(). That helper strips
  // markdown fences; in a .js file the "fence" would be whatever ``` happened
  // to appear in a comment, which would silently blind the scan.
  for (const f of trackedCode()) {
    const text = readFileSync(join(ROOT, f), 'utf8')
    text.split('\n').forEach((line, i) => {
      if (line.includes('stale-ok')) return
      for (const [re, why] of RETIRED_NAMES) {
        if (re.test(line)) {
          fail(f, i + 1, `retired name ${re.source} - ${why}. Fix it, or mark the line stale-ok if it is deliberately retiring the term`)
        }
      }
    })
  }
}

// ---------------------------------------------------------------- 7. grants capture

// ⚠️ THE BLIND SPOT THIS CLOSES. `db/schema/` captures tables, policies,
// functions and triggers — and until 10 Aug 2026 it captured no table or column
// GRANTS at all. `db/schema/README.md` said so plainly: the larger half of
// `20260808_profile_phone_and_column_grants.sql` is a column-level
// REVOKE/GRANT on `profiles`, the thing standing between a member and rewriting
// someone's login email, and NOTHING IN THAT DIRECTORY WOULD DIFF IT.
//
// `db/schema/grants.sql` now captures them. This check is what stops that
// capture rotting the way the README predicted: a migration that grants on a
// TABLE must be represented there.
//
// ⚠️ IT CANNOT SEE THE DATABASE, AND DOES NOT PRETEND TO. CI has no credentials
// — this repo is public — so real drift between the file and live is still only
// caught by re-capturing, and by `db/tests/grants.sql` run against live. What
// this catches is the one failure mode that IS visible from the filesystem, and
// the one that actually happened: a grant migration landing with no
// corresponding line in the capture.
//
// FUNCTION grants are deliberately out of scope — `functions.sql` has captured
// `proacl` since 7 Aug, and a second copy of a fact is a copy that drifts. As of
// this writing every GRANT in `db/migrations/` except one is `on function`.
const GRANTS_CAPTURE = 'db/schema/grants.sql'

/** SQL with $$-quoted function bodies removed, so `;` splits only statements. */
function withoutDollarQuotes(sql) {
  return sql.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, '\n')
}

function checkGrantCapture() {
  const dir = join(ROOT, 'db/migrations')
  if (!existsSync(dir)) return

  if (!existsSync(join(ROOT, GRANTS_CAPTURE))) {
    fail(GRANTS_CAPTURE, 0, 'the grants capture is missing - db/schema/ would no longer diff a table or column GRANT')
    return
  }
  const capture = readFileSync(join(ROOT, GRANTS_CAPTURE), 'utf8')

  for (const name of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const f = `db/migrations/${name}`
    const text = withoutDollarQuotes(readFileSync(join(ROOT, f), 'utf8'))

    for (const raw of text.split(';')) {
      // ⚠️ COMMENTS ARE STRIPPED ONCE AND EVERY TEST BELOW USES THE RESULT.
      // They used to be stripped for the DETECTION and not for the EXTRACTION,
      // so the table name came out of whatever the comment said. A migration
      // whose comment contained the words "ON TOP OF RLS" was reported as
      // granting on a table called "TOP" — a failure naming a table that does
      // not exist, for a migration whose grant was perfectly captured.
      // Found 17 Aug 2026 by writing that comment.
      const stmt = raw.replace(/^\s*--.*$/gm, '')
      if (!/^\s*(grant|revoke)\b/i.test(stmt)) continue
      // Captured elsewhere, on purpose.
      if (/\bon\s+(all\s+)?functions?\b/i.test(stmt)) continue
      if (/\bon\s+(schema|sequence|database|type)\b/i.test(stmt)) continue

      const m = /\bon\s+(?:table\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/i.exec(stmt)
      if (!m) continue
      const table = m[1]

      // A word-boundary match, so `profiles` in the capture would not satisfy a
      // migration granting on `profiles_audit`.
      if (!new RegExp(`\\b${table}\\b`).test(capture)) {
        fail(f, 0,
          `grants on table "${table}" but ${GRANTS_CAPTURE} never names it - ` +
          `re-capture the grants, or db/schema/ is again unable to diff them`)
      }
    }
  }
}

// ---------------------------------------------------- 9. the ignore gate exists

// ⚠️ TOML IS POSITIONAL, AND THAT COST THE DEPLOY GATE ITS LIFE ON 24 Aug 2026.
// A table header like [build.environment] captures EVERY bare key after it, so
// when that block was added above `ignore =` (PR #358), `ignore` silently
// became an environment variable named "ignore", `build.ignore` ceased to
// exist, and Netlify built every commit — docs-only ones included — with no
// error or warning anywhere. It was found only by reading a deploy's build log
// and noticing no ignore evaluation at all.
//
// This does not parse TOML; it asserts the one ordering that matters: the
// `ignore =` key must appear before the first `[build.<anything>]` sub-table
// header. A missing ignore line fails too — deleting the gate should never be
// quieter than misplacing it.
function checkIgnoreGate() {
  const f = 'netlify.toml'
  if (!existsSync(join(ROOT, f))) return
  const lines = readFileSync(join(ROOT, f), 'utf8').split('\n')
  const ignoreAt = lines.findIndex((l) => /^\s*ignore\s*=/.test(l))
  const subTableAt = lines.findIndex((l) => /^\s*\[build\./.test(l))
  if (ignoreAt === -1) {
    fail(f, 0, 'no `ignore =` key - the deploy gate (scripts/netlify-ignore.mjs) is not wired at all')
    return
  }
  if (subTableAt !== -1 && subTableAt < ignoreAt) {
    fail(f, subTableAt + 1,
      'a [build.*] sub-table sits above `ignore =`, which moves the key INTO that table - ' +
      'build.ignore stops existing and Netlify builds every commit (24 Aug 2026, PR #358)')
  }
}

// ---------------------------------------------------------------- 8. real inboxes

// ⚠️ WHAT THIS CATCHES, AND WHY A CHECK WAS POSSIBLE AT ALL. CLAUDE.md rule 9
// forbids a real person's identity in this repo, and says plainly that
// docs:check CANNOT enforce it — a denylist of real names would put those names
// into the repo, in the checker. That is true of NAMES. It is not true of
// MAILBOXES: a consumer mail provider is a domain, not a person, so this list
// names nobody and never will.
//
// The gap it closes was found on 20 Aug 2026. A real club member's inbox sat in
// `harness/stubs/`, their first name across three test files, and their full
// name in `harness/shoot-pending.mjs` — the script that renders the PNGs the
// two parent-facing guides were built from. So the leak path was not
// hypothetical: fixture data in this repo gets published to the club as
// pictures. A child's address was in `tests/` on the same day.
//
// ⚠️ CODE AND FIXTURES ONLY — `claude/` IS DELIBERATELY OUT OF SCOPE. Jay's own
// address is load-bearing in `claude/runbooks/first-admin.md`, where the
// bootstrap SQL will not work without it, and a check that fails an operational
// runbook is a check that gets switched off. The rule for prose is still rule 9
// and still enforced by hand.
//
// ⚠️ `harness/` AND `scripts/` ARE IN SCOPE HERE AND ARE NOT IN `trackedCode()`
// above. That is the whole point: the retired-names scan has never looked at the
// harness, which is exactly where the address was.
const INBOX_DOMAINS = [
  'gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook', 'live', 'msn',
  'icloud', 'me', 'mac', 'aol', 'proton', 'protonmail', 'gmx', 'zoho', 'yandex',
]
// Built from parts so this file never contains a literal address and cannot
// match itself. Verified by running the check over a tree containing it.
const INBOX_RE = new RegExp(
  '[A-Za-z0-9._%+-]+' + '@' + `(?:${INBOX_DOMAINS.join('|')})` + '\\.[a-z]{2,}(?:\\.[a-z]{2,})?',
  'i',
)

function trackedFixtures() {
  return execSync('git ls-files "src/*" "tests/*" "harness/*" "scripts/*" "db/*" "supabase/*"', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

function checkRealInboxes() {
  for (const f of trackedFixtures()) {
    const text = readFileSync(join(ROOT, f), 'utf8')
    text.split('\n').forEach((line, i) => {
      // The escape hatch exists so a line ABOUT this rule can name a domain.
      // It is not for keeping a real address.
      if (line.includes('mailbox-ok')) return
      const m = INBOX_RE.exec(line)
      if (!m) return
      fail(f, i + 1,
        `"${m[0]}" is an address at a personal mail provider, in code or fixture data - ` +
        `CLAUDE.md rule 9. Invent it: every stub in this repo uses the reserved ` +
        `adhq.example / example.com domains. Mark the line mailbox-ok only if the line ` +
        `is about this rule rather than carrying an address`)
    })
  }
}

// --------------------------------------------- unresolved conflict markers
//
// 31 Aug 2026: fourteen changelog conflicts were hand-resolved in one day —
// the one-behind rule serialises every PR through claude/changelog.md — and
// this script would have PASSED a file still carrying <<<<<<< / ======= /
// >>>>>>> markers straight onto main. Verified against the script with a
// control before writing this check. Scope is every tracked file this script
// already reads (markdown, code, fixtures, migrations): a marker anywhere in
// them is never prose, it is an unfinished merge.
//
// ⚠️ The ======= form matches only at line START and only the exact 7-char
// git marker followed by nothing — a markdown heading underline (=== of any
// other length) stays legal, and this file's own examples stay legal because
// the patterns here are split so they cannot match themselves.
const MARKER_RE = /^(<{7}( .*)?|={7}|>{7}( .*)?)$/

function checkConflictMarkers() {
  const scanned = new Set([
    ...trackedMarkdown(), ...trackedCode(),
    ...execSync('git ls-files "db/*" "scripts/*" "harness/*" ".github/*"', { encoding: 'utf8' })
      .split('\n').filter(Boolean),
  ])
  for (const f of scanned) {
    if (!existsSync(join(ROOT, f))) continue
    const text = readFileSync(join(ROOT, f), 'utf8')
    if (!text.includes('<'.repeat(7)) && !text.includes('='.repeat(7)) && !text.includes('>'.repeat(7))) continue
    text.split('\n').forEach((line, i) => {
      if (MARKER_RE.test(line)) {
        fail(f, i + 1,
          'unresolved git conflict marker. This file was hand-merged and the ' +
          'resolution is not finished - the marker would land on main as text. ' +
          'Finish the resolution; there is no exemption for this one')
      }
    })
  }
}

// ---------------------------------------------------------------- run

const files = trackedMarkdown()
const checks = [
  ['broken path references', () => checkLinks(files)],
  ['changelog SHAs and coverage', () => checkChangelog()],
  ['test counts in instructional docs', () => checkCounts(files)],
  ['git add -A in examples', () => checkGitAddAll(files)],
  ['plan status lines', () => checkPlanStatus()],
  ['stale terminology', () => checkStaleTerms(files)],
  ['table and column grants captured', () => checkGrantCapture()],
  ['real inboxes in code and fixtures', () => checkRealInboxes()],
  ['the deploy ignore gate is wired', () => checkIgnoreGate()],
  ['no unresolved conflict markers', () => checkConflictMarkers()],
]

console.log(`docs-check: ${files.length} tracked markdown files\n`)
for (const [name, fn] of checks) {
  const before = failures.length
  fn()
  const n = failures.length - before
  console.log(`  ${n === 0 ? 'ok  ' : 'FAIL'}  ${name}${n ? ` (${n})` : ''}`)
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n`)
  for (const { file, line, msg } of failures) {
    console.error(`  ${file}${line ? `:${line}` : ''}\n    ${msg}`)
  }
  console.error('')
  process.exit(1)
}
console.log('\nAll documentation checks passed.')
