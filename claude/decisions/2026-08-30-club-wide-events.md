# Decision: club-wide events (team_id NULL)

Agreed with Jay, 30 Aug 2026. **Built and tested; the migration is the live step.**

## The ask

> "A social event for Adult Tag — open to all staff and parents, and to players
> U14 and above, every Wed 6–7pm, on the calendar for every age group, all
> season. But the system won't let me add a repeating event in multiple age
> groups at once."

## The four decisions

| Question | Decision | Why |
|---|---|---|
| Model a whole-club event as a fan-out, or a new scope? | **New scope: `team_id NULL`** | A season × 15 squads is ~450 rows and one edit per squad per week; a whole-club social is ONE event |
| Who can create one? | **Admins only** | It writes to every member's calendar — a high-reach action |
| Who sees it? | **Every active member, all ages** | "Show up for every age group." "U14 and above" is who's invited, said in the title/notes — not a visibility filter |
| RSVP? | **None for now (informational)** | RSVP is per-PLAYER; a club social's attendees are staff, parents and U14+ players *as themselves*. Person-based RSVP is a different, later feature |

## Why NULL and not the fan-out

The 5 Aug fan-out (`2026-08-05-multi-squad-events-and-pitch.md`) refused
multi-squad **and** repeating "outright — row multipliers that multiply each
other." That guard is UNCHANGED and still right: a fan-out repeating is still
hundreds of rows. A club-wide event **sidesteps it** rather than reverses it —
it is a SINGLE event (team_id NULL), so it repeats as an ordinary series (~30
rows, one `series_id`), no multiplication. That is why this is a new scope, not a
lifting of the guard.

`team_id` was `NOT NULL`; it becomes nullable, and NULL is the distinct
"whole club" value. No junction table (the read-path + RLS rewrite the 5 Aug
decision priced out) — one nullable column plus two additive policy clauses.

## What changed

- **Migration** `db/migrations/20260830_club_wide_events.sql` (LIVE): `team_id`
  nullable; `private.is_member(_club)` (mirrors `is_admin` without the role);
  `event read` widened to `… OR (team_id IS NULL AND is_member(club_id))`;
  `event edit` widened to `… OR (team_id IS NULL AND is_admin(club_id))`; and
  `calendar_events_for_token` LEFT JOINs teams + admits the club-wide case, so
  the feed emits them too (no edge-function redeploy — the `.ts` is unchanged,
  and its `'Quins'` team-name fallback covers a null).
- **Read path** `listEvents` pulls `team_id IN (…) OR team_id IS NULL` — the
  member's squads plus club-wide — and an empty squad list still fetches
  club-wide ones.
- **EventForm**: an admin-only "Whole club (everyone)" option in the Age group
  `<select>`, offered only on a SOCIAL (a whole-club match/training makes no
  sense, and gating to social keeps it clear of the league/score/minis logic
  that keys on the chosen squad). The `'__club__'` sentinel maps to `team_id
  null`; fan-out extras are hidden; repeat is allowed.
- **Display**: "Whole club" wherever the squad name shows (EventDetail age-group
  row, Schedule/Dashboard/ScheduleTable/DaySheet fixture rows). EventDetail
  hides the player RSVP section for a squad-less event.

## Not done, on purpose

- **Person-based RSVP.** Informational only. A club-wide social has no roster; a
  parent RSVPing would show their child, which is wrong for an adults-and-U14+
  social. Head-counts would need per-account (profile) RSVP — its own feature.
- **Club-wide match/training.** Only social. The other types are squad concerns.
- **Edge-function redeploy.** Unnecessary — the RPC it calls is what changed.

## Ordering

The migration is applied to production BEFORE this code deploys: the code writes
`team_id null` (which the old NOT NULL rejects) and reads club-wide events (which
the old RLS hides). Same order as the pitch-`third` migration.
