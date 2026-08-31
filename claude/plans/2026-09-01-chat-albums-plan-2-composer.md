# Chat photo albums — implementation plan 2 of 4: the composer

**Status: BUILT, NOT YET MERGED — 1 Sep 2026.** Tasks 1 to 6 are done and
green; task 7 (the release) is Jay's call and has not happened. Update this
line when it merges.

## ⚠️ Deviations from this plan, and why

**1. The task ORDER was changed: 4 and 5 were done together, before 2 and 3.**
As written, task 2's own tests assert on `tray-thumb` — which task 5 draws —
against a `tray` on the thread object that task 4 puts there. In the plan's
order those tests could not pass at all, and the intermediate state would have
been a tray holding three photos above a send that posts one, which is a
silent-data-loss shape nobody should be able to reach even mid-branch. Same end
state; each task's tests are unchanged and still written first.

**2. `attachments` joined the SELECT list and `forwardMessagesTo` now carries
the whole album.** Not in the plan. `attachment_path` is the FIRST key only, so
forwarding by it silently drops every photo after the first — a data-loss path
that plan 2 CREATES by making albums sendable. It is closed in the same commit
that opens it rather than left for plan 3.

**3. `PICKER_ACCEPT` was added to `imageResize.js`.** Task 1 merged two copies
of the accepted-types list; the hand-typed `accept` string was its THIRD, in
five components. Derived now, so it cannot drift. Both chat composers use it;
⚠️ **`IdeaForm.jsx`, `MyPhotoField.jsx` and `PhotoField.jsx` still spell it
out** and were left alone as out of scope.

**4. Task 6's "album fixture" also mirrors the DERIVED columns.** A stub row
now carries `attachments`, `attachment_paths` and `attachment_path` exactly as
the trigger produces them — a fixture showing a shape the real thing never
produces is worse than no fixture.

**5. Sequential upload, not bounded-parallel.** The plan allowed either. A
truthful counter over out-of-order concurrent uploads is a second piece of
correctness for a gain nobody has measured; the note is in `uploadAlbum.js`.

## ⚠️ Traps this work hit that the plan did not predict

- **A WORKTREE SHIPS WITH NO `.env` AND NO `node_modules`** — the same trap
  `CLAUDE.md` documents for the second jay-pc clone, and it applies to every
  `.claude/worktrees/` checkout. Without `.env`, a block of tests fails to
  COLLECT with a Supabase env-var error, which reads as a broken suite and is
  not one. Copy it from the parent clone; it is gitignored and holds only the
  public URL and publishable key. ⚠️ **`tests/pwa-build.test.js` CANNOT pass in
  a worktree at all** — it spawns `node_modules/vite/bin/vite.js` by a
  cwd-relative path. It passes in CI, which is a fresh clone.
- **`origin/main` moved mid-branch and another session had ALREADY paid
  `334f11e`'s changelog SHA.** Exactly the collision the handoff warns about.
  Fetch and read what `main` already cites before citing anything.
- **The Browser pane could not screenshot the harness DM thread** — timeouts and
  a blank grey frame while the page was demonstrably rendered (geometry
  measured, `elementFromPoint` returning the composer textarea). ⚠️ **Do not
  read that blank frame as a layout regression**, which is the obvious wrong
  conclusion when you have just wrapped the pane in a new div. Verified instead
  by driving real `DragEvent`/`ClipboardEvent` with a real `DataTransfer`, which
  is stronger evidence than a picture: jsdom has neither.

> **For agentic workers:** REQUIRED SUB-SKILL: use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Steps use `- [ ]` checkboxes.

**Spec:** `claude/plans/2026-08-31-chat-photo-albums.md`.
**Plan 1 (done, live):** `claude/plans/2026-08-31-chat-photo-albums-implementation.md`.

**Goal:** Make multi-photo actually work — attach several photos by picker,
by **Ctrl+V**, or by **dropping them on the conversation** — and send them as
one message.

**Architecture:** One shared tray hook consumed by both thread hooks; three
input doors funnelling into one gate; an all-or-nothing upload that writes the
`attachments` jsonb the database already has.

**Tech stack:** Vite + React, Tailwind, vitest.

⚠️ **THIS IS THE FIRST PLAN IN THIS SERIES THAT DEPLOYS.** Plans 1 and its
reshape were database-only and cost nothing. This one builds: **`main` is
production, a merge is a live release, and it costs 15 Netlify credits.**
Show Jay the diff and get an explicit yes. A stop hook asking is not Jay asking.

## Global constraints

- ⚠️ **Never `git add -A`.** Stage explicit paths.
- ⚠️ **No real names or inboxes** in `harness/stubs/` — those render to PNGs
  that reach parent-facing guides.
- **Cap is 10**, enforced in the database already; the client refuses earlier
  with a readable message.
- **Run `npm run docs:check` after committing**, and never cite your own
  branch SHA in the changelog.
- ⚠️ **Before every task:** `git fetch origin` then
  `git rev-list --left-right --count origin/main...HEAD`. The working tree is
  shared with other live sessions and has been switched underfoot. Never fight
  for the checkout — `git push origin <branch>:<branch>` works regardless.
- **Feedback loop is `npm run test:watch`**, not `npm test`.

## What the database already gives you

Live since 1 Sep 2026 — **do not add a migration in this plan**:

```
attachments      jsonb   [{file, type, size, name}, ...]   <- WRITE THIS
attachment_paths text[]  derived by trigger
attachment_path  text    derived by trigger
```

⚠️ **Write only `attachments`.** The trigger derives the other two. Writing
them directly invites the three to disagree, and `attachment_paths` is what
the storage policy reads — a disagreement there is an invisible permission
bug, not a cosmetic one.

Shape rules the database enforces, so the client should fail earlier and more
kindly: each element must be an object with a non-empty `file`; at most 10.

## Task 1: One tray hook, replacing two copies

**Files:**
- Create: `src/lib/useAttachmentTray.js`
- Create: `tests/attachment-tray.test.js`
- Modify: `src/lib/imageResize.js` (adopt the gate)
- Modify: `src/components/PhotoPositioner.jsx` (re-export from its new home)

**Interfaces:**
- Produces: `useAttachmentTray()` → `{ items, add(files), remove(id), clear(), error }`
  where each item is `{ id, file, previewUrl }`.

⚠️ **`pickPhoto` is byte-identical in `src/lib/useDmThread.js` and
`src/lib/useChannelThread.js` today.** Adding paste, drop and multi-select by
copying would leave two divergent copies of something four times harder. It
becomes one hook.

⚠️ **The accepted-types list is written twice** — `ACCEPTED_IMAGE_TYPES` in
`src/components/PhotoPositioner.jsx:59` and `UPLOAD_TYPES` in
`src/lib/imageResize.js:128`. Two lists that must agree with nothing making
them. Move `isAcceptableImage` next to the types in `imageResize.js`, keep one
list, and re-export from `PhotoPositioner.jsx` so its consumers are untouched.

- [x] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAttachmentTray } from '../src/lib/useAttachmentTray.js'

const img = (name) => new File(['x'], name, { type: 'image/jpeg' })

describe('useAttachmentTray', () => {
  it('accepts several images at once', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add([img('a.jpg'), img('b.jpg')]))
    expect(result.current.items).toHaveLength(2)
  })

  it('refuses a non-image and says so, keeping what was already there', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add([img('a.jpg')]))
    act(() => result.current.add([new File(['x'], 'notes.pdf', { type: 'application/pdf' })]))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.error).toMatch(/not a photo/i)
  })

  it('caps at ten across SEPARATE adds, not just one', () => {
    const { result } = renderHook(() => useAttachmentTray())
    act(() => result.current.add(Array.from({ length: 6 }, (_, i) => img(`${i}.jpg`))))
    act(() => result.current.add(Array.from({ length: 6 }, (_, i) => img(`b${i}.jpg`))))
    expect(result.current.items).toHaveLength(10)
    expect(result.current.error).toMatch(/10 photos/i)
  })
})
```

- [x] **Step 2: Run them and confirm they FAIL**

```bash
npm run test:related -- src/lib/useAttachmentTray.js
```

Expected: module not found. ⚠️ If the cap test passes before you write the
cap, the fixture is not discriminating — fix it before continuing.

- [x] **Step 3: Move the gate to live beside the types**

In `src/lib/imageResize.js`, after `UPLOAD_TYPES`:

```js
/**
 * The gate every attachment door shares. ⚠️ It exists because `accept` on an
 * <input> filters the PICKER only — a dropped or pasted file bypasses it
 * entirely, so the type check has to happen in code.
 */
export function isAcceptableImage(file) {
  return Boolean(file) && UPLOAD_TYPES.includes(file.type)
}
export const ACCEPTED_IMAGE_TYPES = UPLOAD_TYPES
```

In `src/components/PhotoPositioner.jsx`, delete the local copies and re-export
so existing importers keep working:

```js
export { isAcceptableImage, ACCEPTED_IMAGE_TYPES } from '../lib/imageResize.js'
```

- [x] **Step 4: Write the hook**

```js
import { useCallback, useEffect, useRef, useState } from 'react'
import { isAcceptableImage } from './imageResize.js'

export const MAX_ATTACHMENTS = 10

/**
 * The composer's attachment tray: one place for the picker, paste and drop.
 * Replaces the byte-identical `pickPhoto` that used to sit in both thread
 * hooks — see this plan's Task 1 for why that duplication had to go before
 * it grew a third copy.
 */
export function useAttachmentTray() {
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const nextId = useRef(0)

  const add = useCallback((files) => {
    const incoming = Array.from(files ?? [])
    if (!incoming.length) return
    const good = incoming.filter(isAcceptableImage)
    setItems((current) => {
      const room = MAX_ATTACHMENTS - current.length
      const taken = good.slice(0, Math.max(0, room))
      if (good.length < incoming.length) {
        setError('That file is not a photo. Use a JPEG, PNG or WebP image.')
      } else if (taken.length < good.length) {
        setError(`You can send up to ${MAX_ATTACHMENTS} photos at once.`)
      } else {
        setError(null)
      }
      return [
        ...current,
        ...taken.map((file) => ({
          id: nextId.current++,
          file,
          // May throw in odd environments; a missing preview must not stop
          // the send.
          previewUrl: (() => { try { return URL.createObjectURL(file) } catch { return null } })(),
        })),
      ]
    })
  }, [])

  const remove = useCallback((id) => {
    setItems((current) => {
      const gone = current.find((i) => i.id === id)
      if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl)
      return current.filter((i) => i.id !== id)
    })
  }, [])

  const clear = useCallback(() => {
    setItems((current) => {
      current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl))
      return []
    })
  }, [])

  // Release object URLs when the thread unmounts, or a long chat session
  // leaks one per photo ever attached.
  useEffect(() => () => {
    setItems((current) => {
      current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl))
      return []
    })
  }, [])

  return { items, add, remove, clear, error, setError }
}
```

- [x] **Step 5: Confirm the tests pass, then commit**

```bash
npm run test:related -- src/lib/useAttachmentTray.js
git add src/lib/useAttachmentTray.js tests/attachment-tray.test.js src/lib/imageResize.js src/components/PhotoPositioner.jsx
git commit -m "feat(chat): one attachment tray, replacing two copies of pickPhoto"
```

## Task 2: Paste, without breaking paste

**Files:** Modify `src/components/DmThread.jsx`, `src/components/ChannelThread.jsx`.
**Test:** `tests/chat-paste.test.jsx` (create).

⚠️ **Pasting TEXT is a hundred times commoner than pasting a photo.** The
handler must do nothing at all unless the clipboard actually carries image
files, and must not call `preventDefault()` otherwise — breaking ordinary
paste into the message box would be a far worse bug than the one being fixed.

- [x] **Step 1: The failing tests — both directions**

```js
it('attaches an image from the clipboard', async () => {
  render(<DmThread {...props} />)
  const box = screen.getByTestId('dm-composer').querySelector('textarea')
  const file = new File(['x'], 'image.png', { type: 'image/png' })
  fireEvent.paste(box, { clipboardData: { files: [file], getData: () => '' } })
  expect(await screen.findAllByTestId('tray-thumb')).toHaveLength(1)
})

it('⚠️ leaves a TEXT paste completely alone', () => {
  render(<DmThread {...props} />)
  const box = screen.getByTestId('dm-composer').querySelector('textarea')
  const ev = new Event('paste', { bubbles: true, cancelable: true })
  ev.clipboardData = { files: [], getData: () => 'see you Saturday' }
  fireEvent(box, ev)
  expect(ev.defaultPrevented).toBe(false)
  expect(screen.queryByTestId('tray-thumb')).toBeNull()
})
```

- [x] **Step 2: Run, confirm both fail**

- [x] **Step 3: Add the handler to the textarea**

```jsx
onPaste={(e) => {
  const files = Array.from(e.clipboardData?.files ?? []).filter(isAcceptableImage)
  if (!files.length) return          // ⚠️ text paste: hands off entirely
  e.preventDefault()
  tray.add(files)
}}
```

⚠️ Screenshots paste in as a file called `image.png`, so ten pasted
screenshots are ten identical names — **the tray shows thumbnails, not
names.**

- [x] **Step 4: Confirm pass. Commit.**

## Task 3: Drop on the whole conversation

**Files:** Modify `src/components/DmThread.jsx`, `src/components/ChannelThread.jsx`.
**Test:** `tests/chat-drop.test.jsx` (create).

Jay's ruling: the **whole conversation pane**, with a tinted overlay, not just
the composer bar.

⚠️ **Three traps, all of which get a test:**

1. **Without `preventDefault` on `dragover`, the browser opens the dropped
   photo as a page and throws away the typed draft.** This is the classic
   version of this bug.
2. **`dragleave` fires every time the cursor crosses a child element**, so the
   overlay flickers. Track depth with a counter, or compare `relatedTarget`.
3. **Only react to FILES.** Dragging selected text across the pane must not
   raise the overlay — check `e.dataTransfer.types.includes('Files')`.

⚠️ **The chrome sits at `z-40` and auto-hides on scroll** (`.glass-island` /
`.glass-dock` in `src/index.css`, `src/lib/useAutoHideOnScroll.js`) — Menu Bar
Redesign, 31 Aug. Decide deliberately whether the overlay sits under the
chrome or covers it, and note that **the bars slide mid-drag if the drag
scrolls the page.** Check by hand on a real phone; no unit test catches it.
That session confirmed **no** document-level drag/drop/paste listeners exist
elsewhere, so there is nothing to fight over.

- [x] **Step 1: Failing tests**

```js
it('shows the overlay only when FILES are dragged', () => { /* types: ['Files'] vs ['text/plain'] */ })
it('attaches every dropped image', () => { /* 3 files -> 3 thumbs */ })
it('⚠️ prevents the browser default so the draft is not lost', () => {
  const ev = new Event('drop', { bubbles: true, cancelable: true })
  ev.dataTransfer = { files: [imageFile], types: ['Files'] }
  fireEvent(screen.getByTestId('dm-thread-pane'), ev)
  expect(ev.defaultPrevented).toBe(true)
})
it('does not flicker: dragleave over a child keeps the overlay up', () => { /* counter */ })
```

- [x] **Step 2: Run, confirm they fail. Step 3: implement. Step 4: confirm. Commit.**

Follow the house pattern — a function taking `File` objects directly, so the
picker, paste and drop all reach the same gate. Established twice already:
`PhotoPositioner`'s `take` and `DocumentUploadSheet`'s `pickFile` (#596).
⚠️ Both of those are **bounded** drop zones; this is the first whole-pane one,
which is why traps 2 and 3 are new here.

## Task 4: Send the album — all or nothing

**Files:** Modify `src/lib/useDmThread.js`, `src/lib/useChannelThread.js`,
`src/data/messages.js`, `src/data/chatMedia.js`.
**Test:** `tests/chat-album-send.test.js` (create).

- [x] **Step 1: The failing tests**

```js
it('uploads every photo and sends ONE message carrying all of them', async () => {
  await send({ items: [a, b, c] })
  expect(sendDirectMessage).toHaveBeenCalledTimes(1)
  expect(lastOptions().attachments).toHaveLength(3)
})

it('⚠️ keeps the ORIGINAL filename, which the storage key cannot carry', async () => {
  await send({ items: [fileNamed('Fixtures September.jpg')] })
  expect(lastOptions().attachments[0].name).toBe('Fixtures September.jpg')
})

it('⚠️ on a failed upload sends NOTHING, deletes what it uploaded, and keeps the draft', async () => {
  uploadChatPhoto.mockResolvedValueOnce('k1').mockRejectedValueOnce(new Error('network'))
  await expect(send({ items: [a, b], draft: 'tour' })).rejects.toThrow()
  expect(sendDirectMessage).not.toHaveBeenCalled()
  expect(removeChatPhoto).toHaveBeenCalledWith('k1')
  expect(draft()).toBe('tour')
})
```

- [x] **Step 2: Run, confirm all three fail.**

- [x] **Step 3: Implement the send**

```js
const uploaded = []
try {
  for (const item of tray.items) {
    setProgress(`Sending ${uploaded.length + 1} of ${tray.items.length}…`)
    const key = await uploadChatPhoto(selfId, item.file)
    uploaded.push({ file: key, type: item.file.type, size: item.file.size, name: item.file.name })
  }
  await sendDirectMessage(conversationId, draft, { quotedId, attachments: uploaded, mentions })
} catch (err) {
  // ⚠️ Nothing half-arrives. Remove what we put in storage before reporting,
  // or the reaper inherits orphans nobody knows about.
  await Promise.allSettled(uploaded.map((a) => removeChatPhoto(a.file)))
  throw err
}
```

⚠️ **`name` comes from the ORIGINAL File, not the resized one.**
`preparePhotoUpload` re-encodes to JPEG, so the uploaded file's name is not
the user's. This is the entire reason the metadata reshape happened.

⚠️ **Ten uploads is the same road as the 28 Aug slow-site incident** (UAE
fixed line → Supabase Tokyo, 15-second hangs). Sequential is honest but slow;
if you parallelise, bound it (3 at a time) and keep the counter truthful. The
button must say **"Sending 3 of 10…"**, never spin blankly.

- [x] **Step 4: Update the four exact-shape assertions**

⚠️ **Adding an option to `sendDirectMessage` breaks tests that pin the whole
options object.** Measured 31 Aug; **re-grep before trusting this table**:

| File | Line |
|---|---|
| `tests/chat-round-2-thread.test.jsx` | 171, 257 |
| `tests/direct-messages.test.jsx` | 288 |
| `tests/floating-dock.test.jsx` | 239 |

```bash
grep -rn "quotedId" tests/ | grep -E "toHaveBeenCalledWith|toEqual"
```

⚠️ **Do not loosen them to `expect.objectContaining`.** The exactness is what
would catch a stray option reaching the database.

- [x] **Step 5: `npm test`, then commit.**

## Task 5: The tray UI

**Files:** Modify `src/components/DmThread.jsx`, `src/components/ChannelThread.jsx`.
**Test:** `tests/chat-tray-ui.test.jsx` (create).

Replace the single preview row with up to ten thumbnails in a sideways-
scrolling strip, each with its own ×, plus a count. `data-testid="tray-thumb"`.

- Works on a phone: paste and drop are desktop-only, but **multi-select from
  the picker is not**, so add `multiple` to the file input.
- Per `claude/specs/accessibility.md`: each × needs a distinct accessible name
  (`Remove photo 3 of 7`), and the strip must be keyboard-reachable.
- ⚠️ **Do not strip `data-testid="profile-icon"`** from author labels while
  editing this JSX (Message Tagging, 31 Aug).

- [x] Failing test → run → implement → confirm → commit.

## Task 6: Harness stubs and documentation

**Files:** `harness/stubs/messages.js`, `claude/changelog.md`, this file's
status line.

⚠️ **Invented names, invented captions, `.invalid` inboxes.** These stubs
render to PNGs that reach parent-facing guides — that is how a member's name
and a child's address were published in August.

- [x] Add an album fixture. Commit. `npm run docs:check` **after** committing.

## Task 7: Release

- [ ] **Step 1: Show Jay the diff and get an explicit yes.** ⚠️ This one
      **builds**: 15 credits, live release, unlike everything in plan 1.
- [ ] **Step 2: After deploy, verify LIVE** — send a three-photo album on
      https://adhquins-clubhub.com, sign in as a second account, confirm all
      three render for them. A passing suite is not a working site, and the
      storage policy is what would fail silently.
- [ ] **Step 3: Confirm the deploy id MOVED** (this one should — it is the
      opposite of every docs-only merge in this series).

## Self-review against the spec

| Requirement | Task |
|---|---|
| Paste | 2 |
| Drag-and-drop on the whole pane, with overlay | 3 |
| Multi-select picker, ten-thumbnail tray | 1, 5 |
| Cap of 10 | 1 (client) + database (live) |
| All-or-nothing upload, draft survives | 4 |
| Progress rather than a blank spinner | 4 |
| Original filename preserved | 4 |
| Album grid, lightbox, "10 photos" previews | **plan 3** |
| Contract migration | **plan 4** |

**Known gap, deliberate:** after this plan a ten-photo message SENDS but still
renders as one photo per bubble-slot until plan 3 draws the grid. Ship them
close together.
