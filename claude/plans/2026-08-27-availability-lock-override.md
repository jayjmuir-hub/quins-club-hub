# Per-event availability lock override — Auto / Open / Locked

**STATUS: NOT YET SHIPPED** — spec written 27 Aug 2026. Builds directly on the
self-edit lock shipped the same day
(`claude/plans/2026-08-27-availability-clear-and-lock-window.md`,
`db/migrations/20260827_availability_self_lock.sql`). Ends in one production
migration + one Netlify deploy; both need Jay's explicit yes.

## Why

The self-edit lock is automatic — a calendar-day cutoff by event type. Coaches
and managers need to override it **per event**: keep a specific fixture's
availability open for late RSVPs, or close one early once the squad is settled.

This is the per-event override the shipped decision record explicitly parked:
`claude/decisions/2026-08-27-availability-self-edit-lock.md` lists "a stored
per-event `locks_at` column (YAGNI until per-event overrides are actually asked
for)" under Rejected. They have now been asked for. That decision record is
updated by this work (see Docs).

## The rule (exact)

A new per-event setting, **`availability_override`**, with three states:

| Override | Effect on a parent/player's self-service |
|---|---|
| `auto` (default) | The calendar-day rule as shipped — 5 days before a match, 1 before training, never for a social. |
| `open` | **Always editable**, regardless of type or date — parents may set/change/clear right up to the event. |
| `locked` | **Always frozen** — closed even before the auto-cutoff, and even for a social. |

**Staff are still never locked** — `can_edit_team` (admin, and coach/manager/
medic on the team) may always set/change/clear any player, in any override
state. The override only ever changes what *parents/players* may do to their
own child.

**Who may set the override:** exactly `can_edit_team` — the same staff who can
already override any player's status and who already create/edit events. Setting
it is an UPDATE on the event row, so the existing events write permission is the
gate; no new policy.

## Layer 1 — the database

**Migration** (`db/migrations/2026MMDD_availability_override.sql`):

1. **New column on `events`:**
   ```sql
   alter table public.events
     add column availability_override text not null default 'auto'
       check (availability_override in ('auto','open','locked'));
   ```
   Default `'auto'` so every existing event keeps today's behaviour with no
   backfill.

2. **Column grants.** `events` uses **column-level** grants for `authenticated`
   (measured 27 Aug 2026: 32 SELECT and 32 UPDATE columns). A new column is NOT
   covered by those, so it needs its own grants — the client reads it to render
   the control and compute the UI lock, and staff write it:
   ```sql
   grant select (availability_override) on public.events to authenticated;
   grant update (availability_override) on public.events to authenticated;
   ```
   Follow the pattern of prior events-column migrations (e.g.
   `20260811162649_competition_type`, `20260808151251_event_end_time_and_notes`).
   ⚠️ **`docs:check` rule 7** requires a migration granting on a table to be
   represented in `db/schema/grants.sql` — add the two lines there too.

3. **Alter the helper** `private.availability_self_editable` to consult the
   override first, then fall through to the existing auto rule:
   ```sql
   create or replace function private.availability_self_editable(p_event_id uuid)
   returns boolean language sql stable security definer
   set search_path = public, private
   as $$
     select case
       when e.availability_override = 'open'   then true
       when e.availability_override = 'locked' then false
       when e.starts_at is null then true
       when e.type not in ('match','training') then true
       else now() < (
         date_trunc('day', (e.starts_at at time zone 'Asia/Dubai'))
         - make_interval(days => case e.type when 'match' then 5 when 'training' then 1 end)
       ) at time zone 'Asia/Dubai'
     end
     from public.events e
     where e.id = p_event_id
   $$;
   ```
   The `revoke all from public` / `grant execute to authenticated` on the helper
   is already in place from the shipped migration and does not need repeating in
   an `alter` — but `create or replace` preserves existing grants, so nothing is
   lost. (Confirm the grant survives in the verify block below.)

   The three `avail write` policies are **unchanged** — they already call the
   helper.

4. **Verify block** (a migration that changed nothing must fail): assert the
   column exists with the CHECK, the helper still returns the right boolean for
   each override (an `open` locked-window match ⇒ true; a `locked` distant match
   ⇒ false; an `auto` distant match ⇒ true), and that `authenticated` still has
   EXECUTE on the helper.

## Layer 2 — the client (mirror only; DB is the gate)

**`src/lib/availabilityLock.js`** — `isAvailabilitySelfLocked(event, now)`
honours the override before the date maths:
- `event.availability_override === 'open'` → `false` (never locked).
- `event.availability_override === 'locked'` → `true` (always locked).
- `'auto'`, `undefined`, or `null` → the existing `availabilityLockInstant`
  computation (unchanged). `availabilityLockInstant` itself gains no override
  logic — it stays "when does the *auto* rule lock" and returns `null` for a
  non-auto override (there is no computed instant for a manual state).

## Layer 3 — the two controls (one DB column, always consistent)

Because both controls write the single `events.availability_override`, they
cannot disagree.

**A. EventForm (`src/screens/EventForm.jsx`)** — a tri-state field, default
`Auto`, in the event create/edit form (which is already staff-only). Its value
rides along in the event object passed to the existing `upsertEvent(event)`
(`src/data/events.js`) — no new write path. Label: "Self-service availability"
with options Auto / Open / Locked and one line of helper text each
("Auto — locks 5 days before a match, 1 before training" / "Open — parents can
RSVP right up to kickoff" / "Locked — closed to parents now").

**B. Availability sheet (`src/screens/Availability.jsx`)** — a staff-only
(`canOverrideAll` / `can_edit_team`) tri-state control at the top of the sheet.
Changing it calls a new `setAvailabilityOverride(eventId, value)` in
`src/data/events.js` (a targeted `update` of just that column, throw-on-error,
returns the saved row), then updates the sheet's local override state so the
per-row lock and the notice re-render immediately. The parent-facing notice
adapts:
- `locked` (manual) → "Availability is closed for this event."
- `auto` inside the window → the existing calendar wording.
- `open` → no notice; buttons active.

`setAvailabilityOverride` also gets a matching stub in
`harness/stubs/events.js` (same public shape the harness aliases).

## Testing

1. **`tests/availabilityLock.test.js`** — override cases: `open` on a match
   inside the window → not locked; `locked` on a distant match and on a social →
   locked; `auto`/undefined → unchanged from today. Discriminating: a wrong
   precedence (date rule before override) would fail the `open`-inside-window
   and `locked`-social cases.
2. **`tests/availability.test.jsx`** — the staff override control writes via
   `setAvailabilityOverride` and flips the sheet's lock state; a parent on an
   `open` match inside the window sees active buttons (no notice); a parent on a
   `locked` event sees disabled buttons + the manual notice; a coach is
   unaffected by every override state.
3. **EventForm test** (`tests/` — the event-form suite) — the field renders,
   defaults to Auto, and its value reaches the `upsertEvent` payload.
4. **RLS rot-anchor** `db/tests/rls-availability-equivalence.sql` — extend
   `pg_temp.configure` to also set `availability_override`, and add probes:
   parent on `open` + locked-window match → ins/upd/del ALLOWED; parent on
   `locked` + distant match (or social) → upd/del NO ROWS, ins ≠ ALLOWED; staff
   ALLOWED throughout. Keep the existing inversion self-test. `npm run db:check`.

## Edge cases

- **Override on a social:** `open` is a no-op (socials never auto-lock anyway),
  `locked` genuinely closes a social early — the one way a social can be locked.
  Intended.
- **Override + null `starts_at`:** `open`/`locked` still apply (they short-
  circuit before the null check); `auto` fails open as today.
- **Stale sheet copy:** the sheet writes the override and updates its own local
  state; the parent's `event` prop upstream refreshes on the next Schedule/
  EventDetail reload. No cross-viewer lie — the DB is authoritative and a parent
  loading the sheet reads the current value.

## Rejected / out of scope

- **A free `locks_at` timestamp** (arbitrary custom cutoff per event) — rejected;
  three states cover the ask and are far simpler to reason about and display.
- **A squad-wide default override** — out of scope; the ask is per event.
- **Notifying parents when a coach re-opens/locks availability** — out of scope
  (YAGNI); revisit if asked. Push plumbing exists but this is a separate feature.

## Rollout

1. Front-end + helper + tests green (`npm test`); DB harness green
   (`npm run db:check`) proving the override matrix.
2. Show Jay the diff + migration SQL; explicit yes.
3. Apply `db/migrations/2026MMDD_availability_override.sql` to production.
4. Merge → deploy (**15 credits**); verify the deploy id moves.
5. Verify live: as a coach, set an in-window match to Open (parent can now RSVP)
   and a distant match to Locked (parent frozen); confirm EventForm and the sheet
   agree; confirm a parent sees the effect and staff are never blocked.
6. Docs: update the decision record, changelog.
