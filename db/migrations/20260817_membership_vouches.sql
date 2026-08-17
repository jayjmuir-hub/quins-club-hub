-- public.membership_vouches — "do you know this person?", answered by the
-- people already being asked to approve them.
--
-- Item 8 of claude/plans/2026-08-16-account-creation-redesign.md.
--
-- ══ THE POINT, AND IT IS THE SECOND ANSWER ═══════════════════════════════
--
-- ⚠️ "I DON'T KNOW THEM" IS THE VALUABLE ONE, AND IT IS THE ANSWER NOBODY CAN
-- GIVE TODAY. It rejects nobody and blocks nothing. What it does is make an
-- unrecognised adult asking to reach a children's squad VISIBLE AS EXACTLY
-- THAT, instead of identical to everyone else in the queue. Today a coach who
-- has never seen a name has no way to say so, so the queue cannot tell a
-- familiar parent from a stranger.
--
-- ══ ⚠️ WHY THIS IS ANSWERED IN THE APP AND NOT FROM THE EMAIL ════════════
--
-- The obvious build is two links in the notification email — one click, done.
-- It is the wrong one here.
--
-- A link that acts on somebody's behalf without a session needs a TOKEN, and a
-- token in an email is a credential in an email: forwarded, quoted in a reply,
-- or sitting in a mailbox somebody else opens. `invites.token` is exactly that
-- and it is why supabase/functions/notify-invite/index.ts has no bcc and one
-- recipient. A vouch is a safeguarding signal about a named adult reaching
-- children — the last thing to make actionable by anybody holding a URL.
--
-- ⚠️ AND THERE IS NO COST TO REQUIRING A SESSION. The coach must sign in to
-- APPROVE anyway; the email already links to /approvals. So the answer is given
-- on the row, by a signed-in person the database can identify, and `voucher_id`
-- means something.
--
-- ══ ⚠️ WHY NOT THE DROPDOWN THAT WAS KILLED ══════════════════════════════
--
-- The plan records a "who at the club knows you?" picker, designed and rejected:
-- filling that list means telling anybody who signs up which adults coach which
-- children. This asks the CLUB about the person, never the person about the
-- club, so nothing is disclosed to the one being vouched for.

begin;

create table if not exists public.membership_vouches (
  membership_id uuid        not null,
  voucher_id    uuid        not null,
  club_id       uuid        not null,
  team_id       uuid,
  answer        text        not null check (answer in ('known', 'unknown')),
  at            timestamptz not null default now(),

  -- ⚠️ ONE ANSWER PER PERSON PER REQUEST, AND CHANGING YOUR MIND REPLACES IT.
  -- Two rows from one coach would let the same opinion be counted twice; an
  -- upsert on this key means "I thought I knew them, I don't" is a correction
  -- rather than a second vote.
  primary key (membership_id, voucher_id)
);

comment on table public.membership_vouches is
  'Whether a member of staff recognises the person in the approval queue. '
  '"unknown" is the valuable answer and the one nobody could give before: it '
  'rejects nobody and blocks nothing, it makes an unrecognised adult visible '
  'as unrecognised. Answered IN THE APP by a signed-in voucher — never from an '
  'email link, because that needs a token and a token in an email is a '
  'credential in an email.';

create index if not exists membership_vouches_membership_idx
  on public.membership_vouches (membership_id);

alter table public.membership_vouches enable row level security;

-- ⚠️ EXACTLY THE PEOPLE WHO COULD APPROVE THE REQUEST, AND NO WIDER. This is
-- `private.can_approve_team` — admins plus the coaches and managers of that
-- squad — the same set `notify_pending_membership` already emails and the same
-- set that decides the request. A medic is deliberately outside it, matching
-- 20260816_invite_parent.sql: a medic may not approve, so a medic's opinion must
-- not sit in the queue looking like one that counts.
create policy "vouch read" on public.membership_vouches
  as permissive for select to public
  using (private.can_approve_team(team_id));

-- ⚠️ THE `WITH CHECK` IS WHAT STOPS SOMEBODY VOUCHING AS SOMEBODY ELSE. Without
-- `voucher_id = auth.uid()` a coach could write a row attributing an opinion to
-- another coach — which, for a signal whose whole purpose is "who recognised
-- them", would be worse than having no signal at all.
create policy "vouch write own" on public.membership_vouches
  as permissive for all to public
  using (voucher_id = (select auth.uid()) and private.can_approve_team(team_id))
  with check (voucher_id = (select auth.uid()) and private.can_approve_team(team_id));

-- ── THE GUARD ──────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  if not exists (
    select 1 from pg_policy
     where polrelid = 'public.membership_vouches'::regclass
       and polname = 'vouch write own'
       and pg_get_expr(polwithcheck, polrelid) like '%auth.uid()%'
  ) then
    raise exception 'ABORTING: the write policy does not pin voucher_id to the caller.';
  end if;

  select count(*) into n from pg_policy
   where polrelid = 'public.membership_vouches'::regclass;
  if n <> 2 then
    raise exception 'ABORTING: expected exactly two policies, found %.', n;
  end if;

  raise notice 'guard passed: readable by approvers, writable only as yourself';
end $$;

commit;

-- ── VERIFIED ON PRODUCTION, 17 Aug 2026, ROLLED BACK ───────────────────────
--
-- Against a real pending STAFF claim on U18B — a stranger claiming to coach,
-- which is the case this table exists for.
--
--   a coach of that squad (can_approve = true)   wrote 1 row
--   changing their mind                          answer 'known', STILL 1 ROW
--   ⚠️ vouching AS ANOTHER COACH                 REFUSED
--   a real medic on the same squad               can_approve = false, reads 0
--   somebody with no membership                  reads 0
--   control, no RLS                              1
--
-- ⚠️ THE MEDIC IS A CREATED FIXTURE, NOT A FOUND ONE. The club may have none,
-- and a NULL fixture would have measured a stranger while looking like it
-- measured a medic — the trap that made the first membership_audit read probe
-- meaningless. `can_approve = false` is printed alongside the 0 so the zero is
-- evidence rather than an absence.
--
-- ⚠️ AND A `parent` ROW CANNOT BE USED AS THE FIXTURE HERE:
-- `memberships_family_role_needs_player` requires a player_id for parent and
-- player roles, so the first attempt failed 23514. A staff claim is the better
-- fixture anyway.
