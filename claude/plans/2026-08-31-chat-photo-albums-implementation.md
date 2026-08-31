# Chat photo albums — implementation plan 1 of 4: the data foundation

**Status: NOT SHIPPED — plan only, 31 Aug 2026.** Update this line when it
ships, and record deviations here rather than leaving the code as the only
account.

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`
> to work task-by-task. Steps use `- [ ]` checkboxes.

**Spec:** `claude/plans/2026-08-31-chat-photo-albums.md`. Read it first — it
carries the safeguarding reasoning this plan only implements.

**Goal:** Move chat attachments from a single `messages.attachment_path` to a
list, so a message can carry up to ten, **with no user-visible change and no
moment where anything is broken.**

**Architecture:** Expand-then-contract. This plan is the *expand* half: add
`attachment_paths text[]`, backfill it, and keep it in sync with the old
column by trigger in both directions, so the currently-deployed app and every
phone on a cached bundle keep working untouched. The storage read policy — the
thing that decides who may view a photo — moves to the list in the same
migration. The *contract* half (dropping `attachment_path`) is plan 4.

**Tech stack:** Postgres 17 (Supabase, project `lusmshimxdcxpnrktlgz`), Vite +
React, vitest, `db/tests/` rolled-back SQL harnesses run by `npm run db:check`.

## Why this is four plans

Each produces working, testable software on its own and can be reviewed and
merged independently. **Do them in order** — 2 and 3 both depend on 1.

| Plan | Scope | User-visible? |
|---|---|---|
| **1 (this file)** | The list column, the sync trigger, the storage boundary, the data layer, the three existing harnesses | No — invisible by design |
| 2 | The composer: multi-select, paste, drag-and-drop, the ten-thumbnail tray, all-or-nothing upload with progress | Yes — sending several photos starts working |
| 3 | The album bubble grid, the lightbox with prev/next, reply and quote previews reading "10 photos" | Yes — albums start *looking* like albums |
| 4 | Contract: drop `attachment_path`, rewrite `my_chats()`, rewrite the attachment harness across all six arms | No |

⚠️ **Plan 4 must not start until plan 2 has been live long enough that stale
cached bundles are gone.** The spec argues this; do not collapse it.

### ⚠️ Carried forward for plan 2: the drop overlay meets the chrome

From the Menu Bar Redesign session, 31 Aug 2026, about work merged that day.
**The dock and masthead are fixed `z-40` islands with an auto-hide transform**
(`.glass-island` / `.glass-dock` in `src/index.css`; the auto-hide is
`src/lib/useAutoHideOnScroll.js`, untouched since 23-24 Aug). So a full-pane
drop overlay must either sit **under** `z-40` or deliberately cover the chrome
— and **the bars will slide mid-drag if the drag scrolls the page.** Check it
by hand on a real phone, not only in the harness. That session confirmed it
adds **no** document-level drag, drop or paste listeners, so there is nothing
to fight over for the event handlers themselves.

## Global constraints

Copied verbatim from the spec and `CLAUDE.md`. Every task inherits these.

- ⚠️ **`main` IS PRODUCTION.** It deploys to https://adhquins-clubhub.com. A
  push is a live release. **A deploy costs 15 Netlify credits.** Show the diff
  and get Jay's explicit yes.
- ⚠️ **Never `git add -A`.** Stage explicit paths.
- ⚠️ **Never write a real person's name into this repo**, `db/` and `harness/`
  included. Invented names, `.invalid` inboxes.
- ⚠️ **Never `[skip ci]`** — it suppresses the required checks and the PR can
  never merge.
- **The cap is 10 attachments per message**, enforced in the database as well
  as the client.
- **Run `npm run docs:check` after committing**, not only after staging.
- **Never cite your own branch's SHA in the changelog** — leave the entry
  un-SHA'd for the next PR.
- ⚠️ **The working tree at `C:\Users\Jay\GitHub\quins-club-hub` is SHARED with
  other live sessions.** Before every task: `git fetch origin` then
  `git rev-list --left-right --count origin/main...HEAD`. If another session
  has moved the checkout, do not fight it — push branch refs directly
  (`git push origin <branch>:<branch>`), which works regardless of checkout.
- Feedback loop: `npm run test:watch`, not `npm test`, until you are about to
  push.

---

## Task 1: The migration and its storage-boundary harness

**Files:**
- Create: `db/migrations/20260901_message_attachment_list.sql`
- Create: `db/tests/chat-album-media.sql`
- Modify: `db/schema/grants.sql` (only if the column grant needs capturing —
  `docs:check` rule 7 will tell you)

**Interfaces:**
- Produces: `public.messages.attachment_paths text[]`, non-null default `'{}'`;
  trigger `sync_attachment_paths` on `public.messages`; storage policy
  `chat media read` reading the list.
- Consumes: nothing.

- [ ] **Step 1: Write the harness FIRST, and watch it fail**

`db/tests/chat-album-media.sql`. Follow the house style from PR #587:
synthetic club, invented names, `.invalid` inboxes, numbered assertions in the
header, `pg_temp._chk(...)`, assert against live, and a SELF-TEST arm.

```sql
-- Harness for db/migrations/20260901_message_attachment_list.sql.
--
-- THE BOUNDARY THIS EXISTS FOR. A chat photo is not protected by an
-- unguessable name. `chat media read` on storage.objects grants a read when
-- you own the object OR a live message points at it. Before the album, a
-- message pointed at ONE object. If the policy is not moved to the list,
-- photos 2..10 are pointed at by nothing and only the sender can see them;
-- if it is loosened carelessly, it widens who can see photographs of
-- children. Both failures are silent from the app.
--
-- Assertions:
--   1. the sender can read attachment 1 of their own album
--   2. a DIFFERENT member of the same conversation can read attachment 7
--   3. CONTROL: a member of ANOTHER conversation is REFUSED attachment 7
--   4. CONTROL: attachment 7 of a SOFT-DELETED message is refused everyone
--        but its owner (proves the deleted_at arm still bites)
--   5. cardinality > 10 is refused by the database, not just the client
--
-- ⚠️ Assertions 3 and 4 are the ones that matter. Without them a policy of
-- `using (true)` would pass 1 and 2.
begin;

create or replace function pg_temp._chk(ok boolean, what text) returns void
language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', what; end if;
end $$;

-- ... build a synthetic club, two conversations, three members, one album
-- message with 8 attachment paths under the sender's own prefix ...

rollback;
```

⚠️ **Test the BEHAVIOUR, not the policy text.** Do not read `polqual` — `WITH
CHECK` lives in `polwithcheck` and a one-column probe silently passes every
INSERT policy. Ask "can this member actually select this object row".

- [ ] **Step 2: Run it and confirm it FAILS**

```bash
npm run db:check
```

Expected: `chat-album-media.sql` fails — `attachment_paths` does not exist yet.
That failure is the point; a check that has never failed is not a check.

- [ ] **Step 3: Write the migration**

`db/migrations/20260901_message_attachment_list.sql`:

```sql
-- 1 Sep 2026 — messages carry a LIST of attachments, not one.
-- Expand half of expand-then-contract. attachment_path stays, and a trigger
-- keeps the two agreeing in BOTH directions, so the currently-deployed app
-- and every phone on a cached service-worker bundle keep working untouched.
-- The contract half is a later migration; do not merge them.
begin;

alter table public.messages
  add column if not exists attachment_paths text[] not null default '{}';

comment on column public.messages.attachment_paths is
  'Every attachment on this message, in display order, max 10. Photos AND '
  'voice notes — src/data/chatMedia.js tells them apart by path, so the album '
  'grid must filter voice notes rather than render one. attachment_path is '
  'kept in sync as element 1 by private.sync_attachment_paths() until the '
  'contract migration drops it.';

-- Backfill: every existing single attachment becomes a one-element list.
update public.messages
   set attachment_paths = array[attachment_path]
 where attachment_path is not null
   and cardinality(attachment_paths) = 0;

-- ⚠️ THE CAP LIVES HERE TOO, not only in the client. A client cap is a
-- suggestion; this is the rule.
alter table public.messages drop constraint if exists messages_attachment_cap;
alter table public.messages add constraint messages_attachment_cap
  check (cardinality(attachment_paths) <= 10);

-- Both directions, so an OLD client writing attachment_path and a NEW client
-- writing attachment_paths both end up consistent.
create or replace function private.sync_attachment_paths()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if cardinality(new.attachment_paths) > 0 then
    new.attachment_path := new.attachment_paths[1];
  elsif new.attachment_path is not null then
    new.attachment_paths := array[new.attachment_path];
  end if;
  return new;
end $$;

drop trigger if exists sync_attachment_paths on public.messages;
create trigger sync_attachment_paths
  before insert or update on public.messages
  for each row execute function private.sync_attachment_paths();

-- A photo may still travel alone: empty body is legal alongside ANY
-- attachment, now counted from the list.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  length(btrim(body)) <= 2000
  and (length(btrim(body)) >= 1 or cardinality(attachment_paths) > 0)
);

-- ⚠️ THE SECURITY BOUNDARY. `= name` becomes membership of the list.
drop policy if exists "chat media read" on storage.objects;
create policy "chat media read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (
      private.chat_media_owner(name) = (select auth.uid())
      or exists (select 1 from public.messages x
                 where name = any(x.attachment_paths) and x.deleted_at is null)
    )
  );

-- Guard: refuse to finish if the trigger did not install exactly once.
do $$
declare n int;
begin
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'messages' and t.tgname = 'sync_attachment_paths'
     and not t.tgisinternal;
  if n <> 1 then
    raise exception 'ABORTING: expected exactly one sync trigger, found %.', n;
  end if;
  raise notice 'guard passed';
end $$;

commit;
```

- [ ] **Step 4: Apply it, then re-run the harness**

Apply through the Supabase MCP `apply_migration` (this repo keeps migrations
in `db/migrations/`, so Supabase branching cannot replay them — see
`CLAUDE.md`). Then:

```bash
npm run db:check
```

Expected: `chat-album-media.sql` **ok**, and all other harnesses still ok.

- [ ] **Step 5: Prove the boundary by breaking it**

Temporarily change the policy's list test back to `x.attachment_path = name`,
re-run, and confirm assertion 2 (a second member reading attachment 7) FAILS.
Then restore it and confirm ok again. ⚠️ **Commit before injecting the fault** —
`git checkout --` reverts to the last commit, not to "before my last edit".

- [ ] **Step 6: Commit**

```bash
git add db/migrations/20260901_message_attachment_list.sql db/tests/chat-album-media.sql
git commit -m "feat(db): messages carry a list of attachments, not one"
```

---

## Task 2: The data layer writes and reads the list

**Files:**
- Modify: `src/data/messages.js` — `SELECT` (L33-40), four insert sites
  (L102, L531, L563, L647), `forwardMessagesTo` (L669-680)
- Modify: `src/lib/useDmThread.js:390`, `src/lib/useChannelThread.js:411`
- Test: `tests/chat-attachment-list.test.js` (create)

**Interfaces:**
- Consumes: `messages.attachment_paths` from Task 1.
- Produces: every send helper accepts `attachmentPaths: string[]` (the old
  `attachmentPath: string | null` keeps working and is mapped to a
  one-element list); message rows carry `attachment_paths`.

- [ ] **Step 1: Write the two failing tests that catch the subtle bugs**

`tests/chat-attachment-list.test.js`. These are the two the spec names as
"a single-file edit would miss":

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('forwarding an album', () => {
  it('carries EVERY attachment, not just the first', async () => {
    const sent = []
    vi.doMock('../src/lib/supabase.js', () => makeStub(sent))
    const { forwardMessagesTo } = await import('../src/data/messages.js')
    await forwardMessagesTo(
      { kind: 'dm', conversation_id: 'c1' },
      [{ body: 'tour', created_at: '2026-09-01T10:00:00Z',
         attachment_paths: ['u/a.jpg', 'u/b.jpg', 'u/c.jpg'] }],
    )
    expect(sent[0].attachment_paths).toEqual(['u/a.jpg', 'u/b.jpg', 'u/c.jpg'])
  })
})

describe('deleting my own album', () => {
  it('removes EVERY file from storage, not just the first', async () => {
    const removed = []
    const gone = { author_id: 'me', attachment_paths: ['u/a.jpg', 'u/b.jpg'] }
    await removeAttachmentsFor(gone, 'me', (p) => removed.push(p))
    expect(removed).toEqual(['u/a.jpg', 'u/b.jpg'])
  })
})
```

- [ ] **Step 2: Run them and confirm they FAIL**

```bash
npm run test:related -- src/data/messages.js
```

Expected: both fail — forwarding sends one path, deletion removes one file.
⚠️ If either PASSES here, the fixture is not discriminating and must be fixed
before you go on; a test that passes against the bug it exists to catch is
worse than none.

- [ ] **Step 3: Add the list to the SELECT**

`src/data/messages.js` L33-40 — add `attachment_paths` beside
`attachment_path` in both the main list and the `quoted:` embed:

```js
const SELECT = `
  id, club_id, team_id, channel, parent_id, event_id, author_id, author_role, author_title, body, pinned,
  mentions, edited_at, deleted_at, created_at, quoted_id, forwarded, attachment_path, attachment_paths,
  author:profiles!messages_author_id_fkey(full_name),
  quoted:quoted_id(id, body, deleted_at, attachment_path, attachment_paths, author_id, author:profiles!messages_author_id_fkey(full_name)),
  event:events!messages_event_id_fkey(id, type, title, opponent, home, starts_at, ends_at, time_tbd, venue, pitch, team_id)
`
```

- [ ] **Step 4: Make every insert site write the list**

Add one shared helper near the top of `src/data/messages.js`, and use it at all
four insert sites so the shape cannot drift between them:

```js
/**
 * Normalises either calling convention into the column the database wants.
 * `attachmentPath` (singular) is the pre-album signature and still works —
 * the sync trigger would cover it, but writing the list here means the app
 * never depends on the trigger, which the contract migration removes.
 */
function attachmentExtras({ attachmentPath = null, attachmentPaths = null }) {
  const list = attachmentPaths?.length
    ? attachmentPaths
    : attachmentPath
      ? [attachmentPath]
      : []
  if (list.length > 10) throw new Error('You can send up to 10 photos at once.')
  return list.length ? { attachment_paths: list } : {}
}
```

Then at each site replace
`...(attachmentPath ? { attachment_path: attachmentPath } : {})`
with `...attachmentExtras({ attachmentPath, attachmentPaths })`, and widen each
function's options to accept `attachmentPaths`.

⚠️ **Do not also write `attachment_path`.** The trigger sets it from element 1;
writing both invites the two to disagree.

- [ ] **Step 5: Make forwarding carry the whole album**

`src/data/messages.js` L672:

```js
const opts = {
  attachmentPaths: m.attachment_paths?.length
    ? m.attachment_paths
    : m.attachment_path ? [m.attachment_path] : [],
  forwarded: true,
}
```

- [ ] **Step 6: Make deletion clean up every file**

In both `src/lib/useDmThread.js:390` and `src/lib/useChannelThread.js:411`,
replace the single-path removal with a loop over the list, keeping the
author check:

```js
if (gone?.author_id === selfId) {
  const paths = gone.attachment_paths?.length
    ? gone.attachment_paths
    : gone.attachment_path ? [gone.attachment_path] : []
  for (const p of paths) await removeChatPhoto(p)
}
```

⚠️ **This is a safeguarding step, not tidiness.** A missed path leaves a
photograph of a child in storage with no live message pointing at it.

- [ ] **Step 7: Fix the four exact-shape assertions this breaks**

⚠️ **Adding an option to `sendDirectMessage` breaks tests that pin the whole
options object.** Measured 31 Aug 2026, flagged by the Message Tagging session
whose group-@mention work added the `mentions` key the same day:

| File | Line | Asserts |
|---|---|---|
| `tests/chat-round-2-thread.test.jsx` | 171 | `{ quotedId: 'd1', attachmentPath: null, mentions: [] }` |
| `tests/chat-round-2-thread.test.jsx` | 257 | `{ quotedId: null, attachmentPath: '<me>/uploaded.jpg', mentions: [] }` |
| `tests/direct-messages.test.jsx` | 288 | `{ quotedId: null, attachmentPath: null, mentions: [] }` |
| `tests/floating-dock.test.jsx` | 239 | `{ attachmentPath: null, quotedId: null, mentions: [] }` |

These are `toHaveBeenCalledWith`, so they fail on an ADDED key, not only a
changed one. ⚠️ **Re-grep before relying on this table** — it was measured on
one day in a repo several sessions are editing:

```bash
grep -rn "quotedId" tests/ | grep -E "toHaveBeenCalledWith|toEqual"
```

⚠️ **Do not "fix" them with `expect.objectContaining`.** The exactness is the
point: it is what would catch a stray option being sent to the database.
Update each to the new shape instead.

- [ ] **Step 8: Run the tests and confirm they now PASS**

```bash
npm run test:related -- src/data/messages.js
```

- [ ] **Step 8: Run the full suite before pushing**

```bash
npm test
```

- [ ] **Step 9: Commit**

```bash
git add src/data/messages.js src/lib/useDmThread.js src/lib/useChannelThread.js tests/chat-attachment-list.test.js
git commit -m "feat(chat): the data layer reads and writes the attachment list"
```

---

## Task 3: Repoint the three harnesses the change trips

**Files:**
- Modify: `db/tests/my-chats-attachment.sql`
- Modify: `db/tests/chat-list.sql`
- Modify: `db/tests/group-chats.sql`

**Interfaces:**
- Consumes: `attachment_paths` from Task 1.
- Produces: nothing the app uses.

⚠️ **These three are a deliberate tripwire, installed by PR #587 so that
exactly this change cannot pass unnoticed. Update them in the SAME pull
request as the migration; a merge that leaves them red destroys the tripwire.**
Re-sweep before starting — the list was measured on 31 Aug and #589 has already
edited one of them since:

```bash
for f in $(git ls-files 'db/tests/*.sql'); do
  n=$(grep -ciE 'attachment_path|my_chats|chat_media' "$f"); [ "$n" -gt 0 ] && echo "$n  $f";
done | sort -rn
```

- [ ] **Step 1: Run the three and confirm they FAIL against the migration**

```bash
npm run db:check
```

Expected: `my-chats-attachment.sql`, `chat-list.sql`, `group-chats.sql` red.
If any is GREEN, stop — either the migration did not apply or the harness is
not asserting what its header claims.

- [ ] **Step 2: Rewrite `my-chats-attachment.sql` against the list, and close
      the coverage gap**

⚠️ **`my_chats()` has SIX arms** — squad, staff, club, **role channels**, dm,
group. The sixth arrived in `db/migrations/20260830_role_channels.sql`. Only
the **DM** arm has ever had last-attachment coverage, so five arms could break
silently. Add them. Count `union all` + 1 to confirm the arm count; **do not**
grep for `'x'::text as kind` — the role-channel arm names its kind from a
column (`rc.key`) and that probe returns a plausible-looking ONE row.

Keep the existing photo / voice / **text control** trio per arm — the control
is what stops an always-null or always-populated column passing vacuously.

- [ ] **Step 3: Repoint `chat-list.sql` and `group-chats.sql`**

They call `public.my_chats()` live and only need the return-row change
absorbing. Do not re-inline a schema replica — #587 deleted those on purpose.

- [ ] **Step 4: Prove each rewritten assertion against an injected fault**

For each arm you added, break it once (e.g. have the harness look for the
wrong path) and confirm that arm's assertion fails. Restore.

- [ ] **Step 5: Run everything**

```bash
npm run db:check && npm test && npm run docs:check
```

- [ ] **Step 6: Commit**

```bash
git add db/tests/my-chats-attachment.sql db/tests/chat-list.sql db/tests/group-chats.sql
git commit -m "test(db): the chat harnesses assert against the attachment list"
```

---

## Task 4: Documentation and release

**Files:**
- Modify: `claude/changelog.md`
- Modify: `claude/plans/2026-08-31-chat-photo-albums.md` (status line)
- Modify: `claude/schema-history.md` (the reasoning behind the migration)

- [ ] **Step 1: Changelog entry, deliberately un-SHA'd**

Add the newest-first entry, and **catch up the previous PR's squash SHA** if
its entry still says "SHA follows in the next changelog-touching PR". Leave
your own entry un-SHA'd — `main` squash-merges, so your branch SHA will not
exist after merge and citing it turns `main` red.

- [ ] **Step 2: `docs:check`, after committing**

```bash
git commit -m "docs(chat): record the attachment-list migration" && npm run docs:check
```

⚠️ On a multi-commit branch this check **fails locally and passes in CI**, and
both are correct — see `CLAUDE.md`. Trust CI. Never "fix" it by citing your own
branch SHA.

- [ ] **Step 3: Open the PR and get Jay's explicit yes before merging**

This plan touches `src/`, so **the merge will build and cost 15 credits** —
unlike the docs-only spec PR. Show Jay the diff. A stop hook asking is not Jay
asking.

- [ ] **Step 4: Verify live, not just green**

After the deploy: send a photo in a real chat on https://adhquins-clubhub.com,
sign in as a second account, and confirm it renders for them. A passing suite
is not a working site, and the storage policy is the thing that would fail
silently.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| One attachment list, old column retired | 1 (add + sync) · plan 4 (drop) |
| Storage read policy moves to the list | 1, with fault injection |
| Cap of 10 | 1 (database constraint) · 2 (client throw) |
| Voice notes stay in the same list, filtered by the grid | 1 (column comment) · plan 3 (the filtering) |
| Forwarding carries all ten | 2, test written to fail first |
| Deleting your own album removes all ten files | 2, test written to fail first |
| Three harnesses updated in the same PR | 3 |
| `my_chats()` six arms, five uncovered | 3 |
| Behavioural assertions, not policy introspection | 1, stated in the harness header |
| PWA-safe rollout | 1 (trigger both directions) · plan 4 gated on time |
| Paste, drag-and-drop, tray, progress | **plan 2** |
| Album grid, lightbox, reply/quote previews | **plan 3** |

**Known gap, deliberate:** nothing here makes multi-photo *usable* — that is
plan 2. Shipping plan 1 alone is safe and invisible, which is the point.
