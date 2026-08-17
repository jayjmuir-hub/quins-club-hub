-- public.player_private.plays_up_confirmed_at — the parent said yes to their
-- child playing up an age group.
--
-- Jay, 17 Aug 2026: "we need the ability for players to play up one age group
-- with a notification". The RULES half shipped in #203 (src/lib/ageGrade.js,
-- ported from the tournament repo). This is what makes the notification
-- possible without a third copy of those rules.
--
-- ══ ⚠️ WHY A STORED COLUMN AND NOT A DERIVED ANSWER ═══════════════════════
--
-- A play-up is visible from the birthday and the squad, so storing it looks
-- redundant. It is not, for three separate reasons and each one alone is enough:
--
--   1. ⚠️ IT IS A DECISION, NOT A FACT. The dates say a play-up is POSSIBLE; the
--      tick says a parent CHOSE it. Deriving it would record consent nobody
--      gave — and this column exists precisely so the club can show that
--      somebody agreed.
--
--   2. ⚠️ THE RULES CANNOT REACH THE PLACE THAT NEEDS THEM. The registration
--      already emails the squad's coaches through notify_pending_membership ->
--      notify-approval, which is exactly the right audience. That function is
--      DENO and cannot import src/lib/ageGrade.js, so deriving it there means a
--      THIRD copy of the UAERF model — one in …\GitHub\adhjrt, one in src/, one
--      in an edge function. Two already have to be kept in step by hand.
--
--   3. ⚠️ THE ORDERING MAKES DERIVATION AT TRIGGER TIME IMPOSSIBLE ANYWAY.
--      register_my_player creates the membership, which fires the notification
--      trigger, and the date of birth is written by a SECOND call afterwards. A
--      trigger deriving a play-up would read a player_private row that does not
--      exist yet, every single time, and conclude there is nothing to say.
--
-- ══ ⚠️ WHY HERE, AND NOT ON `players` ════════════════════════════════════
--
-- Same reason the date of birth is here: `player read` is squad-wide and RLS
-- grants ROWS not COLUMNS, so a column on `players` would tell every parent in
-- the squad which children are playing outside their age group. That is a fact
-- about a child's body and it belongs with their birthday, behind the same pair
-- of policies — staff for that squad, or the child's own family.
--
-- ⚠️ NULL MEANS "NOT PLAYING UP", AND THERE IS NO SEPARATE "NO" TO RECORD.
-- Nothing asks the question unless the dates make it a play-up, so the absence
-- of a timestamp is the absence of the question. Do not add a boolean beside
-- this to represent a "no" — it would be a second value meaning the same thing
-- and free to disagree.

begin;

alter table public.player_private
  add column if not exists plays_up_confirmed_at timestamptz;

comment on column public.player_private.plays_up_confirmed_at is
  'When a parent confirmed this child may play up an age group (UAERF rules '
  'allow one, or two for the girls'' squads — see src/lib/ageGrade.js). A '
  'DECISION, not a derived fact: the birthday and the squad say a play-up is '
  'possible, this says somebody agreed to it. NULL means not playing up.';

-- ── THE GUARD ──────────────────────────────────────────────────────────────
-- ⚠️ THE COLUMN IS USELESS IF `authenticated` CANNOT SELECT IT, and that failure
-- reads exactly like an RLS refusal rather than a missing grant. The 16 Aug
-- migration established that this table's privileges are TABLE-level, so a new
-- column inherits them — this asserts that rather than trusting it.
do $$
declare granted int;
begin
  select count(*) into granted
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'player_private'
     and column_name = 'plays_up_confirmed_at'
     and grantee = 'authenticated'
     and privilege_type in ('SELECT', 'INSERT', 'UPDATE');

  if granted < 3 then
    raise exception 'ABORTING: authenticated holds % of the 3 needed privileges on plays_up_confirmed_at.', granted;
  end if;

  raise notice 'guard passed: the column exists and authenticated can read and write it';
end $$;

commit;

-- ── VERIFY (run it; do not assume) ─────────────────────────────────────────
-- The policies are unchanged, so the thing worth re-proving is that the new
-- column follows them. Inside a transaction that ROLLS BACK, impersonating a
-- parent of another child in the same squad:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<another parent>"}';
--   select count(*) from public.player_private where player_id = '<the child>';
--   -- must be 0, exactly as it is for date_of_birth
--   rollback;
