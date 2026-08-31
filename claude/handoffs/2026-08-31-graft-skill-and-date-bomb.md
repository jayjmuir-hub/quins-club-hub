# Handoff — 31 Aug 2026: graft skill doc, `.claude/` deploy gate, and two false reds

History, not instruction. What this session did and the traps it hit, for the
session that meets one of them next.

## What shipped

**PR #569, squashed as `50bed3a`** — three commits, one deploy (expected; see
the gate note below):

1. **`.claude/skills/graft/SKILL.md`** — committed the `build --deep` guidance
   that had been live-but-uncommitted on cafnet: plain `build` refreshes the
   structural graph free with no key; `--deep` spends tokens and runs through
   the local `hermes proxy` with a dummy key. First `.claude/` file ever
   committed to this repo.
2. **`.claude/` joined `DEPLOY_IRRELEVANT`** in `scripts/netlify-ignore.mjs`,
   beside `.cursor/` — skills, hooks and settings steer Claude sessions and
   cannot reach `dist/`. Proven red-then-green in
   `tests/netlify-ignore.test.js`, with a `claude-skills/` prefix guard.
   ⚠️ **The skip only applies from the NEXT `.claude/`-only change** — the
   ignore script Netlify consults is the one in the commit being deployed, so
   the PR that adds a pattern always builds once itself.
3. **The 31 Aug date bomb in `tests/allocation.test.jsx`** — see below.

Session start found this clone **83 commits behind** with a clean tree —
reading-order step 2 caught it, `git pull --ff-only` fixed it, exactly the
case the rule exists for.

## Trap 1 — a test that passes for months, then fails on a Monday

Two direct-assignment tests queried the U16B event button with a singular
`findByRole`. The allocation screen's default week view is **Monday-start**,
and its fixtures sit on Sat 5 Sep 2026 — so from Mon 31 Aug (and only from
then) the visible week contained the fixture, the event rendered in BOTH the
"waiting for a pitch" list and the calendar grid, and the singular query threw
on the duplicate. CI was green on 30 Aug and red on 31 Aug **with no code
change in between**; a clean local main failed the same way.

The tell that unmasked it: `throughDetail`, two functions up in the same file,
already used `findAllByRole(...)[0]` — which is why only two of the three
sibling tests broke. Fix: the same pattern, with a comment naming the date it
bit. **When a test fails "for no reason", diff the DATE before diffing the
code.**

## Trap 2 — a bundle-reading test cries wolf on a stale `dist/`

`tests/nav-sheen.test.js` failed locally while CI passed. Jay's instinct —
leftover from the menu-bar rethink — was right in substance, wrong in
mechanism: the working tree was clean and unstashed; the residue was
**`dist/` itself, built 17 Aug**, four days before phase 5 of the retheme
removed the sheen block. The test reads `dist/assets/*.css` on purpose
(Tailwind tree-shakes `@layer components`, so a source-only check passes on
CSS that never shipped) and the stale bundle still carried `.nav-tab`.

`npm run build` cleared it. Nothing to commit. **Any bundle-reading test
(`nav-sheen`, `button-sweep`) fails against a `dist/` older than the CSS it
asserts about — rebuild before believing a local red in those files. CI is
the authority; it always builds fresh.**

## Verified at close

Full suite on cafnet, current main: 257 files, 4,128 tests, all passing
<!-- count-ok: a measurement made this day, in a handoff, which is history -->
— both false reds explained and gone. Production deploy id
`6a94f4ca425a7c0008db5cd3`, commit `50bed3a`, state ready.

## Left open

Nothing from this session. State-of-play was deliberately not touched — the
session changed no standing fact; this file is the record.
