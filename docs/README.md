# `docs/` moved to `claude/` — 4 Aug 2026

**Tombstone.** This folder's contents were reorganised into `claude/` so that specs, plans
and runbooks each have an obvious home instead of one flat folder that grows forever. Left
here rather than deleted silently, because a deletion with no trace is an invitation to
re-add it — and because links to the old paths exist in commit messages, in the
`.superpowers/sdd/` ledgers, and possibly in Jay's notes.

| Was | Is now |
|---|---|
| `docs/design-system.md` | `claude/specs/design-system.md` |
| `docs/accessibility.md` | `claude/specs/accessibility.md` |
| `docs/superpowers/specs/*` | `claude/specs/*` |
| `docs/superpowers/plans/*` | `claude/plans/*` |
| `docs/deploy.md` | `claude/runbooks/deploy.md` |
| `docs/first-admin.md` | `claude/runbooks/first-admin.md` |
| `docs/e2e-roles.md` | `claude/runbooks/e2e-roles.md` |
| `docs/email-and-domain.md` | `claude/runbooks/email-and-domain.md` |
| `docs/plans/quins-v1-mvp.md` | `claude/archive/quins-v1-mvp.md` (v1 is complete — historical) |

**Note on the section references throughout the source.** Comments citing
`design-system.md §5.7` and similar were left as bare filenames where they had no path,
and repointed where they did. The section numbers are unchanged; only the folder moved.

**The `.superpowers/sdd/` ledgers still say `docs/...` and that is deliberate.** They are
historical records of what was true when they were written; rewriting them would falsify
them. This table is how they resolve.
