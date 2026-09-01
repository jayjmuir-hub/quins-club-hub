# `my_chats()` — an attachment COUNT, so the chat list stops saying "Photo" for ten

**Status: NOT SHIPPED — spec only, 1 Sep 2026.** Nothing in this file has been
built. Update this line the moment it has, and record any deviation from the
spec here rather than leaving the code as the only account of it.

## The visible problem, and how small it is

Albums shipped on 1 Sep (#605 composer, #613 grid). A ten-photo message renders
correctly **inside** a conversation — and the **Chats list** still previews it
as `📷 Photo`, because `public.my_chats()` returns `last_attachment_path`, a
single path, and no count.

⚠️ **BE HONEST ABOUT THE PAYOFF BEFORE STARTING: this is cosmetic.** One line of
preview text on one screen. The failure modes below are not cosmetic. If that
trade stops looking worth it halfway through, stopping is the right call — say
so in this file rather than pressing on.

## This is half of plan 4, and the other half is still blocked

`claude/plans/2026-08-31-chat-photo-albums.md` plan 4 is "the contract":

1. **This file** — `my_chats()` returns a count. Buildable now.
2. **Dropping `attachment_path`** — NOT buildable. A phone on a cached
   service-worker bundle still writes only that column and cannot be forced to
   update; dropping it makes that photo unreadable by everyone, silently and
   per-device.

⚠️ **The blocker is now MEASURABLE, which it was not before.** Taken 1 Sep 2026
over `public.messages`:

| | |
|---|---|
| messages carrying any attachment | 11 |
| carrying the new `attachments` array | 11 |
| carrying **only** the old column | **0** |
| old-only in the last 24h | **0** |

**Eleven is a small sample and proves nobody HAS written the old shape, not that
nobody WILL.** Re-run it after a fortnight of ordinary use before believing the
drop is safe.

## What `my_chats()` actually is

Confirmed against LIVE, 1 Sep 2026:

| Property | Value |
|---|---|
| Signature | `public.my_chats()` |
| `prosecdef` | **true** — SECURITY DEFINER |
| `proconfig` | `search_path=public` |
| `UNION ALL` count | **5**, therefore **6 arms** |
| Returns | `kind, team_id, conversation_id, label, detail, last_at, last_body, last_author_id, last_attachment_path, last_author_name, unread` |
| Grants | `authenticated`, `postgres`, `service_role` — **no PUBLIC, no anon** |
| Comment | *"The Chats list: every channel and DM the caller may read, newest first, with unread counts."* |

**It is not only a round-trip optimisation.** *"every channel and DM the caller
may read"* is the load-bearing clause: it is the access boundary for the whole
Chats screen, and it runs with elevated rights. A mistake here decides who reads
whose messages, not how fast a screen paints.

The six kinds, from the harnesses that assert them: `squad`, `club`, `staff`,
`dm`, `group`, and the role channels (`headcoaches` / `managers` / `clubstaff`).

## ⚠️ THE TRAP THAT HAS ALREADY FOOLED TWO SESSIONS — reproduced on purpose

The function's own comment once claimed **five** arms. It has six. The sixth
names its kind from a **column** (`rc.key`, the role channels), not a literal —
so a search for the obvious pattern finds one arm and misses five.

**Measured 1 Sep 2026 while writing this plan**, and it reproduced exactly:

```
regexp for '<literal>'::text as kind   ->  1 match  ('squad')
count of `union all` lines             ->  5
```

**COUNT `UNION ALL` AND ADD ONE. Never trust a grep for the kind literal, and
never trust the comment.** A change applied to the arms you can find leaves the
list behaving differently depending on which kind of chat you opened — and
nothing in the app tells you which arm produced a row.

## ⚠️ THE FAILURE MODE THAT MATTERS: the ACL

Adding a column changes the return type, which **forces `DROP FUNCTION` +
`CREATE FUNCTION`**. A freshly created function **grants `EXECUTE` to `PUBLIC`
by default.**

This is not hypothetical. **#610 hit exactly this on 1 Sep 2026** on
`calendar_events_for_token`, and the migration had to re-apply the measured
grants and assert `PUBLIC` absent — forgetting it would silently have undone
`calendar_feed_revoke_public_execute`.

Here the function is SECURITY DEFINER over every conversation in the club, so
the migration MUST:

```
revoke execute on function public.my_chats() from public;
grant  execute on function public.my_chats() to authenticated, service_role;
```

...and then **assert** it, in the same migration, by reading
`information_schema.routine_privileges` back and failing if `PUBLIC` or `anon`
appears. A grant that is merely written is not a grant that is verified.

⚠️ Also re-apply `security definer`, `set search_path = public`, and the
`comment on function` — all three are lost by the drop, and
`db/tests/search-path.sql` fails the whole suite on the missing pin.

## The change itself

**Return one more column: `last_attachment_count integer`.**

- Derived the same way `last_attachment_path` already is, from the newest
  VISIBLE message — see `db/migrations/20260828_my_chats_last_attachment.sql`
  for how that row is chosen, including the `cleared_before` handling.
- `jsonb_array_length(attachments)` where the array is present; fall back to
  `1` when only `attachment_path` is set, and `0` when neither is.
- ⚠️ **Applied in ALL SIX ARMS.** See the trap above.

**Client: exactly one call site.** `src/screens/ChatList.jsx:97` —
`attachmentPreviewLabel(row.last_attachment_path)` becomes
`attachmentPreviewLabel(row.last_attachment_path, row.last_attachment_count)`.
The optional second argument already exists and already produces
`📷 10 photos`; it was added in #613 for exactly this.

## Harnesses — FOUR of them touch this function

`db/tests/chat-list.sql`, `db/tests/group-chats.sql`,
`db/tests/my-chats-attachment.sql`, `db/tests/role-channels.sql`.

⚠️ **`db/tests/chat-list.sql` and `group-chats.sql` BOTH carry a REPLAY of the
function and have rotted before** — their own headers say so: *"when
`20260828_my_chats_last_attachment` (then voice, then mentions) changed
my_chats' return row, the replay's ..."*. A replay that is not updated tests a
function that no longer exists while passing.

⚠️ **`db/tests/my-chats-attachment.sql` was once GREEN BY LUCK.** Its three
messages shared one `now()` — which is transaction-constant — and `my_chats`
picks the newest with **no tie-break**, so "a later message supersedes it" was
never actually true. It is staggered now; do not un-stagger it.

⚠️ **Run the FULL `npm run db:check`, not just the files you touched.** A
session turned production red on 1 Sep by testing its own new behaviour
thoroughly and never asking which EXISTING harnesses its change made false.

## Sequence

1. **Announce** before applying — two sessions applied the same migration
   concurrently on 31 Aug.
2. Write the migration. ⚠️ **Take the existing function body from
   `pg_get_functiondef` ON LIVE, never from the migration that created it.**
   Live `private.send_fixture_push` already diverges from its own file because a
   later migration changed it; editing the obvious file silently reverted
   hardening with every test green.
3. Apply to production; assert the grants back, and assert `PUBLIC`/`anon`
   absent with a control (a role that IS expected, so the probe is known to be
   able to see something).
4. Full `npm run db:check`.
5. Frontend PR (one line plus tests). Verify live from the served bundle —
   markers absent before and present after, with a control present in both.

## Definition of done

- A ten-photo message previews as `📷 10 photos` in the Chats list; a single
  photo still previews as `📷 Photo`; a voice note still previews as
  `🎤 Voice message`.
- All six arms return the count — asserted per kind, not just for `squad`.
- `information_schema.routine_privileges` for `my_chats` reads exactly
  `authenticated`, `postgres`, `service_role` afterwards.
- `db/tests/search-path.sql` green, and the full `db:check` green.

⚠️ **NOT in scope:** dropping `attachment_path`. That is the other half of plan
4 and stays blocked on cached service workers.
