# Social Media Management — the plan

**STATUS: SHIPPED 12 Aug 2026.**

⚠️ **One thing this plan did not predict, and it is the sort of defect that
reaches production.** `/admin/social/ideas` is the app's **first nested tab
pair** — every admin tab before it was a leaf. `NavLink` is active for its own
path *and everything beneath it* unless given `end`, so "What's on" lit up
while standing on "Ideas". Fixed at the source in `AdminDashboard`, and pinned
by a test that fails when `end` is removed.

⚠️ **Set this line to SHIPPED in the commit that ships it**, not as a promise
about that commit. ⚠️ **And if this plan is ever split in two, both halves get a
status line** — `2026-08-11-league-teams-and-fixtures.md` sat on NOT SHIPPED for
days because only its implementation half was marked, and `docs-check` cannot
see that.

Ruling and reasoning: `claude/decisions/2026-08-12-social-media-management.md`.
⚠️ **Read it before changing anything here** — it records what was ruled OUT,
which is the part a later session is most likely to undo by accident.

## 1. The table

`public.social_ideas`, mirroring `public.pitch_requests` in shape and in
reasoning. Migration in `db/migrations/`.

| Column | Notes |
|---|---|
| `event_id` | **nullable** FK → `events`, `on delete set null` — the optional link, and an idea outlives the fixture it was about |
| `submitted_by` | FK → `profiles` |
| `body` | free text, required |
| `photo_path` | nullable, a key in the new bucket |
| `from_staff` | ⚠️ **set by a trigger, never by the client** |
| `status` | `new` / `used` / `dismissed`, CHECK not enum |
| `decision_note`, `decided_by`, `decided_at` | who actioned it |

⚠️ **NO unique constraint**, unlike `pitch_requests`. One request per fixture is
right for a pitch — a second is the same question twice. Ideas are the opposite:
five people sending photos of the same match is the feature working.

## 2. RLS, and the one thing that must not be got wrong

- **insert** — an active member of the club. ⚠️ `submitted_by = auth.uid()`
  enforced in the policy, not left to the client, exactly as `pitch request
  create` does: without it somebody files in another member's name and the read
  policy then hides it from them and shows it to a stranger.
- **read** — `submitted_by = auth.uid()` **or** `private.is_admin(club_id)`.
- **update** — `private.is_admin`. ⚠️ **NOT the `media` right.** Rights gate
  screens, never data.
- **delete** — `(submitted_by = auth.uid() and status = 'new') or private.is_admin(club_id)`.
  ⚠️ **The admin arm is Jay's 12 Aug ruling** — the manager marks *and* removes.
  It is the only real control over an inappropriate photo, because the consent
  line is a prompt and declining to post leaves the image in club storage
  forever.

⚠️ **DELETING AN IDEA WITH A PHOTO IS TWO OPERATIONS AND THE ORDER IS
LOAD-BEARING.** Storage cannot be cleared by SQL (`delete from storage.objects`
raises `42501`), so the object goes through the storage API separately.
**Remove the object first; delete the row only if that succeeded.** Row-first
leaves an orphaned image nobody can reach — which is the exact file being
removed. Object-first leaves a visible broken entry that can be retried.

⚠️ **`from_staff` NEEDS A TRIGGER, and a policy cannot do this job.** A policy
authorises a row; it does not stop a caller putting `from_staff: true` in the
payload. A `BEFORE INSERT` trigger overwrites it from the submitter's own
membership role. Same class of hole as `memberships.is_super`, which needed a
column grant plus an RPC for the same reason.

⚠️ **Column grants on UPDATE.** Admin UPDATE must reach `status`,
`decision_note`, `decided_by`, `decided_at` and nothing else — otherwise
"actioning" an idea also authorises rewriting the submitter's words. The
precedent is `profiles.email`: **policies authorise the ROW, grants authorise
the COLUMN**, and getting only the policy right leaves it open.

## 3. Storage

A new **private** bucket for submitted images. ⚠️ **Not `player-photos`** — see
the ruling. Policies: a member writes under their own prefix; admins read; the
submitter reads their own.

Reuse `resizePhoto()` from `src/lib/imageResize.js` and the upload shape in
`src/data/photos.js` rather than writing a second one.

## 4. Screens

| Route | What |
|---|---|
| `/admin/social` | **What's on** — every event, past and upcoming, in one list: matches, tournaments, socials, training, with squad, opponent and result where played |
| `/admin/social/ideas` | **The inbox** — newest first, staff-marked, thumbnail, linked fixture, and the two actions |

Both behind the `media` right, both repeating their own check because a route is
linkable.

Adding these two tabs to `PORTALS` in `src/lib/portals.js` is **the only change
the chooser needs** — the card opens itself, which is what that empty `tabs`
array was built for.

**Submitting** from the More screen (any member) and from an event's detail
sheet, pre-filling the event.

⚠️ **The consent line is required copy, not decoration**: the photo may be
published, send only what you are happy for the club to use.

## 5. Testing

Rule 6 on every new assertion, and **prove each injection actually applies** —
one anchor already rotted this session by assuming LF on a CRLF file.

- `from_staff` cannot be set by the caller — **inject a payload claiming it**.
- A non-member cannot insert; a member cannot read another's idea; an admin can.
- Withdraw works while `new` and silently affects zero rows once actioned —
  ⚠️ **and zero rows must be treated as a refusal, not success**, the trap
  `src/data/pitchRequests.js` already documents.
- The `media` card opens once the tabs exist.

⚠️ **A DB harness (`db/tests/`) is where the RLS claims get proved.** Vitest
cannot see a policy.

## 6. Afterwards

⚠️ **Re-capture `db/schema/`.** It drifted for two days in August because a
migration landed without one, and `db/schema/README.md` records it. The capture
is the mechanism, not a formality.

## Out of scope

- Scheduling or planning posts.
- Any integration that posts anywhere.
- `player-photos`. Permanently, until Jay says otherwise.
