-- The tenth officer title: Club Captain (Jay, 3 Sep 2026). Same route as
-- the ninth (20260826_officer_title_social_media.sql): the closed vocabulary
-- admits a title by a deliberate migration widening the CHECK, never by a
-- free-text field (claude/plans/2026-08-26-club-officers.md).
--
-- The rendering order lives in src/lib/identity.js's OFFICER_TITLES, which
-- gains the same entry (last — the club's stated order, then the additions
-- in the order they were asked for).

begin;

alter table public.club_officers
  drop constraint club_officers_title_check;

alter table public.club_officers
  add constraint club_officers_title_check check (title in (
    'Club President', 'Vice Chairman', 'Rugby Junior Manager',
    'Club Secretary', 'Treasurer', 'Membership Secretary',
    'Director of Rugby', 'Rugby Performance Director',
    'Social Media Director', 'Club Captain'
  ));

commit;
