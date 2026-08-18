-- Lets the push-send Edge Function read the VAPID private key without a
-- second secret store.
--
-- Apply as migration `20260818xxxxxx push_vapid_key_rpc`.
-- Full reasoning: claude/plans/2026-08-18-push-notifications.md.
--
-- ══ WHY AN RPC RATHER THAN AN EDGE FUNCTION SECRET ══════════════════════
-- Every other secret this Edge Function set reads (`APPROVAL_NOTIFY_SECRET`,
-- `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) is an Edge Function
-- environment variable, set once via the Supabase dashboard or CLI — neither
-- of which this session has tooling access to. The VAPID private key already
-- lives in Vault (`push_vapid_private_key`), so rather than copy it into a
-- second secret store by hand, push-send fetches it the same way it already
-- fetches everything else it needs: a REST call with the service-role key.
--
-- ⚠️ `vault.decrypted_secrets` IS NOT REACHABLE THROUGH POSTGREST AT ALL —
-- it is in the `vault` schema, and PostgREST only exposes `public` (and, per
-- CLAUDE.md's own measurement elsewhere in this repo, NOT even `private` —
-- `private.squad_expects_gender` via REST answers 404). This function is the
-- one narrow door through: `public`, SECURITY DEFINER, and granted to
-- `service_role` alone.
--
-- ⚠️ EXECUTE IS REVOKED FROM EVERYONE ELSE, EXPLICITLY, AT CREATION —
-- the same lesson today's session drew from `register_my_player`: a new
-- function inherits an `anon`/`authenticated` grant from Supabase's default
-- privileges unless something revokes it, and an unexamined grant here would
-- let any signed-in member read the key that lets this app impersonate the
-- club to every push service on earth. `photo_backup_list_objects` is the
-- existing precedent for "service_role only" in this schema; this matches it.

begin;

create or replace function public.get_push_vapid_private_key()
 returns text
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_private_key';
$function$;

revoke all on function public.get_push_vapid_private_key() from public;
revoke all on function public.get_push_vapid_private_key() from anon;
revoke all on function public.get_push_vapid_private_key() from authenticated;
grant execute on function public.get_push_vapid_private_key() to service_role;

commit;
