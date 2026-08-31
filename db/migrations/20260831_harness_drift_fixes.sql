-- 31 Aug 2026 — three hygiene drifts the nightly harnesses caught, fixed in one pass
--
-- BACKGROUND. The db-check nightly had been red since 22 Aug and nobody
-- triaged it. On 31 Aug all 16 failures were measured one by one: fourteen
-- were stale harnesses (repointed in the same PR, db/tests/), and THREE were
-- production drifts where the harness was right and the database wrong. This
-- migration is those three. None is an open door — each is a hygiene rule the
-- repo already enforces everywhere else, missed by one migration each.
--
-- ── 1 · "officers read member" re-evaluates auth.uid() per row ─────────────
-- db/tests/rls-initplan.sql. 20260826_club_officers.sql wrote the policy with
-- a BARE auth.uid(), so Postgres runs it once per row instead of once per
-- query. Wrapping it as (select auth.uid()) changes no meaning — see
-- db/migrations/20260814_rls_initplan_wrap_auth_calls.sql, which proved
-- equivalence for the same rewrite across the whole schema.

drop policy "officers read member" on public.club_officers;
create policy "officers read member" on public.club_officers
  for select to authenticated
  using (exists (
    select 1 from memberships me
     where me.profile_id = (select auth.uid())
       and me.status = 'active'
       and me.club_id = club_officers.club_id
  ));

-- ── 1b · both pitch_share_approvals policies, same disease ─────────────────
-- Found while proving fix 1: the initplan harness reports ONE bare policy at
-- a time, and these two (20260829_pitch_share_approvals.sql) were queued up
-- behind club_officers. Recreated verbatim except for the wrap.

drop policy "share approval read" on public.pitch_share_approvals;
create policy "share approval read" on public.pitch_share_approvals
  for select using (
    exists (
      select 1 from memberships m
      where m.profile_id = (select auth.uid())
        and m.status = 'active'
        and (m.role = 'admin'
             or (m.role in ('coach','manager','medic') and m.team_id is not null))
    )
  );

drop policy "share approval create" on public.pitch_share_approvals;
create policy "share approval create" on public.pitch_share_approvals
  for insert with check (private.is_admin(club_id) and approved_by = (select auth.uid()));

-- ── 2 · private.push_endpoint_allowed has a mutable search_path ────────────
-- db/tests/search-path.sql. 20260830_push_hardening.sql created it without a
-- pin. It is a pure SQL predicate over its argument — it references no tables,
-- so there is nothing to hijack today — but the standing rule is every
-- `private` function is pinned or on the harness's argued exemption list, and
-- an unargued exemption is how the rule dies. Pinned empty, like the other
-- pure helpers in 20260830_pin_private_helper_search_path.sql.

alter function private.push_endpoint_allowed(text) set search_path = '';

-- ── 3 · anon can EXECUTE public.complete_signup_intent ─────────────────────
-- db/tests/grants.sql. 20260825_signup_before_confirm.sql granted it to
-- `authenticated` only and revoked from PUBLIC — but a revoke from PUBLIC
-- does not remove Supabase's NAMED default grant to anon, which is the exact
-- trap the grants harness's own failure message describes. Not exploitable
-- (the function's first line raises 42501 on a null auth.uid()), so this is
-- defence in depth, same as 20260818_revoke_anon_execute_register_my_player.
-- ⚠️ list_signup_squads is NOT revoked: its anon grant is deliberate — the
-- signup wizard has no session yet (same migration, argued in its header).

revoke execute on function public.complete_signup_intent() from anon;
