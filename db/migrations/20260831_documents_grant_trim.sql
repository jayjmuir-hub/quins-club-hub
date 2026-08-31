-- 31 Aug 2026 — close the grant ceiling on the documents tables.
--
-- Jay's ruling, same session as the feature landed: the tables were born
-- with Supabase's default INSERT/UPDATE grants to authenticated, while the
-- design routes every write through the SECURITY DEFINER RPCs and
-- deliberately has no INSERT or UPDATE policy. Not exploitable — RLS
-- refused the writes anyway — but the open grant is what would turn a
-- future policy mistake into writable tables, and the
-- 20260826_trim_grant_ceilings convention is to close doors nothing uses.
--
-- Proven in a rolled-back dry-run before applying:
--   * authenticated keeps SELECT and DELETE — the read and delete policies
--     still need them;
--   * the RPCs run as their owner (postgres), which retains INSERT via
--     ownership, so create_document / update_document are unaffected;
--   * anon holds nothing on either table (measured; no anon revoke needed).
--
-- ⚠️ DELIBERATELY NARROW: only the two verbs the migration's own comment
-- claimed were absent. REFERENCES and TRIGGER remain from birth defaults,
-- as they do on the league_teams-class tables — inert without DDL access,
-- and revoking them here would be a privilege change beyond what was
-- reviewed and ruled on. Measured after applying: authenticated holds
-- exactly DELETE, REFERENCES, SELECT, TRIGGER on both tables.

revoke insert, update on public.documents from authenticated;
revoke insert, update on public.document_squads from authenticated;
