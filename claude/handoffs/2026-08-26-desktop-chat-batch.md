# Handoff — 25–26 Aug 2026: positions, re-capture, desktop width, chat batch

**History, not instruction.** Where things STAND is `claude/state-of-play.md`;
what is TRUE is `RESTORE.md`. This records one long session (Claude Code,
graft worktree `graft-build-152101`) so its traps aren't rediscovered.

## Shipped, all merged and verified live from the served bundle

- **Floating dock pins to the newest message** (#415, `2ea3e5c`) —
  `useStayPinnedToBottom` grew a container-ref mode; the window-pinning fix
  had never reached the dock's own scroll div.
- **Positions are staff-only, picked forward/back → sub-position** (#419,
  `1d3bafe`; columns dropped in `#421`, `861c731`). REVERSES the 14 Aug
  squad-readable ruling, on Jay's explicit instruction. RLS grants rows not
  columns, so the data moved off `players` into `player_positions` (first
  row = primary) + new `player_units`, both the player_grades shape. Staff
  screens DECORATE their rows from the maps; parents get bare rows.
  Fault-injected with a real parent (zero rows) and admin (all rows).
- **Full `db/schema/` re-capture** (#424, `0465064`) — twelve days of drift:
  13 missing tables, 25 missing policies, 22 missing functions, 15 missing
  triggers, two INVERTED standing claims (anon grants; publications). Found
  `a5c5efd`'s player_parents migration COMMITTED BUT NEVER APPLIED — applied
  with Jay's yes (#426, `545778e`), backfill 62→83 rows, trigger
  fault-injected in a rolled-back fixture.
- **Desktop uses the width** (#428, `dfeee1d`) — Jay: "why can't we have
  things fill the entire width of the screen?" Schedule's table from 820px
  (was 1280), Notices in CSS columns (2/3, break-inside-avoid), chat list's
  DMs + squads side by side. The shell's 1120px cap was ALREADY gone —
  screens just never used the room. More screens can follow the pattern.
- **DM notice removed for members** (#431, `bb4833b`) — reverses the 23 Aug
  permanent-notice ruling (addendum in
  `claude/decisions/2026-08-24-groups-open-no-warnings.md`). The REVIEWING
  banner and welfare log are untouched.
- **Online status + WhatsApp ticks** (#430, `242d442`) — presence is
  Realtime with deliberately NO table; ticks are sent/delivered/viewed with
  `message_deliveries` (written by the unread-badge fetch) + author-arm
  SELECT policies on both receipt tables
  (`20260826_chat_delivery_receipts`, applied and fault-injected pre-merge).

## Traps this session hit (the reusable half)

- **Local `npm run docs:check` red ≠ CI red** on multi-commit or
  fresh-cut branches — CLAUDE.md already documents both directions; trust CI.
- **`npx.cmd vitest -t "words with spaces"` breaks** in this shell
  (`'C:\Program' is not recognized`); use a dot-regex (`-t "shows.an.age"`).
- **Supabase MCP `execute_sql` returns only the FINAL statement's rows** —
  put the assertion you need last, or run twice.
- **`set local role authenticated` with no JWT sees zero rows EVERYWHERE** —
  useless as a control; impersonate real profiles via `request.jwt.claims`.
- **A DOM node captured before async data lands can be DETACHED** once
  grouping re-buckets — re-query inside `waitFor` (roster ages test).
- **Port 5199 is squatted by the on-hold peer worktree's orphaned harness**
  (`graft-build-check-1a7154`); `harness-alt` on 5299 exists in this
  worktree's untracked `.claude/launch.json`.
- **The harness aliases every module that imports `src/lib/supabase.js`**
  (throws at import without env) — a NEW lib importing it needs a stub +
  alias + a row in `tests/harness-stubs.test.js`'s ALIASES list, which also
  counts the alias lines.
- **Parallel sessions were racing all day** (three at peak: this one, the
  roster-builder/welcome-email one, a Cursor one pushing straight to main).
  The changelog cite-the-previous-squash protocol held; whoever merges
  second rebases. One Cursor push turned main's docs-check red for ~25
  minutes (branch SHAs cited that exist in no clone).

## Open (also in claude/open-items.md)

- Floating dock shows no ticks; chat-list online dots need `my_chats` to
  return the DM counterpart's profile id.
- The changelog's top "(unmerged)" ticks entry cites `242d442` via the next
  PR — which may be the PR that lands this file.
