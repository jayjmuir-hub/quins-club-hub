### Task 6: Auth gate + routing
**Files:** Modify `src/App.jsx`; create `src/components/RequireAuth.jsx`.
**Interfaces:** Logged-out → `Login`; logged-in → app shell. Handles the magic-link/OAuth redirect callback.
- [ ] Test: `RequireAuth` renders `Login` when there is no session, its children when a session is present, and a spinner while `loading`.
- [ ] Implement React Router (`BrowserRouter`) with protected routes; strip the `#access_token` fragment from the URL after Supabase consumes it. Commit.

