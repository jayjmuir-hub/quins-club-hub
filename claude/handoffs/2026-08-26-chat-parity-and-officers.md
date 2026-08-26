# Handoff — 26 Aug 2026, the chat-parity and officers day

**History, not instruction.** Ten PRs merged and verified live in one
session (cafnet, worktree `continue-18b5dc`), alongside a second session
shipping the person card and presence in parallel. What follows is the
shape of the day and the traps worth carrying forward; current state is
`claude/state-of-play.md`, the rulings are in the specs named below.

## What shipped (all live, each verified by a bundle-marker control)

- **#433** — the shared chat thread: the floating dock renders the SAME
  components as the full screens (`useDmThread`/`DmThread`,
  `useChannelThread`/`ChannelThread`); the hand-rolled dock copy is gone.
  `claude/plans/2026-08-26-shared-chat-thread.md`.
- **#436** — needs-attention names are doors (`/roster?open=<id>`).
- **#437** — unused DMs hidden from the list; DM header identity line v1.
- **#439** — identity rows: every hat, sticky, dock strip; the v1 line
  replaced same day. `claude/plans/2026-08-26-dm-identity-rows.md`.
- **#440 + #442** — club officers: titles WITHOUT rights, nine of them
  after Jay added Social Media Director minutes post-ship — the closed
  vocabulary admitting a title the designed way.
  `claude/plans/2026-08-26-club-officers.md`.
- (Peer session: #434/#435 person card, #438 presence dots — its handoff
  is its own.)

## The traps this session paid for

1. **The harness aliases match SPECIFIER TEXT and a new src/lib file
   escapes them.** `useDmThread` wrote `./memberships.jsx` and the whole
   dock died in the harness while jsdom stayed green (vitest mocks by
   resolved path). The './'-depth rules are in `harness/vite.config.js`
   now; the harness-stubs count assertion caught its OWN sixth miss the
   same day — because the alias commit landed AFTER that phase's full
   suite run. `npm test` goes after the LAST commit.
2. **The one-behind changelog rule, under multi-session cadence, fails
   CI on almost every PR's first push.** Expected, cheap, correct: cite
   the previous squash, push again. Never cite your own branch's SHA.
3. **docs-check reads `claude/<branch-name>` as a file path.** Name PRs
   by number in prose, not by their git branch.
4. **`gh pr merge` was blocked by the permission classifier until Jay
   added `Bash(gh pr merge*)` to his user settings** — and Claude
   editing that settings file itself is self-escalation, blocked by
   design. Jay's explicit go per PR remains the authority either way.
5. **A harness for an APPLIED table must drop-and-recreate INSIDE its
   rolled-back transaction** — the verbatim `create table` collides once
   the migration is live. Proven safe in passing: the two live officer
   rows survived the drop's rollback, measured.
6. **The deploy-proof pattern held all day:** capture the entry bundle
   name AND a grep-count control for a new-code string BEFORE merging;
   after, the bundle hash must move and the count must flip. A marker
   that already exists in the old bundle (the `/roster?open=` case)
   needs a count delta, not presence.

## Parked, deliberately (recorded in claude/open-items.md)

Self-managed U16s vs guardian-required; the parent-match automation
(fenced with the "email match ≠ parent" finding); tappable identity
badges into the person card — offered twice, not yet asked for.
