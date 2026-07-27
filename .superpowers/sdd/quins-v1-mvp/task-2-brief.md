### Task 2: Supabase client + connection smoke test
**Files:** Create `src/lib/supabase.js`, `tests/supabase.test.js`, `tests/supabase.integration.test.js`.
**Interfaces:** Produces `supabase` client. Consumes env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- [ ] Unit test first: module throws a clear error when env vars are missing; exports a client when they are present.
- [ ] Integration test (excluded from default run): selects `count` from `teams` and expects 15.
- [ ] Implement `createClient(url, anonKey)` from Vite env; export `supabase`.
- [ ] Run both; commit.

## Phase B — Auth & scope

