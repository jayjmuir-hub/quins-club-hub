# Handoff — admin-rights security redesign: design done, Phase 0 next

*28 Aug 2026. A session record — history, not instruction. Describes the moment
this session ended; the code and the two design docs win on current state.*

## One-line status

The **design phase is complete and merged**; the **next work is Phase 0 of the
migration — the first code, and it touches production children's data.** Nothing
is implemented yet.

## What this session did

- Wrote and merged the **access matrix + threat model** (PR #481) — the current
  model, the three enforcement surfaces, the two design options, the full
  right × surface matrix with all seven rights ruled, and the insider-over-reach
  + account-takeover threat model.
- Wrote and merged the **architectural decision + migration plan sketch**
  (PR #482) — chose **α + default-deny** over β, and sketched Phase 0 + four
  narrowing phases.

Both live on `main` in two docs:
- `claude/specs/2026-08-28-admin-rights-access-matrix-and-threat-model.md` — the
  design contract (matrix in §5.2, α decision in §4.1, threat model in §6).
- `claude/plans/2026-08-28-admin-rights-migration.md` — the phased how, marked
  *not started*.

## Start here (next session)

1. Read `claude/plans/2026-08-28-admin-rights-migration.md` (the what/how), then
   the spec's §5.2 matrix (the rulings) and §4.1 (why α + default-deny).
2. **Phase 0a is the first task and the linchpin.**

## Decisions already made — do NOT re-litigate

- **Shape: α + default-deny** (spec §4.1). Keep `is_admin`; add allowlist,
  deny-by-default helpers only on the four narrowed surfaces. Not β. The caveat
  for *when* β becomes right is recorded in §4.1 — it is not today.
- **The full matrix** (spec §5.2): Pitch = names read-only; Training = names +
  attendance only; Welfare = full read sight + DM review; Social Media / Youth
  Manager / Club Hub Admin = full sight (knowingly wide).
- **Chat splits into review and reach.** DM *review* narrows to the explicit
  `welfare` grant — even a super must tick it (audited), and a sensitive-read
  audit logs the opening of a child's DM. DM *reach* (may DM any adult) is
  preserved for every admin right via `private.can_dm`, needing no child data.
- **Club Hub Admin becomes its own `clubadmin` right**; existing admins are
  backfilled, so nobody loses access.

## What Phase 0a is, and its traps

Add `'clubadmin'` to `ADMIN_RIGHTS` (`src/lib/scope.js`); **backfill every active
admin** with it (keeping their other rights); *then* flip the Club Hub Admin
portal from `right: null` to `right: 'clubadmin'` (`src/lib/portals.js`,
`isPortalOpen`).

- ⚠️ **Order is load-bearing:** backfill BEFORE the portal flip, or existing
  admins lose the Club Hub Admin screen.
- ⚠️ **0a must land before ANY narrowing phase** — every allowlist in the later
  phases includes `clubadmin`, so if current admins are not yet holding it, the
  first deny-by-default policy strips them too.
- ⚠️ **It touches PRODUCTION data — live children's records.** Prove *both*
  directions in a `db/tests/` rollback harness (`npm run db:check`): (a) no
  legitimate admin loses access, (b) the narrowing holds. Adversarial-test at the
  API, not the menu. Apply to production only as a deliberate step with Jay's
  explicit yes.

## Explore FIRST — I did not, so do not assume

Before writing the migration, the next session must establish (this session ran
out of runway before doing so):

- **How `db/migrations/` get applied to Supabase** — read
  `claude/runbooks/db-harnesses.md` (how to run/write harnesses, and why they are
  safe against production) and `claude/runbooks/deploy.md`. Do not assume a merge
  applies a migration.
- **Current production admin state** — query read-only first: how many active
  admins, what `admin_rights` each holds, the `is_super` distribution. Do not
  write a backfill blind. (Use the Supabase MCP read path or a read-only harness.)
- **`src/lib/portals.js`** — how `isPortalOpen` and the `right: null` Club Hub
  Admin portal work today.
- **`public.set_admin_rights`** — the existing write path for `admin_rights`
  (SECURITY DEFINER, super-only). Decide whether the backfill goes through a
  one-off migration or this RPC.

## Parked decisions (rule when the phase needs them)

- **Welfare read vs edit** on children → Phase 3.
- **Audit-log visibility** (super-only vs super + Welfare) → Phase 4.

## Housekeeping / traps from this session

- **On jay-pc:** repoint the `admin-rights-security-redesign` memory — its "first
  deliverable: draft the doc" is done. It should now read roughly *"design
  complete and merged (spec + migration plan in the repo); α + default-deny
  chosen; next is Phase 0 — the clubadmin backfill."*
- **Memory is per-machine, not synced.** The design memory was stranded on
  jay-pc for this whole (cafnet) session; the repo docs are the synced truth now,
  which is the right home.
- **`main` moved mid-session (#480)** and caused a changelog conflict. Always
  `git fetch` and check freshness before committing, and reconcile the changelog
  (catch up the prior SHA + add your own un-SHA'd entry).
- **`claude/`-only changes skip the Netlify build** (`scripts/netlify-ignore.mjs`)
  — merging these docs does not deploy. Phase 0's *code* changes will not skip.
- **Uncommitted on the cafnet clone:** `.claude/skills/graft/SKILL.md` — Jay's
  own in-progress edit, unrelated to this work. Leave it.
