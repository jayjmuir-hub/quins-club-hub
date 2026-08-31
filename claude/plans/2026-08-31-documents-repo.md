# Documents repo — club distributes, age groups self-serve

**Status: see `claude/plans/2026-08-31-documents-repo-implementation.md`** —
BUILT — awaiting merge (PR follows). Requested by Jay, 31 Aug 2026:
"we need a document repo on the site and in the app, the club should be able
to distro documents to age groups and age groups should be able to save
documents themselves."

## The decisions, made in the brainstorm and settled

Each was a multiple-choice question put to Jay; his pick is recorded so the
next session doesn't re-open it.

1. **Two visibility tiers per document** — "members" (everyone in the targeted
   squads sees it) or "staff only", chosen at upload. **Default: staff-only**,
   so the lazy path exposes nothing and publishing to parents is the
   deliberate act. Jay's read: "mainly these are staff documents", and the
   default follows that.
2. **In-app only.** "On the site and in the app" meant the one PWA — nothing
   public, no anonymous links. (A public tier was offered and declined.)
3. **Upload rights mirror the existing permission grain:** admins for
   club-wide documents, squad staff (coach/manager) for their own age
   group(s). Volunteers were offered and declined.
4. **Multi-select targeting**, like multi-squad notices: an admin aims one
   document at any set of age groups, or the whole club. Role-based audience
   targeting (all coaches everywhere) was offered and declined as scope creep.
5. **Optional push on publish** — a tick-box, off by default, riding the
   existing `push-send` pipeline. Always-notify was rejected (trains people to
   ignore pushes); a silent repo was rejected (distro nobody hears about is
   half a feature).
6. **Category chips, not folders** — a fixed list: Registration, Fixtures &
   Festivals, Policies, Coaching, Other. Flat lists rot; folder trees are
   where club repos go to die (every coach invents a different tree, and both
   RLS and UX get harder). The fixed list is the middle path and matches the
   app's chip-and-filter idiom.

## Approach — real storage, mirroring the chat-media pattern

A private Supabase Storage bucket plus a metadata table, following the
conventions `src/data/chatMedia.js` and the player-photo code already use:
strict key prefixes that carry write authority, storage RLS mirroring table
RLS, short-lived signed URLs for reads, best-effort cleanup.

**Alternatives examined and killed — the arguments, so they aren't remade:**

- **Link registry (files on Google Drive / OneDrive, app stores URLs).** Less
  to build, but permissions become a lie: the app can hide the *link* from
  the wrong people, while anyone the link leaks to can open the file, because
  Drive knows nothing about squads. For a club of mostly children,
  split-brain permissions are the wrong foundation. Also a second system for
  volunteers to mismanage.
- **Public bucket with unguessable URLs.** Rejected out of hand:
  "unguessable" is not access control, links get forwarded, and these
  documents can touch children's activities. This paragraph is the tombstone.

## Data model

One migration in `db/migrations/`:

- **`documents`** — `id`, `title`, `category` (constrained to the fixed
  list), `staff_only boolean`, `club_wide boolean`, `storage_key`,
  `file_name`, `file_size`, `content_type`, `created_by`, `created_at`.
- **`document_squads`** — `document_id`, `team_id`; rows exist only when
  `club_wide` is false. Same shape as multi-squad notices.

**Storage bucket `documents` (private), key prefixes carry write authority:**

- `club/<uuid>.<ext>` — only admins may write under `club/`.
- `<team_id>/<uuid>.<ext>` — only that squad's staff may write under its
  prefix.

Storage policies check the same membership facts as the table policies, so
the file and its metadata row can never disagree about who is allowed in.

**Limits (app-side constants, not DB constraints):** PDF, Word, Excel,
PowerPoint, images; 25 MB per file. Trivial next to the photo library on
Supabase Pro storage.

## Permissions (RLS — the app UI only reflects these, never creates them)

Read a document's row (and obtain a signed URL):

| Document | Who sees it |
|---|---|
| Club-wide, members tier | every confirmed member |
| Club-wide, staff-only | admins + staff of any squad |
| Squad-targeted, members tier | confirmed members of a targeted squad + admins |
| Squad-targeted, staff-only | staff of a targeted squad + admins |

Create: admins anywhere; squad staff only for squads they hold staff
membership in. Edit (metadata only — title, category, tier, targeting): the
uploader, any staff member of a targeted squad (a coach who leaves doesn't
strand their squad's documents), and admins. Replacing a file is delete +
re-upload; no versioning.

**Deliberate exclusions, recorded so they don't get re-argued:**

- **Pending members see nothing** — the line the rest of the app draws.
- **Welfare/safeguarding case documents do NOT belong here.** This is a
  distribution shelf, not a case-file store; the welfare system has its own
  isolation, and mixing them puts case material one mis-ticked checkbox away
  from a squad's parents. Wanting welfare docs here later is a new design
  conversation, not a category.

## UI

Two doors into the same data:

1. **Documents screen** — More menu (and desktop sidebar). Everything the
   viewer can see, newest first; category chips filter; a squad filter
   appears only for people in more than one squad. Staff-only documents carry
   a badge so staff know parents can't see them.
2. **A section in Squad Hub** — the *staff* door. `src/screens/SquadHub.jsx`
   is the coach/manager dashboard and parents never reach it (checked in the
   brainstorm — an earlier draft of this design wrongly put parents there).
   Coaches save and find their age group's working documents alongside
   attendance and match sheets. The Documents screen is the only
   parent-facing surface; if the club never publishes members-tier documents,
   parents just see the empty state.

Rows show file-type icon, title, category chip, age-group name(s), size,
uploader, date. Tapping fetches a signed URL and opens it in a new tab —
phones hand PDFs to the built-in viewer; no in-app preview to build or
maintain.

Upload (visible to staff and admins only): pick file → title (pre-filled
from the file name) → category → tier → targeting (squad staff locked to
their own squads; admins get the multi-select picker plus a whole-club
switch) → optional notify tick-box.

Empty states are written, not blank: "No documents yet — the club and your
coaches can share files here."

## Notifications

The notify tick-box (off by default) sends one push through the existing
pipeline (`supabase/functions/push-send/index.ts`) to the people who can
*see* the document — the tier defines the audience:

- Members tier → confirmed members of the targeted squads:
  "New document for U12: Festival pack".
- Staff-only → staff of the targeted squads only.

Tapping deep-links to the Documents screen (Squad Hub section for staff-only)
with the document highlighted.

Two rules: **push targets are computed server-side from the same membership
facts as the read policy, never from a client-supplied list** (the pipeline
stopped trusting its callers — `fix(edge)` 55d25e5 — and this feature is born
not trusting them); and **no email** — if push adoption proves too thin,
email distribution is a separate later decision with Resend-cost and template
questions attached.

## Testing

- **`db/tests/` harness** (rolled back against production —
  `claude/runbooks/db-harnesses.md`): one probe per permission rule above.
  The wrong role tries the forbidden thing — reading a staff-only document,
  targeting a squad the coach doesn't staff, listing anything while pending —
  and must be refused *by the new policy*, with a control query proving the
  probe can see what it should. Storage policies get the treatment
  `db/tests/rls-staff-photos.sql` and `db/tests/rls-social-upload.sql`
  already model.
- **Vitest:** upload form (type/size rejection, tier defaulting to
  staff-only, targeting locked to a coach's own squads), list filtering
  (chips, squad filter, staff badge), and the pure visibility helpers
  mirrored client-side for UI hiding. All fixtures use invented names —
  CLAUDE.md rule 9 — including harness stubs, which render to published PNGs.
- **`docs:check` obligations:** the migration's table grants land in
  `db/schema/grants.sql`; schema captures re-run after the migration.

## Error handling

- Upload failures surface the friendly-error card, never a raw Supabase
  message (per the #566 error-hygiene rules).
- Upload is **file first, then metadata row**; a failed row insert triggers
  best-effort deletion of the orphan file, non-blocking, chat-media style.
  Delete mirrors it: row first, then best-effort file removal — a stranded
  file has no row and no signed URL, so it is invisible and harmless.
- The storage-usage card counts the new bucket, so admins see documents where
  they already see photo usage.

## Deliberately not building (tombstones)

Versioning (delete + re-upload is the version story), in-app preview,
folders, public links, role-based audience targeting, email distribution,
welfare documents. Each has its argument recorded above; removing an item
from this list means writing the design conversation that changed the answer.
