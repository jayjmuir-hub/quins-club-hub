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
const PATH_PREFIXES = ['claude/', 'db/', 'src/', 'scripts/', 'harness/', 'supabase/', 'tests/', '.superpowers/']
const ROOT_DOCS = ['CLAUDE.md', 'RESTORE.md', 'README.md']

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

function checkChangelog() {
  if (!existsSync(join(ROOT, CHANGELOG))) return
  const text = readFileSync(join(ROOT, CHANGELOG), 'utf8')
  const listed = new Set()

  text.split('\n').forEach((line, i) => {
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
    if (!listed.has(sha)) {
      const subject = execSync(`git log --format=%s -1 ${sha}`, { encoding: 'utf8' }).trim()
      fail(CHANGELOG, 0, `commit missing from changelog: ${sha} ${subject}`)
    }
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
]

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
    }
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
