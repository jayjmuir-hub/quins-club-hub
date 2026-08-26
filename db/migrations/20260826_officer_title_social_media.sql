-- The ninth officer title: Social Media Director (Jay, 26 Aug 2026,
-- minutes after the eight shipped — "sorry, we need a Social Media
-- Director"). This is the closed-vocabulary design working as intended:
-- a new title is a deliberate migration, not a typo
-- (claude/plans/2026-08-26-club-officers.md).
--
-- The rendering order lives in src/lib/identity.js's OFFICER_TITLES,
-- which gains the same entry (last — the club's stated order, then this).

begin;

alter table public.club_officers
  drop constraint club_officers_title_check;

alter table public.club_officers
  add constraint club_officers_title_check check (title in (
    'Club President', 'Vice Chairman', 'Rugby Junior Manager',
    'Club Secretary', 'Treasurer', 'Membership Secretary',
    'Director of Rugby', 'Rugby Performance Director',
    'Social Media Director'
  ));

commit;
