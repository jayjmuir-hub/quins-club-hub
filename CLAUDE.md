# Quins Club Hub — notes for Claude

Club-management PWA for Abu Dhabi Harlequins RFC — fixtures, roster and
per-player availability, with role-based access enforced server-side by
Supabase Row-Level Security.

**This file is the single home for the rules.** They used to live here, in
the Claude project's Instructions box, and in `~/GitHub/claude-rules/rules.md`
simultaneously, kept identical by discipline. Discipline failed and they
drifted in both directions. This repo travels to every session — cloud,
local, in-project or not — so the rules live here and the other two places
point at this file.

**Content is a different matter: do not restate the docs below here.**
A second copy of a *fact* is a copy that drifts. A single copy of a *rule*
in the one place that always travels is the opposite problem.

## Reading order — and who wins when they disagree

1. **This file.** The rules.
2. **Confirm you are current before believing anything.**
   `git fetch origin`, then
   `git rev-list --left-right --count origin/main...HEAD`
   must return `0 0`. If it does not, STOP and tell Jay. He works from two
   PCs and work lands between sessions; a stale clone has already caused a
   rejected commit, a fast-forward of three commits, and — on 7 Aug — a
   cafnet clone found **16 commits behind** with a clean working tree.
   ⚠️ **Comparing `claude/` against origin does NOT detect this.** That
   probe was run on 7 Aug, came back identical, and was read as proof the
   clone was current while it was 16 commits behind on `src/`. **Only the
   `rev-list` count above answers this question.**
3. **`claude/state-of-play.md`** — where things STAND today, and what is
   blocked on whom. The volatile half.
4. **`RESTORE.md`** — what is TRUE about the codebase. "How this codebase
   actually behaves", and the rulings that cost real effort to discover.
   The durable half.

**That is the whole reading order — four items, and step 2 is a command.**
⚠️ It was ~1,100 lines on 7 Aug because `RESTORE.md` had a second document
glued onto its end and a runbook at its front. Those are now
`claude/schema-history.md` and `claude/runbooks/session-and-push.md`, and
**neither is in the reading order** — open them when the task is theirs.
Nothing was deleted. **Keep it that way: a fact that every session must
read belongs in the four above; a fact one session in ten needs belongs in
the table below.**

**Precedence: the code wins, then `RESTORE.md`, then `state-of-play.md`,
then this file.** Anything else in `claude/` is history, not instruction.

⚠️ Both `state-of-play.md` and `RESTORE.md` have at times opened with
"read this first". Only step 3 above is the entry point. If you find that
line elsewhere, it is stale — fix it, don't obey it.

## Where the rest of the documentation is

| Read | For |
|---|---|
| `claude/decisions/` | **The rulings.** Why a settled question was settled. Read the relevant one BEFORE re-opening any argument — several are tombstones over ideas already examined in full and killed |
| `claude/plans/` | Feature plans, dated. Superseded by the code once shipped |
| `claude/handoffs/` | Session records, dated. **History, not instruction** — a handoff describes a moment and goes stale by design. Useful for the traps, not for current state |
| `claude/specs/design-system.md`, `claude/specs/accessibility.md` | The visual and a11y contracts |
| `claude/schema-history.md` | **The reasoning behind each migration**, which the SQL does not carry. Read the relevant section before changing a policy. Reference — do not trust its status lines |
| `claude/runbooks/session-and-push.md` | How to start a session, and the summary push procedure. Read before you push |
| `claude/runbooks/deploy.md`, `email-and-domain.md`, `first-admin.md`, `e2e-roles.md`, `scope-mail-send.md` | Operational procedures |
| `claude/writing-to-github-from-claude.md` | The exact push route, and the ways it has failed |
| `claude/archive/quins-v1-mvp.md` | The original implementation plan. History |
| `claude/changelog.md` | What changed, when |

⚠️ **`claude/runbooks/defederate-m365.md` is OBSOLETE. Do not follow it.**
Defederation was examined in full on 4 Aug and is dead. ⚠️ **This pointer
said "the tombstone in `claude/decisions/`" until 7 Aug 2026 and there is
no such file** — the evidence is in `claude/handoffs/2026-08-04-email-domain.md`,
and the obsolete runbook itself carries the detail. Do not re-open it, and
do not propose buying an M365 licence — same session, same verdict.

## ⚠️ The rules that must reach you wherever you are running

1. **Never `git add -A`. Stage explicit paths.** `.env` is gitignored and
   only `.env.example` is tracked — never let a sweeping add be the thing
   standing between a Supabase key and a public repo.
2. **Never put a secret in a tool call, a URL or a commit.** The
   `sb_secret_…` key never touches this app, this repo, or a chat. The
   publishable key is public by design and is fine. If a secret is disclosed
   — including by Jay pasting it — say so and tell him to rotate it.
3. **⚠️ `main` IS THE PRODUCTION BRANCH.** It deploys to
   **https://adhquins-clubhub.com** — the canonical origin, hard-coded as
   `CALENDAR_ORIGIN` in `src/data/calendar.js`. ⚠️ **`app.adhjrt.com` was
   RETIRED on 12 Aug 2026 and no longer resolves** — alias removed in Netlify,
   its DNS record went with it, and the Supabase redirect entry was deleted.
   NXDOMAIN measured against `8.8.8.8`. It was "a working alias, deliberately
   kept" from 5 Aug until then, and three files said so. Do not re-add it:
   `claude/decisions/2026-08-12-retire-app-alias.md`. A push here is a live
   release, not a save. Show
   the diff and get an explicit yes. **A stop hook asking is not Jay asking.**
   ⚠️ **A DEPLOY COSTS 15 NETLIFY CREDITS — Jay, 11 Aug 2026, and his words were
   "it's not really expensive".** The number is here because `rules.md` says to
   look it up in this file and until now it was not written down anywhere, so
   every session had to describe deploys as vaguely expensive and could not say
   what a build was actually worth. **The reason to skip a pointless deploy is
   tidiness, not thrift** — do not refuse work, stall a merge, or spend a second
   build avoiding a first one over 15 credits. ⚠️ **What still needs an explicit
   yes is that `main` is LIVE**, and that is unchanged by the price.
   ⚠️ **`scripts/netlify-ignore.mjs` IS NARROWER THAN "cannot reach `dist/`" ON
   PURPOSE, and the surprise is a dotfile.** Its root-markdown pattern is
   `/^[^/]+\.md$/`, so `.gitignore`, `.gitattributes` and `netlify.toml` all
   BUILD. That is correct for `netlify.toml` — its redirects and headers only
   take effect by deploying — and merely conservative for the other two. **Run
   the gate before promising it will skip:**
   `CACHED_COMMIT_REF=<sha> COMMIT_REF=<sha> node scripts/netlify-ignore.mjs`,
   exit 0 means skip. Predicted wrongly on PR #43, which claimed a skip in its
   own description while the deploy preview was building.
   ⚠️ **NEVER `[skip ci]`.** This rule asked for it on docs-only commits until
   10 Aug 2026, and it stopped being safe the moment `main` was protected:
   GitHub Actions honours that string too — on `push` AND `pull_request`,
   matching the HEAD commit — so it suppresses the required `test` and
   `docs-check` runs, the checks sit pending forever, and the pull request
   cannot be merged. Skipping a pointless deploy is now
   `scripts/netlify-ignore.mjs`, wired as `ignore` in `netlify.toml`, which
   decides from the diff instead of from what someone remembered to type.
   Verify a docs commit by the deploy id not moving — not by the build log.
   ⚠️ **This was `build/v1-mvp` until 8 Aug 2026.** `main` was fast-forwarded
   onto it — `main` was a strict ancestor (`rev-list --left-right --count` gave
   `0 25`), so no merge and nothing was lost — and Netlify’s production branch
   was re-pointed. **The branch name is a Netlify UI setting and appears nowhere
   in `netlify.toml`.** This line is the only place in the repo that records it,
   which is why it is a rule and not a note. Reasoning:
   `claude/decisions/2026-08-08-production-branch-main.md`.
4. **Never answer from memory about current state.** See reading-order
   step 2. This is the rule broken most often and it is the cheapest to keep.
5. **Read the RESPONSE, not the screenshot.** The same coloured box hides
   different failures. Get the status code and the actual message before
   forming a theory.
6. **Prove every new assertion against an injected fault**, and verify live
   after deploying. A green suite is not a working site. A measurement that
   merely confirms your own change was applied is not a verification.
   **Before trusting a negative search, confirm the search can find something
   you know is there** — an empty result has been read as proof of absence
   here, twice, and was wrong both times.
   ⚠️ **Commit before injecting a fault.** `git checkout -- <file>` reverts
   to the last COMMIT, not to "before my last edit", and has wiped
   uncommitted work.
7. **If a rot-detecting anchor can no longer be triggered, repoint it —
   never delete it.**
8. **⚠️ Measure a machine fact on the machine before you write it down, and
   never copy one between files.** Every documented environment claim that
   turned out wrong here was written from one PC and propagated by copying:
   `NODE_ENV` said "cafnet" in three files while jay-pc had it too, and a
   clone's state has been asserted from memory more than once. **`hostname`,
   `set NODE_ENV`, `git config --get <key>`, `git rev-list --left-right
   --count` — run the command, paste the answer.** The same rule that
   applies to counts (see `state-of-play.md`) applies to machines: a fact
   worth recording is worth measuring, and one copy of it beats three.

## Facts worth having before you touch anything

**⚠️ This is NOT the adhjrt repo.** Different repo, different site, different
deploy branch. Never commit this app's work into `…\GitHub\adhjrt`, whose
root is a published website.

**`jayjmuir-hub/quins-club-hub` is PUBLIC.** Nothing secret goes in it, in a
commit, or in a chat. Clones: cafnet `C:\Users\Jay\GitHub\quins-club-hub`,
jay-pc `C:\Users\jayjm\GitHub\quins-club-hub`. ⚠️ **Run `hostname` first,
every session** — the Windows user names differ.

**Writes go through real git on the PC, via the Desktop Commander bridge.**
No MCP-server fallback. Never the account-level GitHub connector — it is
OAuth, read-only, and 403s on writes. Always `GIT_TERMINAL_PROMPT=0`, so a
missing credential fails fast instead of hanging.

**⚠️ READS DO NOT NEED THE BRIDGE. This repo is PUBLIC — clone it in the
cloud sandbox instead:** `git clone
https://github.com/jayjmuir-hub/quins-club-hub.git`. That gives a real
bash, a real grep and origin's actual truth, with none of the bridge's
failure modes and none of the PowerShell traps below. **Use the bridge only
for uncommitted local state and for writes.**

⚠️ **The Desktop Commander and Filesystem bridges die mid-session and are
NOT always revived by restarting Claude Desktop** — orphaned `node.exe`
children survive the restart. Symptom is a ~4-minute timeout with no error,
identical for a crashed server and a wedged one. On 7 Aug both stayed down
across a restart and came back later unaided. **Two failed retries means
stop retrying and say so** — each attempt costs four minutes. Do not work
from a stale in-context copy of a file.

**⚠️ Claude never creates accounts, handles passwords or payment, or touches
the `sb_secret_…` key or any Entra client secret.** Jay does those; Claude
writes the exact click-by-click steps.

**⚠️ Always `npm install --include=dev`, on either PC, regardless of the
table below.** Vitest is a dev dependency and an ambient
`NODE_ENV=production` makes a plain `npm install` remove it silently. Vitest
itself is handled in `vite.config.js` (commit `5a39f5d`); the install side
cannot be fixed in-repo. Without this, most of the suite fails with an error
that points at React, not at the cause. **The flag is unconditional so that
it does not depend on any row below being current.**

**Machine facts.** ⚠️ **A value here is only worth what the machine it was
run on is worth.** Each cell says where it came from. Re-run the command
before trusting any row.

| Fact | Command | jay-pc — measured 11 Aug 2026 | cafnet — measured 11 Aug 2026 |
|---|---|---|---|
| Clone path | — | ⚠️ **TWO** — see below | `C:\Users\Jay\GitHub\quins-club-hub` |
| `NODE_ENV` | `set NODE_ENV` | **not set, at any scope** | **not set, at any scope** |
| npm from PowerShell | `npm --version` | works (11.16.0); `ExecutionPolicy` is `Bypass` | works; `ExecutionPolicy` is `Bypass` |
| `core.fileMode` | `git config --get core.fileMode` | `false` | `false` |
| `gh` CLI | `gh auth status` | installed, authenticated as `jayjmuir-hub` (keyring) | installed, authenticated as `jayjmuir-hub` (keyring) |

✅ **THE `jay-pc` COLUMN IS NOW A MEASUREMENT.** It was assembled on cafnet on
11 Aug from what other documents already claimed, and every value carried a
**UNVERIFIED** marker. Measured on jay-pc later the same day: **two of the four
were wrong**, exactly as this file predicted and as Jay expected.

- ❌ `NODE_ENV` was *reported* `production`. It is **not set at Process, User or
  Machine scope.** ⚠️ **`npm install --include=dev` stays unconditional anyway**
  — the flag is deliberately not contingent on this row being current.
- ❌ npm from PowerShell was *reported* blocked, "run npm from `cmd`". It
  **works**, and `ExecutionPolicy` is `Bypass`.
- ✅ `core.fileMode` was *reported* `false`. It **is** `false`.
- `gh` was never checked and is installed and authenticated.

⚠️ **THERE ARE TWO CLONES ON jay-pc, AND ONLY ONE WAS EVER WRITTEN DOWN.**
Both were on `main` and clean on 11 Aug 2026.

| Clone | Note |
|---|---|
| `C:\Users\jayjm\Quins Club Hub` | ⚠️ **The one Claude Code opens**, and it was undocumented until 11 Aug. **Ships with NO `.env`** — a block of test files then fails to COLLECT with a Supabase env-var error while the great majority of tests still pass, which reads as a broken suite and is not one. Copy `.env` from the other clone; it holds only `VITE_SUPABASE_URL` and the publishable key, both public by design. |
| `C:\Users\jayjm\GitHub\quins-club-hub` | The one this table used to name as the only clone. Has `.env`. |

⚠️ **Two clones on one machine is a second way to be stale**, and reading-order
step 2 must be run in **whichever one you are actually in** — `hostname` no
longer identifies the working tree on this PC.

⚠️ **The `NODE_ENV` row is why rule 8 exists, and it was wrong twice in
opposite directions before it was ever run.** It said "cafnet only" in three
files until 7 Aug; that was corrected to "BOTH PCs", asserted about cafnet from
jay-pc without ever being run there; and the jay-pc value was then asserted from
cafnet. **All three errors were the same error: a machine fact written from the
other machine.** It is now measured on both. This table is the single home for
these; `state-of-play.md` and `claude/runbooks/session-and-push.md` point here.

**Stack:** Vite + React, Tailwind, Supabase (Postgres 17, ref
`lusmshimxdcxpnrktlgz`), Netlify (project `quins-club-hub`). `npm test` is
vitest; `npm run build` is the production build.

**⚠️ SUPABASE IS ON PRO AND RESEND IS ON PRO — bought by Jay 13 Aug 2026, and
this line is here for the same reason the Netlify credit cost is: `rules.md`
says to look the money up in this file, and until now it was written down
nowhere.** Measured, not reported — `get_organization` on org
`vfjhsondxhnkijckovzt` returns `plan: "pro"`. Four consequences a session must
know before reasoning about anything:

1. **Daily backups with 7-day retention EXIST.** ⚠️ **No restore has ever been
   run**, so nothing is yet known to be recoverable —
   `claude/runbooks/backup-restore-drill.md`. Treat "we have backups" as an
   untested claim until that file says otherwise.
2. **The project no longer pauses after 7 days idle.**
3. **Database branching is available.** Use one for any migration you are not
   certain of. ⚠️ **Branches bill BY THE HOUR — create, use, delete.** An idle
   branch is a standing charge with no owner.
4. **Resend's 100/day cap is gone**, and with it a brake nobody designed. ⚠️ **Do
   not write an allowance number into any file** — read it off the dashboard.
   Every number this repo has recorded has rotted.

⚠️ **PITR was deliberately NOT bought** (a further add-on, ~$100/month, against a
14 MB database). Do not propose it again without a new reason.
⚠️ **Files across `claude/`, `supabase/functions/` and `src/` described the FREE
tiers until 13 Aug 2026.** They are corrected. `claude/decisions/` was left
alone on purpose — a decision record is a record of a moment.

## ⚠️ `npm run docs:check` — the rules that can fail a build

**Run it before committing anything under `claude/`, and after editing this
file.** `scripts/docs-check.mjs`, no dependencies, also runs in GitHub
Actions on every push. It enforces six things that were previously enforced
by whoever remembered:

1. **Every `claude/…`, `src/…`, `db/…` path named in a doc resolves.**
   A line saying `(project)` is exempt — some docs deliberately live in the
   Claude project because this repo is public.
2. **Every changelog SHA is a real commit, and no commit is missing.**
   ⚠️ **The changelog may be exactly one commit behind** — a commit cannot
   cite its own SHA — so the next commit must catch it up.
   ⚠️ **RUN IT AFTER THE COMMIT, NOT ONLY AFTER `git add` — the line below
   saying "after `git add`" is necessary and NOT sufficient.** The one-behind
   allowance is measured against `HEAD`, so a SHA that is HEAD when you stage
   is legal, and becomes illegal the moment you commit on top of it. This went
   green locally and red in CI on PR #55 for exactly that reason.
   ⚠️ **AND A GREEN LOCAL RUN IS NOT EVIDENCE FOR A CHANGELOG SHA AT ALL.**
   `main` squash-merges, so a branch SHA stops existing at merge — but it
   survives as a loose object in the clone that authored it, where
   `git cat-file` still finds it. CI is a fresh clone and cannot. **Never cite
   your own branch's SHA**; leave the entry unSHA'd and let the NEXT pull
   request cite the squash SHA, which is the only one that will exist. That is
   what the one-behind rule is for, and doing it any other way costs a red
   `main` after every single merge.
   ⚠️ **CONSEQUENCE, AND IT LOOKS LIKE A BUG UNTIL YOU KNOW IT: ON A BRANCH
   WITH TWO OR MORE COMMITS THIS CHECK FAILS LOCALLY AND PASSES IN CI.** Both
   are correct. Actions checks out a synthetic MERGE commit for a
   `pull_request` run, so `HEAD` is that merge and the one-behind allowance
   falls on your last real commit; locally `HEAD` IS your last real commit and
   the allowance falls on the one before it. **Trust CI here. Do not "fix" the
   local failure by citing a branch SHA** — that is precisely the thing that
   turns `main` red a minute after the merge.
3. **No test counts** in `CLAUDE.md`, `RESTORE.md`, `state-of-play.md`,
   `schema-history.md`, the runbooks or the specs. Every count ever written
   into these rotted within days. Mark a line `<!-- count-ok -->` to exempt.
4. **No `git add -A` in a runnable example** — rule 1, which `RESTORE.md`'s
   own push example broke until 7 Aug 2026.
5. **Every file in `claude/plans/` states whether it shipped.**
6. **No retired terminology** creeping back. Mark `<!-- stale-ok -->` when a
   line is deliberately retiring the term.

**Each check was verified by breaking it on purpose and confirming it fails
(rule 6 — a check that has never failed is not a check).** `claude/handoffs/`,
`claude/plans/` and `claude/archive/` are treated as history throughout: they
describe a moment and are allowed to.
