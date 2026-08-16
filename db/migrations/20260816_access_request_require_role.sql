-- Require a role and a squad on every new access request.
--
-- ⚠️ RUN THIS ONLY ONCE THE NEW FORM IS LIVE. It is the second half of
-- 20260816_access_request_role_and_squad.sql, split from it precisely because
-- the two must not land together: the form deployed before that change sends
-- neither column, so applying this policy while it is still serving refuses
-- every signup — a stranger trying to join the club is told they are not
-- allowed, and nothing on the screen explains why.
--
-- The order is: columns and RPC -> deploy the form -> this file.
--
-- ⚠️ AND THE POLICY IS THE GATE, NOT THE <select>. This repo's standing rule is
-- that the client decides what is OFFERED and the database decides what is
-- PERMITTED. A required dropdown is a convenience; this is the thing that makes
-- "I have no idea who they are" impossible to produce again.

begin;

-- ⚠️ THE FORM IS NOT THE GATE AND MUST NEVER BE THE ONLY ONE. This repo's
-- standing rule is that the client decides what is OFFERED and the database
-- decides what is PERMITTED. A required <select> is a convenience; this is the
-- thing that makes "no idea who they are" impossible to produce again.
--
-- ⚠️ THE ADMIN POLICY IS UNTOUCHED AND STILL PERMITS A NULL ROLE. It is `ALL`
-- on is_admin_anywhere(), so an admin can still write a row by hand — which is
-- the escape hatch for a case this form cannot express, and the only account
-- that should have one.
drop policy if exists "access request insert own" on public.access_requests;
create policy "access request insert own" on public.access_requests
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and status = 'pending'
    and requested_role is not null
    and requested_team_id is not null
  );

commit;
