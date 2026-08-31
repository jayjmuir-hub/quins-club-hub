# Chat photo albums — paste, drag-and-drop, and up to ten photos a message

**Status: SHIPPED except plan 4 — 1 Sep 2026.** Plans 1 (`918fa59`), 1b
(`812a185`), 2 (`ebda2f3`, #605) and 3 (#613) are live. **Plan 4 — dropping
`attachment_path` and rewriting `my_chats()` — is NOT built**, and it is
deliberately blocked: a phone on a cached service-worker bundle still writes
that column and cannot be forced to update, so dropping it makes that photo
unreadable by everyone, silently and per-device.

⚠️ **Deviations from the spec, recorded here rather than left to the code:**
- The album grid caps at FOUR tiles with a `+N` badge; the spec did not fix a
  number.
- The lightbox CLAMPS at both ends rather than wrapping — looping gives a
  reader no signal they have seen the whole album.
- **The chat LIST still previews an album as "📷 Photo"**, because
  `my_chats()` returns `last_attachment_path` and no count. Fixing it needs the
  function rewritten, so it belongs to plan 4. Recorded, not faked.
- `attachmentPreviewLabel()` took an OPTIONAL `count` rather than a new
  signature: four screens and eleven test files call it with a path alone.

## What was asked for, and how it grew

Jay, 31 Aug 2026: *"the club hub — add paste and drag-drop for photos"*, after
noticing he could not paste a picture into a chat.

⚠️ **The premise was half wrong, and the half that was wrong matters.**

- **Paste has never existed anywhere in this app.** `onPaste` and
  `clipboardData` appear in **zero commits** across all branches and all
  history. Verified with a control (`git log -S"pickPhoto"` finds its three
  commits, so the search works). This was not a regression and there was no
  bug to find.
- **Drag-and-drop DOES already exist**, in `src/components/PhotoPositioner.jsx`
  — a dashed drop zone used by the player photo field, a member's own profile
  photo, and the admin staff screen. So "I have dropped a photo into this app
  before" was correct; it was never into a chat.

The feature then grew on Jay's ruling: asked whether several photos should
send as several messages or as one album, he chose **one album, capped at ten**
— knowing it costs a database migration and at least one extra deploy.

## The decisions, and who made them

| Decision | Ruling | By |
|---|---|---|
| Where a drop is accepted | The whole conversation pane, with a tinted "drop to attach" overlay | Jay |
| Several photos | One album per message, **max 10** | Jay |
| Storage shape | **One attachment list; the old single field retired** — the tidier option, taken over the lower-risk one after both were put | Jay |
| Three-photo layout | **One hero left, two stacked right** (the WhatsApp arrangement) | Jay |
| Reaching the tidy end state | Expand-then-contract, three steps | Claude — see "the argument against" |

## ⚠️ Section 1 — the data, and the safeguarding boundary

**This is the whole job. Everything else is presentation.**

A chat photo is not protected by having an unguessable name. It is protected
by the `chat media read` policy in
`db/migrations/20260824_chat_round_2.sql`, which grants a read when **you
uploaded the file, or a live message points at it**:

```
private.chat_media_owner(name) = (select auth.uid())
or exists (select 1 from public.messages x
           where x.attachment_path = name and x.deleted_at is null)
```

Photos 2–10 of an album are pointed at by nothing under today's schema. So:

- Leave the policy alone and **only the sender sees photos 2–10.** Everyone
  else gets blank squares.
- Loosen it carelessly and **you widen who can see photographs of children.**

The policy's `= name` becomes a membership test against the list. That single
line is the security boundary and gets the fault-injection test below.

### ⚠️ The field carries voice notes too

`src/data/chatMedia.js:37` tells a voice note from a photo **by inspecting the
path**. So the new column is *attachments*, not *photos*, and the album grid
must filter voice notes out rather than render one as a picture. Missing this
puts a broken square where a voice message belongs.

### The three steps, and why it is not one

The end state is a single list with the old single field gone. It is reached
in three moves because **this app is a PWA**: after a deploy, phones keep
running a cached older bundle for a while. A straight swap breaks photo
sending for exactly those people, silently, and they are the last to find out.

1. **Migration 1 — additive, nothing breaks.** Add the list column; backfill
   every existing row from the old field; add a trigger keeping the two in
   agreement in both directions; update the `chat media read` policy and the
   `messages_body_check` constraint to read the list. **The currently live app
   keeps working untouched** — it writes the old field, the trigger mirrors it.
2. **Deploy the app.** It writes the list. Stale cached clients still work,
   because the trigger is still mirroring.
3. **Migration 2, about a week later.** Drop the old field and the trigger;
   rewrite `my_chats()` to read the list. Now genuinely tidy, with no window
   in which anything was broken.

### Blast radius — measured, not guessed

| What | Where | Needs |
|---|---|---|
| 4 message-insert paths | `src/data/messages.js:102`, 531, 563, 647 | write the list |
| Message query + quoted embed | `src/data/messages.js:35`, 37 | select the list |
| **Forwarding** | `src/data/messages.js:672` | carry all ten, not just the first |
| **Delete-my-own-photo** | `src/lib/useDmThread.js:390`, `src/lib/useChannelThread.js:411` | remove all ten from storage |
| Bubble rendering | `src/components/MessageRow.jsx:232`, `src/components/DmThread.jsx:255` | the grid |
| Reply / quote preview | `src/components/MessageRow.jsx:89`, `src/components/DmThread.jsx:109`, 204, 362, `src/screens/StarredMessages.jsx:86` | "10 photos", not one filename |
| Chat-list preview | `src/screens/ChatList.jsx:97` + `my_chats()` | step 3 |

⚠️ **Two of these a single-file edit would miss, and both matter.**
Forwarding currently re-points at one path — an album must forward whole.
Deleting your own album must clean up all ten files, or nine photographs of
children remain in storage with no live message pointing at them.

## Section 2 — the composer

**One tray, not two copies.** `pickPhoto` is byte-identical in
`src/lib/useDmThread.js:287` and `src/lib/useChannelThread.js:291` today.
Adding paste, drop and multi-select by copying would leave two divergent
copies of something four times more complex, so the tray becomes one small
hook both threads consume. This removes existing duplication rather than
doubling it.

**Three doors, one gate.** The attach button (now `multiple`), Ctrl+V, and
drop all funnel into one "add these files" function applying the same rules:
is it an image, does it decode, are we under ten. The gate already exists —
`isAcceptableImage` in `src/components/PhotoPositioner.jsx:61`, written
because *"the drop path cannot use `accept`"*.

⚠️ **One tidy-up while there:** the accepted-types list is written out twice —
`ACCEPTED_IMAGE_TYPES` in `src/components/PhotoPositioner.jsx:59` and
`UPLOAD_TYPES` in `src/lib/imageResize.js:128`. Two lists that must agree,
with nothing making them. Move the gate beside the types; keep one list.

**Paste, and the thing that must not break.** Pasting **text** into the
message box is far commoner than pasting a photo. The handler intervenes only
when the clipboard actually carries image files and otherwise does nothing at
all. Screenshots arrive as a file named `image.png`, so ten pasted screenshots
are ten identical filenames — **the tray shows thumbnails, not names.**

**Drop, and two traps.** Without an explicit claim on the drag, the browser
does its default thing and **opens the photo as a page, discarding the typed
draft**. And the drag highlight flickers off each time the cursor crosses a
message bubble unless tracked properly. Both get handled and both get a test.

**The tray.** Up to ten thumbnails in a sideways-scrolling row, each with its
own ×, plus a count. It works on a phone: paste and drop are desktop-only, but
choosing several photos from the picker is not.

**Upload 7 of 10 fails → all or nothing.** The message is not sent, the seven
already uploaded are deleted, the tray and the typed text survive untouched,
and the error names the photo that failed. Sending the six that worked is the
worst outcome available — the sender believes ten arrived.

⚠️ **Ten uploads is the same road as the 28 Aug slow-site incident** (UAE fixed
line → Supabase Tokyo, 15-second hangs). Sequentially that is a minute of
unexplained spinner. Uploads run a few at a time, and the button reads
**"Sending 3 of 10…"** so a bad day on that route looks like progress rather
than a hang.

## Section 3 — the album bubble and the viewer

| Photos | Layout |
|---|---|
| 1 | Single image — **identical to today**, so every existing message is untouched |
| 2 | Side by side |
| 3 | **One hero left, two stacked right** (Jay's ruling) |
| 4 | Even 2×2 |
| 5–10 | 2×2 with the remainder counted on the fourth tile — `+7` for ten |

- **The viewer.** Any tile opens the existing lightbox at that photo, with
  swipe and arrow keys between them and a "4 of 10" counter. Today's lightbox
  handles one image, so it gains prev/next — and per `claude/specs/accessibility.md`
  that means real keyboard support (arrows, Escape, focus trapped in the
  overlay), not swipe alone.
- **Voice notes are filtered out of the grid** — see section 1.
- **A reply or quote of an album** reads "📷 10 photos", not a filename.

## Section 4 — proving it, and getting it live

### The test that matters most

The storage boundary cannot be unit-tested. It gets a harness in `db/tests/`,
the rolled-back-transaction kind described in
`claude/runbooks/db-harnesses.md` — **not** a database branch, which does not
work on this repo. It asserts a member of the thread can read photo 7, and a
member of a different thread is refused it.

⚠️ **Broken on purpose first.** Take the extras back out of the policy, watch
the test go red, put them back. A check that has never failed is not a check.

⚠️ **Test the BEHAVIOUR, not the policy text.** A harness that reads policy
expressions out of the catalogue has a trap in it: `WITH CHECK` lives in
`polwithcheck`, not `polqual`, so a `polqual`-only probe **silently passes
every INSERT policy** — and a case-sensitive match misses `SELECT auth.uid()`.
Both were measured giving false readings against production on 31 Aug 2026 (a
control found 0 where the truth was 65). Asking "can this member actually read
this object" sidesteps the whole class. If any introspection is unavoidable,
cover both columns and both cases, and give every negative a control that must
fire.

### ⚠️ THREE EXISTING HARNESSES WILL GO RED, AND THAT IS CORRECT

PR #587 rewrote the chat harnesses to assert against the **live** schema
instead of an inlined replica, so they are now a tripwire under exactly this
change. Measured against that branch, by hits on `attachment_path` /
`my_chats` / `chat_media`:

| Harness | Hits | Why it fires |
|---|---|---|
| `db/tests/my-chats-attachment.sql` | 23 | Asserts `last_attachment_path` directly. **Migration 2 retires that column, so this one breaks hardest.** |
| `db/tests/chat-list.sql` | 17 | Calls `public.my_chats()` live |
| `db/tests/group-chats.sql` | 8 | Calls `public.my_chats()` live |

**All three are updated in the SAME pull request as the migration**, never
after. Going red is the tripwire working; shipping a migration that leaves
them red is how it stops being one.

### ⚠️ Retiring `attachment_path` is a REWRITE of `my_chats()`, not a swap

Measured on the #587 branch's `db/schema/functions.sql`: the function body is
131 lines and mentions `attachment_path` **14 times** (control: 31
occurrences of `select` in the same body, so the count fires). It is woven
through, not referenced once per branch.

⚠️ **AND IT HAS SIX ARMS, NOT FIVE.** Measured, the arms are **squad, staff,
club, ROLE CHANNELS, dm, group** — the fourth was added by
`db/migrations/20260830_role_channels.sql` on **30 Aug 2026, the day before
this spec**, and it selects `attachment_path` twice like the rest.

✅ **The header comment in `db/tests/my-chats-attachment.sql` said "all five"
and was FIXED to six by PR #589 while this spec was in review.** Recorded
rather than deleted, because the failure is the reusable part: the comment
was true when written and wrong a day later, and it was then repeated twice
in conversation by two sessions before anyone measured it — exactly the kind
of number CLAUDE.md rule 8 says to measure rather than copy. ⚠️ **The probe
that hid the sixth arm returned exactly ONE plausible arm, not zero**, because
that arm names its kind from a column (`rc.key`) rather than a quoted literal.
A confident-looking single row gets believed; an empty result invites
suspicion. Count the `union all` separators, never the label pattern.

**Consequence for coverage.** That harness exercises the **DM arm only**, so
today five of the six arms have no last-attachment coverage at all and a
rewrite could break squad, staff, club, role-channel and group behaviour
while the harness stayed green. Since the file is being rewritten against the
attachment list anyway, **it gains the missing five arms in the same pass** —
reproducing a DM-only blind spot in new form would waste the one moment we
are in a position to close it. Fix the header comment's count while there.

⚠️ **`my-chats-attachment.sql` was NOT on the list handed over** — it was found
by sweeping every `db/tests/` file in #587 rather than trusting the two named.
Sweep again before implementing; #587 may have moved.

### House style for the new harness

PR #587 is the current shape for `db/tests/` and the chat-media harness
follows it: a synthetic club with invented names and `.invalid` inboxes
(CLAUDE.md rule 9), a header comment listing the numbered assertions,
`perform pg_temp._chk(...)` for each, assertions against live rather than an
inlined replay, and a **SELF-TEST arm that deliberately fails** to prove the
check is not vacuous.

### Unit tests written to fail against today's code

- forward an album → **ten** paths at the destination, not one
- delete your own album → **ten** files removed from storage, not one
- an eleventh photo is refused; a dropped PDF is refused
- **pasting plain text still just pastes text**
- a failed upload leaves nothing behind and keeps the draft
- a voice note never appears in the grid

### ⚠️ Fixtures

`harness/stubs/messages.js` needs album fixtures, and those stubs are rendered
to PNGs that reach the parent-facing guides. **Invented names, invented
captions, nothing real** — this is exactly the path by which a member's name
and a child's address were published in August.

### Rollout

| Step | Where | Cost | Explicit yes |
|---|---|---|---|
| 1. Migration 1 — list, backfill, sync trigger, new storage policy | Supabase | none | yes — it touches a security policy |
| 2. The app | Netlify — **`main` is production, this is a live release** | 15 credits | **yes** |
| 3. Migration 2 — drop the old field, rewrite `my_chats()` | Supabase | none | yes, ~a week later |

**Then verify live, because a green suite is not a working site.** Send a
three-photo album on the real site, sign in as a second account, confirm
photo 3 renders for them. That is the safeguarding boundary proven in
production rather than in a transaction that rolled back.

## ⚠️ The arguments AGAINST what is being built

Recorded because somebody will make them again.

1. **"One message per photo needed no migration at all."** True, and it was
   the recommendation. Five photos dropped would have become five bubbles,
   with zero schema change, every per-message feature untouched, and a partial
   failure naming the photo that failed. It was rejected for the album, which
   gives one notification instead of five and reads better. **The album is
   prettier; it is not more useful.** If this work stalls, that is the fallback
   and it is cheap.
2. **"Keep the old field for photo 1 and add a list for 2–10."** Zero
   migration of existing rows, nothing existing rewritten, and abandoning the
   work halfway breaks nothing. Rejected as untidy: a permanent "photo 1 is
   special" rule in the schema. The cost of choosing tidiness is the
   three-step rollout in section 1.
3. **"Three steps is over-engineering — just swap the column and deploy."**
   This is the one most likely to be proposed again, and it is wrong for a
   specific reason: **this is a PWA.** The window is not the deploy minute, it
   is every phone still running a cached bundle, and for those people photo
   sending would fail silently. Step 3 exists to be boring.
4. **"Ten is arbitrary."** It is. It is a cap chosen so an accidental drop of
   a folder cannot post a hundred photographs of children into a squad chat.
   Any number would do; having no number would not.

## What this deliberately does NOT do

- **No album for player photos, notices, or social ideas.** Chats only.
- **No editing an album after sending** — no adding or removing a photo from a
  message that has already gone.
- **No captions per photo.** One message body covers the album.
- **No video.** The accepted-types list is unchanged: JPEG, PNG, WebP, HEIC,
  HEIF.
