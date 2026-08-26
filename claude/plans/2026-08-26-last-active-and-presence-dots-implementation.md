# Last Active + Presence Dots Implementation Plan

**Status: NOT SHIPPED — plan written 26 Aug 2026, execution starting the same
session.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins see a day-level "Last active" on every account; DM avatars carry a three-state presence dot (green online / yellow away / grey offline).

**Architecture:** Half 1 is a `profiles.last_seen_at` column stamped by a no-argument SECURITY DEFINER RPC, backfilled from auth's last sign-in, displayed on the admin Accounts screen. Half 2 extends the existing ephemeral presence channel with a `state` field driven by page visibility + a 5-minute idle timer, rendered as a `PresenceDot` on DM avatars. Spec: `claude/plans/2026-08-26-last-active-and-presence-dots.md`.

**Tech Stack:** Supabase (Postgres RPC + Realtime presence), React, Tailwind semantic tokens (`accent` green / `warn` yellow / `line-strong` grey), vitest, `db/tests/` rolled-back harnesses.

## Global Constraints

- Never `git add -A`; never `[skip ci]`. Invented names only (`Zz Probe …` / `zz-…@example.invalid`).
- Migration IDEMPOTENT (`if not exists` / `create or replace`) — the harness inlines and re-runs it.
- Day granularity for `last_seen_at` writes (12h server throttle, once-a-day client throttle). Presence stays EPHEMERAL — nothing stored.
- Never colour alone: every dot carries an accessible label (Online / Away / Offline).
- Branch `claude/last-active-presence`; production applies and the merge need Jay's yes.

---

### Task 1: The last_seen migration and harness

**Files:**
- Create: `db/migrations/20260826_last_seen.sql`
- Create: `db/tests/last-seen.sql`
- Modify: `db/schema/tables.sql` (profiles column), `db/schema/functions.sql` (new RPC), `db/schema/grants.sql` (column grant — docs:check rule 7 fires for this)

**Interfaces:**
- Produces: `public.touch_last_seen()` (no args, void) callable by `authenticated`; `profiles.last_seen_at timestamptz` selectable by `authenticated`.

- [ ] **Step 1: Write the migration**

```sql
-- 26 Aug 2026 — "Last active" for admins (option B of
-- claude/plans/2026-08-26-last-active-and-presence-dots.md).
-- Day-level, self-stamped, throttled server-side. The deliberate,
-- admin-facing exception to chat's no-stored-presence ruling: coarse enough
-- not to be surveillance, enough to answer "is this account alive?".

begin;

alter table public.profiles add column if not exists last_seen_at timestamptz;

-- The column allow-list pattern (see photo_path): selectable, never
-- directly writable — the RPC below is the only write path.
grant select (last_seen_at) on public.profiles to authenticated;

-- No arguments ON PURPOSE: it structurally cannot stamp anyone else's row.
-- The 12-hour floor keeps this one write per person per day-ish whatever
-- the client does.
create or replace function public.touch_last_seen()
returns void
language sql security definer
set search_path to 'public'
as $$
  update profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '12 hours');
$$;

revoke all on function public.touch_last_seen() from public;
revoke all on function public.touch_last_seen() from anon;
grant execute on function public.touch_last_seen() to authenticated;

-- Backfill from the auth event — a true "active at least then" floor
-- (measured 26 Aug: 82 of 86 logins carry one), so the admin screen is
-- useful on day one. Idempotent: only fills NULLs.
update public.profiles p
   set last_seen_at = u.last_sign_in_at
  from auth.users u
 where u.id = p.id
   and p.last_seen_at is null
   and u.last_sign_in_at is not null;

commit;
```

- [ ] **Step 2: Write the harness** — `db/tests/last-seen.sql`, house pattern (synthetic club, `pg_temp.as_user`, `_log`, rollback), migration inlined without begin/commit. Fixture: two users (`zz-seen-one/two@example.invalid`), one with `auth.users.last_sign_in_at` back-dated 3 days. Asserts:

```
1  touch stamps the CALLER's own row to ~now()
2  a second immediate touch does NOT move it — with the CONTROL that after
   back-dating the row 13 hours the same call DOES move it
3  user one touching never moves user two's row (no-argument proof)
4  the inlined backfill fills a NULL row from last_sign_in_at, and does not
   overwrite a fresher non-NULL value
```

- [ ] **Step 3: Run** `npm run db:check -- last-seen` — expected PASS. Then prove assert 2's discriminator: temporarily delete the `and (last_seen_at is null or …)` throttle clause in the INLINED copy, run, expected `ASSERT 2 FAILED`; restore (commit first — rule 6's revert trap).
- [ ] **Step 4: Capture** the column in `db/schema/tables.sql`, the RPC in `db/schema/functions.sql`, the column grant in `db/schema/grants.sql`. Run `npm run docs:check`.
- [ ] **Step 5: Commit**

```bash
git add db/migrations/20260826_last_seen.sql db/tests/last-seen.sql db/schema/tables.sql db/schema/functions.sql db/schema/grants.sql
git commit -m "feat(db): profiles.last_seen_at — self-stamped, throttled, backfilled"
```

---

### Task 2: Apply to production (Jay's yes) and verify

- [ ] Apply via `apply_migration` (name `last_seen`) — **ask Jay if the permission gate blocks**. Verify: column exists; `has_function_privilege('anon','public.touch_last_seen()','execute')` is false; `select count(*) from profiles where last_seen_at is not null` ≈ the 82 backfilled. Re-run the harness against production (rolls back).

---

### Task 3: The client touch

**Files:**
- Create: `src/data/activity.js`
- Modify: `src/components/AppShell.jsx` (one effect)
- Test: `tests/activity.test.js`

**Interfaces:**
- Produces: `touchLastSeenOncePerDay()` — fire-and-forget; exported `TOUCH_KEY = 'last-seen-touched'` (localStorage, value = `YYYY-MM-DD`).

- [ ] **Step 1: Failing test** — `touchLastSeenOncePerDay()` calls `supabase.rpc('touch_last_seen')` when localStorage has no stamp for today; a second call the same day does NOT; an rpc failure neither throws nor writes the stamp (so tomorrow retries). Mock `../src/lib/supabase.js`.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** (guard every localStorage access in try/catch — private mode). Wire ONE `useEffect(() => { touchLastSeenOncePerDay() }, [])` in AppShell where the signed-in shell mounts.
- [ ] **Step 4: Run — PASS**, plus `npm run test:related -- src/components/AppShell.jsx`.
- [ ] **Step 5: Commit** (`src/data/activity.js src/components/AppShell.jsx tests/activity.test.js`).

---

### Task 4: The admin display

**Files:**
- Modify: `src/data/members.js:123` (add `last_seen_at` to the `profiles(...)` select), `src/screens/Accounts.jsx` (`groupByProfile` gains `lastSeenAt`; the list row's second line; a LAST ACTIVE line in the Edit sheet beside the email block)
- Test: `tests/accounts.test.jsx`

- [ ] **Step 1: Failing tests** — a fixture profile with `last_seen_at` renders "Active 24 Aug 2026" on its list row and "Last active 24 Aug 2026" in its Edit sheet; a fixture with null renders "Never signed in" in the sheet (the discriminating pair).
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** — a small `lastActiveLabel(value)` beside `formatJoined` (same date voice; null → 'Never signed in'). **Step 4: Run — PASS.** **Step 5: Commit.**

---

### Task 5: Presence gains a state

**Files:**
- Modify: `src/lib/presence.js`, `src/lib/useDmThread.js` (consume the Map), `src/components/DmThread.jsx` / `src/screens/DirectMessages.jsx` (the subtitle's 'Online' word retires)
- Test: `tests/presence-state.test.js`

**Interfaces:**
- Produces: `usePresence(selfId)` now returns `Map<profileId, 'online'|'away'>`; pure helpers `computePresence(stateObj)` (channel state → Map, any-tab-online wins) and `dotState(map, id)` → `'online'|'away'|'offline'`.

- [ ] **Step 1: Failing tests for the PURE halves** — `computePresence`: one entry online → online; two tabs, one away one online → online; away only → away; `dotState` on a missing id → 'offline'.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** — module tracks `myState` ('online'/'away') from `document.visibilitychange` plus a 5-minute idle timer reset by pointer/key/scroll (listeners passive, module-level, torn down with the channel); re-`track({ profile_id, state })` on change; `handleSync` builds the Map via `computePresence`. Update `useDmThread` (`online` becomes the Map; anything doing `online.has(id)` becomes `dotState(online, id) !== 'offline'` or moves to the dot). Retire the header subtitle's `'Online'` branch — the dot replaces it; "Private · you and X" stays unconditionally.
- [ ] **Step 4: Run — PASS**, plus every `tests/*` file that mocks `usePresence` (update mocks: `() => new Map()`).
- [ ] **Step 5: Commit.**

---

### Task 6: The dot

**Files:**
- Create: `src/components/PresenceDot.jsx`
- Modify: `src/screens/ChatList.jsx` (`RowAvatar` gains `presence`; the screen builds `otherByConversation` from the existing `listMyConversations()` — my_chats does NOT return the other person's id, and extending it is a migration this feature does not need), `src/components/DmThread.jsx`, `src/components/FloatingChatDock.jsx`, the DM header avatar in `src/screens/DirectMessages.jsx`
- Test: `tests/presence-dot.test.jsx` + assertions in `tests/floating-dock.test.jsx`, `tests/group-thread.test.jsx`

**Interfaces:**
- Produces: `<PresenceDot state={'online'|'away'|'offline'} />` — a ringed corner dot: `bg-accent` / `bg-warn` / `bg-line-strong`, `ring-2 ring-surface-card`, with a visually-hidden label Online/Away/Offline. NAMED TOKENS ONLY (tests/theme.test.js refuses raw hex).

- [ ] **Step 1: Failing tests** — PresenceDot renders each state with its label; a DM row avatar shows the dot for the row's other person; a **group row shows NO dot** (the discriminating negative); the DM header avatar carries it.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** (wrap the avatar in `relative`; dot `absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full`). **Step 4: Run — PASS.** **Step 5: Commit.**

---

### Task 7: Suite, docs, hand-off

- [ ] `npm test` — full suite green. `npm run docs:check`.
- [ ] Changelog entry (unSHA'd), plan statuses updated honestly, spec status flipped when shipped.
- [ ] Push branch, PR; **merge and its deploy are Jay's yes**. After deploy: two real devices — background one → yellow within the window; close it → grey; and an admin row shows "Active <today>" once someone opens the app post-deploy.
