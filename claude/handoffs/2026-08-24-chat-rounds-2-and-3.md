# Handoff — 24 Aug 2026, chat rounds 2 and 3 (the night session)

**History, not instruction.** One session, Jay directing live, in parallel
with the glass session. Shipped and verified live, in merge order: #371
(round 2: quotes, forwarding, emoji picker, staff-pill DMs, photo
attachments), #372 (docs), #373 + #375 (the embed hotfixes), #376 (dock
resize), #378 (ceiling 1100), #380 (round 3: the WhatsApp design pass).
Two migrations applied and measured in production
(`20260824_chat_round_2.sql`, `20260824_nicknames.sql`). Two rulings:
`claude/decisions/2026-08-24-chat-photos-open.md`, and private-only
nicknames inside `claude/plans/2026-08-24-chat-round-3-design.md`.

## The trap of the night: PostgREST self-join embeds, broken twice

The `quoted` embed on messages (a table referencing itself twice —
`parent_id` and `quoted_id`) shipped broken in two different ways in one
evening, and no unit test could see either because the mocks swallow the
SELECT string:

1. **Constraint-name hint** (`messages!messages_quoted_id_fkey`) → PGRST200
   "Could not find a relationship", every thread dead. NOT cache staleness:
   the same probe against the weeks-old `messages_parent_id_fkey` fails
   identically, and two schema-reload notifies changed nothing.
2. **Table+column hint** (`messages!quoted_id`) → resolves BACKWARDS: the
   messages-that-quote-this-one array, empty on every row, truthy and
   bodyless — a phantom "📷 Photo" chip on every bubble in the club.

**Only `quoted:quoted_id(…)` — the FK column itself — is to-one by
definition.** Pinned by a test on the literal SELECT string, and the
renderers demand `m.quoted?.id`, never truthiness. If a second self-join
embed is ever added, start from the column spelling and probe LIVE with the
publishable key before merging: a 401 means the relationship resolved and
only the grant refused; a 400 PGRST200 means it did not.

## Other traps that cost time

- **`notify pgrst, 'reload schema'` through the MCP's execute_sql may not
  commit.** Send it over a direct `pg` connection using the harness's
  `SUPABASE_DB_URL` — and even then, prove the outcome at the REST endpoint,
  not by the notify returning.
- **The terminology gate bans the bare word "Nick"** (a retired person-name
  → "Social Media Management"), and a helper function named `nick()` trips
  it. `nameFor()` now; the gate was right to be annoying.
- **A migration that grants on a table needs `db/schema/grants.sql` in the
  same PR** (docs-check rule 7) — and write the anon REVOKE into the
  migration itself, so the capture states a fact.
- **`jq` does not exist in the background-task shell** even though the
  interactive Bash tool has it. A CI-watching loop died silently on it;
  plain grep loops survived.
- **A stale `dist/` in a worktree fails `tests/nav-sheen.test.js`** (it
  reads the BUILT stylesheet). `npm run build` first; the suite is honest.
- **The live-bundle probe must be proven against a known positive.** The
  first "is 1100 live?" grep would have matched any 1100 anywhere; and the
  proven regex STILL missed a later build because the minifier switched to
  backtick strings. Grep the actual minified context, then probe.
- **The auto-mode classifier blocks production writes** (apply_migration,
  `gh pr merge`) until Jay speaks. That is the gate working — route it to
  him, never around it.

## The cross-session protocol that held

Two sessions merging to one `main` all evening. What worked, written down
because it will be needed again: name the touched files at each other
BEFORE branching; announce every merge with its squash SHA; **newest squash
wins the changelog citation and the second PR rebases**; hold a rebase that
changes nothing a reviewer is judging (each push burns a preview build).
The changelog conflicted twice and both resolutions were unions — nothing
was lost.

## Rounds 4 and 5, appended before midnight — the night kept going

Jay's "we aren't done" was accurate within the hour. Also shipped and
verified live, same session: #382 (the BlockTitle `first:mt-0` spacing
trap — a wrapper's first child loses its 18px; wrappers carry mt-[18px],
Dashboard's convention), #384 (round 4: chevron message menu, pins by
SECURITY DEFINER single-column RPC — never widen the messages UPDATE
policy, grants.sql §4 — private stars, reply-privately with the quote
guard relaxed to readable-by-sender and the round-2 anchors REPOINTED),
and #386 (round 5: sidebar chat categories + ?filter= chips + folds +
unread-first). Two more migrations applied on Jay's explicit go-ahead.
New traps for the pile:
- **A "do it" can be narrower than the list it follows.** Welfare-log
  improvement drafts were built and then DISCARDED unbuilt when Jay
  clarified "do it" meant the navigation set — ask which antecedent when
  a reply follows two proposals.
- **`gh pr checks` can show ONLY Netlify rows while the Actions runs
  never triggered at all** — #386 sat checkless until a push after
  merging main re-triggered them. An empty `gh run list --branch` is the
  tell, and the fix is a rebase-push, not waiting.
- **The deploy watcher must capture its baseline BEFORE the merge** — one
  armed seconds after a fast deploy waited forever for a change that had
  already happened; another's regex missed because a later build minified
  strings with backticks. Prove the probe against a local build first.
- **Welfare access requires reviewability** — log_welfare_access refuses
  an adults-only unreported DM ("not reviewable"), so a harness must
  report a message before an admin open can be logged.

## Open, in order of likely next ask

- Jay's words closing the night: **"we aren't done."** Round-4 feedback is
  expected imminently — this handoff may be stale by morning.
- The other session's #379 (glass material) waits on Jay's look-approval,
  then rebases onto `34c9e1c`.
- Nicknames on the chat LIST need `other_id` in `my_chats` (accepted
  residue in the round-3 plan).
- Phase 4 remainder: retention and email digests. Welfare right still
  unassigned; no real DM sent yet.
