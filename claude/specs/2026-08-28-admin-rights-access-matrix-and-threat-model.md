# Admin-rights access matrix & threat model

*28 Aug 2026. **Design only — no code.** This is the first deliverable of the
"admin-rights security redesign" project: making a specialist admin right a
**real data boundary** in the database, not a screen that is merely hidden.*

> **Precedence reminder.** The code wins, then `RESTORE.md`. This document is a
> *target design* plus a *threat model*; where it describes current behaviour it
> is describing the code as measured on 28 Aug 2026, and the code is the truth if
> the two ever disagree. Line numbers below are as-measured and will drift; the
> file paths and function/policy names are the durable anchors.

---

## 0. What this is, and what it is not

**This document does two jobs, and only these two:**

1. **The access matrix** — for each admin *right* (Social Media Management,
   Pitch Management, …) and each *surface* of club data (children's names,
   photos, parent contacts, chat, …), what that right should be allowed to do:
   **none / read / edit**. Several cells are a safeguarding judgement that is
   **Jay's call**, and this document exists to put those decisions in front of
   him, not to pre-empt them. Undecided cells are marked **`?`** — they are the
   point of the exercise, not an omission.
2. **The threat model** — who we are defending children's data against, where
   the trust boundaries are, what is already closed, and what is still open.

**It is NOT:**

- **The migration plan.** How we change 274-odd call sites safely, in what order,
  surface by surface, is the *next* deliverable. Section 7 sketches the approach
  only so the design can be judged against a realistic cost.
- **Code.** Nothing here is implemented. No migration is written.
- **The dashboards themselves.** How each specialist screen looks and what it
  does is separate design work, most of which already exists.
- **Legal advice.** Section 6 raises a data-minimisation / GDPR angle that Jay
  should put to his own advisor. It is a flag, not counsel.

Related prior decisions, which this supersedes or extends:
`claude/decisions/2026-08-10-role-dashboards.md` (the two-tier admin ruling that
*deferred* this "expensive piece"), `claude/decisions/2026-08-12-admin-portals.md`,
and the earlier `claude/specs/2026-08-03-multi-access-design.md`.

---

## 1. Why this change is needed

**Today, every admin sees every child.** A membership row with `role = 'admin'`
gives its holder the full club roster: every child's name, gender, photo, and
every parent's email and phone number, with the power to edit or delete — across
the whole club. That is `private.is_admin` in `db/schema/functions.sql`, and it
is enforced correctly. It is also, right now, **all-or-nothing**.

**The specialist "rights" do not change that.** `memberships.admin_rights` is a
list drawn from `['youth', 'media', 'pitches', 'training', 'welfare']`
(`src/lib/scope.js`). It decides **which dashboard a person is shown** — and
nothing else. The code says so in as many words: *"A right decides which
specialist DASHBOARD appears; it withholds nothing"* (`src/lib/scope.js`), and
*"a screen that hides a row is not security."* Crucially, **you cannot hold a
right without also being a full admin** — the rights live *on top of* `is_admin`,
they do not stand in for it.

So the person who runs the club's **social media**, or who allocates **pitches**,
technically holds every child's name, photo and home contact details — even
though their job never needs them. The menu hides the roster from them; the
database does not. Anyone who pasted the right URL, or who used the API directly
with their own login, would get the lot.

**Jay's ask (28 Aug 2026): make it genuinely secure.** A right like Social Media
Management or Pitch Management should *actually not expose* children's data — not
merely omit it from a menu. This is the **"expensive piece"** the 10 Aug ruling
priced and deferred, now commissioned.

**The safeguarding / data-minimisation driver.** This is a youth club; the
subjects are mostly children. The principle — hold the least data necessary for
each job — is both a safeguarding instinct and, in data-protection terms, *data
minimisation*. **Jay should put the data-minimisation posture below to his own
advisor.** That is a flag for a professional, not legal advice from this document.

---

## 2. The model today (the baseline we are changing)

### 2.1 Roles and attributes

`memberships.role` is CHECK-constrained to exactly six values
(`db/schema/tables.sql`):

| Role | Scope | What it grants |
|---|---|---|
| `admin` | Club-wide (`team_id` is null) | **Everything** — full sight and edit of all club data |
| `coach` | One squad | Edit that squad; see its people |
| `manager` | One squad | Identical to coach (label only) |
| `medic` | One squad | Identical to coach, **except** cannot approve new registrations |
| `parent` | One child | See/edit own child only |
| `player` | Self | See/edit own record only |

On top of the role, a membership row carries **attribute flags** that modify
authority or identity:

| Flag | Type | Meaning |
|---|---|---|
| `is_super` | boolean | The super-admin tier. May grant access to others. A **flag, not a role** — deliberately (see 2.3). |
| `admin_rights` | text[] | Which specialist **dashboard** is shown. **Not a data boundary today.** |
| `status` | `active` / `pending` | A `pending` row *attaches* a person (fixtures, own child) but satisfies **no** authority helper. |
| `is_head_coach` | boolean | Routing only — decides who gets *told*, never who may *act*. |
| `notify_approvals` | boolean | Who is emailed about approvals. Confers nothing. |
| `title` | free text | A job label ("Head Coach"). **Never permission** — anything that branches on it is a bug. |

### 2.2 The `is_admin` spine

<!-- count-ok -->
`is_admin` appears roughly **274 times** across `db/migrations/` (measured 28 Aug
2026). This is the single most important fact about the cost of this project: it
is not "13 policies," it is the **spine of the whole schema**. Every one of those
sites is a place where "admin" currently means "sees everything," and the
redesign must visit each and decide whether that surface exposes children's data.

### 2.3 Why super-admin is a flag, not a role

Recorded in full at `claude/decisions/2026-08-10-role-dashboards.md`: a new role
*value* would have to be added to every place that tests `role = 'admin'`, and
each is a chance to miss one — silently stripping a super admin of an ordinary
admin power. A boolean makes a super admin *also* an ordinary admin in the same
row, so everything existing keeps working and only the *new* restricted things
test the flag. **The same reasoning is a warning for this project:** anything we
build that narrows an admin must not accidentally narrow the 274 places that
assume the wide admin.

### 2.4 Baseline reality matrix — what each actor can do *today*

Legend: **edit** = read + write/delete · **read** = read only · **—** = no access

| Actor | Children's names/gender | DOB / parent contact | Player photos | Events | Pitches | Match sheets | Chat DMs | Grant access |
|---|---|---|---|---|---|---|---|---|
| Super Admin | edit | edit | edit | edit | edit | edit | review¹ | **yes** |
| Admin (any right, or none) | edit | edit | edit | edit | edit | edit | review¹ | no² |
| Coach / Manager | edit (own squad) | edit (own squad) | edit (own squad) | edit (own squad) | — | edit (own squad) | own + squad | no |
| Medic | edit (own squad) | edit (own squad) | edit (own squad) | read | — | read | own + squad | no |
| Parent / Player | own child | own child | own child | read (attached) | — | — | own | no |

¹ Any admin may review a DM only when it is *reviewable* — a participant is a
minor, or a message was reported (`private.admin_may_review`,
`db/migrations/20260823_squad_chat_phase3.sql`). Adult↔adult DMs are otherwise
private.
² Since the 10 Aug work, granting access (setting `is_super`/`admin_rights`) is
super-admin-only, via `public.set_admin_rights`. An ordinary admin can no longer
promote themselves — see 5.1.

**The single row that this whole project is about is row 2:** an admin who holds
only the `media` or `pitches` right still has `edit` across every children's
column. The target design must turn some of those cells into **—**.

---

## 3. The three enforcement surfaces (the trust boundaries)

To reason about a data boundary you have to know *where* boundaries are actually
enforced. There are three surfaces, and only the first is a real boundary.

**Surface A — Postgres RLS + `SECURITY DEFINER` helpers. The real boundary.**
Every table has row-level security; access decisions live in `private.*` helper
functions (`private.is_admin`, `can_edit_team`, `can_see_team`, …) and in storage
policies. Quote, repeated a dozen times in the codebase: *"The SQL is the real
boundary."* **This is the only surface that can withhold data from a determined
user.** Everything the redesign actually secures, it secures here.

**Surface B — `src/lib/scope.js`. Advisory only; never enforces.** The client
mirrors the DB helpers (`isAdmin`, `canEditTeam`, `hasAdminRight`, …) to decide
*what the UI offers*. The file states its own status plainly: *"this decides only
what the UI shows … could never let anyone write a record they don't own."* Route
and menu guards are the same — *"not security."* **Getting Surface B wrong can
hide something from someone entitled; it can never expose anything.** It matters
for polish, not for safety — but it must be kept in step with A so the two do not
drift (the codebase's "change one, change both" rule).

**Surface C — trusted service-role edge functions. Bypass RLS entirely.** Nine of
the eleven functions under `supabase/functions/` run with the `service_role` key,
which *ignores* row-level security, and are gated only by a **shared project-wide
secret** (`APPROVAL_NOTIFY_SECRET`), not by any user's role. Two more are special:
`calendar` (the unguessable URL token *is* the credential) and `send-email` (a
webhook signature; it has silently broken before when redeployed with JWT
verification toggled). **This surface is where residual trust concentrates:** a
leaked secret, or a mis-toggled deploy flag, bypasses Surface A completely. The
redesign must ensure that when we narrow an admin at Surface A, **no edge function
quietly re-widens the same data at Surface C.**

> **Why this matters concretely.** Suppose we make the `pitches` right unable to
> read children (Surface A). If `backup-player-photos` or a future notifier hands
> that same person child data through a service-role path, the boundary is a
> fiction. Every surface added to the matrix in Section 5 must be checked at A
> **and** C.

---

## 4. The two design options — and the one chosen

Two ways to make "Club Hub Admin" and the specialist jobs behave like distinct
access levels were considered. They are **not** equivalent, and the difference is
the whole point of this project.

### Option 1 — Portal composition (rejected for this purpose)

Add `'clubadmin'` to `ADMIN_RIGHTS`; change the Club Hub Admin portal from
`right: null` (auto-granted to every admin, `src/lib/portals.js`) to
`right: 'clubadmin'`; backfill existing admins so nobody loses their screen. This
makes "Club Hub Admin" a tickbox in the existing `AdminRightsEditor`, and lets
rights *compose* portals cleanly.

**Why it is not enough:** it is **Surface B only**. It changes which menu appears.
Every holder is still `role = 'admin'`, so `is_admin` is still true, so the
database still hands them every child. It is honest *if labelled as screen
gating* — but it does not restrict data, which is exactly what Jay asked for.

> **Tombstone, not a dead end.** Option 1 is a *legitimate, cheap* improvement to
> portal *composition* if that is ever wanted on its own — it is recorded here so
> the idea is not re-proposed as a security fix, and not lost as a UI tidy-up.

### Option 2 — Real RLS data boundaries (**chosen**)

Make a right a genuine boundary at **Surface A**: someone who holds only the
`media` or `pitches` right is **not** given `is_admin`-level sight of children.
This is the "expensive piece," because of the 274 `is_admin` sites (2.2) and the
surfaces C and columns/storage/chat that a naive "just change `is_admin`" would
miss (Section 5).

**Jay chose Option 2.** The rest of this document designs Option 2.

### 4.1 The architectural crux Option 2 forces

Today the relationship is: **holding a right ⊂ being a full admin.** You are an
admin first; the right only picks your dashboard. Option 2 must **break that
link** so that a right can be held by someone who is *not* a full-sight admin.

There are two broad shapes for that (the choice between them belongs to the
migration deliverable, but the design must acknowledge it):

- **Shape α — right-aware `is_admin`.** Keep `role = 'admin'`, but make the
  *sensitive* helpers (the subset of the 274 that gate children's data) also
  require an appropriate right. Least disruptive to the non-sensitive spine, but
  every sensitive site must be found and reclassified — a miss *leaks*.
- **Shape β — scoped admin as a first-class thing.** Introduce a genuinely
  narrower admin (the "narrower admin" the 10 Aug record priced) whose reach is
  the union of the rights it holds, with `is_super`/Club Hub Admin remaining the
  wide one. Cleaner conceptually, larger blast radius to build.

Either way, the **access matrix in Section 5 is the input**: it says *which*
helper sites are "sensitive" and what each right may reach. That is why the matrix
is the first deliverable and this decision is deferred to migration planning.

---

## 5. The access matrix (the deliverable)

**Axes:** admin *right* (row) × data *surface* (column) × permitted action
(**edit / read / — / `?`**).

`?` = **a safeguarding decision for Jay.** These are not gaps in the analysis;
they are the questions the analysis exists to raise.

### 5.1 The surfaces (columns), and why each is its own boundary

| # | Surface | Enforced at | Note |
|---|---|---|---|
| S1 | **Children's core identity** — name, gender | RLS on `players` | The headline PII. |
| S2 | **Sensitive columns** — DOB, parent email/phone | RLS **+ column grants** | Column-level, not row-level. `profiles.email` is already protected by a column grant, not a policy (`db/schema/grants.sql`) — **the pattern to copy.** A right could see a child's *name* but not their *DOB/contact*. |
| S3 | **Player photos** | Storage policies (`db/schema/policies.sql`) + `backup-player-photos` edge fn (Surface C) | Images of children. Governed by `can_see_team`/`can_edit_team` today; the R2 backup runs at Surface C. |
| S4 | **Events / fixtures** | RLS on `events` | Not child PII. The "events yes/read/no" column of the 10 Aug table. |
| S5 | **Pitches & pitch requests** | RLS on pitch tables | The Pitch job's home surface. |
| S6 | **Match sheets** | `private.can_edit_match_sheet` | **Inherently contains children's names** — so a right that may edit match sheets implies at least S1 read. |
| S7 | **Chat DMs / welfare review** | RLS on `messages` + `admin_may_review` | The "any admin may review a DM" ruling **must change** under a scoped model — see 5.4. |
| S8 | **Announcements / social output** | RLS on `announcements`, `social-ideas` storage | The Social Media job's surface. **Tension:** social posts often feature children's *photos* (S3). |
| S9 | **Membership & grant-access** — who is an admin, who holds which right | Column grants + `set_admin_rights` RPC | Super-admin-only today. The self-promotion hole is **closed** (column grant on `memberships` excludes `is_super`/`admin_rights`; restrictive INSERT policy `"memb no self promotion"`; `SECURITY DEFINER` RPC that raises unless caller is super). |
| S10 | **Audit-log sight** — who read/changed what | `"membership audit read"` policy (super only) | Sensitive-*read* logging (S1/S2 access) does **not** exist yet and is a redesign requirement (7.3). |

### 5.2 The target matrix — DECIDED 28 Aug 2026

Every cell below was ruled by Jay on 28 Aug 2026. Legend: **edit** = read +
write · **read** = read only · **—** = no access · **grant** = may hand access to
others.

| Right ↓ / Surface → | Names / gender | DOB / parent contact | Photos | Events | Pitches | Match sheets | DM any adult³ | DM review² | Announce / social | Grant access | Audit sight |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Super Admin** (`is_super`) | edit | edit | edit | edit | edit | edit | yes | only if `welfare` ticked² | edit | **grant** | read |
| **Club Hub Admin** (`clubadmin`, new right) | edit | edit | edit | edit | edit | edit | yes | — (needs `welfare`) | edit | — | — |
| **Youth Manager** (`youth`) | edit | edit | edit | edit | — | edit | yes | — | — | — | — |
| **Social Media** (`media`) | edit | edit | edit | edit | — | — | yes | — | edit | — | — |
| **Welfare** (`welfare`) | read¹ | read¹ | read¹ | — | — | — | yes | **yes — the defining power** | — | — | — |
| **Pitch Management** (`pitches`) | read | — | — | edit | edit | — | yes | — | — | — | — |
| **Training** (`training`) | read | — | — | read | — | — | yes | — | — | — | —⁴ |

¹ **Welfare sees children as *read*, not edit** — it is an oversight/review role;
it may remove a flagged message but not edit the roster. Read-vs-edit was not
separately ruled; read is the safe default for oversight. Bump on request.
² **DM review is enforced on the *explicit* `welfare` grant, never implied by
super.** A super self-ticks Welfare (an audited write to their own
`admin_rights`) to review, and can untick it. The **sensitive-read audit** (7.3)
logs the *opening* of a child's DM, so "did a super read this, and when?" is
answerable. This is a deliberate exception to "a super implicitly holds every
right", and must not be "fixed" back.
³ **"DM any adult" = may start and hold a direct message with any adult in the
system.** It is a general capability of holding *any* admin right, enforced in
`private.can_dm`, and needs **no** children's data — which is why a `pitches`
holder with names-only sight still has it. Requested by Jay 28 Aug specifically
so a narrowed admin does not lose the ability to reach other adults.
⁴ **Training also holds read/edit on training *attendance*** for its squads (not
a column above), and on the training content (plans, drills, templates). It sees
players by **name** only — no photos, DOB, or parent contacts.

**The headline.** Three rights become genuine data boundaries — **Pitch** (names
only), **Training** (names + attendance only) and **Welfare** (read-only
oversight). Three stay wide by Jay's deliberate choice — **Club Hub Admin**,
**Youth Manager**, **Social Media**, each a recorded full-sight role. And
**nobody loses access today**: every existing admin is backfilled with Club Hub
Admin, which carries full sight, so the change only enables *narrower future
grants*.

### 5.3 How each decision was ruled (28 Aug 2026)

1. **Pitch → children's *names* only** (read); no photos, DOB or contacts; keeps
   events and pitches; gains DM-any-adult. Not "no children at all" — Jay wanted
   names visible for scheduling context.
2. **Social Media → full access, incl. photos.** Jay chose to keep this a
   full-sight admin rather than build a curated photo hand-over now. Recorded as
   knowingly wide: this volunteer still holds every child's details. (This drops
   the 10 Aug "events read-only, kids no" pricing for this right, deliberately.)
3. **Youth Manager → full sight** (names, photos, DOB, parent contacts) — the
   10 Aug "kids yes" ruling, confirmed in full.
4. **Training → names + attendance only** (note ⁴). A real boundary: no photos,
   DOB or contacts.
5. **Welfare → full read sight + DM review**, the *stricter* model: DM review is
   the explicit `welfare` grant even for supers (note ²), paired with the
   sensitive-read audit.
6. **Club Hub Admin → its own right, and full sight.** Existing admins are
   backfilled so none loses access; the decoupling is what lets a specialist be
   granted *without* the wide screen.

### 5.4 Chat & DMs — the decided model

Two separate chat capabilities fall out of the rulings, and keeping them apart is
the whole trick:

- **Reviewing** children's / reported DMs moves from *every admin* to the
  **explicit `welfare` grant** (`admin_may_review` →
  `db/migrations/20260823_squad_chat_phase3.sql`, to be revised). Even a super
  must hold Welfare to review, and every review is auditable (note ²). Fewer eyes
  on children's private messages — a safeguarding improvement.
- **Reaching** other adults is *preserved for all admin rights*. Today an admin
  can DM any adult because `private.can_dm` treats "is an admin" as the pass.
  When a narrowed right (e.g. `pitches`) stops implying full admin, that reach
  must not vanish with it — so "**holds any admin right → may DM any adult**"
  becomes its own rule in `can_dm`, independent of data sight (note ³).

The design point: **review** and **reach** are different powers on the same chat
surface. The redesign *narrows* review (to Welfare) while *preserving* reach (for
every right). Conflating them — the current model, where "admin" grants both — is
exactly what is being unpicked.

---

## 6. Threat model

### 6.1 Assets

Children's personal data, in order of sensitivity: safeguarding/welfare content
(chat, any future notes) → DOB and home/parent contact → photos → names/gender.
Secondarily: the integrity of *who is an admin* (S9).

### 6.2 Threat actors (Jay's two, plus the standing one)

- **T1 — the trusted insider who over-reaches.** A genuine club volunteer, given
  a *narrow* job (social media, pitches), who can technically reach the whole
  roster. Not assumed malicious — but data they never needed to hold is data that
  can be misused, screenshotted, or lost. **This is the primary driver** and the
  reason Option 1 (menu-only) is insufficient: T1 has a login and can use the API.
- **T2 — account takeover.** A volunteer's account is phished or their device
  compromised. The attacker inherits *exactly what that account can reach*.
  **Minimising each right's reach directly shrinks the blast radius** of every
  takeover. A compromised Pitch account that cannot read children is a far
  smaller incident than one that can.
- **T0 — the external attacker with no account** (standing baseline). Defended by
  auth + RLS; relevant to this project mainly at Surface C (secrets) and the two
  unauthenticated-by-design functions.

### 6.3 Attack scenarios and current posture

| Scenario | Surface | Status |
|---|---|---|
| Admin promotes self/another to admin or super | S9 / A | **Closed.** Column grant excludes `is_super`/`admin_rights`; restrictive INSERT policy; `set_admin_rights` RPC raises unless super. |
| **Narrow-right holder reads whole roster via API/URL** | S1–S3 / A | **OPEN — this is the core weakness the redesign fixes.** `is_admin` is true for any admin, so RLS returns everything regardless of which dashboard the menu shows. |
| Leaked `APPROVAL_NOTIFY_SECRET` → any worker function abused | C | Accepted trade today (one secret, nine workers). Redesign must ensure no worker becomes a *new* child-data path for a narrowed right. |
| `send-email` redeployed with JWT verification on / hook secret unset | C | Known fragility; has broken before. Out of scope to fix here, in scope to *not depend on*. |
| Pasted deep-link / menu-hiding treated as security | B | Not a boundary by design; only dangerous if we *mistake* B for A during the migration. |
| Stolen JWT + direct PostgREST call | A | RLS still applies — which is *why* the boundary has to be at A, not B. |

### 6.4 Knowingly-accepted risks (recorded so they are not "discovered" later)

- **Every admin sees every child, today** — chosen knowingly on 10 Aug ("trusted
  volunteers"). This project is the reconsideration of that acceptance for the
  *specialist* rights, not for Club Hub Admin / Super.
- **`training-diagrams` storage bucket is world-readable to any authenticated
  user** (`db/schema/policies.sql`). Not child PII, but confirm it is intended.
- **`verify_jwt` deploy flags are not in the repo** (no committed
  `supabase/config.toml`); they live only in per-function deploy config and code
  comments. The threat model cannot *prove* the deployed posture from the repo.
- **`private.squad_expects_gender` has no pinned `search_path`** — a general
  hardening gap noted in-schema, not specific to admin rights.

### 6.5 Residual risk after the redesign

Even with Option 2 complete, three things remain true and should be stated:
Surface C still bypasses RLS (mitigated by secret hygiene, not by this design);
Surface B must be kept in step by discipline; and **Club Hub Admin / Super Admin
still hold everything** — the redesign narrows the *specialist* rights, it does
not eliminate wide access, because the club needs some. The goal is
*least-privilege per job*, not *no privileged accounts*.

---

## 7. Implementation approach (context only — full plan is the next deliverable)

Sketched so the design can be judged for feasibility. **Not a commitment to
sequence.**

### 7.1 Per-surface, incremental

Take the matrix one surface-column at a time (start with the clean one: make
`pitches` lose children, S1–S3). For each surface, find every `is_admin` (and
sibling) site touching it among the ~274, classify it sensitive/not, and apply the
narrowing. **Deploy one surface at a time** so a mistake is small and reversible.

### 7.2 Prove both directions against production

Database branching does **not** work on this repo (migrations live in
`db/migrations/`, not where Supabase branches look — see `CLAUDE.md`). Use the
`db/tests/` **rollback harness** (`npm run db:check`), which runs inside a
transaction that rolls back, against production data. For each surface, prove
**both**:

- **No legitimate admin loses access** they should keep (the regression risk the
  10 Aug "flag not a role" reasoning warns about), **and**
- **No narrowed right can still reach the boundary** (the leak the whole project
  exists to prevent).

A test that only checks one direction is half a test. **Adversarial test per
right:** log in *as* a `pitches`-only holder and confirm the roster is genuinely
refused — at the API, not just the screen.

### 7.3 New requirement: sensitive-read audit (S10)

The redesign should add **audit logging of sensitive reads** (who read children's
S1/S2 data, and who *opened* a child's DM), not only of membership *changes*
(which `membership_audit` already covers). This is both a safeguarding control
and evidence for the data-minimisation posture in Section 6. **Confirmed a
requirement on 28 Aug 2026** — it is what makes the stricter Welfare DM-review
model auditable (5.2 note ²), so it ships with that surface, not after it.

### 7.4 Process guardrails

Destructive schema changes deploy-first (per the project's standing rule); merges
and deletes on this work are classifier-gated and need Jay's explicit yes. These
process rules are recorded in the project's own memory and are **not** re-decided
here.

---

## 8. Status of the decisions

**Resolved 28 Aug 2026 (5.2, 5.3):** the full right × surface matrix; the chat
review/reach split (5.4); Club Hub Admin as its own right; and the stricter
super/Welfare DM-review model with a sensitive-read audit.

**Still open — smaller, and not blocking the matrix:**

1. **Architectural shape** — α (right-aware `is_admin`) vs β (scoped-admin as a
   first-class thing), 4.1. Needed before migration planning, not before sign-off.
2. **Welfare read vs edit** on children (note ¹) — defaulted to read; confirm.
3. **Audit-log visibility** — the rights-log and the new sensitive-read audit are
   super-only today; does Welfare also get to see the read-audit? (Left
   super-only for now.)
4. **Advisor flag** (unchanged): put the data-minimisation posture — which rights
   hold which children's data, and why — to Jay's data-protection advisor. A flag
   for a professional, not legal advice from here.

---

## 9. What this does not settle / next deliverables

- **The migration plan** — sequenced, per surface, with the α/β decision made.
- **The dashboards** behind each right (mostly already built).
- **Surface C hardening** (secret rotation, `send-email` robustness) — related but
  separate.

*Once the matrix cells are ruled and the architectural shape is chosen, the next
document is the migration plan, and only then does code begin.*
