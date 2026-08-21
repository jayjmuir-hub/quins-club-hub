# State of play

**Reading-order step 3.** Where things stand TODAY and what is blocked on whom.
Restarted from scratch 14 Aug 2026 — the previous edition reached 2,151 lines
because every correction was appended instead of replacing anything, and half of
it was dated narrative about its own past.

## ⚠️ The rule that keeps this file useful

**Nothing dated goes in here. If it will be wrong in a week, it does not belong.**

- **A fact about the CODEBASE** → `RESTORE.md`.
- **Why a question was settled** → `claude/decisions/`.
- **What changed and when** → `claude/changelog.md`.
- **Known-broken but not blocking** → `claude/open-items.md`.
- **What a session did** → `claude/handoffs/`.

**Never quote a number a query can produce.** Every wrong claim in this file's
history was a rotted measurement; the rulings never rotted. Measure it.

⚠️ **If this file passes ~80 lines, something dated has crept in. Cut it.**

## Where things stand

**Live at https://adhquins-clubhub.com with real families on it.** The club went
live 13 Aug 2026. Assume a real parent is looking at whatever you touch.

🏉 **The Rugby Performance Director dashboard (pieces 1–3) is BUILT on branch
`claude/rugby-performance-dashboard-001473`, PR open, NOT merged.** The first
migration (`training_plans`) IS applied to production — six empty tables and
`teams.requires_contact`, all 15 squads false. A second, ten-line migration
(`publish_training_fit_check`) is written and waits for Jay's "apply":
`claude/schema-history.md`. Notification email, AI assist and a first/second
session pair are out of scope and unbuilt. Nobody holds the `training` right yet.

**Current phase: onboarding, and the fixes it throws up.** Not new
infrastructure. The last four features found their bugs within hours of a real
person using them, and none of those bugs had a failing test.

## Blocked on Jay

- **Most squads have nobody attached on `/admin/staff`**, so the Home "Squad
  contacts" card shows its empty state to most of the club. Data entry, not code.
  Run the query below rather than trusting this sentence.
  ⚠️ **JAY'S POSITION: this resolves itself as staff sign in, and it is not
  blocking.** Do not keep raising it as the top priority; he has heard it.

✅ **Monitoring is no longer on this list** — two uptime monitors and Sentry are
LIVE, each proved by making it fire. ⚠️ **Read
`claude/runbooks/monitoring.md` before touching either**; two things there are
load-bearing and easy to undo by tidying.

## Tabled — do not start, do not offer, do not ask again

The photo **restore drill**, the **AI build**
(`claude/plans/2026-08-12-ai-integration.md`), and the **live `squad_push` test**
(Jay, 20 Aug 2026). Jay reopens them or they stay closed.
✅ **Training session plans came OFF this list on 20 Aug 2026**, reopened by Jay
after eight days — `claude/plans/2026-08-12-training-session-plans.md`. It is the
worked example of the list doing its job: nobody offered it, and he brought it
back himself. ⚠️ `squad_push` is still UNPROVEN; when it is reopened, the safe route is
a fixture change on **U13 Mixed** made by somebody OTHER than Jay — measured, it
reaches his devices and nobody else's. Being super admin puts you in no squad's
audience: `notice_audience` keys purely on `team_id`, and the actor is excluded. ⚠️ The AI *ruling* — children's data may
leave the club, minimised — still stands and still governs;
`claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md`.

## Numbers — measure, never cite

```sql
-- the club, right now
select (select count(*) from auth.users)                                as logins,
       (select count(distinct profile_id) from memberships
         where status = 'active')                                       as members,
       (select count(*) from players)                                   as players,
       (select count(*) from memberships where status = 'pending')      as awaiting_approval,
       (select count(*) from memberships where is_super)                as super_admins,
       (select count(*) from storage.objects
         where bucket_id = 'player-photos')                             as player_photos;

-- reports, and whether any carry a reply (see "Test data" below)
select ref, status, admin_note is not null as has_reply from public.feedback
 order by created_at desc;

-- squads with nobody looking after them
select t.name from teams t where not exists (
  select 1 from memberships m where m.team_id = t.id and m.status = 'active'
    and m.role in ('coach','manager','medic','admin')) order by t.sort_order;
```

## Test data still in the live database

**Two reports in `public.feedback` carry test text as the club's reply**, left
over from proving push notifications on a real phone. ✅ **They can now be
deleted** — an admin has a Delete on each row as of 19 Aug 2026, which they
could not on the morning of the same day. Jay's to clear or keep.

⚠️ **Measure before you repeat.** The last warning in this section outlived the
problem by a week, because it was copied forward instead of re-run.
