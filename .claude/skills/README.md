# Skills committed to this repo

**A skill here travels with the repo, so every session gets the same guidance —
cafnet, jay-pc, and every cloud sandbox alike.** That is the same reasoning that
moved the rules into `CLAUDE.md`: a fact kept in one place travels, a fact
regenerated per machine drifts. A skill installed by a tool on one PC is
invisible to every other session, and nothing records that it should be there.

## What is here, and why it is tracked rather than regenerated

- **`graft/SKILL.md`** — how to query the graft index instead of grepping.
  Installed by graft itself, but **stable**: `graft build` does not rewrite it
  (measured 18 Aug 2026 — the file's mtime did not move across a full build),
  so it does not churn the way `.gitignore` does. ⚠️ **A graft UPGRADE may ship a
  new version**, which arrives as a diff nobody in this repo authored. Read it
  before taking it; that is a visible decision rather than a silent one.

## ⚠️ Two things about this directory that surprise people

**1. `.claude/` is NOT `claude/`, and the deploy gate only knows the second one.**
`scripts/netlify-ignore.mjs` skips `^claude/`, `^docs/`, `^db/` and root markdown
(`/^[^/]+\.md$/`). **None of those match `.claude/skills/…`**, so editing a skill
file BUILDS and costs a deploy, where editing `claude/handoffs/…` does not. Same
shape as the `.gitignore` surprise already recorded in `CLAUDE.md` — the leading
dot is the whole difference. Verified with `isDeployIrrelevant()` rather than
assumed.

**2. The graft ignore rule has hidden this directory before.** `graft build`
writes an UNANCHORED `graft/` into `.gitignore`, which matches a directory of
that name at any depth and silently swallowed `graft/SKILL.md` here. `.gitignore`
carries `/graft/` with the slash for that reason, and graft re-adds the broken
form on every fresh clone or worktree. If a skill vanishes from `git status`,
that is the first thing to check: `git check-ignore -v <path>`.

⚠️ **`.claude/settings.json` IS tracked and must stay so** — it wires the session
guard. `.claude/launch.json` is gitignored, being auto-scaffolded per machine.
