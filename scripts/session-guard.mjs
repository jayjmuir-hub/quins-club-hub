#!/usr/bin/env node
// The clone check, as a gate rather than a rule.
//
// WHY THIS EXISTS. `CLAUDE.md` reading-order step 2 says: confirm you are
// current before believing anything, with
// `git rev-list --left-right --count origin/main...HEAD`. It is the single most
// useful rule in this repo and it keeps being skipped — not defied, skipped,
// because a rule in prose has to be remembered at exactly the right moment and
// that fails a few percent of the time. At this project's rate of work a few
// percent is roughly one incident a week:
//
//   7 Aug   a clone found 16 commits behind with a clean working tree
//   9 Aug   a session on a local branch named `feat/password-auth` at main's
//           tip; `rev-list` returned `0 0` because it compares SHAs, not names
//   9 Aug   a shallow clone read as "every other branch was deleted"
//   10 Aug  a THIRD clone appeared in the home directory, shallow, and the next
//           session adopted it
//
// Every one of those already had a written warning against it. Compare with
// what stopped happening the moment `main` was protected: pushing to the wrong
// branch, force-pushing over work, merging without tests. Those became
// structural. This file is the same move for the clone.
//
// ⚠️ IT NEVER BLOCKS, AND THAT IS DELIBERATE. A SessionStart hook that refuses
// to start is one flaky network call away from making the repo unusable on a
// train. Blocking would also punish the honest case — a first clone, an offline
// afternoon — while the thing being guarded against is a silent wrong belief.
// So it always exits 0 and speaks loudly instead: the point is that a session
// cannot BEGIN without being told, which is the part prose could not manage.
//
// Run it by hand any time: `node scripts/session-guard.mjs`

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Returns trimmed stdout, or null if the command failed for any reason. */
function git(args) {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const gitDir = git('rev-parse --git-dir')
// Not a git repo, or git is unavailable. Nothing to say; say nothing.
if (!gitDir) process.exit(0)

const problems = []
const notes = []

// ── 1. Shallow ────────────────────────────────────────────────────────────
// ⚠️ THE LOCAL CHECK, AND THE ONE WITH NO FALSE POSITIVES. A shallow clone
// lies in three directions at once, all of them silently:
//   - `--depth` implies `--single-branch`, so `git branch -r` shows one branch
//     and reads as "the others were deleted";
//   - `--force-with-lease` cannot verify a ref it never fetched, so it refuses
//     a push that is perfectly safe;
//   - scripts/docs-check.mjs SKIPS its changelog-coverage check outright,
//     saying so on stderr where nobody looks.
// A shallow clone is fine to throw away and wrong to work in.
if (existsSync(join(gitDir, 'shallow'))) {
  problems.push(
    'This clone is SHALLOW (`.git/shallow` exists). `git branch -r` will show only ' +
      'one branch and read as though the others were deleted, `--force-with-lease` ' +
      'will refuse safe pushes, and `scripts/docs-check.mjs` silently SKIPS its ' +
      'changelog-coverage check. Work in a full clone instead — see the Machines ' +
      'section of claude/state-of-play.md.',
  )
}

// ── 2. Behind origin/main ─────────────────────────────────────────────────
// Needs the network, so a failure here is not evidence of anything. Fetch
// quietly and treat "could not" as "unknown", never as "fine".
const fetched = git('fetch origin --quiet') !== null
const counts = git('rev-list --left-right --count origin/main...HEAD')

if (!fetched) {
  notes.push('Could not reach origin, so the freshness check below may be stale.')
}

if (counts) {
  const [behind, ahead] = counts.split(/\s+/).map(Number)
  if (behind > 0) {
    problems.push(
      `This clone is ${behind} commit(s) BEHIND origin/main` +
        (ahead > 0 ? ` and ${ahead} ahead` : '') +
        '. Run `git pull --ff-only` before believing anything you read here. ' +
        'CLAUDE.md reading-order step 2 exists because a stale clone with a ' +
        'clean working tree looks exactly like a current one.',
    )
  }
} else {
  notes.push('Could not compare against origin/main — is the remote configured?')
}

// ── Output ────────────────────────────────────────────────────────────────
// Silence when there is nothing wrong. A guard that speaks on every start is a
// guard people stop reading, which is how the prose version failed.
if (problems.length === 0 && notes.length === 0) process.exit(0)

const lines = [...problems, ...notes]
const headline =
  problems.length > 0
    ? `⚠️ Clone check: ${problems.length} problem(s) — see below before doing any work.`
    : '⚠️ Clone check: could not fully verify this clone.'

process.stdout.write(
  JSON.stringify({
    systemMessage: [headline, ...lines.map((l) => `  • ${l}`)].join('\n'),
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: [
        'CLONE CHECK (scripts/session-guard.mjs, run automatically at session start):',
        ...lines.map((l) => `- ${l}`),
        problems.length > 0
          ? 'Resolve this before reading or changing anything. Do not treat the ' +
            'working tree or the docs as current until it is fixed.'
          : 'Treat the freshness of this clone as unverified.',
      ].join('\n'),
    },
  }),
)
process.exit(0)
