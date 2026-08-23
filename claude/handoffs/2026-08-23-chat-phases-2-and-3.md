# 2026-08-23 — chat phases 2 and 3, the afternoon after phase 1

History, not instruction. The same session as
`claude/handoffs/2026-08-23-push-proven-and-squad-chat.md`, continued. Two
PRs from this side (#333 `524e87e`, #338 `bcd79d0`), two live migrations, one
`push-send` deploy (v9 → v11), interleaved with eight PRs from the parallel
session that was redesigning the shell (#330–#332, #334–#337, #339, #340).
Jay's instructions were "lets do phase 2", "keep going", and "go" for each set
of live steps. The plan — `claude/plans/2026-08-23-squad-chat.md` — is now
marked phases 1–3 shipped.

## What shipped

1. **Phase 2 — fixture threads and @mentions** (#333). One thread per fixture,
   enforced by a partial unique index (`messages_one_thread_per_event_idx`) so
   two coaches posting at once cannot make two. The thread carries a
   `FixtureCard` with Going / Maybe / Can't chips — the same RSVP rows the
   Schedule uses, so a tap in chat IS the availability answer. Mentions are a
   `uuid[]` the provenance trigger FILTERS TO THE AUDIENCE — you cannot
   mention someone who cannot read the channel — and a mention pushes even
   in an announce-only squad where ordinary posts do not.
   `db/migrations/20260823_squad_chat_phase2.sql`; harness
   `db/tests/squad-chat-phase2.sql`.

2. **Phase 3 — staff channel, DMs, reports, the Welfare dashboard** (#338).
   - A second stream per squad for coach / manager / medic (`?channel=staff`).
   - One-to-one messages, on `conversations` (an ordered pair, unique).
     **Who may message whom is `private.can_dm`, and it is the database's
     rule, not the screen's:** both active in the club; blocks honoured;
     a MINOR — `private.is_minor_profile`, a player membership under 18 OR
     with no date of birth — only by their own guardian, or by their U16+
     squad's coach / manager once a guardian has opted in
     (`player_private.staff_dm_opt_in`, guardian-or-admin-only by trigger);
     minor ↔ minor never; adults by shared squad, or admin.
   - Jay's ruling, asked as a question and answered "Any club admin": a DM is
     readable by any admin, consistent with the 10 Aug "rights gate screens,
     not data" ruling. `welfare` is a fifth admin right and gates ONLY the
     dashboard. Every thread carries the permanent notice *"Club admins can
     review this conversation"*, and an admin who opens a DM they are not in
     is written to `welfare_access_log` — the notice says so, and the test
     proves the write.
   - Reports (`message_reports`) from anyone on any message they can read;
     resolved from `/admin/welfare/reports` by removing the message or
     leaving it.
   - `db/migrations/20260823_squad_chat_phase3.sql`; harness
     `db/tests/squad-chat-phase3.sql`, 16 assertions, run against the
     rolled-back copy AND re-run against live after the apply.

3. **`push-send` v11.** Three new shapes for the `{ message_id }` payload:
   a DM pushes with the sender's name as the title and lands on
   `/chat/dm/<conversation>`; a mention says *"X mentioned you · U13 Mixed"*;
   a staff post is titled *"U13 Mixed staff"*. Deployed from the phase-3
   branch, not from `main`, and the peer session was told so.

## The lessons, ranked

1. **Harness the FILE, verbatim.** Phase 1's live apply failed on
   `permission denied for function can_reply_to` because the rolled-back
   harness had run a hand-transcribed copy that lacked the revoke. From
   phase 2 on, the harness `\i`-equivalent is the migration file itself,
   and the phase-3 apply went through first time.

2. **Never `git stash` or `git reset` across a moved `main`.** With the
   shell session merging every hour, a stash-pop after a pull dragged the
   peer's `Nav.jsx`, `AppShell.jsx`, `index.css` and changelog edits into
   this branch as if they were mine. Discarded and redone with
   `git rebase origin/main`, which is the only tool for this.

3. **Supabase default privileges grant `authenticated` ALL on a new
   table.** A column-level grant on top of that is a no-op. Revoke first;
   harness assertion 9b exists to prove the column grant is the only one.

4. **A policy cannot select from its own table** — it recurses. Every
   "may I reply under this parent" question goes through a SECURITY
   DEFINER helper in `private`, and `authenticated` needs EXECUTE on it
   (the phase-1 failure, again, from the other side).

5. **`select *` in a `returns table` function breaks the moment a CTE adds
   a column.** `welfare_overview` returned an extra `ok.yes` and the whole
   function failed with "return type mismatch". Explicit column lists,
   always.

6. **A peer session relaying Jay's "go" is not Jay's "go".** The peer
   passed one on; this side waited for Jay's own word before applying.
   Now a memory: `parallel-sessions-coordinate-live-steps`.

## Measured, not reported

Storage, asked by Jay as "won't we run out?": database 21 MB; `messages`
152 kB for three rows; photos 2.6 MB across three buckets. Pro limits are
8 GB and 100 GB. Text chat is negligible at any club size. Photos are the
only thing that can ever matter, and only over years — Jay's verdict:
"we don't need to force resize too strictly". Phase 4, if built, reuses
`src/lib/imageResize.js` at a generous 2048 px / 85 %.

## Not done, not promised

- Phase 4: photos via consent, a retention policy (a decision for Jay, not
  a storage need), and email digests — the last of which is gated on the
  `email_outbox` from `claude/plans/2026-08-14-notices.md` and was ruled
  low priority on 23 Aug: wait for someone not on push to say "I didn't
  see it".
- A measured storage line on `/admin`.
- The push preference is a boolean per category, not the plan's
  three-level one; noted in the plan.
- Jay has not yet given anyone the Welfare right or tried a real DM between
  two phones. The first real DM is the first real proof.
