-- 4 Sep 2026 — take EXECUTE away from `anon` on nine public functions created
-- 3–4 Sep 2026 (#684, #688, #689, #690), the same trap 20260813_revoke_anon_execute.sql
-- describes at length: Supabase's default privileges grant EXECUTE to `anon`
-- BY NAME, so the house pattern `revoke ... from public; grant ... to
-- authenticated` leaves anon in. Each of these needs `revoke ... from anon`.
--
-- Found by db/tests/grants.sql on 4 Sep 2026, the first time every harness was
-- run individually. Two more (senior_season_stats, _gaps) were fixed the same
-- day in 20260906_senior_season_stats.sql.
--
-- ⚠️ NOT REVOKED, ON PURPOSE (see the 13 Aug migration for why each is safe):
-- public.calendar_events_for_token(uuid) — the calendar feed, called with the
-- publishable key on behalf of Google/Apple Calendar; and
-- public.list_signup_squads() — the sign-up screen, before there is a session.
-- db/tests/grants.sql asserts BOTH directions.
--
-- Why revoking these nine cannot break anything: every one derives its effect
-- from auth.uid() (null for anon) or is gated inside on a membership; anon
-- already got nothing from them but an empty result or an exception.
--
-- Signatures measured from pg_get_function_identity_arguments on live, 4 Sep 2026.
revoke execute on function public.answer_callup(uuid, boolean)                     from anon;
revoke execute on function public.callup_candidates(uuid)                          from anon;
revoke execute on function public.competition_standings(uuid)                      from anon;
revoke execute on function public.end_callup(uuid)                                 from anon;
revoke execute on function public.event_clashes(uuid)                              from anon;
revoke execute on function public.import_season(uuid, jsonb, jsonb)                from anon;
revoke execute on function public.profiles_push_subscriptions(uuid[], text)        from anon;
revoke execute on function public.request_callup(uuid, uuid)                       from anon;
revoke execute on function public.results_push_subscriptions(uuid)                 from anon;

-- Anon has no USAGE on schema `private` (measured 4 Sep 2026), so the private.*
-- helpers that also carry the named grant are unreachable and are left alone —
-- the 13 Aug migration made the same call.
