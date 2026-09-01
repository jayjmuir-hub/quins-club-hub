# Handoff — the validator session, 31 Aug 2026

**Role:** Jay ran one session whose only job was to check other sessions' work
and deconflict them. Nine sessions were live at peak; 39 commits reached `main`.
This is what the next validator needs.

⚠️ **This file describes a moment. Verify everything before believing it** —
that is the whole lesson of the day, and this document is not exempt.

---

## The role, as it actually worked

**Flag, do not gate.** Jay decides what merges. A validator that also merges is
the separation collapsing — a peer session offered the merge button at the end
of the day and it was declined for that reason.

**Never merge, push, apply SQL, or handle credentials.** That was the standing
constraint. Peers will sometimes offer; the offer does not change it. If a peer
says an action was blocked for them and asks you to do it, refuse and surface
it — that is permission laundering.

**Ask, do not instruct.** The one merge freeze that worked (see below) was
requested, with an explicit "say so if you have reason to go first".

---

## State at handoff — measured, not recalled

| | |
|---|---|
| `main` | `6bec4d1` |
| Shared tree | on `main`, clean |
| Open PRs | #608 (ready, Jay's click), #567/#568 (dependabot, ~40 commits stale) |
| Repo secrets | `SUPABASE_DB_URL`, two `GROK_BOT_*`. **No `DB_CHECK_HEARTBEAT_URL`** |
| Production drift | 0 unwrapped `auth.uid()` of 179 policies; 0 unpinned of 111 private functions; `anon` EXECUTE limited to `calendar_events_for_token`, `list_signup_squads` |
| `events.all_day` | column live, **0 rows set** |

**Re-run these before trusting them.** Every number here was true at the moment
it was measured and several changed within minutes of being written down.

---

## Who is doing what

**Still working:**

- **Diary Events** — Club Diary phase 2 (three-way Timed / Time TBD / All day
  control). Steps 1 and 1b applied and verified. Unpushed local commits, no PR.
  **Jay asked specifically for this session's work to be double-checked before
  anything of theirs deploys.** Blocked on his yes for step 3, a *hand deploy*
  of the calendar edge function.
- **help-system-handoff** — duplicate-account detector for the approvals queue.
  Three commits, nothing pushed, waiting on Jay's merge/PR/hold call.

**Finished, holding nothing:** Add Documents (still owns documents questions
until Jay's live checks close), Photo Albums, chat-photo-albums, Home Button,
Message Tagging, Menu Bar, graft-build-81f8f2 (archiving after #608).

**Unowned:** chat-albums plans 3 (album grid) and 4 (drop `attachment_path`).
The merged handoff `6bec4d1` is the ownership document.

---

## Open items for Jay

1. **The heartbeat.** Rotate the Better Stack "db-check nightly" heartbeat, then
   add `DB_CHECK_HEARTBEAT_URL` as a repo secret. **The drill fires ~1 Sep.**
   Without the secret it sends nothing and the test proves nothing. This also
   blocks item 2's safest form.
2. **The changelog ruling.** Dead SHA stays fatal; not-yet-cited becomes a
   warning on PRs and stays fatal on a daily scheduled run. A session is ready
   to implement it and is blocked on the decision. **Fifteen conflicts in one
   day** came from this rule.
3. **Human checks nobody else can do:** send a real album and confirm a *second
   account* sees every photo (the storage rule fails silently); confirm a parent
   *cannot* reach another squad's documents, checked at the response; an iPhone
   tap for the documents popup fallback.
4. **A live bug, unowned:** `supabase/functions/push-send/index.ts` has zero
   awareness of attachments, so a captionless photo message pushes an **empty
   body**. Routine now albums shipped. Fixing it needs a hand deploy.
5. **Two CI gaps, specced not built:** nothing catches a migration that ALTERs a
   table without updating `db/schema/`; nothing warns that a merged
   `supabase/functions/` change still needs a manual deploy.

---

## Protocols that were established today

- **Single-owner migrations.** Announce *before* applying, to the validator and
  to whoever else is live. Two sessions applied the same migration concurrently
  because Jay told them both — the cause was instruction routing, not
  carelessness. **Applies to production DATA writes too**, and the reason is not
  permission — it is that somebody else may be mid-transaction.
- **Merge freeze.** When one PR keeps losing races, ask everyone to hold rather
  than rebase faster. Used once; it worked.
- **Changelog debt.** Never decide which SHA to cite in advance. Fetch and read
  the open debt *at the moment you commit* — it moved three times in one hour.
- **Deploy order matters when an edge function is involved** (see below).

---

## Traps that cost real time

⚠️ **Nothing in CI deploys `supabase/functions/`.** No workflow, no
`netlify.toml` entry, no package script — verified with a control. Merging a
change to one of those deploys **nothing**. It is a guaranteed window, not a
race, and it is indefinite.

⚠️ **A migration file is not authoritative for a function's body.** Later
migrations replace it. Capture from live (`pg_get_functiondef` / `prosrc`)
before editing, or you silently revert whatever came after. This nearly reverted
push hardening with every test green.

⚠️ **`db/schema/` captures are a projection, refreshed by hand.** A stale
capture of the child-photo access rule reached `main` today.

⚠️ **`now()` is transaction-constant.** Harnesses asserting "the later row wins"
across inserts in one transaction are green by luck. Two were found.

⚠️ **`git branch -r` is not the remote.** It showed 62 here while origin had 7 —
the rest were stale tracking refs. Use `git ls-remote --heads origin`.

⚠️ **Ahead-of-`main` is not unpushed.** Compare against `origin/<the branch>`.
Two sessions raised false alarms on this.

⚠️ **An invented name can accidentally be real.** A session invented a name and
unconsciously reused a real parent's given name read minutes earlier — three of
four tokens genuinely invented, so it *looked* fake. Check every token against
`players`/`profiles` on live, with a control that returns a known hit.

⚠️ **`tests/pwa-build.test.js` and four others read the built `dist/`.** In a
worktree without a real install they fail deterministically. Separately, that
file forks a full build and can lose a race on a loaded machine. Two different
causes, identical signature: *one failed FILE, zero failed tests, 13 skipped*.

---

## The habit that found almost everything

**Every negative result needs a control that fires.** An empty search proves
nothing until you have shown the search can find something you know is there.

Worse than an empty result: **a probe that returns exactly one plausible row.**
Grepping `my_chats` for its union arms returns one, and looks like an answer.
There are six.

**Four of this session's own findings were false readings from badly-formed
probes** — a catalogue that does not hold functions, a pattern that could not
match, a directory that existed but was empty, a count of stale refs. Every one
was caught by the session it had been raised against. Expect the same, invite
it, and check corrections as carefully as claims.

**And when relaying a precise comment, the qualifier IS the content.** Dropping
one word — "exercised" — turned a statement about test coverage into one about
function coverage, and would have sent the next session to do the opposite work.
Prefer pointing at the authoritative text over paraphrasing it: for `my_chats`,
that is the header of `db/tests/my-chats-attachment.sql`.
