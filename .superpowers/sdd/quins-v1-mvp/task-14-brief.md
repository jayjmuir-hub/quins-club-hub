### Task 14: Event create/edit/delete
**Files:** Create `src/screens/EventForm.jsx`; modify `src/data/events.js` (`upsertEvent`, `deleteEvent`).
**Interfaces:** Coaches/admin only; squad dropdown limited to `canEditTeam` teams; type match/training/social with conditional fields (opponent/home/competition/score only for match).
- [ ] Test: `upsertEvent` inserts when there is no id and updates when there is; the form blocks submit when required fields are empty; team options are limited to editable teams; a Supabase error surfaces as a visible error message.
- [ ] Implement. Commit.

