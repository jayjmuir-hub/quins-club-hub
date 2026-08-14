# Writing to GitHub from a Claude session

Restarted 14 Aug 2026. Only the routes that work and the traps that have actually
bitten.

**A cloud session has no GitHub credentials and must not be given any.** Every
push goes through one of Jay's PCs, where git is already authenticated (a PAT in
Windows Credential Manager, `credential.helper=manager`).

## The three routes, and which work

| Route | Status |
|---|---|
| `git push` via Credential Manager | ✅ works |
| `gh` CLI — the only way to open a PR | ✅ installed and authenticated on both PCs |
| Account-level GitHub connector | ❌ OAuth, read-only, `Bad credentials` on writes |

⚠️ **`git push` working tells you NOTHING about whether a pull request can be
opened.** Git-over-HTTPS and the GitHub API are two surfaces with two
credentials, and **no git command opens a PR** — it does not exist in the
protocol. A session once pushed a branch successfully and then found every API
route shut.

⚠️ **Never read git's stored credential to feed it elsewhere.** That shape is
indistinguishable from exfiltrating a token and is blocked, rightly. `gh auth
login` is the supported route and **Jay runs it**, as with every credential.

⚠️ **`hosts.yml` existing does not mean logged in** — an interrupted login writes
the file without finishing. `gh auth status` is the check; it exits `1` when
logged out.

## From a cloud sandbox

The repo is public, so **clone it and work locally at full speed** — install,
tests, harness, all of it. Only the final push needs a PC.

```bash
git clone https://github.com/jayjmuir-hub/quins-club-hub.git
# ...work, test, commit... then:
rm -f .env                                  # gitignored, but never risk it
git bundle create /tmp/x.bundle <base-sha>..HEAD
```

Upload it, then **verify the round trip before handing over the URL**:

```bash
curl -F "reqtype=fileupload" -F "time=72h" -F "fileToUpload=@/tmp/x.bundle" \
  https://litterbox.catbox.moe/resources/internals/api.php
curl -sSL -o /tmp/rt.bundle <returned-url>
cmp /tmp/rt.bundle /tmp/x.bundle            # must be byte-identical
```

⚠️ **This check is not ceremony — it has caught real corruption twice**, once as a
69 KB HTML "504 Gateway Timeout" page standing in for a 17 KB bundle. Retry until
`cmp` passes. Litterbox 504s under load.

On the PC, `git pull --ff-only %TEMP%\x.bundle HEAD`, then test, build, push.

## Traps

⚠️ **NEVER relay file bytes through model output** — not base64, not chunked.
Two attempts dropped ~578 bytes mid-stream with no error anywhere, caught only by
an MD5 check that was nearly skipped.

⚠️ **`git bundle` records `HEAD`, not the branch name.** Pull it as
`git pull <file> HEAD`; pulling by branch name fails with "couldn't find remote
ref".

⚠️ **Run `hostname` first.** The bridge has silently reconnected to the other PC
mid-session, and the clone paths differ. Machine facts live in `CLAUDE.md` and
nowhere else — do not restate one here.

**Before pushing to `main`: show Jay the diff and get a yes.** Branches and pull
requests are fine without asking.
