# Channel seats and a Committee channel (3 Sep 2026)

**Status: SHIPPED 3 Sep 2026** — `db/migrations/20260904_channel_seats_and_committee.sql`, both parts in one PR (see the changelog). Dated 2026-09-03.

## Why

Role-channel membership is derived from roles and never stored
(`claude/plans/2026-08-30-role-channels.md`). The only override is a chat
right on an ADMIN row. So the one way to seat an outsider — the Club Captain,
a senior coach who is not a head coach — is to make them an admin, which
hands them the whole club. Jay, 3 Sep 2026: seats are **super-only**; a
Committee channel is **titles only**.

The derived rule stays the backbone. Seats are additive exceptions with a
reason. There is deliberately **no way to exclude** a derived member —
exclusions are how a channel drifts away from its own name.

## Part A — the Committee channel (pure derived, ships first)

A sixth role channel, `committee`, whose members are every row in
`public.club_officers` for the club. No admin tick, no seat: hold a title and
you are in; lose it and you are out. Supers are NOT in it by virtue of being
super (Jay, 3 Sep) — a super who wants in holds a title or a seat.

| Piece | Change |
|---|---|
| `messages_channel_check` | add `'committee'` |
| `private.in_role_channel` | new arm: `exists (select 1 from club_officers o where o.profile_id = auth.uid() and o.club_id = _club)` |
| `private.role_channel_audience` | new arm from `club_officers`, reason = the title (several titles aggregate as today: "Club Captain · Treasurer") |
| every `channel in ('headcoaches',…)` list | the messages policies (read/create/edit/delete), `can_reply_to`, `channel_members`, the provenance mention filter (`20260830_role_channels.sql`, `20260831_group_chat_mentions.sql`), and the `my_chats` VALUES list — each gains `committee`. Grep the five keys together; a list that misses one is the drift the 30 Aug migration warns about |
| `src/lib/roleChannels.js` | `committee: { label: 'Committee', glyph: '🏛️' }` |
| Harness `db/tests/role-channels-committee.sql` | an officer reads and posts; a non-officer super reads nothing (control: the same super reads `clubstaff`); revoke the title → out the same instant; the member sheet reason is the title |

## Part B — explicit seats (super-only, audited, additive)

### Table

```sql
create table public.channel_seats (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  channel     text not null check (channel in
                ('headcoaches','managers','medics','welfare','clubstaff','committee')),
  reason      text not null check (length(btrim(reason)) between 1 and 120),
  granted_by  uuid not null default auth.uid() references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (club_id, profile_id, channel)
);
```

- RLS: read for any active member of the club (the member sheet must be able
  to say "Seated by the club — <reason>"); insert/delete `private.is_super_admin()`
  only. No update — change the reason by re-seating.
- `on delete cascade` from `profiles`: leave the club, lose the seat.
- ⚠️ `welfare` is seatable only because Jay may want a safeguarding person who
  is not an admin in the channel. A seat in `welfare` grants the CHANNEL only,
  never DM review — `private.can_review_dm` is untouched and still demands the
  explicit `welfare` right on an admin row. State this in the migration header
  and prove it in the harness (a seated non-admin calls `welfare_overview` and
  is refused, with a control).

### Membership

`private.in_role_channel(_channel, _club)` gains one final `or exists (select 1
from channel_seats s where s.profile_id = auth.uid() and s.club_id = _club and
s.channel = _channel)`. `private.role_channel_audience` gains a union arm with
reason `'Seated by the club — ' || s.reason`. Nothing else changes: every
policy and list already routes through those two functions.

### Audit

`membership_audit` is written by a trigger on `memberships` and cannot see
this table. Mirror the pattern, not the table: `channel_seat_audit`
(`at`, `seat_id`, `profile_id`, `channel`, `action in ('seated','unseated')`,
`actor_id`, `reason`), written by a trigger on `channel_seats`, readable by
supers, shown as a second section of `/admin/rights-log`.

### UI

- **Channel members sheet** (`ChannelMembersSheet.jsx`): a super sees a
  "Seat someone" button under the list → picker of adult accounts (reuse the
  officers picker's `listClubMembers` dedupe) + a required reason → insert.
  Seated rows show the reason and, for a super, an "Unseat" control.
  Derived rows show no control — the sheet explains itself, as designed.
- No new admin right, no new portal. Super-only is the gate, matching
  `AdminOfficers`.

### Harness `db/tests/channel-seats.sql`

1. super seats a plain coach in `headcoaches`; the coach reads and posts
2. ⚠️ an ordinary admin's seat insert is refused; a coach's is refused
3. member sheet shows "Seated by the club — <reason>"
4. unseat → out the same instant (control: still in `clubstaff` via their role)
5. a seat in `welfare` does NOT grant DM review (control: an admin with the
   right IS granted)
6. audit rows written for seat and unseat with the actor
7. an invented channel key is refused by the CHECK

## Order and deploy

1. Part A migration + app + harness → PR. Apply on merge (Jay's yes). Safe
   either way round: an unknown channel key is simply absent from `my_chats`.
2. Part B → second PR. Apply on merge (Jay's yes).
3. After both: Jay seats the Club Captain in `headcoaches` if wanted; his
   Committee membership follows the title automatically.

## Out of scope, on purpose

- Exclusions from a derived channel.
- Seats in squad or staff channels (`team_id` channels) — those follow
  membership rows, which already exist for exactly that.
- Push for role-channel posts (still parked from 30 Aug).
- Anything about what an ADMIN can see — that is the `is_admin` matrix
  (`claude/open-items.md`, item 13), a separate ruling.
