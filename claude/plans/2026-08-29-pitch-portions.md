# Pitch sharing: portions and capacity-based clash detection

**Status: PARTLY SHIPPED — phase 1 merged (#522, `a128447`); phase 2 merged
(#523, `a4283c7`), migration applied to production; phase 3 allocator-side
portion code written, the PitchGlance stacked view and the "sharing approved"
override still not started.** Dated 2026-08-29.

## What Jay asked for

> we need a way in pitch assignments to split pitches for training or at the
> least to mark pitch conflicts approved and clear … in most training sessions
> different age groups share pitches, maybe 1/4 or 1/2 pitches depending on the
> age and size of the groups, sometimes they will get a full pitch though.

And, in the same conversation:

> actually even matches can split pitches in the younger age groups … i think
> only U12 and older get a full pitch for matches.

The old `findPitchClashes` flagged **any** two overlapping bookings on one
pitch as a clash, so every legitimate share — the ordinary Tuesday where four
age groups take a quarter each — looked like a double booking.

## Decisions taken (29 Aug 2026)

- **Model a portion, not a named zone.** A booking records how *much* of the
  pitch it uses (`quarter` / `half` / `full`), not *which* physical quarter.
  Clash detection becomes a **capacity** question — warn only when the portions
  occupying a pitch at one moment overtop a whole pitch. (Chosen over named
  sub-areas, which balloon the picker and demand precision coaches sort out on
  the grass, and over a bare "approve this clash" flag, which tracks nothing
  about how full the pitch is.)
- **Portions apply to matches too, not just training.** Age-based match default:
  U6–U8 ¼, U9–U11 ½, U12+ full. (Jay's rule. Training leans smaller: youth ½,
  tinies ¼, seniors full.)
- **Defaults are editable suggestions, never enforced** — the same fail-open
  posture as `src/lib/minis.js`, and the detector still **reports, never
  refuses** (`src/data/pitches.js` header).
- **`ack` (approve-and-clear) is the escape hatch, not the mechanism.** Portions
  make the normal share *automatically* clear, so a manual "sharing's fine here"
  override is only for a genuine over-capacity that is still OK — phase 3.

## Phase 1 — the engine (SHIPPED, #522 / `a128447`)

- `src/lib/pitchPortion.js` — the `quarter/half/full` vocabulary,
  `portionFraction` (unset = a whole pitch, the backward-compat hinge), and
  `defaultPitchPortion(teamName, {type})`.
- `src/data/pitches.js` — `findPitchClashes` reworked from pairs `{pitch,a,b}`
  to over-capacity groups `{pitch,load,events}`; a two-pass sweep (timed
  intervals + coincident starts) that preserves every prior rule, including the
  `group_id` fan-out exemption and the nullable-`ends_at` "same start only" rule.
- Consumers `src/screens/Allocation.jsx`, `src/screens/PitchGlance.jsx` updated.
- `tests/pitch-portion.test.js`, `tests/pitch-clashes.test.js`.

## Phase 2 — the column and the picker (SHIPPED, #523 / `a4283c7`; migration applied)

- `db/migrations/20260829_pitch_portion.sql` — adds `events.pitch_portion`
  (text, nullable, CHECK) and re-creates the `pitch_occupancy` RPC to return it.
- `src/screens/EventForm.jsx` — a "How much of the pitch" picker beside the
  pitch field, shown only for a real pitch, pre-filled from the squad's age and
  the type, kept in step until overridden. Written in the payload's `common`.
- `src/data/events.js` — `pitch_portion` joins `SERIES_EDITABLE_FIELDS`.
- `tests/event-form-pitch-portion.test.jsx`.

⚠️ **Ordering:** the migration is applied to production **before** the phase-2
code deploys — the column must exist before the writer names it (the reverse of
a drop-column change). Jay applies the migration; the PR merges after.

## Phase 3

- **Allocator-side portion (CODE WRITTEN).** The two assign sheets in
  `src/screens/Allocation.jsx` (queue decide + direct assign) set only a pitch;
  a pitch answered from a request kept a null portion (= full), so a coach's U8
  match — requested, then allocated — never got its quarter. Now a "How much of
  the pitch" dropdown appears once a pitch is chosen, defaulted from the fixture's
  squad (`portionDefaultFor`), and `setEventPitch` / `allocatePitch` in
  `src/data/pitchRequests.js` write `pitch_portion` alongside the pitch (null when
  there is no real pitch). `tests/allocation.test.jsx`, `tests/pitch-requests.test.js`.
- **PitchGlance stacked occupancy (not started).** Render each pitch/time slot as
  a stacked bar (¼ U8 · ½ U12) so "what's free before I ask" shows the room left.
- **"Sharing approved" override (not started)** for a genuine over-capacity that
  is still fine, keyed to the exact set of events so a new booking re-flags.
