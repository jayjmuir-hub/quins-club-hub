# Writing to GitHub from a Claude session

**A cloud session has no GitHub credentials and must not be given any.** Every push goes
through one of Jay's PCs, where git is already authenticated (a PAT in Windows Credential
Manager, `credential.helper=manager`).

**Never use the account-level GitHub connector.** It is read-only and 403s on writes.

## The route that works

The repo is public, so a cloud session clones it and works locally at full speed —
`npm install`, `npm test`, the browser harness, all of it. Only the final push needs a PC.

**In the sandbox:**

```bash
git clone https://github.com/jayjmuir-hub/quins-club-hub.git
cd quins-club-hub && git checkout build/v1-mvp && npm install
# create .env (see RESTORE.md "Start a session") — the test suite needs it
# ...work, test, commit...
rm -f .env                       # gitignored, but never risk it
git bundle create /tmp/x.bundle <base-sha>..HEAD
```

**Upload it, then VERIFY THE ROUND TRIP BEFORE handing the URL to the PC:**

```bash
curl -F "reqtype=fileupload" -F "time=72h" -F "fileToUpload=@/tmp/x.bundle" \
  https://litterbox.catbox.moe/resources/internals/api.php
curl -sSL -o /tmp/rt.bundle <returned-url>
cmp /tmp/rt.bundle /tmp/x.bundle     # must be byte-identical
```

**This check is not ceremony.** On 4 Aug 2026 a download came back as a 69 KB HTML "504
Gateway Timeout" page instead of a 17 KB bundle. It has caught real corruption twice.
Retry the upload/download until `cmp` passes.

**On the PC (In Windows, `cmd`):**

```
curl -sSL -o %TEMP%\x.bundle <url>
certutil -hashfile %TEMP%\x.bundle MD5      REM must match the sandbox's md5sum
git bundle verify %TEMP%\x.bundle
git pull --ff-only %TEMP%\x.bundle HEAD
npm test && npm run build
git push origin build/v1-mvp
```

## Things that will bite you

**`git bundle create <file> <base>..HEAD` records only `HEAD`, not the branch name.** Pull
it as `git pull <file> HEAD` — pulling by branch name fails with "couldn't find remote ref".

**NEVER relay file bytes through model output.** Not base64, not chunked text. Two attempts
on 4 Aug corrupted silently — 43,296 bytes expected, 42,718 written, ~578 dropped mid-stream
with no error anywhere. It was caught only by an MD5 check that was nearly skipped. Google
Drive's `create_file` has the same shape and the same risk.

**Temp file hosts:** `litterbox.catbox.moe` works from the sandbox (72h). `tmpfiles.org`
works but expires in ~60 minutes and needs a fake `.zip` extension. `0x0.st` and catbox
proper both reject sandbox uploads. Litterbox 504s under load — retry.

**`npm install` on `cafnet` needs `--include=dev`** — `NODE_ENV=production` is set
machine-wide there and npm silently strips every dev dependency, vitest included.

**Run `hostname` first.** The bridge has silently reconnected to the other PC mid-session,
and the clone paths differ (`C:\Users\Jay\...` vs `C:\Users\jayjm\...`).

## Before pushing

Show Jay the diff and get a yes. Branches and PRs are fine without asking.
