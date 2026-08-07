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
git checkout build/v1-mvp
npm install
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
git pull --ff-only origin build/v1-mvp
# ...apply changes...

# ⚠️ STAGE EXPLICIT PATHS. Never `git add -A` — CLAUDE.md rule 1. `.env` is
# gitignored, but a sweeping add is the only thing that would ever put a
# Supabase key in a public repo. This example said `git add -A` until 7 Aug 2026.
git add path/to/file another/path
git commit -m "..."
git push origin build/v1-mvp
```
**Do not rely on the Claude GitHub *connector*.** It returned `Bad credentials` across
multiple sessions and is a different credential from the PC's git. The PC route above is
the reliable one.

**Two PCs use this project — `jay-pc` (user `jayjm`) and `cafnet` (user `Jay`).** Always
`git pull` before starting work on either. GitHub is what keeps them in sync; nothing else
does. **Run `hostname` first, every session** — the Desktop Commander bridge flaps and has
silently reconnected to the *other* machine mid-session. The two clone paths differ
(`C:\Users\jayjm\...` vs `C:\Users\Jay\...`), so assuming the wrong one wastes a round trip
at best and edits a stale tree at worst.


**`cafnet` has `NODE_ENV=production` set machine-wide.** This breaks the dev workflow
in two ways that both look like something else entirely:

1. **`npm install` silently omits devDependencies** — npm resolves `omit=dev` from
   `NODE_ENV`. A plain `npm install` there removed 492 packages including vitest itself,
   and the next `npm test` said `'vitest' is not recognized`. Use
   **`npm install --include=dev`** on that machine.
2. **`npm test` used to fail most of the suite** with `act(...) is not supported in
   production builds of React`, because Vitest only defaults `NODE_ENV` to `test` when it
   is *unset*, so Vite resolved React's production build. Nothing in the output points at
   `NODE_ENV`. `vite.config.js` now forces `NODE_ENV=test` when `VITEST` is set, so this
   is handled — don't remove that guard. `npm run build` deliberately still sees the real
   `NODE_ENV`.

⚠️ **This was verified on cafnet with a pass count and a date, both of which rotted.**
The behaviour is durable; the numbers were not. Run the suite.

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
