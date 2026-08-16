-- "I don't do anything else at the club" — recorded once, so it stops being asked.
--
-- ⚠️ THIS IS THE MIRROR OF `no_player_confirmed_at`, ADDED EARLIER THE SAME DAY,
-- AND THE ASYMMETRY IT CLOSES IS THE WHOLE POINT. Sign-up forks two ways
-- (src/components/AppShell.jsx): "Add your player", or "I'm not adding a
-- player". Whichever door somebody takes, the other half of who they are is
-- never asked for again.
--
--   staff door  -> a staff role, and since 20260816_profile_no_player_confirmed
--                  they ARE asked whether they have children here.
--   parent door -> a parent membership, and NOTHING ANYWHERE asks whether they
--                  also coach.
--
-- Jay, 16 Aug 2026, having found a real one: a coach with an account, a
-- `parent` membership on one squad, who "got through without asking to be
-- designated a coach". The parent door is the one with no mirror, and this
-- column is that mirror.
--
-- ⚠️ IT CANNOT BE FIXED BY THE SIGN-UP SCREEN ALONE. `AddYourPlayer` only
-- renders while `memberships.length === 0`, so the moment a first child is
-- registered the question can never be put there again. That is why the answer
-- lives on the profile and is asked by the sign-in gate, which every existing
-- member meets — including the coaches already filed as parents today.
--
-- ⚠️ A TIMESTAMP, NOT A BOOLEAN — same reasoning as the column it mirrors. A
-- boolean records that somebody answered; a timestamp records WHEN, which is
-- the difference between "they said no in August" and "they said no at some
-- point, possibly before the squad they now coach existed". And false is
-- indistinguishable from null in a boolean written by an app that has not asked
-- yet.
--
-- ⚠️ BOTH COLUMN GRANTS, AND THIS IS THE PART THAT WOULD SILENTLY BREAK IT.
-- `authenticated` holds UPDATE on public.profiles for named columns only. RLS
-- grants ROWS; column privileges grant COLUMNS, and a policy permitting the row
-- says nothing about a column nobody was granted. Without the grants below the
-- gate closes, the write is refused, and the person is asked again at every
-- sign-in forever — a failure that is invisible in the UI, because a reopened
-- gate looks exactly like a gate that was never answered.
--
-- ⚠️ NOTHING IS BACKFILLED. Every existing profile gets null, which means
-- "never asked" — and that is exactly right: nobody has been asked yet, and the
-- coaches this exists to find are precisely the people whose profiles already
-- exist. Backfilling would record an answer on behalf of people who never gave
-- one, which is the same objection that kept `requested_role` nullable on
-- access_requests.

begin;

alter table public.profiles
  add column if not exists no_role_confirmed_at timestamptz;

grant select (no_role_confirmed_at) on public.profiles to authenticated;
grant update (no_role_confirmed_at) on public.profiles to authenticated;

commit;
