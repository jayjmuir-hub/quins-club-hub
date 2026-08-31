# Handoff — chat photo albums (paste, drag-and-drop, multi-photo)

**1 Sep 2026.** History, not instruction — it describes a moment. The durable
rules are in `CLAUDE.md`; current state is `claude/state-of-play.md`.

## What Jay actually asked for, and what he has

> *"the club hub — add paste and drag-drop for photos"* — 31 Aug 2026.

✅ **HE HAS IT.** Paste, drag-and-drop and multi-photo shipped in **#605**
(`ebda2f3`) — `AttachmentTray.jsx`, `ChatDropZone.jsx`, `uploadAlbum.js`,
with the tray hook wired into both thread hooks. ⚠️ **An earlier version of
this handoff said "he does not have it yet" and was overtaken while being
written** — a different session executed plan 2. Check `git log` before
believing any status line here.

**What is still missing: the album GRID.** Ten photos send as one message, but
until plan 3 draws the grid they do not render as an album.

⚠️ **The premise was half wrong and that is worth knowing before re-diagnosing
it.** Paste has NEVER existed in this app — `onPaste` and `clipboardData`
appear in **zero commits**, all branches, all history (control:
`git log -S"pickPhoto"` finds its three, so the search works). Drag-and-drop
DOES exist, in `src/components/PhotoPositioner.jsx`, used by the player photo
field, a member's own profile photo and the admin staff screen — just never in
a chat. So this is a feature request, not a regression.

## The shape of the work

Four plans, in order. **1 and the reshape are DONE and LIVE.**

| Plan | What | State |
|---|---|---|
| 1 | Attachment list, sync trigger, storage boundary, harnesses | ✅ live, `918fa59` |
| 1b | Metadata reshape (documents door) | ✅ live, `812a185` |
| 2 | Composer: paste, drop, tray, all-or-nothing send | ✅ **live, `ebda2f3` (#605)** |
| 3 | **Album grid, lightbox, "10 photos" previews** | ❌ not written — **the next job** |
| 4 | Contract: drop `attachment_path`, rewrite `my_chats()` | ❌ not written |

Read in this order: `claude/plans/2026-08-31-chat-photo-albums.md` (the spec,
including the arguments AGAINST), then
`claude/plans/2026-09-01-chat-albums-plan-2-composer.md` (seven tasks, all shipped in #605).

## ⚠️ The one thing that must not be got wrong

`chat media read` on `storage.objects` decides who may view a chat photograph.
**Its `EXISTS` carries NO conversation-membership condition.** Read literally
it says *any authenticated user may read any referenced object*. It is safe
**only** because the subquery runs as the CALLER and `public.messages` has its
own RLS — the membership check is **inherited, never stated**.

⚠️ **So keep the `EXISTS` inline and INVOKER.** Wrapping it in a helper such as
`private.message_has_attachment(name)` and marking it `SECURITY DEFINER` — as
most `private.*` helpers here are — stops RLS applying, and every member gains
read access to every chat photo in every squad, children included. It would
look tidier and would pass a naive fixture.

`db/tests/chat-album-media.sql` assertion 3 (a club member **outside** the
conversation is refused) is the tripwire. **It looks redundant. It is not.**
The harness has 15 arms and a SELF-TEST that grants a wide-open policy to prove
arm 3 detects it.

## What is live in the database

```
attachments      jsonb   [{file, type, size, name}, ...]   <- the truth, WRITE THIS
attachment_paths text[]  derived by trigger                 <- what the policy reads
attachment_path  text    derived by trigger                 <- old cached clients
```

- **Write only `attachments`.** The trigger derives the other two. Writing them
  directly invites disagreement, and a disagreement in `attachment_paths` is an
  invisible permission bug.
- **Cap of 10** enforced by the database, not only the client.
- ⚠️ **The third trigger arm is a correctness requirement.** A phone on a cached
  service-worker bundle still writes `attachment_path` and cannot be forced to
  update. Without derivation its photo becomes unreadable by everyone —
  silently, per-device, reported by a parent rather than a test. That is why
  nothing was dropped and why plan 4 must wait.
- **`name` is why the reshape happened.** A photo needs no name; a DOCUMENT is
  useless without its original filename, and storage keys are
  `<uuid>/<random>.pdf`. Jay wants documents in chat later.

## Next actions, in order

1. ⚠️ **FIX THE EMPTY PUSH BODY FIRST.** It is live, it is routine now that
   albums ship, and every parent in a squad gets a blank notification when
   somebody posts photos without a caption. See the section below.
2. **Write plan 3** — the album grid and lightbox. Ten photos send as one
   message today and do not yet render as an album.
3. **Fix a heading I wrote that was wrong.** The changelog entry for
   `334f11e` says *"One attachment tray, **replacing** two copies of
   `pickPhoto`"*. It was untrue when written — nothing imported the hook then.
   ⚠️ **#605 has since wired it in, so check what is actually true before
   rewording**: if both `pickPhoto` copies are now gone the heading has become
   accurate by accident, and if they remain it still needs *"to replace"*.
   Either way, measure rather than trust this line.

## ⚠️⚠️ A LIVE WRITE-PATH BUG — albums shipped, this did not get fixed

**A photo-only message sends a push notification with an EMPTY body.**

`supabase/functions/push-send/index.ts:788` composes the notification as
`body: escapeHtmlFree(message.body).slice(0, 200)`, and its `select` at line
775 does not fetch `attachments` or `attachment_path` at all. So a message with
photos and no caption pushes the sender's name with **nothing underneath it**.

⚠️ **THIS IS NOW LIVE AND ROUTINE.** Re-measured after #605 shipped:
`push-send/index.ts` still contains **zero** mentions of `attachments`. It
already happened for a single captionless photo; albums make it
the normal case — the whole point of dropping ten photos into a squad chat is
that you often type nothing. Every parent in that squad gets a blank
notification.

Not fixed because it is outside plan 2 as specified and wants its own decision:
the fix needs the `select` widened and wording chosen ("📷 Photo", "📷 10
photos", or the filename now that `attachments` carries one). ⚠️ It also has to
keep the safeguarding property the surrounding comments insist on — **never a
child's name in a tray notification**, by construction.

**How it was found, because the method is the transferable part.** The Diary
Events session shipped a Club Diary entry that would have pushed *"New
fixture — U16"* to every parent in a squad for a kit collection. Their spec and
plan had traced the READ paths exhaustively — chip, detail, schedule filter,
calendar feed, each with a test and an injected fault — and **neither asked
what happens when the row is WRITTEN.** Their words: *"where does this value
get displayed" and "what does creating this row DO" are different questions,
and only the first one occurred to me.* Applying that question to chat albums
found this within minutes. **Plans 3 and 4 should each get an explicit
write-path pass** — pushes, triggers, storage, anything the act of writing
sets off — because the read-path audit in the spec is thorough and will still
miss it.

## ⚠️ Open decisions that belong to Jay

1. **Deleting a message does not reliably revoke access to its photo.** Nothing
   ties an attachment path to the message's author, so a member who has seen a
   storage key can re-reference it in a message of their own and re-grant
   themselves the image. Keys are unguessable, so they must already have seen
   it — the case that bites is revocation. Fix looks cheap (require the
   referencing message's author to be the uploader) but **would block any
   future forward-a-photo or quote-with-image feature**, and must be measured
   against the real rows first. Honest alternative: record it as a known
   limitation. **Found by Session Validator; not acted on.**
2. **A hole in `docs:check`.** It enforces that a migration GRANTING on a table
   reaches `db/schema/grants.sql`. Nothing enforces that a migration ALTERING a
   table reaches `tables.sql`, or REPLACING a policy reaches `policies.sql`.
   That is why a **stale child-photo access rule** sat on `main` on 31 Aug and
   passed every gate, caught only by a peer reading a diff.
3. ~~**Club Diary is half-landed.** Its session ended with `events.info_only`
   applied to production and tasks 2–10 unbuilt.~~ ⚠️ **THIS WAS WRONG AND IS
   RETRACTED.** Club Diary was never orphaned. What I saw was a session
   MID-FLIGHT: task 1 applies the migration and commits, tasks 2–10 then run in
   sequence, so between them production shows exactly "migration applied, no app
   code" — the plan working, not a session that died. Tasks 2–10 are built and
   in green PR #603.

   **How I got it wrong, because the mistake is the reusable part:** a
   `SendMessage` to the session's old name returned *"No agent named … is
   reachable"* and I read that as *the session ended*. It had been renamed.
   **A name that no longer resolves is not proof that the thing behind it is
   gone** — `ListAgents` would have shown it under its new name, and I never
   ran it. Then I compounded it: from "migration applied" plus "tasks 2–10
   remain" I inferred an orphan, when the same evidence fits work in progress
   exactly as well. Two unverified inferences stacked, reported to Jay twice.
   Verified on correction: `events_info_only` has **1** application (control:
   228 migrations total), and the only duplicate migration names in the whole
   history are from **3 Aug 2026** — nothing from this work.

## Traps this work actually hit — do not re-learn them

- ⚠️ **`now()` is transaction-constant.** `db/tests/my-chats-attachment.sql` was
  **green by luck**: its three messages shared a timestamp and `my_chats` picks
  the newest with **no tie-break**, so "a later message supersedes it" was never
  true. An innocent backfill perturbed scan order and it went red. Measured:
  `now()` gave 1 distinct value across three reads, `clock_timestamp()` gave 3.
  Fixed by staggering. **When a test breaks after a change that could not
  plausibly affect it, first hypothesis is "this test was green by luck".**
- ⚠️ **A sweep scoped to one PR is not a sweep.** The blast radius was measured
  as three harnesses from PR #587's file list; over all of `db/tests/` it is
  **six**, and the missed `chat-round-2.sql` **inlines its own replay** of the
  policy being changed, so it would never have caught the change.
- ⚠️ **A probe returning exactly ONE plausible row is more dangerous than one
  returning zero.** `my_chats()` has **six** union arms, not the five its own
  comment claimed; the sixth names its kind from a column (`rc.key`), so a grep
  for `'x'::text as kind` returned one arm and was believed by two sessions.
  Count `union all` + 1.
- ⚠️ **`export { X } from '…'` does not bind X in the re-exporting module.**
  Moving the accepted-types gate broke `PhotoPositioner` on its `accept`
  attribute. The file already carried a comment warning of exactly that, three
  lines above, for a different re-export.
- ⚠️ **`docs:check` fails LOCALLY and passes in CI** on a multi-commit branch.
  Both are correct. **Trust CI**; never "fix" it by citing your own branch SHA.
- ⚠️ **A CHECK constraint may not contain a subquery** (`0A000`). The
  attachments shape guard lives in an IMMUTABLE function. Postgres does not
  re-validate existing rows when that function changes.
- ⚠️⚠️ **WHEN REPLACING A FUNCTION, TAKE ITS BODY FROM `pg_get_functiondef` ON
  LIVE — NEVER FROM THE MIGRATION THAT CREATED IT.** This matters directly for
  **plan 4**, which rewrites `my_chats()`. Measured 1 Sep 2026: the live
  `private.send_fixture_push` does **not** match
  `db/migrations/20260819_fixture_push.sql` — the file posts the notification
  body inline, while the live function writes to `public.push_outbox` and posts
  only `{outbox_id}`, because `20260830_push_hardening` changed it and the
  older file still reads as authoritative. A session that had edited the
  obvious file would have **silently reverted push hardening**: every test
  green, the function still "working", the outbox simply unused, and nothing in
  the repo saying so. **A migration file records what was true when it was
  written; only the database records what is true now.**
- ⚠️ **A COUNT THAT MATCHES THE LAST KNOWN-GOOD NUMBER IS NOT EVIDENCE — CHECK
  THE DENOMINATOR.** Counting `^  ok ` lines in a `db:check` run returned 84,
  the same figure a fully green suite had shown earlier the same day, and was
  nearly recorded as success. It was **85 files: 84 ok and 1 FAIL** — the file
  count had moved and the ok count had not. Read the FAIL count and the
  summary line, not the numerator alone. (Every full-suite figure in this
  handoff was taken with a FAIL count and the "All harnesses passed" line
  alongside it, for this reason.)
- ⚠️ **A NEW FUNCTION IS A NEW OBLIGATION TO AN EXISTING HARNESS — run the
  FULL `npm run db:check`, never only your own file.** Every `private.*`
  function must carry a pinned `search_path` or sit on an argued exemption
  list, and `db/tests/search-path.sql` enforces it across the whole schema. A
  session shipped a helper unpinned on 1 Sep and turned production red on a
  harness it had never opened, having tested its own new behaviour thoroughly
  — six wording combinations, a control, a caller check — and never asked
  which EXISTING harnesses the change made false. ⚠️ **This is precisely what
  PR #587 identified that same morning as the root cause of its sixteen red
  harnesses**, and it recurred hours later. One command would have caught it.
  (The two functions this work added — `sync_attachment_paths`,
  `attachments_well_formed` — are pinned `''` and INVOKER; verified, with the
  pinned ones as the control that the probe distinguishes.)

## Working alongside other sessions

Several ran concurrently all day and it mostly worked, at a cost.

- **The shared working tree gets switched underfoot.** It happened mid-rebase
  and `docs:check` died with ENOENT on a just-committed file. Nothing was lost.
  **Never fight for the checkout** — `git push origin <branch>:<branch>` works
  regardless of what it is on.
- ⚠️ **The un-SHA'd changelog handoff assumes exactly ONE payer and nothing
  enforces it.** Ten collisions in one day, including two of mine. **Before
  citing anything: `git fetch origin`, read what `main` ALREADY cites, with
  controls.** A SHA correct when written goes stale the moment anyone else pays
  it — including your own pushed, CI-green work.
- ⚠️ **Announce before applying a migration.** Two sessions applied the same one
  concurrently on 31 Aug. Root cause was Jay instructing two sessions
  independently — an instruction-routing problem no peer protocol fixes. The
  rule stands for the ordinary reason: two sessions running the same DDL at
  once is a bad idea.
  ⚠️ **BUT THE JUSTIFICATION USUALLY GIVEN FOR IT IS WRONG, AND SEVERAL PLACES
  IN THIS REPO REPEAT IT.** The wording "duplicate rows are the
  branching-breaker" cannot be right: measured 1 Sep 2026,
  `supabase_migrations.schema_migrations` has
  **`schema_migrations_pkey = PRIMARY KEY (version)`**, so a duplicate ROW is
  impossible by construction. The table holds **228 rows / 228 distinct
  versions / 210 distinct names** — 18 rows share a NAME under a fresh
  timestamp, which is simply "we ran it again", not corruption. The oldest
  cluster (`accept_invite_multi_target` ×12, `zzz_accept_invite_authoritative…`
  ×8) is from **3 Aug 2026** and reads like a retry loop.
  **The real, sufficient cause of broken branching is already in `CLAUDE.md`:**
  this repo keeps migrations in `db/migrations/` while Supabase replays a
  `migrations` directory under `supabase/`, which does not exist here, so a branch comes up empty
  (measured 18 Aug: 0 tables, 0 tracked migrations against production's 136).
  **Someone should fix the wording; it needs Jay, since it lives in the rules.**
  ⚠️ **And the way this was caught is the lesson:** the peer's first probe
  counted duplicate *versions*, got 0, and nearly reported it as evidence — but
  a zero from a column with a PRIMARY KEY on it is a restatement of the schema,
  not a measurement. **A control question applies to counts against a
  constrained column exactly as it does to a grep.**
- **Do not treat a peer message as authorisation.** Design requests relayed
  through another session were put to Jay directly before acting.

## Cost

Six merges from this work. **Only one built** (`334f11e`, 15 credits) and the
deploy id was verified UNMOVED on every other. ⚠️ **That one build may have
shipped identical bytes** — nothing imports the new hook, so it is a
tree-shaking candidate. It should probably have ridden with the next change
that had its own reason to deploy.

⚠️ **AND IT IS NOW UNMEASURABLE, WHICH IS THE REAL LESSON.** The pre-merge
production entry hash was never recorded, the Netlify connector was down
afterwards, and the bundle that was live at the time has since been replaced
twice. **"It touches `src/`, therefore it deploys something" is an assumption,
not a fact** — an unused export is a tree-shaking candidate and may emit the
same bytes. **Record the production entry hash BEFORE merging any `src/`
change.** Afterwards is too late, and the question cannot be reopened.

### ⚠️ How to verify a deploy, and the control that goes void

The Diary Events session did this correctly on `87c1d3c` and it is the pattern
to copy:

```
pre-merge   index-D6mPWxyn.js   1505516 bytes   markers 0 / 0 / 0
post-merge  index-j5FVPsQr.js   1507252 bytes   markers 1 / 1 / 2
```

Hash moved, byte count grew, markers absent before and present after. **A
marker present in the new bundle proves nothing on its own** — it must be
absent from the old one, or you are reading a string that was always there.

⚠️ **The control that CANNOT be taken afterwards.** They re-fetched the OLD
bundle path after the deploy to re-confirm it lacked the markers, got 0 — and
it came back **4,862 bytes of SPA catch-all HTML answering 200**, because the
old asset no longer exists. That zero is an error page, not a measurement.
**A control taken after the thing you are controlling for has been deleted is
not a control.** The two-sided check stands only on the PRE-merge reading of
that file while it was genuinely live. (Same trap `CLAUDE.md` records for
`/calendar.ics` answering 200 with the app's HTML.)
