# Decision — account deletion and privacy policy (6 Aug 2026)

Built to unblock a possible Google Play listing, but both are worth having
regardless: a club storing children's photographs should have a privacy policy
whether or not it ever ships to Play.

**Google Play requires BOTH** an in-app deletion path **and** a public web link
where deletion can be requested without the app. One screen serves both.

---

## What is deleted, and what deliberately stays

Jay's call, 6 Aug 2026.

| | |
|---|---|
| **GOES** | the auth user → cascades to `profiles` → `memberships`, `access_requests`, `calendar_tokens`, plus auth's own sessions and identities |
| **STAYS** | `players`. A child's squad place is a **club** record. One parent leaving must not take a player off a coach's team sheet mid-season. |
| **STAYS** | `player_contacts` and `player_parents` — the club's contact records for a child, entered by the club. |
| **STAYS** | `events`, `invites` — club records. Authorship is nulled, the rows are kept. |

### ⚠️ The consequence Jay accepted, with eyes open

Because the roster email stays, **signing in again re-matches through
`claim_roster_access()` and rebuilds the person's access automatically.** A
deletion that quietly undoes itself.

Jay chose this: the roster contact is the club's record, not the parent's.
**The mitigation is disclosure, not code** — `/delete-account` and `/privacy`
both say it in plain words, and offer `admin@adhquins-clubhub.com` for anyone
who wants their details off the roster too. Undocumented it is a trap;
documented it is just how it works.

## ⚠️ THE FINDING: three foreign keys are `NO ACTION`, and they break deletion

Verified against `pg_constraint`, 6 Aug 2026:

- `events.created_by` → **NO ACTION**
- `invites.created_by` → **NO ACTION**
- `availability.updated_by` → **NO ACTION**

**This is good news and bad news.** Good: deleting an admin does NOT cascade
away the club's fixtures. Bad: without intervention the delete does not
partially succeed — **it RAISES `23503` and removes nothing at all.** Any admin
who has ever added a fixture simply could not delete their account.

`delete_my_account()` nulls all three first. They are set to null, never
deleted — the fixture belongs to the club.

`memberships`, `access_requests` and `calendar_tokens` all CASCADE from
`profiles`, and `profiles` CASCADEs from `auth.users`, so one delete does the
rest.

## The function

`public.delete_my_account()` — `db/migrations/20260806_delete_my_account.sql`,
applied to Supabase and mirrored in git in the same breath.

- **Takes no arguments.** It reads `auth.uid()`, so it cannot be aimed at
  anyone else. There is no id to tamper with.
- **`SECURITY DEFINER`, `search_path = ''`**, everything schema-qualified.
- **Null-uid guard raising `42501`** — the same fail-safe shape as every other
  SECURITY DEFINER function in this project.
- **`revoke ... from public, anon; grant execute to authenticated`.**
- ⚠️ **RAISES on refusal rather than returning zero rows** — the opposite of
  every other writer here (see the `REFUSED_*` constants in `members.js`).
  Deliberate for this one call: "we could not delete your account" must never
  be indistinguishable from "we deleted your account".
- ⚠️ **The last admin cannot leave.** Without that guard one tap makes the club
  permanently unadministerable — nobody can approve access requests or promote
  a replacement, and there is no way back through the app.

### Proved with rolled-back fault injections

| Injection | Result |
|---|---|
| Delete as Jay | profiles 4→3, memberships 5→4, calendar_tokens 1→0, auth user gone. **players 315→315, player_contacts 315→315, player_parents 2→2, events 2→2.** |
| **Set `events.created_by` to Jay first, then delete via the function** | succeeds, both events survive with `created_by` null |
| **Same, but delete `auth.users` WITHOUT nulling first** | `23503 violates foreign key constraint "events_created_by_fkey"` — **the updates are load-bearing, not cargo cult** |
| Call as `anon` | `42501 permission denied for function delete_my_account` |
| Call as the only remaining admin | `P0001 You are the only admin. Make someone else an admin first...` |

⚠️ **A FALSE POSITIVE CAUGHT IN OUR OWN TEST.** The first run reported
`events_orphaned: 2` after the delete and that proved nothing — **both events
already had `created_by` null before the test ran.** Only setting authorship
deliberately, and then also proving the raw delete fails without the fix, made
the assertion mean anything. Rollback was confirmed afterwards by reading the
rows back.

## ⚠️ Structural change: the app had no public route at all

**Everything sat inside `RequireAuth`.** A Play reviewer opens the deletion URL
cold, with no account, and so does a parent who cannot remember which email
they used.

`App.jsx` now has two groups. The signed-in half is wrapped in a **pathless
layout route** (`<Route element={<Authed/>}>`), chosen specifically because it
leaves every existing path string untouched — nesting a second `<Routes>` under
`path="*"` would have made them all relative and rewritten the lot. The
catch-all redirect stays inside the group, so an unknown URL still lands a
signed-out visitor on the login screen exactly as before.

`AuthProvider` lives above `App` in `main.jsx`, so public pages can still see
whether someone is signed in. That is what lets one screen be both halves.

## `/delete-account` — one screen, both requirements

- **Signed out** it renders the real `<Login/>` **in place**, not a link to it.
  `/delete-account` is public so `RequireAuth` never fires here. Rendering
  Login in place also means the magic link comes **back to this page** —
  `emailRedirectTo` is built from `window.location.pathname` (commit
  `174bffd`), so someone who signs in to delete their account lands on the
  delete screen rather than the dashboard.
- **Signed in** it names the account and requires typing `DELETE`.
  Case-insensitive on purpose — a phone keyboard fights all-caps, and the box
  is for deliberateness, not typing accuracy.
- **On success it does NOT redirect.** They are signed out; bouncing someone to
  a login screen after they asked to leave reads as failure.
- More → Account links here rather than duplicating the delete button. One
  implementation of a destructive action, not two that drift.

## `/privacy` — every fact checked against the live system

⚠️ **Not written from a template.** Checked on 6 Aug 2026: the full table and
column list; the hosting region; and that the front end loads **no** analytics
or tracking (fixed-string search for `gtag`, `analytics`, `plausible`,
`posthog`, `sentry`, `fathom` across `src/` and `index.html` — zero hits, run
with a positive control to prove the search worked).

- ⚠️ **THE DATA LIVES IN TOKYO.** Supabase region `ap-northeast-1` — not the
  UAE. Children's names, contact details and photographs included. Stated
  plainly in the policy; Jay should get a view on whether that is acceptable
  to the club.
- Drafted by an assistant, **not a lawyer**. The legal entity name is marked
  CONFIRM.
- **If what the app stores changes, this page changes in the same commit.** A
  policy that has drifted from the database is worse than none.

## Not done

- **Removing the roster contact on deletion** — rejected above, deliberately.
- **A suppression list** so a deleted person lands on request-access instead of
  being auto-granted. This is the honest fix for the re-match behaviour if
  disclosure ever proves not to be enough.
- **`assetlinks.json`** — needed only if the Play route is actually taken;
  without it a TWA shows a browser address bar.
