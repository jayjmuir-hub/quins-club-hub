# Plan: future AWS migration

*Moved out of `RESTORE.md` on 7 Aug 2026. `RESTORE.md` is what is TRUE about
the codebase; a future plan is not that. Content below is unchanged.*


This is a real, confirmed end goal, not speculation — capturing it so no future session forgets
or has to re-derive it from scratch.

**The plan, in two phases, both explicitly agreed with Jay:**

1. **Now → next ~6 months:** stay exactly on the current stack (Supabase + Netlify). Get the
   app fully functional within ~2 weeks of this note, then keep refining functionality/
   usability based on real committee/season use. This is the active phase — treat it as the
   priority, not the migration below.
2. **~6 months out:** full migration to a backend entirely on AWS, run by the developer
   building the club's new main website. This was deliberately chosen as **Option C** (full
   backend rebuild, not just a hosting swap) out of three options discussed — the reasoning
   Jay gave: the new site's dev wants to manage everything under one AWS setup, and the new
   site is already building its own parent/player registration logins — so a single unified
   identity + backend is the real goal, not just "an AWS address."

**What Option C actually requires when that migration happens (do not underestimate this):**
Supabase isn't just a database — it bundles Postgres, Auth, Row-Level Security enforcement, and
Realtime. AWS has no drop-in equivalent for RLS specifically; "who can see/edit what" (14
policies, currently enforced *by the database itself*, hardened in Task 21) would have to be
rewritten as application-layer authorization code (Lambda/API Gateway or similar) against
RDS/Cognito. This is a genuine second build project, comparable in scope to the original
22-task plan for this app — not a config change, and not something to attempt casually or
early. Scope it properly with the AWS dev once their stack is real, rather than guessing now.

**A cheaper alternative was raised and explicitly rejected in favour of full migration:**
Supabase Auth supports federating with an external OIDC provider (e.g. Cognito), which would
give one login across both systems without a backend rewrite. Worth knowing this exists as a
fallback if the full AWS migration ever stalls or timelines slip — it's a real, much smaller
project that solves the "two logins" problem on its own. Sources confirmed live as of this
note: https://supabase.com/docs/guides/auth/custom-oauth-providers,
https://supabase.com/features/custom-oidc-providers.

**Also raised, and worth doing independently of the AWS timeline:** transferring the current
Supabase project and Netlify site from Jay's personal accounts to club-owned accounts. Both
platforms support project/site transfer natively (no rebuild) — this solves "not tied to my
personal card/email" on its own, separately from whether Option C ever happens. Not yet done as
of this note; low-risk, can happen whenever convenient.

**Cheap practices to follow between now and the migration, agreed with Jay, that don't slow the
2-week goal:**
- Keep every Supabase call behind `src/lib` (already the established pattern) — this is what
  makes "swap the backend" mean "rewrite one layer," not "rewrite the app."
- Avoid leaning on Supabase-only mechanisms (Realtime subscriptions, Edge Functions) for new
  features going forward unless there's a real need — they have no AWS-native equivalent and
  would need reworking at migration time. Flag it in-session if a feature seems to want one,
  rather than reaching for it silently.
- Keep RLS policies documented as they're added (`claude/runbooks/e2e-roles.md` and the migration files
  already do this) — that documentation is the actual migration spec later.
- **Do not build a speculative multi-backend abstraction layer now.** Explicitly decided
  against — premature for a migration that's ~6 months out and not yet spec'd by the AWS dev's
  actual stack choices.

**Trigger for starting to scope the real migration:** once the AWS site's dev has a concrete
stack decided (Cognito vs. something else, Amplify vs. custom, etc.), bring that to a session
and scope Option C properly as its own plan — don't start it earlier based on guesses.

---


---

## ⚠️ No Wild Apricot import — carried over from `RESTORE.md`, 7 Aug 2026

Earlier plans (`claude/runbooks/e2e-roles.md`, `deploy.md`, `first-admin.md`) assumed
real player data would come from a Wild Apricot member export off `abudhabiquins.com`.
**That is no longer the plan.** The club's new website is being built separately on AWS,
and Quins Club Hub will integrate with *that* site instead.

Those three runbooks still mention Wild Apricot and are stale on this point. They should
be revisited once the AWS integration shape is known — not before, since guessing at it
would just create a second wrong version.
