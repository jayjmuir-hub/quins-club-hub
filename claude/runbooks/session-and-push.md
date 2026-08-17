# Runbook — start a session, and push a change

**Procedure, not truth.** Moved out of `RESTORE.md` on 7 Aug 2026: that file is for
how the codebase behaves, and this is a sequence of commands. Not in the reading
order — read it when you are about to start or about to push.

⚠️ **The full push procedure, with every failure mode that has actually bitten, is
`claude/writing-to-github-from-claude.md`.** This is the summary.

---

## Start a session (cloud sandbox, no PC needed)

```bash
git clone https://github.com/jayjmuir-hub/quins-club-hub.git
cd quins-club-hub
npm install    # main is the default branch and the production branch
```

The repo is public and read-only-cloneable from anywhere, so a Cowork cloud session
can bootstrap itself with no device bridge, no connector and no file transfer.

Then create `.env` in the repo root. **It is gitignored by design and is the only
thing a clone does not give you:**

```
VITE_SUPABASE_URL=https://lusmshimxdcxpnrktlgz.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key from Supabase → Settings → API>
```

That key is the `sb_publishable_…` one — public by design, safe in the frontend.
Never put the `sb_secret_…` key in this repo or in a chat.

Verify:

```bash
npm test        # unit tests, no network
npm run build   # expect clean
```

⚠️ **No expected test count here on purpose.** This file carried "expect 900 passing"
for days after it stopped being true. Counts live in `claude/state-of-play.md`, and
that file declines to carry one either — run the suite if you need the number.

---

## Pushing changes back

**Full procedure, with the failure modes that have actually bitten:
`claude/writing-to-github-from-claude.md`.** Summary below.

**The cloud sandbox has no GitHub credentials and must not be given any.** Pushes go
through a PC.

On either PC (`jay-pc` or `cafnet`), git is already authenticated — a classic PAT for
`jayjmuir-hub` (scopes `gist, repo, workflow`) lives in Windows Credential Manager, and
`credential.helper=manager` is set in the system config. A session can drive it through
Desktop Commander without ever handling the token:

```bash
cd C:\Users\<you>\GitHub\quins-club-hub
git pull --ff-only origin main
# ...apply changes...

# ⚠️ STAGE EXPLICIT PATHS. Never `git add -A` — CLAUDE.md rule 1. `.env` is
# gitignored, but a sweeping add is the only thing that would ever put a
# Supabase key in a public repo. This example said `git add -A` until 7 Aug 2026.
git add path/to/file another/path
git commit -m "..."
git push origin main
```
⚠️ **`gh pr merge --auto` DOES NOT WORK ON THIS REPO — measured 15 Aug 2026.**
It fails with `GraphQL: Auto merge is not allowed for this repository
(enablePullRequestAutoMerge)`; auto-merge is a repository setting and it is off.
The trap is that the command **appears to succeed when the checks are already
green** — `gh` merges immediately and prints nothing, which is what happened on
PR #136 and read as proof that `--auto` worked. Ten minutes later the identical
command on PR #137 errored, because `test` was still running.

**So: wait for the checks, then merge plainly.**
```bash
gh pr view <n> --json mergeStateStatus,statusCheckRollup   --jq '{mergeStateStatus,checks:[.statusCheckRollup[]|select(.name!=null)|{name,conclusion}]}'
# mergeStateStatus CLEAN and `test` SUCCESS, then:
gh pr merge <n> --squash
```
`BLOCKED` with an empty `test` conclusion means the run is still going, not that
something is wrong. ⚠️ **`main` is the production branch, so a merge is a live
release** — CLAUDE.md rule 3 still applies and Jay's explicit yes comes first.

### ⚠️ Merging a Dependabot pull request takes two extra steps, always

**Every Dependabot pull request in this repo is red on `docs-check`, and it is
never about the dependency.** The bot writes no changelog entry, and its branch
was cut from whatever `main` was at the time — so the check correctly reports a
commit missing from the changelog. Measured 17 Aug 2026: #198's *only* failure
was `commit missing from changelog: 31b9ed5`, while `test` passed. **Do not read
a red Dependabot pull request as a broken dependency.** Read the `test` line.

So, for each one worth taking:

```bash
git fetch origin dependabot/<branch>
git checkout -B dependabot/<branch> FETCH_HEAD
git rebase origin/main          # its branch can be 25 commits behind
npm install --include=dev       # the lock file changed; install it
npm run build && npm test       # a matcher or build-tool major can pass vacuously
# ...add the changelog entry, citing the previous squash SHA...
git push --force-with-lease
```

⚠️ **A green suite is weaker evidence than usual for a MATCHER major**, because a
matcher that loosened rather than vanished passes silently — a removed one throws
`is not a function` and the suite catches it. Break one on purpose: under jest-dom
7, `toHaveStyle` was fed a wrong value and both tests using it failed, which is
what makes the green run mean something.

### ⚠️ Two ways opening a pull request fails that look like your mistake

Both met on 17 Aug 2026 while opening #222, and neither is a bad command.

1. **`gh pr create` and `gh pr merge` go through GitHub's GraphQL API, and GitHub
   can 503 on WRITES while READS stay green.** For about fifteen minutes every
   `gh pr list` and every `gh api …/pulls/<n>` answered normally while every
   create returned *"No server is currently available to service your request"*.
   **A read that works is not evidence that a write will.** The way through is the
   REST endpoint, which is a different service:
   `gh api repos/jayjmuir-hub/quins-club-hub/pulls --method POST --input pr.json`.
   ⚠️ **`git push` IS UNAFFECTED** — that is the git protocol, not the API — so the
   branch can be safely on the remote while no pull request can be opened for it.
   Retry the create rather than rewriting it.
2. **⚠️ NEVER BUILD THE BODY INSIDE A DOUBLE-QUOTED SHELL STRING.** Every
   `` `word` `` in it is command substitution, so the shell RUNS the backticked
   tokens and drops them: the comment closing #221 posted with three holes where
   `571f70d`, `docs:check` and `main` had been, and had to be corrected with a
   PATCH afterwards. Nothing warns you — the API accepts the mangled text happily.
   **Every body in this repo is dense with backticks**, so this is the normal case
   and not an edge one. Write it with a **quoted** heredoc and hand over a file:

```bash
cat > body.md <<'EOF'
Body text with `backticks` and $dollars, taken literally.
EOF
python -c "import json;json.dump({'body':open('body.md',encoding='utf-8').read()},open('pr.json','w',encoding='utf-8'))"
gh api repos/jayjmuir-hub/quins-club-hub/pulls --method POST --input pr.json --jq .html_url
```

⚠️ **`gh pr merge --delete-branch` PRINTS A `fatal:` AND STILL MERGES, IN A
WORKTREE.** It reported ``failed to run git: fatal: 'main' is already used by
worktree at 'C:/Users/jayjm/Quins Club Hub'`` — that is its attempt to check
`main` out locally AFTER the merge, which another worktree already holds. The
merge and the remote branch delete had both happened. **Check
`gh api …/pulls/<n> --jq .merged` before treating it as a failure and retrying**,
or the retry is what causes the real problem.

**Do not rely on the Claude GitHub *connector*.** It returned `Bad credentials` across
multiple sessions and is a different credential from the PC's git. The PC route above is
the reliable one.

**Two PCs use this project — `jay-pc` (user `jayjm`) and `cafnet` (user `Jay`).** Always
`git pull` before starting work on either. GitHub is what keeps them in sync; nothing else
does. **Run `hostname` first** — the bridge flaps and has silently reconnected to the
*other* machine mid-session. ⚠️ **The clone paths and the rest of the machine rules are in
`CLAUDE.md`, which is the single home for them — this line is a reminder, not a copy.**
Which clone is currently behind is in `claude/state-of-play.md`.

⚠️ **`npm install --include=dev` on BOTH PCs, always** — vitest is a dev dependency and
a plain `npm install` can drop it silently. **The explanation, and the measured
per-machine table, are in `CLAUDE.md`, which is their single home.** The command is
repeated here and nothing else is, because getting it wrong costs a confusing hour and
this is the file you are reading when you install.

⚠️ **Do not restate the `NODE_ENV` value here.** This section said "cafnet only" until
7 Aug 2026, in three files at once; it was then corrected to "both PCs", and on 11 Aug
that was measured on cafnet and found false too. **Both times the fact was copied
rather than run.** The flag above is unconditional precisely so this file never needs
to know. See `CLAUDE.md` rule 8.

The second half of the same trap is already handled in-repo: `vite.config.js` forces
`NODE_ENV=test` when `VITEST` is set, so `npm test` no longer resolves React's
production build and fails with `act(...) is not supported`. **Don't remove that
guard.** `npm run build` deliberately still sees the real `NODE_ENV`.

#### Getting code from a cloud sandbox onto a PC — do NOT relay bytes by hand

This cost most of a session on 4 Aug 2026 and nearly lost the work. **Never pass file
content (especially base64) through the model's output to reconstruct it on the other
side.** Two attempts corrupted silently — 43,296 bytes expected, 42,718 written, ~578
dropped mid-stream with no error anywhere. It was caught only by an MD5 check that was
almost skipped. Google Drive's `create_file` has the same shape and the same risk.

The route that works, when the bridge cannot move a file directly:

1. In the sandbox: `git bundle create <file> <base>..<branch>` — a *thin* bundle, ~48 KB
   for a two-commit feature rather than 1.9 MB for full history.
2. Upload to a temp file host. `litterbox.catbox.moe` (72h expiry) worked from the sandbox;
   `tmpfiles.org` works but expires in ~60 min and needs a fake `.zip` extension; `0x0.st`
   and catbox proper both rejected sandbox uploads.
3. **Download it back into the sandbox and verify it is byte-identical before handing the
   URL to the PC.** This is the step that turns "probably fine" into "verified".
4. On the PC: `curl -L -o`, then `certutil -hashfile <file> MD5` against the reference
   hash, then `git bundle verify`, then `git pull ..\<file> <branch>`, then `git push`.

Windows gotchas seen doing this: a first `curl` with `-s` looked like a silent failure when
the host was just slow — re-run verbosely before concluding anything; and
`interact_with_process` errors if the process already exited, so start a fresh command
rather than trying to read from a dead one.

**Commit and push durable work in the session that produces it.** The sandbox, chat
attachments and temp links all expire. GitHub is the only thing that survives, and no other
session can see work that never reached it.

**Every Cowork/Claude session — not just the two PCs — runs in its own throwaway cloud
sandbox, separate from every other session.** GitHub is the *only* thing connecting any of
them. Anything written but not committed exists only in that one session's sandbox and is
gone the moment the session ends — this already happened once (see the "Prior art note" in
`claude/specs/2026-08-03-club-overview-dashboard-design.md`: a real planning doc,
`desktop-spec.md`, was written in a different session, referenced by several commit messages,
and never committed — now unrecoverable). **The fix: commit and push anything durable —
specs, plans, docs, not just code — before a session ends, regardless of which PC or session
started it.**
