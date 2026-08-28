# Admin-rights security redesign — migration plan (sketch)

*28 Aug 2026.*

> **Status: NOT STARTED — this is a sketch, nothing here has shipped.** It
> sequences the work designed in
> `claude/specs/2026-08-28-admin-rights-access-matrix-and-threat-model.md`, whose
> access matrix and threat model are the input. Design only; no migration is
> written yet.

## The shape we're building (decided 28 Aug)

**α + default-deny.** `is_admin` keeps meaning "any admin"; the ~274 sites that
lean on it are left alone. Only the four surfaces the matrix narrows get a new
**allowlist** helper — data denied to everyone by default, granted back only to
the rights that should hold it. Reasoning: spec §4.1.

## The non-negotiables (apply to every phase)

1. **Default-deny / allowlist** on every sensitive helper. A wiring mistake must
   *hide* data, never leak it.
2. **The database is the boundary** — RLS policies + column grants (the
   `profiles.email` column-grant pattern in `db/schema/grants.sql`), never the
   app menu. `src/lib/scope.js` is updated to *mirror* each change (the repo's
   "change one, change both" rule), but it only decides what the UI offers.
3. **Prove BOTH directions** in a `db/tests/` rollback harness (`npm run
   db:check`, runs in a transaction that rolls back, against production data):
   (a) **no legitimate admin loses access** they should keep, and (b) **the
   narrowed right is genuinely refused** the data it should not see. A test that
   checks only one direction is half a test.
4. **Adversarial test per right** — log in *as* the narrowed holder and confirm
   the refusal *at the API / direct link*, not just that the menu is hidden.
5. **One surface at a time**, deployed and verified live before the next. DB
   branching is broken on this repo, so the rollback harness is the safety net
   (spec §7.2). Destructive changes deploy-first.

## Phase 0 — groundwork (purely additive; nothing is taken away)

This phase is the safe foundation: every step *adds* capability, so nothing can
regress, and it makes the later narrowing possible.

- **0a — `clubadmin` right + backfill (the linchpin).** Add `'clubadmin'` to
  `ADMIN_RIGHTS` (`src/lib/scope.js`); **backfill every existing active admin**
  with `clubadmin` (keeping their other rights); *then* flip the Club Hub Admin
  portal from `right: null` to `right: 'clubadmin'` (`src/lib/portals.js`).
  **Order is load-bearing:** backfill before the flip, or existing admins lose
  the Club Hub Admin screen. ⚠️ **This step must land before ANY narrowing
  phase**, because every allowlist below includes `clubadmin` — if current admins
  aren't holding it yet, a default-deny policy strips them. Prove: no admin loses
  a screen or a row.
- **0b — `can_dm` adult-reach rule. ⚠️ NOT NEEDED under Shape α — skipped
  28 Aug 2026.** This step assumed a *narrowed* admin stops being `is_admin` — a
  **β** premise. Under the chosen **α** (spec §4.1) `is_admin` stays true for every
  admin; narrowing lives only in new default-deny helpers on data surfaces, never in
  `is_admin`. So `private.can_dm`'s adult-reach arm
  (`if private.is_admin(club) then return true`,
  `db/migrations/20260823_squad_chat_phase3.sql`) already preserves reach for a
  narrowed admin, and rewriting it to "any admin right" would instead *narrow* a
  hypothetical zero-right admin's reach — the opposite of the goal. The review/reach
  **split** is delivered entirely by **Phase 4** (narrow `admin_may_review` →
  `welfare`); `can_dm` (reach) is left as-is. Recorded as β-only, not an α task.
- **0c — the default-deny sensitive helpers (defined, not yet wired).** Add the
  allowlist helpers — e.g. `private.can_see_child_contacts(club)`,
  `can_see_child_photos(...)`, `can_write_child(...)`, `can_review_dm(conv)` —
  each returning **deny unless the caller holds an allowlisted right**. Unit-test
  each in isolation before any policy calls it.
- **0d — sensitive-read audit scaffolding.** Stand up the log table + write path
  for "who read a child's contact/DOB and who *opened* a child's DM" (spec §7.3),
  inert until wired in Phase 4.

## The narrowing phases (lowest-risk first)

Each follows the non-negotiables above. Ordered so the proof-of-concept surface
is the safest, and the most safeguarding-sensitive one is last, by which point
the audit is live.

- **Phase 1 — parent contacts + DOB (S2).** The proof-of-concept. Column grants +
  policy so contact/DOB is visible only to the allowlist `{clubadmin, youth,
  media, welfare}`; **Pitch and Training denied**. Because of 0a, every current
  admin keeps it. Adversarial: a Pitch-only login cannot read a parent's phone
  via the API. This phase is the template the rest copy.
- **Phase 2 — player photos (S3).** Repoint the `player-photos` storage policies
  to `can_see_child_photos` (same allowlist). ⚠️ **Close the Surface-C bypass:**
  the `backup-player-photos` edge function runs with `service_role` and ignores
  RLS — confirm it cannot become a side door for a narrowed right, and that
  nothing hands photos back through a notifier.
- **Phase 3 — children write-access (S1 edit vs read).** Narrow *writing* to
  children to `{clubadmin, youth, media}`; Pitch, Training and Welfare become
  read-only on the roster. (Names stay broadly *readable* — every admin right
  reads names; this phase is only about who may edit/delete.)
- **Phase 4 — DM review → Welfare, + super carve-out + read audit (S7b, S10).**
  The most safeguarding-sensitive, done last. Repoint `admin_may_review`
  (`db/migrations/20260823_squad_chat_phase3.sql`) to key on the **explicit
  `welfare` grant, never `is_super`** (spec §5.2 note ²); wire the sensitive-read
  audit from 0d so *opening* a child's DM is logged; a super self-ticks Welfare
  (an audited write) to review. Prove: an admin without Welfare cannot review; a
  super without Welfare cannot either until they tick it, and the tick + the read
  both appear in the log.

## Cross-cutting, every phase

- **Mirror `src/lib/scope.js`** to match the new boundary so the UI offers
  correctly — after the DB change, not before, and pinned by a test as the
  existing role helpers are.
- **Changelog + live verification** — a passing suite is not a working site.

## Risks & rollback

- **The linchpin risk:** any default-deny policy that ships before the `clubadmin`
  backfill (0a) strips current admins. 0a gates everything.
- **Surface C (service-role edge functions)** can re-widen what RLS narrowed —
  Phase 2 especially. Check each function against the surface it touches.
- **Fail-open regressions** are caught by the default-deny writing style + the
  adversarial "prove the refusal" test; do not rely on the menu.
- **Each phase is independently revertible**; the `db/tests/` rollback harness is
  the proving ground because DB branching does not work here.

## Definition of done, per phase

Migration + rollback harness (both directions) + adversarial refusal test +
`scope.js` mirror + live verification + changelog entry.

## Still open (from the matrix residuals — spec §8)

- **Welfare read vs edit** on children (defaulted to read).
- **Audit-log visibility** — super-only, or super + Welfare?

These affect one phase each and can be ruled when that phase is built; neither
blocks Phase 0.
