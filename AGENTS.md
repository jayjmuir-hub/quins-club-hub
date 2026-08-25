# Agent notes — Quins Club Hub

Club-management PWA for Abu Dhabi Harlequins RFC. `main` is production
(https://adhquins-clubhub.com). Reading order for humans and Claude Code is
`CLAUDE.md` — do not copy those rules here.

## Cursor Cloud

Cloud Agent Builds must leave a **current structural graft index** on disk
before the agent reads Club Hub source. There is no LLM concept map and no
API key: **never** run `graft build --deep`.

`.cursor/environment.json` runs `.cursor/install.sh` on those Builds. The
script is idempotent: `npm ci --include=dev` (Vitest is a devDependency),
installs `@nanonets/graft` into `$HOME/.local` (a bare `npm install -g`
EACCES-fails here because npm's prefix is `/`), puts `graft` on PATH, then
`graft build` via `npx` so a missing binary cannot skip the index. Optional
`start` is omitted on purpose — the index is files on disk, not a service.

If you land in a VM where that did not run:

1. If the `graft` CLI is missing: `npm i -g @nanonets/graft` or
   `npx -y @nanonets/graft`.
2. If `graft/` is missing: `graft build` (not `--deep`) in the repo root.
3. If the graph looks stale: `graft check`. Queries themselves refresh the
   graph; `build` is for a missing index.

**Never skip graft** for Club Hub source navigation. Use `graft ask` /
`graft grep` / `graft skeleton` / `graft callers` / `graft map` before
reading source files. The always-apply Cursor rule is
`.cursor/rules/graft.mdc`.

**Do not commit `graft/`.** It is gitignored on purpose (local cache). Keep
the unanchored `graft/` ignore plus `!.claude/skills/graft/` — either half
alone is a bug that has shipped.

<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->
