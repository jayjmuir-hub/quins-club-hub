import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { decide, isDeployIrrelevant, changedPaths } from '../scripts/netlify-ignore.mjs'

// Tests for the deploy gate that replaced `[skip ci]`.
//
// ⚠️ WHAT MAKES THIS WORTH TESTING AT ALL. Netlify inverts the exit code for an
// `ignore` command: 0 CANCELS the build, non-zero proceeds. A gate that is
// wrong in one direction publishes a needless deploy, which nobody would
// notice or mind. Wrong in the other direction it stops deploying the app —
// silently, with a green build list, because a cancelled build is a SUCCESS as
// far as Netlify's UI is concerned. The last two tests in this file are the
// ones that matter; the rest describe the policy.

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'netlify-ignore.mjs')

/** Runs the real script the way Netlify does, and reports its exit code. */
function runScript(env, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      cwd,
      env: { ...process.env, ...env },
    })
    return { code: 0, stdout }
  } catch (err) {
    return { code: err.status, stdout: String(err.stdout ?? '') }
  }
}

describe('which paths can reach the built site', () => {
  it.each([
    'claude/state-of-play.md',
    'claude/handoffs/2026-08-10-session.md',
    'docs/anything.md',
    'db/schema/policies.sql',
    'CLAUDE.md',
    'RESTORE.md',
    'README.md',
  ])('%s cannot', (path) => {
    expect(isDeployIrrelevant(path)).toBe(true)
  })

  it.each([
    'src/screens/Dashboard.jsx',
    'index.html',
    'vite.config.js',
    'tailwind.config.js',
    'package.json',
    'package-lock.json',
    'public/icons/favicon-32.png',
    'pwa-cache-rules.js',
  ])('%s can', (path) => {
    expect(isDeployIrrelevant(path)).toBe(false)
  })

  it('⚠️ netlify.toml can — the redirects and headers are read from the deploy', () => {
    // The /calendar.ics proxy lives in this file. A change to it that never
    // deployed would leave the feed pointed at the old destination while the
    // repo says otherwise.
    expect(isDeployIrrelevant('netlify.toml')).toBe(false)
  })

  it('only root markdown is exempt — a .md under src/ is still source', () => {
    expect(isDeployIrrelevant('src/components/notes.md')).toBe(false)
  })

  it('does not exempt a directory that merely STARTS like an exempt one', () => {
    // `dbmigrate/` is not `db/`, and `claude-notes/` is not `claude/`.
    expect(isDeployIrrelevant('dbmigrate/x.sql')).toBe(false)
    expect(isDeployIrrelevant('claude-notes/x.md')).toBe(false)
  })
})

describe('the decision', () => {
  const cached = 'aaaaaaa'
  const commit = 'bbbbbbb'

  it('skips when every changed file is documentation', () => {
    const { build } = decide({
      cached,
      commit,
      changed: ['claude/changelog.md', 'CLAUDE.md', 'claude/handoffs/2026-08-10-session.md'],
    })
    expect(build).toBe(false)
  })

  it('builds when one source file is mixed in with the docs', () => {
    const { build, reason } = decide({
      cached,
      commit,
      changed: ['claude/changelog.md', 'src/screens/Dashboard.jsx'],
    })
    expect(build).toBe(true)
    // The reason names the file that forced it, so a surprising build in the
    // deploy log can be explained without re-deriving the diff.
    expect(reason).toContain('src/screens/Dashboard.jsx')
  })

  it('builds for an ordinary source change', () => {
    expect(decide({ cached, commit, changed: ['src/lib/scope.js'] }).build).toBe(true)
  })
})

describe('⚠️ every uncertain case builds', () => {
  it('builds when there is no cached commit — first build, or a cleared cache', () => {
    expect(decide({ cached: undefined, commit: 'bbbbbbb', changed: [] }).build).toBe(true)
  })

  it('builds when the diff could not be taken', () => {
    // ⚠️ THE DANGEROUS CONFUSION. `null` means "no answer" and must never be
    // treated as the empty list, which would read as "nothing changed" and
    // skip.
    expect(decide({ cached: 'aaaaaaa', commit: 'bbbbbbb', changed: null }).build).toBe(true)
  })

  it('builds when the refs differ but no files do', () => {
    expect(decide({ cached: 'aaaaaaa', commit: 'bbbbbbb', changed: [] }).build).toBe(true)
  })

  it('builds on a retry of the commit already built', () => {
    // Somebody clicked "clear cache and deploy". Do not out-think them.
    expect(decide({ cached: 'aaaaaaa', commit: 'aaaaaaa', changed: [] }).build).toBe(true)
  })

  it('changedPaths returns null — never [] — when git fails', () => {
    const throwing = vi.fn(() => {
      throw new Error('fatal: bad object')
    })
    expect(changedPaths('aaaaaaa', 'bbbbbbb', throwing)).toBeNull()
  })

  it('changedPaths drops blank lines rather than reporting an empty path', () => {
    const run = vi.fn(() => 'src/a.js\n\nclaude/b.md\n')
    expect(changedPaths('a', 'b', run)).toEqual(['src/a.js', 'claude/b.md'])
  })
})

describe('⚠️ the exit code, which Netlify inverts', () => {
  // These run the actual file, end to end, against a real git repository.
  // Everything above tests `decide()`, and `decide()` could be perfect while
  // the process still exits the wrong way round — which is the one failure
  // that would matter.
  //
  // ⚠️ A THROWAWAY REPO, NOT THIS ONE. Driving these off this repo's own
  // history would pin the test to particular commits AND break in CI, where
  // `actions/checkout` clones to depth 1 and `HEAD~1` does not exist.

  function git(args, cwd) {
    execFileSync('git', args, { cwd, stdio: 'ignore' })
  }

  /** A two-commit repo whose second commit touches only the given paths. */
  function repoWithSecondCommitTouching(paths) {
    const dir = mkdtempSync(join(tmpdir(), 'netlify-ignore-'))
    git(['init', '-q', '-b', 'main'], dir)
    git(['config', 'user.email', 'test@example.com'], dir)
    git(['config', 'user.name', 'Test'], dir)

    // Commit 1: a source file and a doc, so both exist to be edited.
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, 'claude'), { recursive: true })
    writeFileSync(join(dir, 'src', 'main.jsx'), 'export default 1\n')
    writeFileSync(join(dir, 'claude', 'changelog.md'), '# one\n')
    writeFileSync(join(dir, 'CLAUDE.md'), '# rules\n')
    git(['add', 'src/main.jsx', 'claude/changelog.md', 'CLAUDE.md'], dir)
    git(['commit', '-qm', 'first'], dir)

    // Commit 2: only the paths under test.
    for (const p of paths) writeFileSync(join(dir, p), `changed ${p}\n`)
    git(['add', ...paths], dir)
    git(['commit', '-qm', 'second'], dir)

    return dir
  }

  it('FAULT: exits 0 — CANCEL THE BUILD — for a genuinely docs-only diff', () => {
    const dir = repoWithSecondCommitTouching(['claude/changelog.md', 'CLAUDE.md'])
    try {
      const { code, stdout } = runScript(
        { CACHED_COMMIT_REF: 'HEAD~1', COMMIT_REF: 'HEAD' },
        dir,
      )
      expect(code).toBe(0)
      expect(stdout).toMatch(/Skipping the build/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('FAULT: exits 1 — BUILD — when that same diff also touches src/', () => {
    // The injected fault is one extra path. Same repo, same refs, same script:
    // only the content of the diff differs, so a pass here cannot be an
    // accident of the harness.
    const dir = repoWithSecondCommitTouching(['claude/changelog.md', 'src/main.jsx'])
    try {
      const { code, stdout } = runScript(
        { CACHED_COMMIT_REF: 'HEAD~1', COMMIT_REF: 'HEAD' },
        dir,
      )
      expect(code).toBe(1)
      expect(stdout).toMatch(/src\/main\.jsx/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('FAULT: exits 1 — BUILD — when the refs are nonsense', () => {
    // A bad ref makes `git diff` fail. If this ever exits 0, Netlify stops
    // deploying the site and every build still reports as a success.
    const { code, stdout } = runScript({
      CACHED_COMMIT_REF: 'not-a-ref',
      COMMIT_REF: 'also-not-a-ref',
    })
    expect(code).toBe(1)
    expect(stdout).toMatch(/could not read the diff/)
  })
})
