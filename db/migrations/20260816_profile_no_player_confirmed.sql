-- "I don't have a player at the club" — recorded once, so it stops being asked.
--
-- Jay, 16 Aug 2026: "force them to add a player or confirm again 1 time they
-- don't have a player". The "1 time" is the whole reason this column exists. A
-- gate that asks every login is a nag, and a coach with no children at the club
-- would meet it forever.
--
-- ⚠️ A TIMESTAMP, NOT A BOOLEAN, and it is the same shape as
-- `name_confirmed_at` directly above it in this table. A boolean records that
-- somebody answered; a timestamp records WHEN, which is the difference between
-- "they said no in August" and "they said no at some point, before or after the
-- three squads they now coach existed". Also, false and null are indistinguishable
-- in a boolean written by an app that has not asked yet.
--
-- ⚠️ THE COLUMN GRANT IS NOT OPTIONAL AND IS THE PART THAT WOULD SILENTLY BREAK
-- THIS. `authenticated` holds UPDATE on public.profiles for exactly five
-- columns — first_name, full_name, last_name, name_confirmed_at, phone —
-- measured on production before this ran. RLS grants ROWS; column privileges
-- grant COLUMNS, and a policy that permits the row says nothing about a column
-- nobody was granted. Without the grant below the gate would close, the write
-- would be refused, and the person would be asked again on their next login
-- forever. src/screens/More.jsx's YouCard header records the same trap from the
-- other direction: `email` is deliberately NOT granted, which is what stops
-- somebody rewriting the address an admin reads when approving them.
--
-- ⚠️ NOTHING IS BACKFILLED. Every existing profile gets null, which means
-- "never asked" — and that is correct: nobody has been asked yet. Backfilling
-- would record an answer on behalf of people who never gave one, which is the
-- same objection that kept `requested_role` nullable on access_requests.

begin;

alter table public.profiles
  add column if not exists no_player_confirmed_at timestamptz;

grant select (no_player_confirmed_at) on public.profiles to authenticated;
grant update (no_player_confirmed_at) on public.profiles to authenticated;

commit;
