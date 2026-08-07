# Handoff — 6 Aug 2026, roster onboarding session

**Read this, then `claude/state-of-play.md`, then `git log`.** Do not answer from
memory about current state.

Everything below is pushed and live unless it says otherwise.

---

## 1. START HERE — the one thing that is broken

⚠️ **An in-app request reached the database as `anon` while the UI believed the user
was signed in.** Jay hit it live: clicking Save on the name prompt after a Google
sign-in produced

```
permission denied for function shares_admin_club
```

**The symptom is fixed. The cause is not.**

What was proved (rolled-back transactions, both directions — do not re-derive this):

| Run as | Result |
|---|---|
| `authenticated` with Jay's uid | update **succeeded** — RLS and the new trigger are innocent |
| `anon`, no JWT | `42501 permission denied for function shares_admin_club` — the exact reported error |

`shares_admin_club` and `can_admin_see_pending` were the **only** two private helpers
on the `profiles` policies missing an `anon` EXECUTE grant. `is_admin`, `can_see_team`,
`can_edit_team` and `is_own_player` have always had one — which is why this error
appeared on exactly one screen and nowhere else. **The inconsistency was the bug, not
the permission.** Granted in migration `grant_anon_execute_on_two_profile_helpers`;
verified as anon afterwards: **0 rows visible, 0 rows updated** — refused cleanly, no
crash, no access gained. Safe because both are `SECURITY DEFINER` bottoming out in
`mine.profile_id = auth.uid()`, so a null uid returns false.

### What is still open, and why it is the top priority

**Why did the request arrive as `anon`?** A raw Postgres error is now a clean refusal,
but the underlying condition remains: the app thought there was a session and there
wasn't.

At rollout across 279 people this presents as **"it says I'm signed in but nothing
saves"** — no error anyone can act on, and no reason for them to suspect their session.

**Prime suspect: the service worker.** `state-of-play` already records that it serves a
cached `index.html`, proved by `fetch('/')` showing `x-frame-options: null` in a real
browser while `curl` showed the header present. A cached shell plus an expired or
missing token produces exactly this shape.

**How to chase it** (Jay's Chrome can be driven, and this is the fastest route):
hook `window.fetch` on the live site, trigger a profile save, and read the actual
`Authorization` header on the outgoing PostgREST request. If it carries the anon
publishable key rather than a user JWT, that is the answer in one step. ⚠️ **Read the
request, not the screenshot** — the app renders many different failures in the same red
box.

---

## 2. What shipped today

Three commits on `build/v1-mvp`, all pushed, `0 0` in sync with origin.

| Commit | What |
|---|---|
| `e1e8275` | Roster auto-onboarding + the hard name gate |
| `d449d3c` | Auth rate-limit error message |
| `57a04e0` | The anon grant above (`[skip ci]`, docs/SQL only) |

**Live deploy `6a747fa901d2a00008656a9d`, state `ready`, published 2026-08-06 12:36:08Z
from `d449d3c`.** The `[skip ci]` on `57a04e0` correctly did not trigger a build. The
deploy changed the bundle (3 new files), so the service worker re-fetches and the
cached-security-headers issue self-heals on this release.

**1045 tests across 44 files, build clean.**

### Seven migrations, all applied to Supabase AND mirrored in `db/migrations/`

`teams_is_senior` · `memberships_unique_grant` · `profiles_first_and_last_name` ·
`profiles_backfill_split_names` · `profiles_name_confirmed_at` · `claim_roster_access` ·
`grant_anon_execute_on_two_profile_helpers`

### The feature, in one paragraph

Parents no longer need an emailed invite. A signed-in person holding **zero**
memberships has their authenticated email matched against `player_contacts.email` by
`public.claim_roster_access()`, and is granted one membership per player found — role
from `teams.is_senior`, so adult squads yield `player` and junior squads `parent`. The
invite form is untouched and stays in service for staff. Full reasoning, rejected
alternatives (passwords, Sign in with Apple) and the fault-injection table live in
`claude/decisions/2026-08-06-roster-auto-onboarding.md`.

---

## 3. Immediate next steps, in order

1. **Jay walks the flow.** Nobody has ever completed an onboarding path in this app
   against a live inbox. To see the name gate on an existing account:
   ```sql
   update public.profiles set name_confirmed_at = null where email = 'jayjmuir@gmail.com';
   ```
   The migration deliberately stamped all four existing profiles as confirmed, so
   without this you sail straight past it. **Sign out fully and back in** rather than
   reloading — that is also what clears the anon state and lets the PWA take the new
   bundle.
2. **Chase the anon root cause** (§1).
3. **Read Resend's real daily quota** — Settings → Usage. Genuinely unknown. ⚠️ **Do
   not trust any "100/day" figure in older docs.** The 2/hour Supabase ceiling was
   accidentally hiding this limit; now that it is 200/hour, Resend is the next wall and
   nobody has looked at it.
4. **Test the no-match path**: sign in with an address that is NOT on the roster and
   read the reassurance copy on the request-access screen.

---

## 4. Rollout preconditions

- ✅ **Email ceiling raised 2 → 200/hour**, verified by reloading the page and reading
  the value back.
- ❌ Resend daily quota unknown (§3.3).
- ❌ The anon bug (§1).
- **Announce BY AGE GROUP, not club-wide.** Not for the rate limit any more — for
  deliverability. `send.adhquins-clubhub.com` is a brand-new sending domain whose first
  real traffic was 6 Aug; a cold domain emitting 140 messages in an evening gets
  throttled or spam-foldered, and the symptom ("nobody got the link") looks nothing
  like the cause. Each squad already has its own WhatsApp group, so it costs nothing.
- **279 distinct roster addresses; 136 (49%) are Gmail and use Google sign-in, sending
  zero emails.** 143 need magic links.
- ⚠️ **U16 has 0 players** — expect "my squad is empty".
- ⚠️ One roster contact is a generic `info@` covering a single U11 player. A shared
  business mailbox; whoever else reads it gains that player's access. Eyeball it.
- Nobody is emailed when an access request arrives — Jay must check the Accounts tab,
  and this queue gets busier under roster onboarding.

---

## 5. ❌ Corrections made to this project's own docs today

Three recorded claims were wrong. All are fixed in the docs; listed here so a new
session does not rediscover them the hard way.

1. **"`signInWithOtp` is the ONLY sign-in call in the codebase."** Wrong. **Google
   OAuth is live and is how Jay actually signs in** — `src/lib/auth.jsx:77`, wired in
   `Login.jsx`, covered in `tests/auth.test.jsx`, and eight of his last ten sessions
   carry `amr: oauth`. This cost a whole detour.
2. **"Supabase Auth defaults to 30 emails/hour with a custom sender."** Wrong twice.
   30 is the documented default for **custom SMTP**; this project uses a **Send Email
   Auth Hook**, which Supabase does not count as custom SMTP. The live value was
   **2 emails/hour**. At 2/hour the 143 magic-link parents would have taken ~71 hours of
   continuous sending — the rollout was impossible, not tight.
3. **"The 5 Aug 429 was SECONDARY — Supabase's own limiter after repeated 500s."**
   Wrong. Not secondary and unrelated to the 500s. The project had been on 2/hour the
   whole time; two sign-in attempts an hour was the ceiling.

---

## 6. Traps learned this session — these will bite again

### Verification

- ⚠️ **`git grep -E "a|b|c"` through the Desktop Commander bridge silently
  under-matches.** It returned three unrelated lines while `signInWithOAuth` sat in
  `src/lib/auth.jsx`; `git grep -F` on the single term found it instantly. This trap
  was already recorded for `start_search` — it applies to `git grep -E` too. **Use `-F`,
  one term per search.**
- ⚠️ **And the worse half: an empty search result was read as PROOF OF ABSENCE.** It
  produced correction #1 above. **Before trusting a negative search, confirm the search
  can find something you know is there.** Same class of error as verifying security
  headers with `curl`.
- ⚠️ **A Postgres self-assignment (`set x = x`) does NOT fire a `distinct from` check.**
  A migration doing exactly this reported **success and changed nothing**. Only reading
  the rows back caught it. Fixed in `20260806_profiles_backfill_split_names.sql`.

### Git

- ⚠️ **`git checkout -- <file>` reverts to the last COMMIT, not to "before my last
  edit".** Used to undo a fault injection, it wiped uncommitted work. **Commit before
  fault-injecting, or revert by hand.**
- ⚠️ **A migration was applied to Supabase with no file in git**
  (`profiles_name_confirmed_at`), caught only at commit time. Exactly the drift this
  project warns about. **Write the file in the same breath as applying the migration.**
- `git push`/`git fetch` in PowerShell **look** like they failed and have not — git
  writes progress to stderr. Confirm with
  `git rev-list --left-right --count origin/<branch>...HEAD` returning `0 0`.

### Tooling

- ⚠️ **The Chrome permission classifier BLOCKS typing into production dashboard config
  fields.** Reading and navigating are fine; `computer:type` into the Supabase
  rate-limit field was denied. **Config changes must be made by Jay by hand** — plan to
  read and verify, not to drive.
- ⚠️ **The remote-devices file bridge can drop mid-session** and come back. An edit that
  was mid-flight is simply lost; re-check the file rather than assuming it landed.
- ⚠️ **Two Chrome browsers are paired, neither auto-selected, names change between
  sessions.** Use `switch_browser` and let Jay pick. The one that connected today named
  itself "Claude Browse - CAFNET Laptop".
- PowerShell here is **v5 — `&&` is not a statement separator**, use `;`. It refuses
  `npx`, so use `cmd /c`. `Set-Content` fails with "file in use" while vitest runs.
- **cafnet** has `NODE_ENV=production` machine-wide → `npm install --include=dev`. The
  blocked `esbuild` postinstall warning is harmless; vitest still runs.

### Design

- ⚠️ **The name gate keys on `name_confirmed_at`, NOT on a blank name.**
  `handle_new_user` seeds `full_name` from Google metadata and `sync_profile_name`
  splits it on insert, so a Google sign-up arrives with `first_name` already populated.
  Gating on "is it empty" would skip half the club — and those are exactly the wrong
  names. Google supplies **"Jason Muir"** for the account this club calls **"Jay Muir"**.
- ⚠️ `given_name`/`family_name` were **null** in that Google metadata; only the combined
  name is present, so two boxes cannot be reliably prefilled from Google.
- ⚠️ **`Sheet` gained `dismissible={false}`**, which removes the X, Escape **and**
  backdrop click together. Two of three would be a gate with a side door, and which door
  someone finds would depend on whether they use a keyboard.
- ⚠️ **A false promise was removed.** "Request sent" used to say *"We'll email you once
  someone has approved it."* **The app sends no such email.** Promising a notification
  that never arrives is worse than promising nothing — it tells someone to stop
  checking. A test now asserts the promise stays retracted.
- ⚠️ **The matcher works on email equality, full stop.** A parent whose roster address
  is `@yahoo.com` who taps "Continue with Google" against their Gmail gets **zero
  squads**. They land in request-access, where the copy now leads with "Nothing has gone
  wrong", names the failing address, and offers the self-fix first.

### Test hygiene

**Four anchors repointed, never deleted**, all for the same reason — a placeholder
became real:

- `'manager'` was an example of an INVALID role until the role shipped → repointed at
  `'chairman'`.
- `'rate limited'` was an arbitrary error fixture in **three** places until
  `friendlyAuthError` started translating anything matching `/rate limit/i` → repointed
  at `'Email address is invalid'`, which passes through untouched.

The old name-prompt tests were inverted rather than removed: "skipping closes it"
became "there is nothing to skip with"; "stays skipped via localStorage" became
"localStorage is not consulted at all". **Deleting them would have left the reversal
unguarded.**

---

## 7. Deliberately not done

- **Microsoft OAuth** — would take another 22% of parents (62 of 279) off email
  entirely, and the tenant plus app registration already exist. Off the critical path
  because that tenant has caused enough pain.
- **Auto-adding newly-rostered siblings.** `claim_roster_access` runs only for accounts
  with zero memberships. Running it every sign-in would pick up a new sibling — useful —
  but would also **silently resurrect access an admin deliberately revoked**. That needs
  a ledger of what was granted automatically.
- **Passwords and Sign in with Apple** — both asked for, both rejected with reasons in
  the decision doc. Apple in particular *fights* this design: Hide My Email hands the app
  a `@privaterelay.appleid.com` address that matches nothing in the roster.

---

## 8. Reference

- Repo `jayjmuir-hub/quins-club-hub` ⚠️ **PUBLIC**. Production deploys from
  `build/v1-mvp`, not `main`. **Never `git add -A`** — stage explicit paths.
- Clone in use: cafnet `C:\Users\Jay\GitHub\quins-club-hub` (current). ⚠️ **jay-pc is now
  three commits behind.** Run `hostname` first, every session.
- Supabase `lusmshimxdcxpnrktlgz`, PostgreSQL 17.6. Netlify project `quins-club-hub`,
  site `cb37d295-23e6-45b0-900c-910f62684293`, team slug `jayjmuir`.
- Live at `https://adhquins-clubhub.com`; `app.adhjrt.com` is still a working alias.
