# 2026-08-28 — Supabase latency incident + resilience follow-up

History, not instruction. A record of where things stood at handoff.

## TL;DR for the next session

The website "not loading" is a **Supabase platform incident**, not this app,
not the network, not our permissions. Supabase have identified it and are
rolling back their change. **Do not restart the project, do not migrate
providers, do not chase the network-route or grants theories** — all four were
considered and are wrong/settled below. Two things are open and Jay said yes to
both: **(a)** write a resilience spec so the app rides through provider blips,
**(b)** watch the incident and ping him when it clears. (b) was interrupted
before it was set up.

## The live incident (as of ~10:40 UTC, 28 Aug 2026)

- Supabase status page shows an **active, unresolved** incident:
  **"Increased response times for requests"** — impact **major**, started
  **2026-08-27 17:20 UTC**. Latest update (28 Aug 01:38 UTC): *"identified the
  change which resulted in additional latency and error rates for some data API
  Requests… preparing to roll this change back. This rollout will take some
  time."* Also mentions **525 errors**. https://status.supabase.com
- **Symptom measured on our project:** intermittent hangs. ~1 in 10 of the
  signup RPC calls time out (>20–25 s); the rest are fast (~0.25 s). Earlier in
  the day it was ~1 in 5. It flaps.
- **Proof it is server-side, not the network path to Tokyo** (the theory the
  first session landed on this morning — it is WRONG): the Supabase **edge logs
  record the origin's own response time**, and during the hangs those read
  **143,000–315,000 ms** (2–5 minutes) for `/rest/v1/players`,
  `/rest/v1/announcements` and `/auth/v1/token`. The request reached Supabase
  fine; Supabase's own backend took minutes. `/auth/v1/token` (GoTrue) and
  `/rest/v1/*` (PostgREST) are **different services** both stalling → a shared
  compute/gateway bottleneck, i.e. their platform.
- **Everything of ours is healthy:** `pg_stat_activity` idle (no active queries,
  no locks, no stuck transactions); `pgbouncer_logs` normal (no pool
  saturation); `postgres_logs` show no connection/memory/checkpoint errors.
  `postgrest_logs` went **silent after 10:17 UTC** while edge requests kept
  arriving — consistent with PostgREST/compute wedging, but the cause is
  upstream of anything we control.
- **Second, separate Supabase incident (minor):** "401 errors due to JWT
  rejections", open since 14 Aug, component API Gateway. For **that** one
  Supabase advise a project restart. It is **not** our main symptom (ours is
  latency, not 401s), so a restart is not indicated — flagged only so that if
  the picture flips to mostly 401/login-rejection errors, a restart becomes
  worth considering.

### How to reproduce / measure current state
Anon publishable key is public by design. From any shell:
```bash
URL="https://lusmshimxdcxpnrktlgz.supabase.co/rest/v1/rpc/list_signup_squads"
KEY="<anon publishable key — get via get_publishable_keys, it is public>"
for i in $(seq 1 15); do
  curl -s -o /dev/null --max-time 20 -X POST "$URL" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" -d '{}' \
    -w "$i %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" \
    || echo "$i TIMEOUT"
done
```
All fast (~0.25 s, 0 timeouts) = cleared. Cross-check the status page incident
`bv4ntm4x0btf` for `resolved_at`.

## What was DONE this session

- **grants.sql re-capture — merged.** PR
  https://github.com/jayjmuir-hub/quins-club-hub/pull/480, squash `044f5bd`.
  Comment-only. Confirmed `anon` holds **zero** table privileges on all 66 base
  tables — this is **deliberate** (`db/migrations/20260814_revoke_anon_table_privileges.sql`),
  not a regression; signup works via the SECURITY DEFINER RPC `list_signup_squads`
  which anon can still execute. `db/schema/grants.sql` §2's per-table list still
  read "anon … ALL 8" from the 10 Aug capture with the correction 270 lines away,
  which briefly misread as a live regression; a measured banner now sits at the
  head of §2. The merge **skipped the Netlify build** (docs can't reach the built
  site) — verified: live bundle hash + ETag unchanged, deploy Age aged instead of
  resetting. 0 credits.
- ⚠️ **Changelog follow-up owed:** the grants entry for `044f5bd` is currently
  **un-SHA'd** in `claude/changelog.md` (a commit can't cite its own squash SHA —
  the one-behind rule). The **next** PR that touches the changelog must add
  `044f5bd` to that entry, exactly as #480 did for #478's `8d7b1a7`. Until then
  `main` is green (one-behind allowance covers it).

## What is OPEN (Jay said yes to both)

### (a) Resilience spec — the real answer to "I can't have this happen"
Jay asked whether to switch providers. Answer given and agreed: **no** — no
provider is immune, this app is deeply coupled to Supabase (Postgres + RLS as the
security model on children's data, Auth, Storage, Edge Functions, PostgREST,
Realtime), a migration is months of work and the riskiest possible change to the
security model, and it would only swap Supabase's bad days for someone else's.
The high-leverage, low-risk fix is to make the app **ride through** provider
blips. Write this as a spec first (repo rule: anything bigger than a tweak gets a
spec — `claude/plans/`), build it AFTER the incident clears. Intended scope:
- **Timeout + automatic retry (backoff)** on the key calls — signup squads
  (`src/data/signupSquads.js`), login, the dashboard/membership load
  (`src/lib/memberships.jsx` `MembershipProvider`). Today a stalled request hangs
  forever on "Loading squads…"; a retry does automatically what a manual refresh
  already does.
- **Better browser caching / show-last-known-data** (stale-while-revalidate). The
  installed PWA barely noticed today because it caches; bring more of that to the
  browser so a slow moment shows prior data, not a spinner.
- **Honest "taking longer than usual…" UI** instead of a dead-looking spinner.
- Grounding not yet done: read the actual supabase-client fetch/error handling
  before speccing, so the plan fits how data loading really works here.
- Keep a **reliability scorecard** on Supabase. One bad week ≠ migrate; a
  sustained pattern of major incidents would reopen the question with a real plan.

### (b) Monitor the incident, ping when it clears — NOT set up (interrupted)
Plan was a poll every ~10 min that checks (1) status page incident
`bv4ntm4x0btf` resolved, and (2) a clean probe batch, then notifies. Use the
Monitor tool or a background poll. Not started.

## Facts the next session needs

- Supabase project ref `lusmshimxdcxpnrktlgz`, region `ap-northeast-1` (Tokyo),
  Pro plan. A region move was considered and is **not** recommended (latency to
  Tokyo is fine, ~50 ms; a move would not have prevented a platform incident).
- Worktree `graft-build-81f8f2`, branch synced to `origin/main` at `044f5bd`,
  clean. hostname CAFNET.
- The first session working this incident today is `graft-build-check-00dc96`
  (its transcript has the morning's diagnosis, including the wrong Tokyo-route
  conclusion).
