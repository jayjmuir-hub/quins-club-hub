### Task 7: Memberships + scope helpers
**Files:** Create `src/lib/scope.js`, `src/data/members.js`, `tests/scope.test.js`.
**Interfaces:** Produces `loadMyMemberships()`; `visibleTeams(memberships, allTeams)`, `canEditTeam(memberships, teamId)`, `isAdmin(memberships)`, `roleLabel(memberships)`, `childPlayerIds(memberships)`.
- [ ] Test each helper with fixture membership arrays: admin sees all teams and `canEditTeam` is true for any team; coach sees and can edit only their own teams; parent sees their child's team and cannot edit; `roleLabel` picks the highest role; `childPlayerIds` returns linked `player_id`s.
- [ ] Implement pure helpers + `loadMyMemberships()` query (`memberships` joined to `teams`). Verify. Commit.

## Phase C — Shell & design system

