# Decision — `main` is the production branch, not `build/v1-mvp`

*8 Aug 2026.*

Jay asked to mirror his other project, where `main` is the deployed branch. Agreed and
done. **The rename is trivial; the reason it was worth doing is not the tidiness.**

## What was true before

| | |
|---|---|
| Netlify production branch | `build/v1-mvp` |
| Site | `https://adhquins-clubhub.com` (alias `app.adhjrt.com`) |
| `main` | 25 commits behind, **a strict ancestor** — nothing on it that wasn't on `build/v1-mvp` |
| Where the branch name was recorded | **Netlify's UI only** |

Measured, not assumed:

```
$ git rev-list --left-right --count origin/main...origin/build/v1-mvp
0	25
$ git log --oneline origin/build/v1-mvp..origin/main
(empty)
```

`0 25` with an empty right-only log is what made this cheap: a fast-forward, no merge,
no conflict, nothing to lose.

## The real problem being fixed

**The production branch was not discoverable from a clone.** It is not in
`netlify.toml`, not in `package.json`, not in CI. A session with the whole repo in front
of it could not answer "what deploys?" — it had to be told, or it had to read Netlify's
`branchVersionOfSite` hostname (`build-v1-mvp--quins-club-hub.netlify.app`) and infer the
branch name backwards from it.

⚠️ **Renaming the branch does not fix that.** After this change the branch name is
*still* a Netlify UI setting that a clone cannot see; `main` is just a better guess than
`build/v1-mvp`, so the failure is quieter — which is arguably worse. The fix is that
`CLAUDE.md` rule 3 now states the branch explicitly and says it lives in Netlify's UI.
**That line is the deliverable. The rename is the cosmetic half.**

## Order of operations, and why it is not negotiable

1. Fast-forward `main` onto `build/v1-mvp`, push.
2. Change GitHub's default branch to `main`.
3. Change Netlify's production branch to `main`, deploy, verify.
4. Delete `build/v1-mvp` only after a green production deploy off `main`.

⚠️ **Flipping Netlify first would have deployed `main` at `923c421`** — 25 commits stale,
predating the 6–7 Aug migrations, the split-name work, gender, account deletion and the
security headers. The database would **not** have rolled back with it, giving new-schema
DB against old-schema frontend on a live site parents use. Step 4 is last because until
`build/v1-mvp` is deleted it remains a free one-click rollback.

## What had to change in the repo

The branch name was hard-coded in eight places across five instruction-bearing files.
`.github/workflows/docs.yml` was the one that would have failed silently: it triggers on
`branches: [build/v1-mvp]`, so leaving it would have stopped `docs-check` running on
every future push **without failing anything** — a documentation-integrity check that
quietly stops checking.

Changed: `.github/workflows/docs.yml`, `CLAUDE.md` (×3), `RESTORE.md` (×2),
`claude/runbooks/deploy.md` (×3), `claude/runbooks/session-and-push.md` (×3),
`claude/writing-to-github-from-claude.md` (×2).

**Deliberately NOT changed:** `claude/handoffs/`, `claude/decisions/`, `claude/specs/`
and `.superpowers/`. Per `CLAUDE.md`, those are history, not instruction — a handoff
describes a moment, and rewriting the branch name inside one falsifies the record. Each
edited file above instead carries an inline "this said `build/v1-mvp` until 8 Aug 2026"
note, so a reader who finds the old name in an old document can date it.

## Rejected: renaming the branch on GitHub instead

GitHub's branch-rename would have needed `main` deleted first, and it rewrites open PR
bases and pushes a redirect that clones handle inconsistently. Fast-forwarding an
existing ancestor is the boring option and boring was correct here.
