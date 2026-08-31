-- 31 Aug 2026 — close the anon EXECUTE on public.document_push_subscriptions.
--
-- ⚠️ WHY 20260831_documents.sql DID NOT DO THIS, AND WHY THE REASONING WAS
-- WRONG. That migration's comment says "Reached by the edge function as
-- service_role, so NO grant changes (the 20260821 ruling: create or replace
-- preserves the ACL)". That ruling is true only for a function that ALREADY
-- EXISTS — replacing it keeps the proacl it had. document_push_subscriptions
-- was NEW, so there was no ACL to preserve and it was born with Supabase's
-- default `functions EXECUTE to PUBLIC/anon/authenticated`, exactly the trap
-- db/schema/grants.sql section 1 warns about.
--
-- Measured after applying 20260831_documents:
--   document_push_subscriptions  =X | postgres=X | anon=X | authenticated=X | service_role=X
-- against its five siblings, all identical to each other:
--   notice_/squad_/message_/approval_/availability_push_subscriptions
--                                postgres=X | service_role=X
--
-- It is SECURITY DEFINER and returns endpoint + p256dh + auth — the material
-- needed to push to a person's device. A document id is gen_random_uuid and
-- so not guessable, which is why this was a hole and not an active leak; the
-- gate was never meant to be the unguessability of the argument.
--
-- This restores the shape the other five already have.

revoke execute on function public.document_push_subscriptions(uuid) from public;
revoke execute on function public.document_push_subscriptions(uuid) from anon;
revoke execute on function public.document_push_subscriptions(uuid) from authenticated;
