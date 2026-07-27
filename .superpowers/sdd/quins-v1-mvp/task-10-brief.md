### Task 10: Data-access modules
**Files:** Create `src/data/{events,players,availability}.js`, `tests/data.test.js`.
**Interfaces:** Produces `listEvents({teamIds, from, to})`, `listPlayers({teamIds})`, `getPlayerContact(playerId)`, `listAvailability(eventId)`, and realtime `subscribeEvents(cb)`, `subscribeAvailability(eventId, cb)`. All rely on RLS for scoping (no client-side secrets).
- [ ] Test with a mocked supabase client: each function builds the expected query (table, filters, ordering) and returns `data`; errors are thrown, not swallowed; `subscribe*` returns an unsubscribe function.
- [ ] Implement query modules + realtime channels. Commit.

