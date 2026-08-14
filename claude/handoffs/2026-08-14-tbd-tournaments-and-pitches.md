# 14 Aug 2026 (evening) — TBD everywhere, tournaments, and the away-pitch fix

**History, not instruction.** This describes a moment. For current state read
`claude/state-of-play.md`; for what is true about the codebase read `RESTORE.md`.
⚠️ **This is the SECOND handoff dated 14 Aug** — the other is
`claude/handoffs/2026-08-14-migrations-and-merges.md` and covers the earlier part
of the day. Where they disagree, this one is later.

## What shipped

Four pull requests, all merged and live:

| PR | What |
|---|---|
| #125 | A social link preview, so WhatsApp stops upscaling the favicon |
| #126 | TBD competition, R0, TBD round, TBD kick-off, duration shortcut |
| #127 | A tournament is named, not opposed; opponent optional for one |
| #128 | No pitch request on an away match |

Reasoning lives in `claude/changelog.md` and `claude/schema-history.md`. What
follows is only the things that cost time and are not obvious from the diffs.

## ⚠️ The traps

**⚠️ `apply_migration` AND `execute_sql` ARE NOT BLOCKED.** The earlier 14 Aug
handoff says both are refused by the permission layer. **That is stale** — two
migrations were applied through the Supabase MCP this evening.
⚠️ **What IS blocked: a production `DELETE`, and `gh pr merge` without `--auto`.**
Jay deletes rows himself; use `--auto` for every merge and `gh` will merge
immediately when the checks are already green.

**⚠️ THE CALENDAR EDGE FUNCTION DOES NOT DEPLOY WITH NETLIFY, AND IT WAS THE
THING MOST NEARLY FORGOTTEN.** It sat on the pre-TBD version for hours after its
migration landed, during which a TBD fixture would have gone into parents'
calendars at midnight — the exact bug the all-day work exists to prevent. It is
`supabase/functions/calendar/index.ts`, deployed separately, now on **version 32**
with `verify_jwt` still false. ⚠️ **And its COLUMNS are decided by
`calendar_events_for_token`'s `RETURNS TABLE`, never by the function** — that
caught us twice in one evening.

**⚠️ A GREEN `docs:check` BEFORE THE COMMIT PROVES NOTHING.** `CLAUDE.md` says to
run it AFTER committing and this session ignored that, so CI failed on a SHA that
the dirty-tree run had let through under the one-behind allowance. The rule works;
read it. ⚠️ **The reverse divergence is also real and must NOT be "fixed"** — on a
branch with two or more commits the local run demands the branch's own SHA, which
stops existing at the squash. Cite the BASE tip, never your own.

**⚠️ `0` IS FALSY AND `home` IS NULLABLE.** Two separate near-misses of the same
shape. R0 is a legal round, so every renderer must test `round != null`; and
`home` is NULL for every training and social, so an away check must be
`home === false` — `!event.home` would have hidden the pitch button from the
majority of fixtures that want one. Both were caught by injecting the wrong
version and watching tests fail, which is the only reason they are recorded here
rather than in a bug report next month.

**⚠️ A REQUIRED FIELD MADE THE DATA WRONG.** The "Quins vs Al Ain Tournament" bug
was not a rendering bug: a match could not be saved without an opponent, so people
typed the tournament's name into the opponent box. Three fixtures still hold it in
both columns. `eventTitle` checks the tournament AHEAD of the opponent so those
read correctly with no data migration — **do not reorder those two branches.**

**⚠️ AN IMPORT-REWRITING SCRIPT WITH A `.*?` REGEX SPANNED SEVERAL STATEMENTS**
and scrambled the import blocks of seven files. `npm run build` caught it in
seconds. If you script an edit across many files, anchor it and build afterwards.

## Left open

- ⚠️ **The all-day calendar entry has never been seen by a real client.** Google's
  cached copy still predates the deploy — measured, not assumed: the 10 Oct
  fixture still reads `Al Ain Tournament v U10 Mixed Contact`, the pre-deploy
  form. When Google next polls it should become `U10 Mixed Contact — Al Ain
  Tournament`, and 14 Aug should gain an all-day entry described "Kick-off time to
  be confirmed". **If the first changes and the second does not, that is a real
  bug.**
- The raw `.ics` was deliberately never fetched: it needs Jay's personal calendar
  token, which is a bearer credential the app itself says to treat like a
  password, and it would have been written into a transcript.
- A parent-and-player PDF guide lives on Jay's Desktop with its HTML source
  beside it. **Not in this repo** — it names no children and is a handout, but it
  is also not something `docs:check` can look after.
