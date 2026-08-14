-- 14 Aug 2026 — stop 18 RLS policies re-evaluating an `auth.*` call once per row.
--
-- ══ WHAT THIS IS, IN ONE PARAGRAPH ════════════════════════════════════════
--
-- `auth.uid()` reads the request's JWT. It returns the same answer for every
-- row in a query, but Postgres does not know that, so inside a policy it is
-- re-evaluated per row. Wrapping it — `(select auth.uid())` — turns it into an
-- InitPlan: evaluated ONCE, then compared against each row. Same answer, one
-- call instead of N.
--
-- ⚠️ THE MEANING DOES NOT CHANGE. That is the whole point, and it is also the
-- risk: a rewrite that silently changed a predicate on a database holding
-- children's data would be worse than the performance problem it fixed. See
-- "how equivalence was proved" at the bottom — it was not taken on trust.
--
-- ══ ⚠️ THE COUNT, AND WHY THE OBVIOUS SEARCH GETS IT WRONG ════════════════
--
-- Supabase's `auth_rls_initplan` lint names **18 policies**. A string search
-- for `auth.uid()` finds only **17**.
--
-- The 18th is `invites / invites read own`, which calls **`auth.jwt()`**, not
-- `auth.uid()`. `claude/open-items.md` described this item as "18 RLS policies
-- call auth.uid() bare" — a description that, followed literally, produces a
-- migration that fixes 17 and leaves the lint reporting one forever.
--
-- There are **19 bare calls** across those 18 policies: `calendar_tokens /
-- calendar token own` and `social_ideas / social idea create` carry two each.
--
-- ══ ✅ THIS FOLLOWS A PRECEDENT, IT DOES NOT INVENT ONE ═══════════════════
--
-- **Six policies already use the wrapped form** — all four on `announcements`
-- and both on `announcement_reads`, shipped earlier the same day. This file
-- brings the other 18 into line with them.
--
-- ⚠️ Recorded because an earlier draft of open-items.md claimed the opposite:
-- that no policy used the wrapped form. That came from a query which listed
-- only policies with bare calls, so the wrapped ones were filtered out before
-- they could be counted and their absence was read as evidence. Same shape as
-- reading an empty search result as proof of absence — CLAUDE.md rule 6.
--
-- ══ WHY `alter policy` RATHER THAN drop + create ══════════════════════════
--
-- `alter policy` changes ONLY the expressions. The name, the table, the
-- command, the roles and — critically — PERMISSIVE vs RESTRICTIVE all carry
-- over untouched, because they are never restated.
--
-- Drop-and-create would restate every one of them, which means every one of
-- them is a chance to get it wrong. This schema has at least one policy whose
-- correctness depends entirely on that distinction: `memberships / memb no
-- self promotion` is RESTRICTIVE, and its WITH CHECK passes for anybody, so
-- recreating it as PERMISSIVE by omission would open a hole rather than close
-- one. Nothing in this file touches it — but the reason the safer verb was
-- chosen is that the unsafe one has a live example sitting next to it.
--
-- ⚠️ `profiles / profile update own` HAS NO WITH CHECK, DELIBERATELY. For an
-- UPDATE policy with no WITH CHECK, Postgres reuses the USING expression for
-- the check. The statement below therefore names USING only; adding a WITH
-- CHECK here would be a behaviour change wearing the costume of a rewrite.

-- ── access_requests ────────────────────────────────────────────────────────
alter policy "access request insert own" on public.access_requests
  with check (((profile_id = (select auth.uid())) and (status = 'pending'::text)));

alter policy "access request read own" on public.access_requests
  using ((profile_id = (select auth.uid())));

-- ── calendar_tokens (cmd ALL — both halves, two bare calls) ────────────────
alter policy "calendar token own" on public.calendar_tokens
  using ((profile_id = (select auth.uid())))
  with check ((profile_id = (select auth.uid())));

-- ── clubs ──────────────────────────────────────────────────────────────────
alter policy "club read" on public.clubs
  using ((exists ( select 1
                     from memberships m
                    where ((m.profile_id = (select auth.uid()))
                      and (m.club_id = clubs.id)))));

-- ── invites — ⚠️ auth.jwt(), NOT auth.uid(). The one the obvious search misses.
alter policy "invites read own" on public.invites
  using ((lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'::text), ''::text))));

-- ── league_teams ───────────────────────────────────────────────────────────
alter policy "league team read" on public.league_teams
  using (((select auth.uid()) is not null));

-- ── memberships ────────────────────────────────────────────────────────────
alter policy "memb read" on public.memberships
  using (((profile_id = (select auth.uid())) or private.is_admin(club_id)));

-- ── pitch_requests ─────────────────────────────────────────────────────────
alter policy "pitch request create" on public.pitch_requests
  with check (((requested_by = (select auth.uid()))
    and private.can_edit_team(( select e.team_id
                                  from events e
                                 where (e.id = pitch_requests.event_id)))));

alter policy "pitch request read" on public.pitch_requests
  using (((requested_by = (select auth.uid()))
    or private.can_edit_team(( select e.team_id
                                 from events e
                                where (e.id = pitch_requests.event_id)))));

alter policy "pitch request withdraw" on public.pitch_requests
  using (((requested_by = (select auth.uid())) and (status = 'submitted'::text)));

-- ── pitches ────────────────────────────────────────────────────────────────
alter policy "pitch read" on public.pitches
  using (((select auth.uid()) is not null));

-- ── profiles ───────────────────────────────────────────────────────────────
alter policy "profile insert own" on public.profiles
  with check ((id = (select auth.uid())));

alter policy "profile read own" on public.profiles
  using ((id = (select auth.uid())));

-- ⚠️ USING only — see the note above. This policy has no WITH CHECK and must
-- not acquire one.
alter policy "profile update own" on public.profiles
  using ((id = (select auth.uid())));

-- ── social_ideas (create carries two bare calls) ───────────────────────────
alter policy "social idea create" on public.social_ideas
  with check (((submitted_by = (select auth.uid()))
    and (exists ( select 1
                    from memberships m
                   where ((m.profile_id = (select auth.uid()))
                     and (m.club_id = social_ideas.club_id)
                     and (m.status = 'active'::text))))));

alter policy "social idea read" on public.social_ideas
  using (((submitted_by = (select auth.uid())) or private.is_admin(club_id)));

alter policy "social idea remove" on public.social_ideas
  using ((((submitted_by = (select auth.uid())) and (status = 'new'::text))
    or private.is_admin(club_id)));

-- ── teams ──────────────────────────────────────────────────────────────────
alter policy "team read" on public.teams
  using (((select auth.uid()) is not null));

-- ══ ✅ HOW EQUIVALENCE WAS PROVED, AND IT IS NOT "IT LOOKS THE SAME" ══════
--
-- Run in a rolled-back transaction on production before this file was
-- committed:
--
--   1. capture every policy's `qual` and `with_check` from pg_policies;
--   2. apply this migration;
--   3. capture them again;
--   4. assert that the NEW text, with `( SELECT auth.uid() AS uid)` replaced
--      by `auth.uid()` and `( SELECT auth.jwt() AS jwt)` by `auth.jwt()`,
--      is CHARACTER-IDENTICAL to the OLD text, for all 60-odd policies.
--
-- Postgres re-prints these expressions from its own parse tree rather than
-- storing the submitted text, so step 4 compares what the DATABASE understands,
-- not what was typed. Any change of meaning — a dropped clause, a flipped
-- operator, an AND that became an OR — shows up as a mismatch. **A whitespace
-- difference in this file cannot produce a false pass, and a semantic
-- difference cannot produce a false pass either.**
--
-- ⚠️ AND THE COMPARISON WAS PROVED ABLE TO FAIL. A deliberate corruption —
-- rewriting one policy with `and` where the original had `or` — was injected
-- and the check reported the mismatch. A comparison that has never failed is
-- not a comparison.
--
-- ══ HOW TO VERIFY AFTER APPLYING ══════════════════════════════════════════
--
--   npm run db:check -- rls-initplan
--
-- and re-run the Supabase performance advisor: `auth_rls_initplan` should
-- report nothing. ⚠️ It reported 18 before this file, alongside 100
-- `multiple_permissive_policies` entries which this migration does NOT touch
-- and which are a separate question.
