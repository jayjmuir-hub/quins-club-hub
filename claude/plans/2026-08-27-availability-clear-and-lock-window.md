# Availability — clear a status, and a self-edit lock window

**STATUS: NOT YET SHIPPED** — spec written 27 Aug 2026. Ends in one production
migration + one Netlify deploy; both need Jay's explicit yes before they run.

## Why

Two problems, one screen (`src/screens/Availability.jsx`):

1. **You can't un-answer.** The In / Maybe / Out buttons only ever *set* a
   status. Clicking the one already selected just re-saves the same value.
   There is no way back to "No response".
2. **The club wants a deadline.** Parents and players change their minds late,
   which wrecks a coach's planning. The club wants self-service RSVP to *close*
   a fixed time before the event, after which only staff can adjust it.

This reverses a deliberate decision. On 9 Aug 2026
(`db/migrations/20260809_scale_indexes_and_availability_policy_merge.sql`,
and the rot-anchor `db/tests/rls-availability-equivalence.sql` lines 87–93)
DELETE on `availability` was made **staff-only** on the reasoning that "a
parent changes their answer, they do not remove the row." Jay has now asked
for the opposite: parents *may* clear their answer — but that power, and their
existing set/change power, is now bounded by a lock window instead. The
decision record for this reversal is `claude/decisions/2026-08-27-availability-self-edit-lock.md`
(to be written with the implementation), and it must carry the argument that
was made *against* letting parents delete, so it is not re-litigated blind.

## The rule (exact)

The lock applies to **parents and players only** (`is_own_player`). **Staff**
(`can_edit_team` — coaches and admins) are **never** locked and may set,
change, or clear any player's status at any time.

A parent/player may set, change, or clear their own child's status **until a
cutoff**, then every self-edit (set, change, and clear alike) is frozen until
staff change it for them. The cutoff is a **calendar day boundary in Abu Dhabi
time** (`CLUB_TIME_ZONE = 'Asia/Dubai'`, a fixed UTC+4 with no daylight
saving), measured off the event's own date:

| Event `type` | Self-edit closes at |
|---|---|
| `training` | **00:00 Abu Dhabi, 1 day before** the event's date |
| `match` | **00:00 Abu Dhabi, 5 days before** the event's date |
| `social` | **never** — always open to the parent/player |
| anything else / null `starts_at` | never (fail-open) |

The three `type` values are the whole set — `src/screens/EventForm.jsx` `TYPES`
offers exactly `match`, `training`, `social`. Any other value, or an event with
no `starts_at`, is treated as never-locking so a data oddity can never silently
freeze the whole club out.

**Worked examples**
- Match, Sunday 16:00 Abu Dhabi → 5 days before Sunday is Tuesday →
  **locks 00:00 Tuesday** (≈ 5 days 16 h before kick-off).
- Training, Wednesday 18:00 Abu Dhabi → 1 day before Wednesday is Tuesday →
  **locks 00:00 Tuesday** (≈ 42 h before — the calendar-day rounding Jay chose
  over rolling hours).
- Social, any time → never locks.

"Frozen" means the parent's answer at the cutoff is final. A child injured
three days before a match cannot be marked out by the parent; they ask a coach,
who is never locked. That is the intended flow.

## "Clear" = delete the row

There is no stored "No response" value — a player with no availability row *is*
"No response" (`src/data/availability.js` header; the tally in
`Availability.jsx` derives no-response from the roster/rows diff). So clearing a
status **deletes that player's `(event_id, player_id)` row**. Falling back to
"No response" is the absence of the row, exactly as an un-answered player
already is.

## Layer 1 — the database (the real gate)

The UI can be bypassed; the lock is only real if RLS enforces it. `now()` is
the server clock, so a wrong device clock or a direct PostgREST call cannot beat
it.

**New migration** (`db/migrations/2026MMDD_availability_self_lock.sql`, exact
date at apply time):

1. **A `private` helper** encapsulating the time rule, so all three write
   policies share one definition:

   ```sql
   create or replace function private.availability_self_editable(p_event_id uuid)
   returns boolean
   language sql
   stable
   security definer
   set search_path = public, private
   as $$
     select case
       when e.starts_at is null then true
       when e.type not in ('match','training') then true
       else now() < (
         date_trunc('day', (e.starts_at at time zone 'Asia/Dubai'))
         - make_interval(days => case e.type
                                    when 'match' then 5
                                    when 'training' then 1
                                  end)
       ) at time zone 'Asia/Dubai'
     end
     from public.events e
     where e.id = p_event_id
   $$;
   ```

   - `starts_at at time zone 'Asia/Dubai'` turns the stored `timestamptz` into
     the Abu Dhabi wall-clock `timestamp`; `date_trunc('day', …)` is midnight
     that day; subtract N days; the trailing `at time zone 'Asia/Dubai'` reads
     that wall-clock midnight back as a real UTC instant. `now() < instant` ⇒
     still open.
   - `security definer` + pinned `search_path` matches the existing
     `private.*` helpers (`can_edit_team`, `is_own_player`) so the events read
     is not itself subject to the caller's event-RLS. A non-existent event id
     yields NULL, which a policy treats as false — harmless (the FK blocks an
     insert against a missing event anyway).

2. **Rewrite the three `avail write` policies.** Staff arm unchanged; the
   self arm gains the lock, and DELETE gains the self arm it never had:

   ```sql
   drop policy "avail write insert" on public.availability;
   drop policy "avail write update" on public.availability;
   drop policy "avail write delete" on public.availability;

   create policy "avail write insert" on public.availability for insert with check (
     private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
     or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
   );

   create policy "avail write update" on public.availability for update using (
     private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
     or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
   ) with check (
     private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
     or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
   );

   create policy "avail write delete" on public.availability for delete using (
     private.can_edit_team((select e.team_id from public.events e where e.id = event_id))
     or (private.is_own_player(player_id) and private.availability_self_editable(event_id))
   );
   ```

   The read policy (`avail read`) is untouched — visibility is not changing.

3. **Verify block**, in the migration itself (the 9-Aug migration's own
   pattern — a migration that changes nothing must fail, not pass): assert
   `pg_policies` still shows **4** policies on `availability`, and assert the
   helper returns the right boolean at two probe instants (a match 6 days out
   ⇒ true, a match 4 days out ⇒ false) so the migration cannot report success
   with the predicate inverted.

## Layer 2 — the React UI (the affordance)

The `Availability` sheet already holds `event` (with `type` and `starts_at`),
so it computes the same cutoff client-side purely to *show* the lock. The DB
stays the truth; if the two disagree at the exact boundary, the write is
refused and the existing refusal banner shows.

**New helper `src/lib/availabilityLock.js`**, reusing the tested club-time
machinery in `src/lib/eventFormat.js` (`clubWallTimeToUtc`, `clubDateTimeInputs`,
`CLUB_TIME_ZONE`) rather than re-deriving the offset:

- `availabilityLockInstant(event) → Date | null` — `null` when the event never
  locks (social, unknown type, or missing `starts_at`); otherwise the UTC
  instant of 00:00 Abu Dhabi on the (event-date − N days) day. Computed by
  taking the event's club-local date via `clubDateTimeInputs`, subtracting N
  calendar days, and feeding the result date + `'00:00'` back through
  `clubWallTimeToUtc` — the same wall-clock→UTC path the event form writes with,
  so the two can never drift.
- `isAvailabilitySelfLocked(event, now = new Date()) → boolean` — `instant !=
  null && now >= instant`.

**`src/screens/Availability.jsx` changes:**

- Per row, split today's single `editable` flag into two facts:
  `canEdit` (staff-override OR own child, as now) and, for a *self* row only,
  `locked = isAvailabilitySelfLocked(event)`. Staff rows are never locked.
- `StatusButtons` gains toggle-to-clear: when a button is the currently
  pressed status, clicking it calls `onClear` instead of `onSet`. `aria-pressed`
  already models a button that can be un-pressed, so no ARIA change is needed.
- Render states:
  - `canEdit && !locked` → active buttons (set, change, or click-to-clear).
  - `canEdit && locked` → the same buttons **disabled** (so the current answer
    is still visible in colour), with a short caption: *"Availability closed —
    locks {5 days before matches / the day before training}."*
  - not `canEdit` → static label, unchanged.
- `handleClear(playerId)` calls the new `clearAvailability`; on a delete that
  returns the removed row it optimistically drops that row from local state
  (mirroring `handleSet`'s optimistic patch); on an **empty** delete result it
  bumps `reloadToken` to refetch the truth rather than optimistically showing a
  removal the database may have refused. `handleSet` is unchanged.

**New data fn `src/data/availability.js` → `clearAvailability(eventId,
playerId)`:** deletes the `(event_id, player_id)` row with `.select()`, throws
on a real PostgREST error, and returns the deleted rows (`[]` when RLS refused
or the row was already gone — the two are indistinguishable from the row count,
and the caller reconciles by refetch). Same missing-id guard as
`setAvailability`.

**Harness stub `harness/stubs/availability.js`:** add a matching
`clearAvailability` that pushes a `{ op: 'delete' }` record to `window.__writes`
and returns `[]`, so the Playwright harness keeps the same public shape as the
real module (which it aliases).

## Testing

Every assertion is proven against an injected fault (a green test that would
also pass against the bug it guards is worthless).

1. **Repoint the rot-anchor** `db/tests/rls-availability-equivalence.sql`
   (rule 7 — repoint, never delete). Its current "parent DELETE ⇒ NO ROWS"
   assertion is now wrong *by design*. It becomes a matrix over event timing:
   for a parent acting on their own child, DELETE (and UPDATE/INSERT) is
   **ALLOWED** against a match > 5 days out and a training > 1 day out, and
   **NO ROWS** against a match < 5 days out and a training < 1 day out; a
   social is always ALLOWED; staff are ALLOWED throughout. This needs a small
   set of event fixtures at controlled `starts_at`/`type`. The discriminating
   fault: flip the helper's comparison and the "locked" rows must start
   reporting ALLOWED. Run via `npm run db:check`
   (`claude/runbooks/db-harnesses.md`), which rolls back against production.
2. **`src/lib/availabilityLock.js` unit tests** — a new
   `tests/availabilityLock.test.js`: match/training/social; an instant just
   before and just after each cutoff; the UTC+4 boundary (an event just after
   local midnight); null `starts_at` and an unknown type both return
   never-locks.
3. **`tests/availability.test.jsx` additions** — toggle-to-clear calls
   `clearAvailability` and drops the row; a locked parent sees disabled buttons
   and the caption and cannot fire a write; a coach is never locked; an empty
   clear result triggers a refetch rather than an optimistic drop. Mock
   `clearAvailability` alongside the existing `setAvailability` mock.

## Edge cases

- **Boundary race** (device clock says open, server says locked at the same
  midnight): the write is refused; `handleSet` already surfaces the refusal,
  and `handleClear`'s empty-result refetch reconciles. Self-corrects on next
  load. Accepted.
- **Event start edited after lock:** the lock is derived live from
  `starts_at`/`type` every time, never stored, so moving an event moves its
  lock automatically. (This is the argument for *not* denormalising a
  `locks_at` column — see below.)
- **Null `starts_at` / unknown type:** never locks (fail-open) — a data oddity
  must not freeze the club out.

## Rejected / out of scope

- **UI-only lock** — rejected. Trivially bypassed; a rule the club enforces
  belongs in RLS.
- **Rolling hours (24 h / 120 h before kick-off)** — rejected by Jay in favour
  of calendar-day (club-time) boundaries.
- **Stored per-event `availability_locks_at` column** — out of scope (YAGNI).
  It would let an admin override the lock time per event, but costs a column
  that must be recomputed whenever start/type changes and denormalises a value
  we can derive. Revisit only if per-event overrides are actually asked for.

## Rollout

1. Front-end + helper + tests green locally (`npm test`).
2. DB harness green (`npm run db:check`) proving the repointed RLS matrix.
3. Apply the migration to production (Jay's explicit yes; it is a policy
   change on a live table).
4. Merge to `main` → one Netlify deploy (**15 credits**). Show Jay the full
   diff and the migration SQL first; a stop hook asking is not Jay asking.
5. Verify live: as a parent test account, confirm a near match/training is
   locked and a distant one is open; as a coach, confirm no lock; confirm
   clear works and the row returns to "No response".
6. Docs: decision record, `claude/open-items.md` if anything is left partial,
   `claude/changelog.md`, and a tombstone pointer on the 9-Aug migration.
