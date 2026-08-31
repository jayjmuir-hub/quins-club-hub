// Whether a commit needs a deploy — as a gate rather than a commit-message
// convention.
//
// ⚠️ NO `#!/usr/bin/env node` LINE HERE, DELIBERATELY. This file is IMPORTED by
// tests/netlify-ignore.test.js, and on Windows git checks it out with CRLF
// endings. esbuild — which is what Vitest transforms with — strips a shebang up
// to the newline and leaves the `\r` behind, which is not a valid token. The
// whole file then fails to parse with "SyntaxError: Invalid or unexpected
// token", reported against the IMPORT LINE IN THE TEST, several files from the
// actual cause.
//
// ⚠️ AND IT IS INVISIBLE IN CI. Linux checks out LF, so GitHub Actions stays
// green while both of Jay's PCs fail — the mirror image of the usual trap, which
// is why this is written down and not merely fixed. `scripts/session-guard.mjs`
// and `scripts/docs-check.mjs` still carry shebangs and are fine ONLY because
// nothing imports them; `.gitattributes` now pins `*.mjs` to LF so that stops
// being load-bearing luck.
//
// Nothing is lost by dropping it: Netlify and npm both invoke this as
// `node scripts/…`, so the shebang was never what made it run.
//
// WHY THIS EXISTS. `CLAUDE.md` rule 3 used to say: put `[skip ci]` in the
// message of a docs-only commit, so a documentation edit does not publish a
// release. That was right about the goal and wrong about the mechanism, and on
// 10 Aug 2026 it became actively harmful:
//
//   `main` was protected the same day, with `test` and `docs-check` as REQUIRED
//   status checks. `[skip ci]` is honoured by GitHub Actions as well as by
//   Netlify — for `push` AND `pull_request` events, matching on the head
//   commit's message. So a docs-only commit written to the old rule suppressed
//   the two workflows that must report before a merge, the checks sat pending
//   forever, and the pull request could not be merged at all.
//
// ⚠️ AND THE OLD RULE WAS DOCUMENTED ON A FALSE PREMISE. The header comment in
// `.github/workflows/docs.yml` asserted that `[skip ci]` "suppresses the NETLIFY
// build (a deploy), not this workflow". It suppresses both. Nothing in the run
// history could have caught it: every `[skip ci]` commit in this repo predates
// the workflows, which were created on 10 Aug.
//
// THE FIX IS TO SPLIT THE TWO THINGS THE COMMIT MESSAGE WAS CONFLATING.
// "Run the checks" and "publish the site" are different questions and now have
// different answers. The checks always run. This file answers the other one,
// from the DIFF rather than from what someone remembered to type — the same
// move as `scripts/session-guard.mjs`: a rule that has to be remembered at
// exactly the right moment becomes a gate that cannot be forgotten.
//
// ⚠️ EXIT 0 MEANS SKIP THE BUILD. Netlify inverts the usual sense of an exit
// code for `ignore` commands: 0 cancels the build, anything else proceeds with
// it. Getting this backwards would silently stop deploying the app entirely,
// which is why `decide()` below returns an explicit `build` boolean and the
// exit code is derived from it in exactly one place.
//
// Wired up as `ignore` in `netlify.toml`. Run it by hand with the two refs set:
//   CACHED_COMMIT_REF=<sha> COMMIT_REF=<sha> node scripts/netlify-ignore.mjs

import { execSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// Paths that cannot change `dist/`, and so cannot change what a visitor sees.
//
// ⚠️ VERIFIED, NOT ASSUMED. Nothing in `src/`, `index.html` or `vite.config.js`
// imports from any of these directories — checked with a search first confirmed
// able to find imports it was known to contain, per `CLAUDE.md` rule 6.
//
// ⚠️ DELIBERATELY NARROWER THAN "everything that cannot reach dist". `tests/`,
// `scripts/` and `.github/` would also qualify on that test and are left out on
// purpose. The asymmetry is the whole argument: a needless build costs ninety
// seconds, while a skipped build that was needed leaves the live site quietly
// disagreeing with `main` — and this list is the only thing standing between
// those two outcomes. It covers the case the old rule covered and stops there.
//
// ⚠️ `netlify.toml` ITSELF MUST NEVER BE ON THIS LIST. The redirects — including
// the `/calendar.ics` proxy — and the security headers are read from the
// deploy, so a change to that file only takes effect by deploying it.
const DEPLOY_IRRELEVANT = [
  /^claude\//, // session records, decisions, plans, runbooks
  /^docs\//,
  /^db\//, // schema captures and migrations; applied to Supabase, never bundled
  /^[^/]+\.md$/, // CLAUDE.md, RESTORE.md, README.md, AGENTS.md — root markdown only
  /^\.cursor\//, // Cursor rules, MCP, Cloud Agent environment — cannot reach dist/
  /^\.claude\//, // Claude Code skills, hooks, settings — steers sessions, never the build
]

/** True when this path cannot possibly change the built site. */
export function isDeployIrrelevant(path) {
  return DEPLOY_IRRELEVANT.some((re) => re.test(path))
}

/**
 * The decision, as a pure function so it can be tested without a git repo or a
 * Netlify environment.
 *
 * ⚠️ EVERY UNCERTAIN CASE BUILDS. `changed: null` means "the diff could not be
 * taken" and must never be read as "nothing changed" — that mistake would turn
 * a broken git invocation into a site that silently stops updating.
 */
export function decide({ cached, commit, changed }) {
  if (!cached) {
    return { build: true, reason: 'no cached commit to compare against — first build, or the cache was cleared' }
  }
  if (cached === commit) {
    // A retry or a manual "clear cache and deploy". Somebody asked for this
    // build explicitly; do not out-think them.
    return { build: true, reason: 'this commit is the one already built — a retry or a manual redeploy' }
  }
  if (changed === null) {
    return { build: true, reason: 'could not read the diff, so the safe answer is to build' }
  }
  if (changed.length === 0) {
    // Two different refs with no files between them. Unexplained, so it does
    // not get the benefit of the doubt.
    return { build: true, reason: 'the refs differ but no files do, which is unexplained' }
  }

  const relevant = changed.filter((p) => !isDeployIrrelevant(p))
  if (relevant.length === 0) {
    return {
      build: false,
      reason: `${changed.length} file(s) changed and none can reach the built site`,
    }
  }
  return {
    build: true,
    reason: `${relevant.length} of ${changed.length} changed file(s) can affect the build, starting with ${relevant[0]}`,
  }
}

/** The changed paths between two refs, or null if the diff could not be taken. */
export function changedPaths(cached, commit, run = execSync) {
  try {
    const out = run(`git diff --name-only ${cached} ${commit}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return out.split('\n').map((l) => l.trim()).filter(Boolean)
  } catch {
    return null
  }
}

function main() {
  const cached = process.env.CACHED_COMMIT_REF
  const commit = process.env.COMMIT_REF
  const changed = cached && commit ? changedPaths(cached, commit) : null
  const { build, reason } = decide({ cached, commit, changed })

  process.stdout.write(`${build ? 'Building' : 'Skipping the build'}: ${reason}\n`)
  // The single place the inversion happens. 0 skips, non-zero builds.
  process.exit(build ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
