# Becoming the first admin

This is a one-time, manual step. It exists because of a genuine chicken-and-egg problem: every
other way of getting an `admin` membership — the invite flow built in Task 18 — requires an
existing admin to send the invite, and on a brand-new club there isn't one yet. Someone has to
be the first, and that has to happen by running SQL directly against the database once, not
through the app.

This is intentionally a step for **you** (Jay) to run yourself, not something this build asks
Claude to script or automate. Granting the first admin is the one action in this whole project
that decides who has full control of the club's data — it deserves your own hands on the exact
statement, run at the moment you choose, rather than a background agent doing it on your behalf.

---

## Prerequisite: sign in once

Before any of this SQL will work, you must have signed into the app at least once (magic link
or Google — whichever Task 4/5 wired up for you), even if all you saw afterward was the
"you're signed in but not linked to a squad yet" screen. That one sign-in is what matters: it
creates your row in Supabase's own `auth.users` table, and an existing database trigger
(`on_auth_user_created` → `handle_new_user()`) automatically creates your matching row in this
app's `public.profiles` table. No app code needs to run for that part — it already happens
automatically, today, for every new sign-in.

If you haven't signed in yet, do that first, then come back here.

---

## Step 1 — run this in the Supabase SQL Editor

Go to the Supabase dashboard → your `quins-club-hub` project (ref `lusmshimxdcxpnrktlgz`) →
**SQL Editor** → New query. Paste and run exactly this:

```sql
-- Step 1: confirm you've actually signed in, and find your own account id.
-- Replace the email below with whichever address you signed in with.
select id, email, created_at
from auth.users
where email = 'jayjmuir@gmail.com';
```

You should see exactly one row. Copy its `id` value (a uuid) — you'll use it in Step 2. If this
returns zero rows, you haven't signed into the app yet with that email; go do that first.

```sql
-- Step 2: grant yourself admin. Paste your id from Step 1 in place of
-- BOTH <YOUR_PROFILE_ID> placeholders below (keep the quotes). The club id
-- is fixed — this app has exactly one club, seeded with this id — so you
-- don't need to look that up.
--
-- The WHERE NOT EXISTS guard makes this safe to run twice: `memberships`
-- has no unique constraint on (profile_id, role, club_id), so a plain
-- INSERT run a second time would silently create a SECOND admin row for
-- you rather than failing or doing nothing. This form checks first and
-- only inserts if you don't already have an admin row for this club.
insert into public.memberships (profile_id, club_id, role, team_id, player_id)
select '<YOUR_PROFILE_ID>', '00000000-0000-0000-0000-0000000000ad', 'admin', null, null
where not exists (
  select 1 from public.memberships
  where profile_id = '<YOUR_PROFILE_ID>'
    and club_id = '00000000-0000-0000-0000-0000000000ad'
    and role = 'admin'
);
```

A few things about this statement, so you know exactly what it's doing:

- `role = 'admin'` — the highest access level this app has. An admin sees every team, every
  player, every member, and can create/edit/delete anything.
- `team_id = null` — deliberate, not a placeholder. Every other role (`coach`/`parent`/`player`)
  is scoped to one team; `admin` is the one role that's club-wide instead, and the app's own
  scoping logic (`src/lib/scope.js`) specifically checks for a null `team_id` to mean "this is
  an admin, they can see all 15 teams," not "this row is incomplete."
- `player_id = null` — there's no player record linked to an admin membership; that field only
  matters for `parent`/`player` roles.
- This does **not** touch `auth.users`, `profiles`, or anything about your login credentials —
  it only adds one row to `memberships`, the table that decides what a signed-in person can see
  and do inside the app itself.

```sql
-- Step 3 (optional, sanity check): confirm the row landed.
select m.role, m.team_id, m.created_at
from public.memberships m
join auth.users au on au.id = m.profile_id
where au.email = 'jayjmuir@gmail.com';
```

You should see one row: `role = admin`, `team_id = null`.

---

## Step 2 — verify it worked, from inside the app (not just SQL)

Running the query above from the Supabase SQL Editor connects as a superuser and bypasses this
app's Row-Level Security entirely — so seeing the right row in the SQL Editor proves the
*data* is correct, but it doesn't prove the *app* actually grants you admin access through its
normal, RLS-gated path. Confirm that part by using the app itself, not more SQL:

1. Open the app in your browser. If you were already signed in and sitting on the "you're
   signed in but not linked to a squad yet" screen, refresh the page (the app doesn't currently
   poll for membership changes in the background — a refresh re-triggers the membership load).
2. You should now land on the real Dashboard, not the "not linked" screen.
3. Check the small role badge near the top of the header (desktop) or under the club name
   (mobile) — it should read **Admin**, not "No access yet."
4. Go to the **More** tab. You should see the real **Admin overview** screen (Task 17), not a
   "not authorised" message, showing:
   - **15** age groups listed (U6 through Women's XV) — this is the actual proof you're seeing
     every team, not just your own; a coach or parent would only ever see one team's worth.
   - A **Club members** section (at this point, likely showing just yourself).
   - An **"Invite a member"** button (Task 18) — this is now your normal path for adding every
     coach, parent, and player from here on; you never need to touch this SQL Editor again for
     that.
5. Go to **Schedule** and **Roster** — both should show content across all 15 age groups, not
   the "no memberships yet" message. ⚠️ **When this was written there was no player data and
   an empty state was the expected result. The roster has since been imported**, so an admin
   should now see real players; an empty Roster is a symptom, not the expected state. One
   squad genuinely is empty — `claude/state-of-play.md` says which.

If any of the above still shows "not authorised" or "not linked to a squad yet" after a refresh,
double-check Step 1's `profile_id` was pasted correctly (a stray missing character or an extra
space is the most common cause) and re-run Step 3's verification query.

---

## After this

This is the only time you'll ever need to hand-write a `memberships` row. From here on, every
other admin/coach/parent/player joins through the in-app invite flow (Task 18): open **More →
Invite a member**, fill in their email/role/team, and send them the generated link. They accept
it on their own first sign-in, and the app creates their `memberships` row for you — the exact
same table, just through the RLS-safe path this build built rather than a direct SQL statement.
