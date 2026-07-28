### Task 16: Availability RSVPs + coach team-sheet
**Files:** Create `src/screens/Availability.jsx`; modify `src/data/availability.js` (`setAvailability(eventId, playerId, status)`).
**Interfaces:** Player/parent sets own (`is_own_player` via RLS); default "No response"; coach team-sheet lists all players with live In/Out/Maybe and can override; realtime updates.
- [ ] Test: `setAvailability` upserts one row on the `event_id,player_id` conflict target; the team sheet tallies In/Out/Maybe/No-response counts; a parent sees toggles only for their own children; an RLS error surfaces as a visible message.
- [ ] Implement; wire realtime so the coach sheet updates live. Commit.

## Phase F — Onboarding / admin

