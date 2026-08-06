-- Applied to Supabase as migration `memberships_unique_grant`, 6 Aug 2026.
--
-- One access row per (person, club, role, squad, linked player).
--
-- memberships has never had a unique constraint, which is why
-- grantMemberships() de-duplicates in JavaScript and why duplicate admin rows
-- have bitten this project before. This makes that structural.
--
-- NULLS NOT DISTINCT is the load-bearing part (PG15+; this database is 17.6).
-- By default Postgres treats every NULL as distinct, so an admin row
-- (team_id null, player_id null) could still be inserted twice -- precisely the
-- duplicate that has actually occurred here. NULLS NOT DISTINCT is what closes
-- it.
--
-- What this deliberately still ALLOWS, because each is legitimate access:
--   - two parent rows, same squad, different children  (player_id differs)
--   - two coach rows, different squads                 (team_id differs)
--   - a coach row and a parent row for the same squad  (role differs)
--
-- Verified zero existing duplicates before applying.
create unique index memberships_unique_grant
  on public.memberships (profile_id, club_id, role, team_id, player_id)
  nulls not distinct;

comment on index public.memberships_unique_grant is
  'Prevents duplicate access rows, including duplicate admin rows (hence NULLS NOT DISTINCT). A 23505 from this index means the grant already exists, not that the write was refused.';

-- Proved in a rolled-back transaction, not asserted:
--   exact duplicate of an existing row  -> refused (23505)
--   duplicate ADMIN row (both nulls)    -> refused  <-- plain UNIQUE would allow this
--   same person + squad, different child -> still allowed
