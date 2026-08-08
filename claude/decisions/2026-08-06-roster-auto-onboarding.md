# Decision: onboard parents by roster match, not by invite

Agreed with Jay 6 Aug 2026. **BUILT AND VERIFIED. NOT PUSHED.** Commits `e1e8275`
and `d449d3c` sit on local `build/v1-mvp` on **cafnet** only. Migrations ARE applied to
Supabase.

## The ask

> "how can we automate the invite, authenticate, accept and assign users?"

## Three of the four steps were already automated

| Step | State on 6 Aug |
|---|---|
| **Invite** | ❌ **Fully manual.** `createInvite` writes rows and returns a token; `InviteForm` tells the admin to copy the link and send it themselves. The source comment says it outright: *"there is no email-sending infrastructure in this build"* |
| **Authenticate** | ✅ Magic link (Resend) **and Google OAuth** — see the correction below |
| **Accept** | ✅ `/accept-invite/:token` → `accept_invite` RPC. Validates token, already-used, and that the signed-in email matches the invited email |
| **Assign** | ✅ `invite_targets` → one membership per (squad, child). The sibling case was already modelled |

**So there was one gap, not four.** Everything downstream of the send was built and
tested; it had just never been run by a human.

## The decision: route C

**Parents self-onboard by roster match. The existing invite form is retained for
staff.** Nobody is emailed an invite. The club announces the URL through the age-group
WhatsApp groups; a parent signs in with an address already on the roster and is granted
their children's squads automatically.

### Why not bulk invite + automated send

It requires a new `send-invite` edge function, throttling, and it makes the club own 279
deliverability outcomes. ⚠️ **And a bulk invite that fails at send time fails
SILENTLY** — the parent never knows an email existed, so they cannot retry, and nobody
finds out for weeks. A self-serve sign-in that hits a rate limit shows the person an
error and they retry themselves.

### Why not passwords (asked, rejected)

Passwords fork two ways and both are worse:

- **Email confirmation ON** — signup sends one confirmation email, i.e. *exactly the
  same volume as one magic link*. No saving, plus password resets forever after.
- **Email confirmation OFF** — zero emails, but it destroys the security model.
  The roster match grants a family's access on the strength of "this person proved they
  can read mail at that address". Remove the proof and anyone who knows a parent's
  email — not a secret; it is in team WhatsApp groups — gets that family's access.
  **That is a safeguarding problem, not a technical nicety.**

⚠️ Also: **leaked-password protection is a Pro-plan feature and this org is free.**
`state-of-play` closed that item as "not applicable, there are no passwords".
Adding passwords reopens it with nothing to mitigate it.

### Why not Sign in with Apple (asked, rejected)

- **$99/year** Apple Developer Program, required for web use too (Services ID + key).
- **Not required.** App Store guideline 4.8 governs App Store *apps*; a PWA is never
  reviewed. Apple relaxed 4.8 in January 2024 anyway. It would only bind if the app were
  ever wrapped for the App Store, which is out of scope for v1.
- ⚠️ **It actively fights this design.** *Hide My Email* hands the app a
  `@privaterelay.appleid.com` relay address, which matches nothing in
  `player_contacts`, so the parent silently drops into the request-access queue.
  Paying $99/year for a button that defeats the automation.
- **It wins no coverage.** Apple IDs are frequently Gmail addresses, and those people
  can already use the Google button. No iPhone parent is locked out today.

## ❌ Correction: Google sign-in is LIVE, and `state-of-play` said otherwise

`state-of-play` claimed *"`signInWithOtp` is the ONLY sign-in call in the codebase."*
**That is wrong.** Verified both ways:

- `src/lib/auth.jsx:77` — `signInWithGoogle()` → `supabase.auth.signInWithOAuth({ provider: 'google' })`
- `src/screens/Login.jsx` — wired to a button on the login screen
- `tests/auth.test.jsx` — covered, including `redirectTo`
- Live: session created `2026-08-06 10:55:41Z` with **`amr: oauth`**. Eight of Jay's
  last ten sessions are `oauth`, not `otp`.

⚠️ **How the check FAILED, which is the durable part.** A `git grep -i -E` with an
**alternation regex** returned only three unrelated calendar lines while
`signInWithOAuth` sat in `src/lib/auth.jsx`. A fixed-string `git grep -F` found it
instantly. `state-of-play` already records this trap for Desktop Commander's
`start_search`; **it is `git grep -E` through the bridge too.**

**The worse error was reading the empty result as proof.** That is the same class of
mistake as verifying security headers with `curl` — a check that proves nothing while
looking like proof. **Never accept a negative search result without first confirming
the search can find something known to be present.**

## The data — read from production, not assumed

| Fact | Value |
|---|---|
| Players | 315, **every one has a contact email** |
| Distinct emails | **279** |
| Emails covering 2+ players (siblings) | 34 |
| Max players on one email | 3 |
| Senior squads (Men 1st/2nd, Women's) | 36 players |
| U16 | **0 players** — expect "my squad is empty" |
| ⚠️ Generic addresses | **one `info@`**, covering a single U11 player. A business mailbox; whoever else reads it would gain that player's access |

### Provider split of the 279 — this is what sizes the email problem

| Provider | Parents | Share |
|---|---|---|
| **Google** | 136 | **49% — zero emails, works today** |
| Microsoft | 62 | 22% |
| Yahoo | 30 | 11% |
| Apple | 11 | 4% |
| Other | 40 | 14% |

**Half the club can already sign in without an email being sent.** Microsoft OAuth would
take another 22% off, and the tenant + app registration already exist — but that tenant
has caused enough pain that it is deliberately off the critical path.

## ✅ RESOLVED — the email ceiling is 200/hour. This section is history.

⚠️ **Read this before the section below.** The ceiling was raised to **200/hour** at some
point after 6 Aug; measured on the dashboard on **8 Aug 2026**. The "NOT YET DONE — needs
a human" line further down was true when written and stopped being true without anyone
updating it.

**It cost real time.** On 8 Aug a session read this heading, repeated "2/hour is the
rollout blocker" to Jay four minutes into the conversation, and kept asserting it for
another hour — including inside a new decision document that told him to go and change a
setting that was already changed. **Every wrong claim on this project has been a rotted
MEASUREMENT, never a wrong ruling.** Re-read the dashboard; the reasoning below is still
sound, the number is not.

## ⛔ THE EMAIL CEILING IS 2/HOUR, AND THE ROLLOUT IS BLOCKED ON IT — ❌ SUPERSEDED, see above

**Read off the dashboard, not from docs, 6 Aug 2026:**
Authentication → Rate Limits → *"Rate limit for sending emails"* = **2 emails/h**.

### ❌ Correction: this doc previously said 30/hour. Wrong, twice over.

The 30/hour figure is what Supabase's docs quote for **custom SMTP**. This project does
not use custom SMTP — it uses a **Send Email Auth Hook** pointing at Resend, and
**Supabase does not count an auth hook as custom SMTP for rate-limiting**. So the
project is still sitting on the built-in provider's default of 2/hour.

⚠️ **This also re-explains history.** `state-of-play` attributes the 5 Aug
*"email rate limit exceeded"* to *"Supabase's own auth email limiter after repeated
500s"* — a secondary effect. **It was not secondary.** The project has been on 2/hour
the whole time. Two sign-in attempts in an hour is the ceiling. That is a standing
condition, not a artefact of that debugging session.

### What it means

143 parents need a magic link (the other 136 are Gmail and use Google). At 2/hour that
is **~71 hours of uninterrupted sending**. The rollout is not tight — it is impossible
as configured.

### The fix (NOT YET DONE — needs a human)

**Supabase → Authentication → Rate Limits → "Rate limit for sending emails" → 200 →
Save changes.** The field is editable (unlike the greyed-out SMS row); no SMTP
configuration is required to raise it.

200 is above any plausible burst including a club-wide announcement, and low enough that
a runaway retry loop cannot drain the Resend daily quota overnight.

⚠️ **Verify by reloading the page and reading the value back.** This project has been
bitten by a dashboard that looked saved and was not (see the Netlify DNS notes in
`state-of-play`).

### Still unverified

**Resend's free-tier daily quota.** Resend no longer publishes the number; it returns
`429 daily_quota_exceeded` and says to read the account Usage page. ⚠️ **Do not trust
the "100/day" recorded in `state-of-play`.** Raising Supabase to 200/hour is pointless
if Resend cuts off at 100/day — and the 2/hour ceiling has been accidentally hiding
that limit from view. Monthly is not a concern: ~400 sends against 3,000.

### Stagger anyway — but for deliverability, not for the limit

Once the ceiling is raised, staggering is no longer about rate limits.
`send.adhquins-clubhub.com` is a **brand-new sending domain** whose first real traffic
was 6 Aug. A cold domain emitting 140 messages in an evening gets throttled or
spam-foldered, and the symptom ("nobody got the link") looks nothing like the cause.
Two or three age groups a day warms it naturally; each squad already has its own
WhatsApp group, so it costs nothing.

## What was built

All six migrations are **applied to Supabase and mirrored in `db/migrations/`**.

### 1. `public.claim_roster_access()`

`SECURITY DEFINER`, no arguments, explicit `auth.uid() is null` guard raising `42501`.
Reads the caller's email from `auth.users` — never a parameter, or anyone could claim
any family's access by typing their address. Matches case-insensitively against
`player_contacts.email`, inserts one membership per matched player, returns
`SETOF memberships`.

**Runs only when the profile has ZERO memberships.** ⚠️ Running it on every sign-in
would auto-add newly-rostered siblings — genuinely useful — but would also
**resurrect access an admin deliberately revoked**, with no trace. Auto-adding siblings
needs a ledger of what was auto-granted; separate work.

### 2. `teams.is_senior boolean not null default false`

Senior squads yield `'player'`, everyone else `'parent'`. ⚠️ **Never derived from
`teams.name`** — a rename would silently hand an adult a parent role. Set on exactly 3
squads (36 players); U18 Colts is deliberately false.

### 3. `memberships_unique_grant`

`unique nulls not distinct (profile_id, club_id, role, team_id, player_id)`.
`NULLS NOT DISTINCT` is the load-bearing part: it is what catches a duplicate **admin**
row (both nulls), which is the duplicate that has actually occurred here. Zero existing
duplicates before applying.

### 4. `profiles.first_name` / `last_name` / `name_confirmed_at`

Two boxes, with `private.sync_profile_name()` keeping `full_name` in step **both ways**,
so `Admin`, `Accounts` and `PlayerDetail` work untouched. ⚠️ `full_name` is NOT a
generated column — `updateProfileName` writes to it and would break on first save.

⚠️ **The gate keys on `name_confirmed_at`, NOT on a blank name.** `handle_new_user`
seeds `full_name` from Google metadata and `sync_profile_name` splits it on insert, so a
Google sign-up arrives with `first_name` already populated. Gating on "is it empty"
would skip every Google user — half the club, and exactly the people whose names are
wrong. Google supplies **"Jason Muir"** for the account this club calls **"Jay Muir"**.

⚠️ `given_name`/`family_name` were **null** in that Google metadata; only the combined
name is present, so two boxes cannot be reliably prefilled from Google.

### 5. Hard gate, not a prompt

`NamePrompt` was skippable with a localStorage suppressor. Now: no skip, and `Sheet`
gained `dismissible={false}` which removes the **X, Escape and backdrop click
together** — two of three would be a gate with a side door, and which door someone finds
would depend on whether they use a keyboard. localStorage is gone: per-device state
cannot gate a person who has two devices.

### 6. The no-match screen reassures, and stops lying

⚠️ **The matcher works on email equality, full stop.** A parent whose roster address is
`@yahoo.com` who taps "Continue with Google" against their Gmail gets **zero squads**.
Not hypothetical, not Apple-specific. They land in the existing request-access queue,
and the copy now leads with *"Nothing has gone wrong"*, names the address that failed,
and offers the self-fix (sign in with the other address) before the admin fallback.

⚠️ **A false promise was removed.** "Request sent" said *"We'll email you once someone
has approved it."* **The app sends no such email** — nobody is notified on approval in
either direction. Promising a notification that never arrives is worse than promising
nothing: it tells someone to stop checking.

### 7. `friendlyAuthError` in `Login.jsx` (commit `d449d3c`)

Login rendered GoTrue's bare `"email rate limit exceeded"` verbatim. On 2/hour that is
reachable on the third sign-in of any hour. Now translated to name the remedy (wait) and
the escape hatch (Google, which sends no email). Narrow allow-list — every other auth
error keeps its real text.

## Verification

**Live, in a transaction that raises at the end so nothing persists.** Temporary
`auth.users` rows against REAL roster addresses:

```
anon (no JWT)                 -> refused, 42501
junior roster address         -> 1 membership, role = parent
immediate second call         -> 0 rows (idempotent)
sibling address (2 players)   -> 2 memberships across 2 squads
senior roster address         -> 1 membership, role = player
address not on the roster     -> 0 rows
caller who already has access -> 0 rows (no resurrection)
memberships before=5 after=9  -> rolled back, still 5
```

### Fault injection — every assertion earns its place

| Injected fault | Healthy | Faulty |
|---|---|---|
| Email match broken | 1 row | 0 rows |
| `is_senior` ignored | `player` | `parent` |
| Zero-membership guard removed (SQL) | 0 rows | 1 row granted to an existing member |
| Unique index absent — duplicate **admin** row | refused | allowed |
| Zero-membership gate removed (JS) | RPC not called | called — **plus 9 pre-existing view-as tests broke**, which shows the guard protects the common path |
| Teams not re-read after a claim | squads render | squads missing |
| Claim error not swallowed | RequestAccess | red error screen |
| Gate keyed on blank name | opens | skips every Google user |
| `dismissible` restored | no way out | X and Escape return |
| Ref guard removed | 1 RPC call | one per render |
| Rate-limit translation removed | friendly copy | raw GoTrue string |

**1045 tests across 44 files, build clean.**

## Three mistakes made while building this — all caught, all worth keeping

1. **A migration that reported success and did nothing.** The backfill ran
   `update profiles set full_name = full_name`; the trigger guards on
   `new.full_name is distinct from old.full_name`, and **a value is never distinct from
   itself**. Only reading the rows back caught it. Fixed in
   `20260806_profiles_backfill_split_names.sql`.
2. **A migration applied to Supabase with no file in git** — `profiles_name_confirmed_at`,
   caught at commit time. Exactly the drift `state-of-play` warns about.
3. **`git checkout --` wiped uncommitted work.** Used to revert a fault injection, it
   reverts to the last COMMIT — and that file's real changes had never been committed.
   ⚠️ **Commit before fault-injecting, or revert by hand.**

## Open, carried forward

- ⛔ **Raise the 2/hour email ceiling to 200.** Nothing else can happen first.
- ⛔ **Read Resend's real daily quota** off Settings → Usage.
- **Push `e1e8275` + `d449d3c`** — still local to cafnet only.
- **Walk the whole flow as a human** against a live inbox. To see the name gate on an
  existing account: `update public.profiles set name_confirmed_at = null where email = '…'`
  (the migration deliberately stamped all four existing profiles as confirmed).
- Microsoft OAuth (+22%) — deliberately off the critical path.
- Auto-adding newly-rostered siblings needs a grant ledger.
- The `info@` roster address should be eyeballed before launch.
- The request-access queue gets busier under this design, and **nobody is emailed when a
  request arrives** — Jay has to check the Accounts tab.
- Whether Supabase Auth's password signup endpoint can be disabled is still unresolved,
  and now matters more since passwords were explicitly rejected here.
