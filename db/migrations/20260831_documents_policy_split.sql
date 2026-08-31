-- 31 Aug 2026 — the documents repo, review round 1: split the storage write
-- policy per command, and make update_document keep the key-prefix invariant.
--
-- Fixes three findings against 20260831_documents.sql, which is APPLIED and
-- must not be edited. This migration is the correction.
--
-- ══ 1. `FOR ALL` MADE THE ORPHAN PROPERTY A FALSE CLAIM ════════════════════
--
-- 20260831_documents.sql created ONE storage policy, "document write", as
-- `for all`. That reads as "write and delete", and it is not what Postgres
-- does: `for all` covers SELECT too, and its USING arm is the SELECT arm.
-- Policies OR together, so the bucket's SELECT set was
--
--     "document read"   (resolve through a documents row you may read)
--   OR "document write"'s USING (the PREFIX rule)
--
-- and the second arm ignores rows entirely. Consequence, exactly as reviewed:
-- a coach or manager of squad X could sign ANY object under `<X>/`, including
-- an ORPHAN with no documents row at all, and an admin could sign anything in
-- the bucket. The migration's own comment — "an orphan key is signable by
-- NOBODY, which is what makes the app's file-first upload order safe" — was
-- therefore false the moment it was applied. The upload order is only safe
-- while a half-finished upload is unreachable; a prefix-based SELECT arm
-- makes every failed upload readable by that squad's staff.
--
-- The fix is not to narrow the prefix rule — it is correct for WRITE — but to
-- stop it governing SELECT. Three policies replace the one, each naming the
-- command it is for, so no arm can leak into a command it was not written
-- for. SELECT on this bucket is now governed by "document read" ALONE, and
-- the orphan property is true again rather than merely documented.
--
-- ⚠️ THE GENERAL LESSON, WHICH IS NOT ABOUT THIS BUCKET: `for all` is not a
-- shorthand for "the write verbs". Two other buckets here use it
-- ("player photo write", "training diagram write") and the same question
-- should be asked of them by whoever next touches those — not here, because
-- neither is in this change's blast radius and both need their own reasoning
-- about whether a prefix-visible SELECT arm matters for a bucket of faces.
--
-- ══ 2. update_document COULD BREAK THE INVARIANT create_document ENFORCES ══
--
-- create_document refuses a squad-prefixed key whose squad is not one of the
-- targeted squads: "a coach could otherwise park a file under a squad the
-- document does not name". update_document had no such check, so the same
-- invariant could be broken a second later by RETARGETING: file it under
-- `<A>/` targeting [A], then update to target [B] only. Nothing in the RPC
-- objected, and the result is a document squad A no longer manages whose FILE
-- still sits under A's prefix — so A's coaches and managers keep object-level
-- update and delete authority over it through the prefix policies above,
-- while B's staff own the row. Authority over the row and authority over the
-- file had come apart.
--
-- update_document now requires, when the key is squad-prefixed and the
-- document is not being made club-wide, that the prefix squad remain among
-- the targets. The message is the user-facing one because a squad manager can
-- hit this legitimately by deselecting their own squad.
--
-- ⚠️ RESIDUAL, DELIBERATELY LEFT: the club-wide flip. An admin may set
-- club_wide on a document whose file lives under `<A>/`, and A's staff then
-- retain object-level authority over a document nobody would call theirs.
-- That path is admin-only, so it is a trusted actor's choice rather than an
-- escalation, and the alternative — moving the object — is a storage
-- operation an RPC cannot perform inside its own transaction. Fixing it means
-- a re-upload path, which is work nobody has asked for. Written down so the
-- next reader knows it was seen and not missed.
--
-- ══ 3. THE STRANDING FINDING IS NARROWED BY (2), NOT CLOSED ════════════════
--
-- ⚠️ THIS SECTION ORIGINALLY CLAIMED FULL CLOSURE AND A RE-REVIEW (31 Aug
-- 2026, same day) REFUTED IT — left corrected rather than deleted, because
-- the wrong argument is instructive. (2)'s guard guarantees the PREFIX
-- squad's staff always hold file authority. It does not make row-deleters
-- and file-deleters the same set: on a multi-squad document, any targeted
-- squad's staff may delete the row (can_manage_document — Jay ruled to keep
-- the spec's rule) without holding the prefix; and created_by keeps row
-- authority after their memberships lapse. Either arm can orphan a file.
-- Accepted: an orphan is invisible (no row; "document read" is the bucket's
-- only SELECT path) and costs only storage. ⚠️ MEASURED, second correction
-- (db/tests/rls-documents.sql 13d-13f): NO user JWT can remove an orphan —
-- not prefix staff, not admins — because DELETE ... WHERE applies SELECT
-- policies too, so invisibility and unclearability are the same fact. Only
-- service_role clears one; a sweeper in the photo-orphans style is the fix
-- if storage ever cares. Also named here because no header sentence
-- did: the guard has no admin bypass, so even an admin cannot retarget a
-- squad-filed document to a different squad — delete and re-upload is the
-- route, consistent with create_document.
--
-- ══ 4. `TO authenticated`, THE BUCKET CONVENTION ═══════════════════════════
--
-- Both original policies were created without a role list and so landed on
-- the default `to public`, which includes `anon`. The dominant convention for
-- private buckets here is explicit — "player photo read/write", "chat media
-- read/write/remove", "social idea image read/write/remove" are all
-- `to authenticated`. It changes no outcome today, because every predicate
-- below resolves auth.uid() and fails closed for an anonymous caller; it
-- removes the need for a reader to prove that a second time. In scope only
-- because these exact policies are being rewritten anyway.
--
-- ⚠️ A POLICY'S ROLE LIST CANNOT BE ALTERED. "document read" is dropped and
-- recreated with an IDENTICAL predicate for that reason alone.
--
-- ⚠️ NOT IN THIS MIGRATION: the table grant ceiling. `authenticated` also
-- holds INSERT and UPDATE on both documents tables from Supabase's birth
-- defaults, which is wider than 20260831_documents.sql's own comment claims
-- and is recorded as such in db/schema/grants.sql. Trimming it was scoped
-- into this change and then BLOCKED by the permission system before it could
-- be written or applied; it is deliberately absent rather than forgotten, and
-- it needs Jay's explicit go-ahead. It is not exploitable meanwhile: RLS is
-- on and there is no INSERT or UPDATE policy, so both verbs are already
-- denied to every non-owner role.

-- ── Storage policies, one per command ──────────────────────────────────────

-- READ: through a documents row you may read. NOW THE ONLY PERMISSIVE SELECT
-- POLICY MATCHING THIS BUCKET — that is the property, and it is checked from
-- pg_policy after applying, not assumed from this file.
drop policy if exists "document read" on storage.objects;
create policy "document read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_key = name
        and private.can_read_document(d.id)));

-- WRITE and DELETE: by PREFIX, not by row — the delete path removes the row
-- first, so file authority cannot depend on the row existing. The predicate
-- is unchanged from "document write"; only the commands it governs are.
drop policy if exists "document write" on storage.objects;

create policy "document insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      (split_part(name, '/', 1) = 'club' and private.is_admin_anywhere())
      or private.is_active_staff_of(private.document_key_team(name))
      or (private.document_key_team(name) is not null
          and private.is_admin_anywhere())));

-- USING and WITH CHECK both, per the 20260804_self_service_profile trap: a
-- USING-only UPDATE policy lets a row you may reach be renamed into a prefix
-- you may not.
create policy "document update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documents'
    and (
      (split_part(name, '/', 1) = 'club' and private.is_admin_anywhere())
      or private.is_active_staff_of(private.document_key_team(name))
      or (private.document_key_team(name) is not null
          and private.is_admin_anywhere())))
  with check (
    bucket_id = 'documents'
    and (
      (split_part(name, '/', 1) = 'club' and private.is_admin_anywhere())
      or private.is_active_staff_of(private.document_key_team(name))
      or (private.document_key_team(name) is not null
          and private.is_admin_anywhere())));

create policy "document delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      (split_part(name, '/', 1) = 'club' and private.is_admin_anywhere())
      or private.is_active_staff_of(private.document_key_team(name))
      or (private.document_key_team(name) is not null
          and private.is_admin_anywhere())));

-- ── update_document — now keeps the key-prefix invariant ───────────────────
-- ⚠️ WHAT IS NOT CHANGED: private.can_manage_document. The rule that ANY
-- targeted squad's staff may manage a multi-squad document is spec-mandated
-- and a human ruling on it is pending; this migration must not pre-empt it.
create or replace function public.update_document(
  _id uuid, _title text, _category text, _staff_only boolean,
  _club_wide boolean, _team_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _team uuid;
  _prefix_team uuid;
begin
  if not private.can_manage_document(_id) then
    raise exception 'Not your document to change.' using errcode = '42501';
  end if;

  if _club_wide then
    if not private.is_admin_anywhere() then
      raise exception 'Only an admin can make a document club-wide.'
        using errcode = '42501';
    end if;
  else
    if _team_ids is null or cardinality(_team_ids) = 0 then
      raise exception 'Choose at least one age group.' using errcode = '22023';
    end if;
    foreach _team in array _team_ids loop
      if not (private.is_admin_anywhere()
              or private.is_active_staff_of(_team)) then
        raise exception 'You can only target squads you staff.'
          using errcode = '42501';
      end if;
    end loop;

    -- The invariant create_document enforces at upload, held across a
    -- retarget: the squad whose prefix the FILE sits under must stay among
    -- the targets. Without this, a document can be moved to another squad
    -- while its file keeps the first squad's staff as its file owners — and
    -- the row's new owners could delete a row whose object they cannot reach.
    -- A `club/` key parses to null and is unaffected; so is a club-wide flip,
    -- which is admin-only and carries the residual noted in this file's
    -- header.
    select private.document_key_team(storage_key) into _prefix_team
      from documents where id = _id;
    if _prefix_team is not null and not (_prefix_team = any(_team_ids)) then
      raise exception
        'The targeted squads must keep the squad the file is stored under.'
        using errcode = '22023';
    end if;
  end if;

  update documents
     set title = trim(_title), category = _category,
         staff_only = _staff_only, club_wide = _club_wide
   where id = _id;

  delete from document_squads where document_id = _id;
  if not _club_wide then
    insert into document_squads (document_id, team_id)
    select _id, t from unnest(_team_ids) as t
    on conflict do nothing;
  end if;
end;
$function$;

-- create or replace preserves the ACL of an EXISTING function (the 20260821
-- ruling), and this one exists — so no grant lines. That reasoning is only
-- valid because the function is not new; it is the exact reasoning
-- 20260831_documents_push_acl.sql had to correct for a function that was.
