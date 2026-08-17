-- public.player_parents.profile_id — which account, if any, this adult is.
-- Plus public.link_my_parent_rows(), the claim that fills it in on sign-in.
--
-- Item 7 of claude/plans/2026-08-16-account-creation-redesign.md. It is what
-- stops one human existing as three unlinked records, and what gives the Invite
-- button its **Joined** state — until now the button could not tell an adult who
-- had accepted from one who had never opened the email.
--
-- ══ ⚠️ LINKING IS NOT GRANTING, AND THIS FUNCTION DOES ONLY THE FIRST ═════
--
-- `claim_roster_access` — the function this was described as "generalising" —
-- matches an email and CREATES A MEMBERSHIP. That is safe for the case it was
-- written for: the address is on `player_contacts`, the CHILD's own contact
-- details, which only staff can write.
--
-- ⚠️ IT WOULD NOT BE SAFE HERE. `player_parents.email` is an address a PARENT
-- can type, for their own child, with no staff involvement (`parent edit own`).
-- A claim that granted access on that basis would mean: type an address into the
-- contacts box, sign in as it, and hold a membership on that squad. That is the
-- hole `invite_parent` was built to avoid — it deliberately routes the same
-- journey through an invite whose `grant_status` is only 'active' if the sender
-- could already approve.
--
-- ⚠️ SO THIS FUNCTION SETS ONE COLUMN AND CREATES NOTHING. It says "this contact
-- row is that account". Access still arrives the way it always did: an invite,
-- or an admin, or register_my_player. **If a future change makes this insert a
-- membership, it re-opens exactly the hole 20260816_invite_parent.sql closes.**
--
-- ══ WHY IT IS NOT AN ENUMERATION ORACLE ══════════════════════════════════
--
-- It reveals nothing unless the address ALREADY matches the caller's own
-- confirmed sign-in address, which they had to prove they control. Same
-- property that makes claim_roster_access safe. It returns a COUNT, not the
-- rows: "you were linked to 2 records" tells the caller nothing about anybody
-- else, where returning the rows would hand them children's names.

begin;

alter table public.player_parents
  add column if not exists profile_id uuid references public.profiles(id) on delete set null;

comment on column public.player_parents.profile_id is
  'The account this adult signed in as, once their address matched. Set by '
  'public.link_my_parent_rows(). ⚠️ IDENTITY ONLY — it grants nothing, and must '
  'not be made to: this email is one a PARENT can type, unlike '
  'player_contacts.email. See the head of 20260817_parent_profile_link.sql.';

-- ⚠️ NOT UNIQUE. One adult legitimately appears on several rows — a parent of
-- three children is three rows, and each is a separate contact record for a
-- separate child. A unique index here would refuse the second child.
create index if not exists player_parents_profile_id_idx
  on public.player_parents (profile_id)
  where profile_id is not null;

create or replace function public.link_my_parent_rows()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  caller_email text;
  confirmed_at timestamptz;
  linked       integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  -- ⚠️ CONFIRMED, NOT MERELY PRESENT. An unconfirmed address is one somebody
  -- typed at sign-up, not one they proved they control — and this function's
  -- entire safety argument is "the caller already owns this address".
  select email, email_confirmed_at into caller_email, confirmed_at
    from auth.users where id = auth.uid();

  if nullif(btrim(caller_email), '') is null or confirmed_at is null then
    return 0;
  end if;

  -- ⚠️ `profile_id is null` IS NOT AN OPTIMISATION. Without it, re-running this
  -- would re-stamp rows that are already linked — including rows linked to a
  -- DIFFERENT account, if two people ever shared an address. A row that is
  -- already claimed stays claimed; the first match wins and a human resolves
  -- any dispute.
  update public.player_parents pp
     set profile_id = auth.uid()
   where pp.profile_id is null
     and lower(btrim(pp.email)) = lower(btrim(caller_email));

  get diagnostics linked = row_count;
  return linked;
end;
$function$
;

-- ⚠️ `revoke ... from public` DOES NOT REMOVE anon ON SUPABASE — its default
-- privileges grant EXECUTE explicitly on creation. Measured 16 Aug 2026 with
-- request_staff_role; see that migration's header.
revoke all on function public.link_my_parent_rows() from public;
revoke execute on function public.link_my_parent_rows() from anon;
grant execute on function public.link_my_parent_rows() to authenticated;

-- ── THE GUARD ──────────────────────────────────────────────────────────────
do $$
declare granted int;
begin
  -- The column is useless if `authenticated` cannot read it, and that failure
  -- reads exactly like an RLS refusal rather than a missing grant.
  select count(*) into granted
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'player_parents'
     and column_name = 'profile_id' and grantee = 'authenticated'
     and privilege_type = 'SELECT';
  if granted < 1 then
    raise exception 'ABORTING: authenticated cannot select player_parents.profile_id.';
  end if;

  if has_function_privilege('anon', 'public.link_my_parent_rows()', 'EXECUTE') then
    raise exception 'ABORTING: anon can execute link_my_parent_rows.';
  end if;

  -- ⚠️ THE ONE THAT MATTERS MOST. If this function ever learns to insert a
  -- membership it stops being identity-only and becomes a way to grant yourself
  -- access by typing an address into a contacts box.
  if position('memberships' in pg_get_functiondef('public.link_my_parent_rows()'::regprocedure)) > 0 then
    raise exception 'ABORTING: link_my_parent_rows mentions memberships — it must grant nothing.';
  end if;

  raise notice 'guard passed: column readable, anon excluded, function grants nothing';
end $$;

commit;
