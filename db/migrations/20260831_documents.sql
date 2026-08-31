-- 31 Aug 2026 — the documents repo: club distributes, age groups self-serve.
--
-- Spec: claude/plans/2026-08-31-documents-repo.md (Jay approved 31 Aug).
-- Plan: claude/plans/2026-08-31-documents-repo-implementation.md.
--
-- ══ ⚠️ A JUNCTION TABLE, AGAINST THE FAN-OUT PRECEDENT — DELIBERATELY ══════
--
-- 20260821_notice_multi_squad.sql chose fan-out rows over a junction table,
-- and the decision it cites (2026-08-05, events) reasons that team_id was
-- ALREADY the security boundary of an existing read path. Neither condition
-- holds here: documents are a NEW table with no read path to rewrite, and a
-- document has ONE file in storage — fanning out rows would mean N rows
-- sharing one storage_key, and "delete the document" becoming "delete the
-- last surviving sibling, then the file". The junction keeps one row per
-- document, one delete, one push. The precedent was read, not ignored.
--
-- ══ ⚠️ THE KEY CONVENTION IS LOAD-BEARING (staff-photos ruling) ════════════
--
--     club/<uuid>.<ext>        only admins may write under club/
--     <team_id>/<uuid>.<ext>   only that squad's coach/manager may write
--
-- A storage policy sees only a filename, so the first path segment IS the
-- write authority. private.document_key_team() parses it and fails CLOSED
-- (null) on any other shape, exactly as private.staff_photo_owner does.
--
-- ══ ⚠️ WRITES GO THROUGH RPCs, NOT POLICIES — set_my_photo's reason ════════
--
-- RLS grants access to ROWS, not COLUMNS. An update policy on documents
-- would let a squad manager repoint storage_key at ANOTHER document's file —
-- no policy violated anywhere, and the readers of their row would then sign
-- URLs for a file they were never granted. create_document and
-- update_document have hard-coded column lists; storage_key is set once at
-- creation and never updatable.

-- ── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id),
  title        text not null check (length(trim(title)) between 1 and 120),
  category     text not null check (category in
                 ('registration','fixtures','policies','coaching','other')),
  staff_only   boolean not null default true,
  club_wide    boolean not null default false,
  storage_key  text not null unique,
  file_name    text not null,
  file_size    bigint not null check (file_size > 0),
  content_type text not null,
  created_by   uuid not null references public.profiles(id),
  created_at   timestamptz not null default now()
);

comment on table public.documents is
  'The documents repo. staff_only=true limits reads to squad staff + admins; club_wide=true targets every squad, otherwise document_squads lists the targets. storage_key is immutable after creation (see update_document).';

create table if not exists public.document_squads (
  document_id uuid not null references public.documents(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  primary key (document_id, team_id)
);

create index if not exists document_squads_team_idx
  on public.document_squads (team_id);

alter table public.documents enable row level security;
alter table public.document_squads enable row level security;

-- ── The bucket ─────────────────────────────────────────────────────────────
-- PRIVATE, like every bucket in this app. Reads are signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 26214400, array[
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ── Key parsing: who may write under a prefix ──────────────────────────────
-- Called from storage RLS, so search_path is pinned regardless of volatility
-- (the ruling private.staff_photo_owner records). Fails CLOSED: a malformed
-- key yields null, null comparisons are never true.
create or replace function private.document_key_team(_key text)
returns uuid
language sql
immutable
set search_path to ''
as $function$
  select case
    when split_part(_key, '/', 1) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(_key, '/', 1)::uuid
  end;
$function$;

revoke execute on function private.document_key_team(text) from public;
revoke execute on function private.document_key_team(text) from anon;
grant execute on function private.document_key_team(text) to authenticated;

-- ── Membership predicates the policies compose ─────────────────────────────
-- Staff READ set includes medic (mirrors my_squad_staff); MANAGE set does
-- not — a medic reads staff documents, a coach or manager curates them.

create or replace function private.is_active_staff_of(_team uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from memberships m
    where m.profile_id = auth.uid()
      and m.team_id = _team
      and m.status = 'active'
      and m.role in ('coach','manager'));
$function$;

revoke execute on function private.is_active_staff_of(uuid) from public;
revoke execute on function private.is_active_staff_of(uuid) from anon;
grant execute on function private.is_active_staff_of(uuid) to authenticated;

create or replace function private.can_read_document(_doc uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from documents d
    where d.id = _doc
      and (
        private.is_admin_anywhere()
        or d.created_by = auth.uid()
        or (d.club_wide and exists (
              select 1 from memberships m
              where m.profile_id = auth.uid() and m.status = 'active'
                and (not d.staff_only
                     or m.role in ('coach','manager','medic'))))
        or (not d.club_wide and exists (
              select 1 from document_squads ds
              join memberships m
                on m.team_id = ds.team_id
               and m.profile_id = auth.uid()
               and m.status = 'active'
              where ds.document_id = _doc
                and (not d.staff_only
                     or m.role in ('coach','manager','medic'))))));
$function$;

revoke execute on function private.can_read_document(uuid) from public;
revoke execute on function private.can_read_document(uuid) from anon;
grant execute on function private.can_read_document(uuid) to authenticated;

create or replace function private.can_manage_document(_doc uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from documents d
    where d.id = _doc
      and (
        private.is_admin_anywhere()
        or d.created_by = auth.uid()
        or (not d.club_wide and exists (
              select 1 from document_squads ds
              where ds.document_id = _doc
                and private.is_active_staff_of(ds.team_id)))));
$function$;

revoke execute on function private.can_manage_document(uuid) from public;
revoke execute on function private.can_manage_document(uuid) from anon;
grant execute on function private.can_manage_document(uuid) to authenticated;

-- ── Table policies and grants ──────────────────────────────────────────────
-- select + delete only. INSERT and UPDATE have no policy and no grant on
-- purpose: they exist only through the RPCs below.

drop policy if exists "document read" on public.documents;
create policy "document read" on public.documents
  for select using (private.can_read_document(id));

drop policy if exists "document delete" on public.documents;
create policy "document delete" on public.documents
  for delete using (private.can_manage_document(id));

drop policy if exists "document squads read" on public.document_squads;
create policy "document squads read" on public.document_squads
  for select using (private.can_read_document(document_id));

grant select, delete on public.documents to authenticated;
grant select on public.document_squads to authenticated;

-- ── Storage policies ───────────────────────────────────────────────────────
-- READ: only through a documents row you can read — an orphan key (file
-- uploaded, row insert failed) is signable by NOBODY, which is what makes
-- the app's file-first upload order safe.
drop policy if exists "document read" on storage.objects;
create policy "document read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.storage_key = name
        and private.can_read_document(d.id)));

-- WRITE and DELETE: by PREFIX, not by row — the delete path removes the row
-- first, so file authority cannot depend on the row existing. with check as
-- well as using, per the 20260804_self_service_profile trap: using alone
-- lets anyone insert into another prefix.
drop policy if exists "document write" on storage.objects;
create policy "document write" on storage.objects
  for all
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

-- ── create_document ────────────────────────────────────────────────────────
create or replace function public.create_document(
  _title text, _category text, _staff_only boolean, _club_wide boolean,
  _team_ids uuid[], _storage_key text, _file_name text, _file_size bigint,
  _content_type text, _notify boolean default false)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _doc uuid;
  _club uuid;
  _team uuid;
  _prefix_team uuid;
  _endpoint text;
  _secret text;
begin
  select club_id into _club from teams order by sort_order limit 1;

  if _club_wide then
    if not private.is_admin_anywhere() then
      raise exception 'Only an admin can publish a club-wide document.'
        using errcode = '42501';
    end if;
  else
    if _team_ids is null or cardinality(_team_ids) = 0 then
      raise exception 'Choose at least one age group.' using errcode = '22023';
    end if;
    foreach _team in array _team_ids loop
      if not (private.is_admin_anywhere()
              or private.is_active_staff_of(_team)) then
        raise exception 'You can only publish to squads you staff.'
          using errcode = '42501';
      end if;
    end loop;
  end if;

  -- The key's prefix must be an authority the CALLER holds and, for a
  -- squad-prefixed key, one of the targeted squads — otherwise a coach
  -- could park a file under a squad the document does not name.
  _prefix_team := private.document_key_team(_storage_key);
  if split_part(_storage_key, '/', 1) = 'club' then
    if not private.is_admin_anywhere() then
      raise exception 'Only an admin can file under club/.'
        using errcode = '42501';
    end if;
  elsif _prefix_team is null
     or (not _club_wide and not (_prefix_team = any(_team_ids))) then
    raise exception 'The storage key must live under club/ or a targeted squad.'
      using errcode = '22023';
  end if;

  insert into documents (club_id, title, category, staff_only, club_wide,
                         storage_key, file_name, file_size, content_type,
                         created_by)
  values (_club, trim(_title), _category, _staff_only, _club_wide,
          _storage_key, _file_name, _file_size, _content_type, auth.uid())
  returning id into _doc;

  if not _club_wide then
    insert into document_squads (document_id, team_id)
    select _doc, distinct_team from unnest(_team_ids) as distinct_team
    on conflict do nothing;
  end if;

  -- Optional push. Same vault plumbing as private.notify_notice_push; a
  -- push that cannot be sent must never fail the upload.
  if _notify then
    select decrypted_secret into _endpoint
      from vault.decrypted_secrets where name = 'push_notify_url';
    select decrypted_secret into _secret
      from vault.decrypted_secrets where name = 'approval_notify_secret';
    if _endpoint is null or _secret is null then
      raise warning 'create_document: vault secrets missing, no push sent';
    else
      begin
        perform net.http_post(
          url     := _endpoint,
          headers := jsonb_build_object('Content-Type', 'application/json',
                                        'x-approval-secret', _secret),
          body    := jsonb_build_object('document_id', _doc));
      exception when others then
        raise warning 'create_document push: % (document %)', sqlerrm, _doc;
      end;
    end if;
  end if;

  return _doc;
end;
$function$;

revoke execute on function public.create_document(text,text,boolean,boolean,uuid[],text,text,bigint,text,boolean) from public;
revoke execute on function public.create_document(text,text,boolean,boolean,uuid[],text,text,bigint,text,boolean) from anon;
grant execute on function public.create_document(text,text,boolean,boolean,uuid[],text,text,bigint,text,boolean) to authenticated;

-- ── update_document — metadata only, storage_key untouchable ──────────────
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

revoke execute on function public.update_document(uuid,text,text,boolean,boolean,uuid[]) from public;
revoke execute on function public.update_document(uuid,text,text,boolean,boolean,uuid[]) from anon;
grant execute on function public.update_document(uuid,text,text,boolean,boolean,uuid[]) to authenticated;

-- ── Push audience (Task 8 wires the edge branch) ───────────────────────────
-- distinct: a person in two targeted squads is pushed once (the
-- notice_multi_squad lesson). Uploader excluded; 'document' opt-out
-- respected. Reached by the edge function as service_role, so NO grant
-- changes (the 20260821 ruling: create or replace preserves the ACL).
create or replace function public.document_push_subscriptions(_document uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with doc as (select * from documents where id = _document),
  people as (
    select distinct m.profile_id
      from doc d
      join memberships m
        on m.status = 'active'
       and (d.club_wide
            or m.team_id in (select team_id from document_squads
                              where document_id = d.id))
     where (not d.staff_only or m.role in ('coach','manager','medic')))
  select s.id, s.endpoint, s.p256dh, s.auth
    from people p
    join push_subscriptions s on s.profile_id = p.profile_id
    cross join doc d
   where p.profile_id <> d.created_by
     and not exists (
       select 1 from notification_opt_outs o
        where o.profile_id = p.profile_id and o.category = 'document');
$function$;

-- ── The 'document' opt-out category ────────────────────────────────────────
-- ⚠️ tests/notification-categories.test.js demands the FULL current list be
-- restated in the migration that changes it. This is that restatement.
--
-- ⚠️ The list below was READ FROM PRODUCTION on 31 Aug 2026
-- (`select pg_get_constraintdef(oid) from pg_constraint where conname =
-- 'notification_opt_outs_category_check'`) and is NOT the list the plan
-- guessed: production has 'availability', not 'availability_nudge'. The
-- database is the authority; a guessed list would have silently dropped a
-- live category from the constraint.
alter table public.notification_opt_outs
  drop constraint if exists notification_opt_outs_category_check;
alter table public.notification_opt_outs
  add constraint notification_opt_outs_category_check
  check (category in ('feedback_reply','notice','fixture','approval',
                      'availability','squad_chat','direct_messages',
                      'document'));
