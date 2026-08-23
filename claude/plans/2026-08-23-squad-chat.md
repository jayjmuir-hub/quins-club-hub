# Squad chat — a channel per squad that a WhatsApp group could move into

**Status: NOT SHIPPED. Plan only, 23 Aug 2026.** Nothing below exists in the
code. Jay's brief: "each age group to have chat that could replace their
WhatsApp groups — might not replace them, but at least it would be possible."

## What this is, and what it deliberately is not

A **squad channel**: one continuous stream per squad, plus a club-wide one and
a staff-only one per squad, with push, light threading hung off fixtures, and
an announce-only mode. It lives in the Squad Hub for staff and on the phone's
tab bar for parents. **And direct messages** — one-to-one, within a shared
squad, reviewable by the welfare officer — because a parent asking a manager
"is the bus full?" should not have to ask it in front of 26 families, and
today that question goes to a personal WhatsApp number.

It is **not** a WhatsApp clone. No voice notes, no reactions, no media gallery,
no group DMs (a group is a channel, and channels have an audience rule).

⚠️ **DMs were NOT in the first draft of this plan**, on the reasoning that
"DMs inside a club whose members are mostly children" is the thing safeguarding
guidance refuses. Jay reaffirmed them (23 Aug 2026: "we need DMs"), and the
reasoning was wrong in one fact: **children do not hold accounts.** Every
account is a parent, a member of staff, or a self-registered player — and a
self-registered player has a date of birth in `player_private`. So the line is
not "no DMs"; it is **"a minor can be messaged only by their own guardian, or
by their squad's coach or manager once a guardian has opted in — U16 and
above"** (Jay, 23 Aug 2026), and the database can enforce that exactly. The
rest of the safeguarding posture is visibility: the welfare officer can open
any DM, a guardian can open any DM they consented to, and both parties are
told so in the thread itself, permanently.

**It cannot win on WhatsApp's strengths** — everyone is already there, push
that always arrives, photos, speed. It wins on what WhatsApp structurally
cannot do, and those are the reasons a committee says yes:

1. **Safeguarding.** No parent's phone number is shown to any other parent.
   The welfare officer can see every channel. There is a record.
2. **The audience is always right.** Membership IS squad membership. Nobody
   adds the new family; nobody is still in the U10s group two seasons on; a
   coach leaving does not take the group with them.
3. **Messages about things.** A post attached to a fixture carries the RSVP
   chips — "who's coming Saturday" stops being forty replies nobody tallies.
4. **History for the newcomer.** A November joiner sees the pinned posts and
   the last month, not nothing.
5. **Signal and noise are separate by design.** Coach posts are distinguishable
   from chatter; read receipts exist on the ones that matter.

## What already exists, and is reused rather than rebuilt

Measured in the repo on 23 Aug 2026 — re-check before building:

| Need | Already there | Where |
|---|---|---|
| Audience = squad membership | `private.can_see_team`, `private.can_edit_team` | `db/schema/functions.sql` |
| A squad-scoped post with an author | `public.announcements` (`team_id` null = club) | `db/migrations/20260814_announcements.sql` |
| Read receipts | `public.announcement_reads` | same |
| Push on a new post | AFTER INSERT on announcements → `push-send` (`{ announcement_id }`) | `supabase/functions/push-send/index.ts` |
| Per-category opt-out | `NOTIFICATION_CATEGORIES` | `src/data/notificationPreferences.js` |
| Realtime with a coalescing window | `src/data/announcements.js` §Realtime | same |
| Fixture RSVP chips | the Squad Hub's availability chips | `src/screens/SquadHub.jsx` |
| A coach/manager surface | `/squad` | same |
| Photos with consent | `player-photos` bucket, per-player photo flag | `src/data/photos.js` |

So the channel is **notices + replies + a faster cadence + a fixture link**.
The genuinely new parts are the message table, the channel UI, announce-only,
the staff channel and the welfare view.

## ⛔ Step zero, before any of it: prove push on a real iPhone

`squad_push` is on the tabled list as UNPROVEN (Jay, 20 Aug 2026). This plan
is the reason to reopen it. PWA push only works once the app is on the home
screen, and it is flaky in ways WhatsApp never is. **If push is not reliable,
this is a noticeboard with a chat skin and WhatsApp stays.** The safe proof is
the one already written down in `claude/state-of-play.md`: a fixture change on
U13 Mixed made by somebody OTHER than Jay, watched arriving on his phone.

Do this first, with a real parent's phone as well as Jay's. The result decides
whether phase 2 below is built or whether the whole thing stops at phase 1.

## Phases

| Phase | What | Why in this order |
|---|---|---|
| **0** | Push proven on two real phones, one of them not Jay's | Decides whether anything else is worth building |
| **1** | `messages` table, RLS, the squad channel screen, announce-only mode, pinned. Push through the EXISTING announcement trigger shape. | Useful on day one for a pilot squad; reaches only people who installed |
| **2** | Fixture threads (a message can hang off an event; the event drill-in shows its thread with RSVP chips), @mentions → push, everything else → quiet | The thing WhatsApp cannot do, and the noise control |
| **3** | Staff-only channel per squad, welfare-officer view, report-a-message, **and DMs** | DMs ship in the SAME phase as the welfare view, never before it — a DM nobody can review is the WhatsApp problem with the club's name on it |
| **4** | Photos through the consent model; retention; digest **only after** the notices plan's phase 2 (`email_outbox`) exists | Email waits for the brake — `claude/plans/2026-08-14-notices.md` |

**Pilot between 1 and 2:** one squad whose coach asked for it, announce-only
on. Measure with read receipts: what share of the squad reads a coach post
within an hour? That number, not the feature list, decides the rollout.

## The schema

```sql
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,   -- trigger-stamped
  team_id     uuid references public.teams(id) on delete cascade,            -- NULL = club-wide
  channel     text not null default 'squad'
              check (channel in ('squad', 'staff', 'dm')),                   -- 'staff' needs team_id; 'dm' see below
  event_id    uuid references public.events(id) on delete set null,          -- fixture thread
  parent_id   uuid references public.messages(id) on delete cascade,         -- one level only
  author_id   uuid not null references public.profiles(id) on delete cascade,-- trigger-stamped
  body        text not null check (length(btrim(body)) between 1 and 2000),
  pinned      boolean not null default false,
  edited_at   timestamptz,
  deleted_at  timestamptz,                                                   -- soft; body blanked by trigger
  created_at  timestamptz not null default now()
);
create index on public.messages (team_id, channel, created_at desc);
create index on public.messages (event_id) where event_id is not null;

create table public.channel_settings (
  team_id        uuid primary key references public.teams(id) on delete cascade,
  announce_only  boolean not null default true,   -- ⚠️ default ON. Opt into chatter.
  updated_by     uuid references public.profiles(id),
  updated_at     timestamptz not null default now()
);

create table public.message_reads (               -- same shape as announcement_reads
  message_id uuid references public.messages(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, profile_id)
);
```

**Policies, by reusing the predicates that already gate notices:**

- **read** — `channel = 'squad'`: club-wide needs an active membership in the
  club; squad needs `private.can_see_team(team_id)`. `channel = 'staff'`:
  `private.can_edit_team(team_id)`. Plus a welfare-officer arm (phase 3): a
  new `welfare` right, held like the other rights, reads everything.
- **insert** — `author_id = auth.uid()`, and: staff channel needs
  `can_edit_team`; squad channel needs `can_see_team` AND (the squad's
  `announce_only` is false OR `can_edit_team`). Club-wide needs `is_admin`.
  **A reply (`parent_id` set) is allowed in announce-only mode** — that is the
  whole point of announce-only: coaches start threads, parents answer in them.
- **update** — own row, body and `edited_at` only, within 15 minutes. Pin:
  `can_edit_team`. Soft delete: own row, or `can_edit_team`, or welfare.
- **never** a hard delete from the client. `deleted_at` + a trigger that
  blanks `body` so the record of *that there was a message* survives.

`club_id` and `author_id` are stamped by trigger, never sent — the
announcements pattern, for the same reason.

⚠️ **The `announce_only` default is ON.** A squad that wants chatter turns it
on; a squad that does not never has to moderate anything. The default is the
safeguarding posture.

## Direct messages

A DM is a **conversation** with exactly two participants, both profiles.
Messages reuse `public.messages` with `channel = 'dm'` and a
`conversation_id`; `team_id` is null.

```sql
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid not null references public.clubs(id) on delete cascade,
  -- ⚠️ ORDERED PAIR, SMALLER UUID FIRST, so the unique index finds the existing
  -- conversation whichever side starts it. Enforced by the check.
  profile_a   uuid not null references public.profiles(id) on delete cascade,
  profile_b   uuid not null references public.profiles(id) on delete cascade,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  last_at     timestamptz not null default now(),       -- bumped by trigger on insert
  check (profile_a < profile_b),
  unique (profile_a, profile_b)
);
alter table public.messages
  add column conversation_id uuid references public.conversations(id) on delete cascade,
  add constraint messages_channel_shape check (
    (channel = 'dm')  = (conversation_id is not null)
    and (channel <> 'dm') = (team_id is not null or channel = 'squad')
  );
```

**Who may open a DM with whom — `private.can_dm(other uuid)`, SECURITY
DEFINER, and the only place the rule lives:**

1. Both profiles hold an active membership in the club.
2. They share an audience: **the same squad — as parent, player or staff** —
   or one is staff of a squad the other is a parent or player in, or one is an
   admin. Parents in the same squad may DM each other (Jay, 23 Aug 2026: the
   first draft refused this, and a squad's families arranging lifts between
   themselves is exactly club business). A parent still cannot DM a parent in
   a squad they share nothing with.
3. **A minor is reachable only with a guardian's opt-in, and only by staff.**
   A profile is "a minor" when it is linked to a player row (the
   self-registration link from `register_my_player`) whose
   `player_private.date_of_birth` makes them under 18 today, **or whose date
   of birth is unknown** — unknown is treated as a minor, not as an adult.
   Then:
   - **Minor ↔ minor, minor ↔ parent-who-is-not-their-guardian: never.**
   - **Minor ↔ their own guardian: always** (a linked parent).
   - **Minor ↔ coach or manager of their squad: only if** the player is
     **U16 or above** (age-group of the squad, not birthday arithmetic — a
     playing-up U15 in the U16s is still U15) **and**
     `player_private.staff_dm_opt_in` is true. **The opt-in is set by a linked
     guardian or an admin, never by the player**, lives on the player's card
     next to the photo consent, records who set it and when, and is off by
     default. Medics are not included; if that is wrong it is a list change.
   - At 18 the opt-in stops mattering: an adult player is an adult.
   The rule re-evaluates on every insert, so a DM that was allowed stops
   accepting messages the day the opt-in is withdrawn.
4. Neither has blocked the other (`public.dm_blocks`, own-row only, never shown
   to the blocked party).

⚠️ **The welfare notice in a thread with a minor is louder, not quieter.** Same
sentence, plus: *"A guardian has allowed this. They and the welfare officer can
review it."* — and the guardian CAN open it, read-only, from the player's card.
A conversation a parent has consented to is one a parent can see.

**Policies:**

- **read** — a participant, the welfare right, or — for a thread with a minor
  — that minor's linked guardian. ⚠️ **Not admins.** Being a
  club admin is an administrative role, not a safeguarding one; the welfare
  officer holds `welfare`, and an admin who is also the welfare officer holds
  both. This keeps "who can read my private messages" to a list of one role.
- **insert** — `author_id = auth.uid()`, a participant, and `can_dm(other)`
  still true.
- **update / delete** — as channels: own row, 15 minutes, soft delete only.

**The thread itself says who can see it.** The first item in every DM thread,
pinned and not dismissable, reads: *"Private between you and Priya. The club's
welfare officer can review this conversation."* Both parties see it, always.
This is not small print; it is the thing that makes a club DM different from
a WhatsApp DM, and the reason a parent should prefer it.

**Push** — a DM always pushes (category `direct_messages`, default on; a
person can turn it off). The payload carries the sender's name and the first
line, never a child's name — the message body is the sender's responsibility,
the payload is ours.

**Welfare view** lists DM conversations by last activity with the pair's
names, opens any one read-only, and can remove a message. **Every open of a
DM by the welfare officer is logged** (`welfare_access_log`: who, which
conversation, when) and the log is readable by admins — the reviewer is
reviewed.

**Not built:** group DMs, DM to somebody you share nothing with, DM between
minors (ever, under this plan), DM history
export, "seen" ticks (read receipts are a channel feature for coaches; in a
DM they are pressure).

## Push — and why it is the existing trigger shape, not a new one

`push-send` already takes `{ announcement_id }` and resolves the squad's
audience. Phase 1 adds `{ message_id }` as a **sixth trigger** (and changes the
"FIVE" in that file's header — it says so itself), reusing the audience
resolution. The new category in `NOTIFICATION_CATEGORIES` is `squad_chat`
with three levels, not a boolean:

| Level | Pushes for |
|---|---|
| `all` | every message in my squads |
| `staff_and_mentions` | **default** — coach/manager posts, and any message that @mentions me |
| `off` | nothing; the badge still counts |

⚠️ **Default is NOT `all`.** An app that buzzes sixty times on a Friday night
is uninstalled on Saturday. A parent who wants everything opts in.

Realtime: subscribe to ONE squad channel at a time, filtered by `team_id`,
and **apply the inserted row** rather than refetching. The full-refetch-per-
subscriber pattern is on record as the least-tested thing in the app at 1,500
members; a chat is the feature that would find out.

## The UI

Four screens, all in the mockups that accompanied this plan on 23 Aug 2026
(inline in the session; the plan describes them so the session is not needed):

1. **The channel** (phone, parent). Masthead shows the squad and a mute/bell.
   Pinned post at the top, collapsible. Messages as a stream, newest at the
   bottom; **coach and manager posts carry a role pill and a brand-red left
   rule** — this is the signal/noise separation, done visually. A fixture
   thread is a card in the stream with the fixture's name, date and the RSVP
   chips, and a "N replies" link into it. The composer is a single line at
   the bottom; in announce-only mode it reads *"Only staff can post here —
   reply to a thread instead"* and is disabled.
2. **A fixture thread** (phone). The fixture card at the top with the chips
   live; replies below; composer enabled for everyone.
3. **Squad Hub → Chat** (desktop, coach). The channel in the Squad Hub's
   content area with the sidebar's Squad section gaining a "Chat" item. A
   right rail shows the channel settings — announce-only toggle, the staff
   channel switch, pinned post — and **read receipts per post** ("read by 18
   of 27"), which is the one thing WhatsApp cannot tell a coach.
4. **Welfare view** (desktop, phase 3). Every channel AND every DM
   conversation in one list, newest activity first, with a reported-messages
   queue. Read-only except for remove; every DM opened is logged.
5. **Messages** (phone). The DM inbox — a list of conversations with the
   other person's name, their role pill and squad, last line, time. A "New
   message" button opens a picker that shows ONLY the people `can_dm` allows:
   for a parent, their squads' staff and the other families in those squads;
   for staff, their squads' families, the other staff, and any U16+ player
   whose guardian has opted in. No search across the club.
6. **A DM thread** (phone). The permanent notice at the top, then the
   conversation. Composer always on. No read ticks.

The phone's Chat tab splits into two segments at the top — **Squads** and
**Messages** — with an unread count on each.

Design: the 2.0 shell. Barlow body, Barlow Condensed pills, Anton for nothing
here (it is a stream, not a poster). Brand red for staff rule and pills;
accent-mid green for "going" chips; `surface-card` bubbles on `surface`. No
avatars from photos — initials only, so no child's face is ever in a chat.

## Entry points — the phone first, then delete nothing

The phone's tab bar gets **Chat** (the handoff lesson: the phone's only entry
point is the thing you cannot delete). The Home screen's notices card gains
"in Chat". Desktop: Squad Hub sidebar item for staff; More → Chat for parents.
The notices board stays exactly where it is through phase 1; **whether notices
fold into the club-wide channel is a phase 4 question**, not a phase 1 one.

## What is measured, and what is not

Measured, via `message_reads` and `messages`, never quoted in a doc:

```sql
-- the pilot question: how fast does a coach post get read?
select m.id, count(r.*) filter (where r.read_at < m.created_at + interval '1 hour') as read_in_hour,
       (select count(*) from memberships x where x.team_id = m.team_id and x.status = 'active') as squad
  from messages m left join message_reads r on r.message_id = m.id
 where m.team_id = :team and m.parent_id is null
 group by m.id order by m.created_at desc limit 20;
```

Not measured: "did WhatsApp die". That is a thing Jay hears from a coach, not a
number.

## The rulings this plan takes as settled

- Children's data may leave the club, minimised
  (`claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md`) — push
  payloads here carry the squad name and the first line of the message,
  never a child's name.
- No email before the outbox (`claude/plans/2026-08-14-notices.md`).
- Who may post to a squad is `can_edit_team`, not an admin right
  (`db/migrations/20260814_announcements.sql` §WHO MAY POST).

## Risks, named

- **Push on iPhones** — step zero exists because of this.
- **Two channels is worse than one.** If WhatsApp survives alongside, the app
  is the one nobody reads. Mitigation: the app is already the only source of
  RSVP, match sheets and pitch changes; chat rides on that habit, it does not
  create one.
- **Moderation is a job.** Announce-only by default limits the blast radius;
  phase 3 gives the welfare officer the tools. Somebody still has to own it.
- **DMs are where the real risk is, and the plan's answer is three rules
  the database enforces** (minors only via a guardian's opt-in, shared
  audience, welfare can read)
  **plus one sentence every DM shows.** If the club cannot name a welfare
  officer who will actually hold the `welfare` right, phase 3 does not ship
  and DMs do not exist — that is the dependency, stated.
- **Realtime at scale** — one channel subscribed at a time, row-apply not
  refetch, and a load harness before the pilot widens.

## Estimate

Phase 0: an evening, mostly waiting for a phone. Phase 1: a week. Phase 2:
three to four days. Phase 3: a week with DMs (the picker, the `can_dm` rule and its harness, the access log). Phase 4: not estimated until the
outbox exists.
