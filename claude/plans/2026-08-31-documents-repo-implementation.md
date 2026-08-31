# Documents Repo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: BUILT — awaiting merge (PR #588).** All nine tasks executed 31
Aug 2026 with per-task review, plus a whole-branch review and its fix round;
migrations and push-send v13 already live. The approved spec is
`claude/plans/2026-08-31-documents-repo.md` (merged as `1b7c59a`).
Every task box below is ticked except Task 9 Step 5, which is the post-merge
live verification and has not happened — see the note there, and the iPhone
check it now carries.

## Deviations recorded at final review

⚠️ **TWO SPEC DETAILS WERE DROPPED DURING THE BUILD AND NEITHER WAS WRITTEN
DOWN UNTIL NOW.** Both are deliberate and both are small, but an undocumented
omission reads as an oversight to the next person, who then "fixes" it.

1. **The uploader's name is NOT shown on a document row.** `listDocuments`
   selects `created_by` and the screen never renders it — the row shows title,
   category, audience, size and date only. Kept lean on purpose: the row is
   already three lines on a phone, and "who uploaded it" is the least useful of
   the candidates for a fourth. ⚠️ **`created_by` is still load-bearing and must
   not be dropped from the select** — it drives the delete gate
   (`mayDeleteDocument`'s uploader arm) and the push audience's uploader
   exclusion. To add the name later you need a join to `profiles`, not just the
   existing column.

2. **A document push deep-links to bare `/documents`, without highlighting the
   document it announced.** Tapping the notification lands on the list, and the
   member finds the new file at the top because the list is newest-first. The
   route accepts no anchor or query today, so highlighting would mean teaching
   `/documents` to read one and scroll to a row — real work for a feature whose
   list is short. Recorded so that "the push doesn't take you to the document"
   is understood as a known cut rather than a bug.

**Goal:** A documents repo — the club distributes files to age groups, squad
staff save their own — with two visibility tiers, multi-squad targeting,
optional push, all enforced by RLS.

**Architecture:** One private Supabase Storage bucket (`documents`) whose key
prefixes carry write authority, plus `documents`/`document_squads` metadata
tables. Writes go through SECURITY DEFINER RPCs (the `set_my_photo` pattern —
RLS grants rows, not columns); reads are RLS-gated rows plus short-lived
signed URLs. Two UI doors: a member-facing `/documents` screen and a
staff-facing section in Squad Hub.

**Tech Stack:** Vite + React, Supabase (Postgres 17 + Storage + edge
functions), vitest. No new dependencies — do not touch `package.json`.

## Global Constraints

- **Never `git add -A`** — stage the exact paths each task names.
- **This repo is PUBLIC and its members are mostly children.** No real
  person's name in any file, fixture, comment, or migration header — invent
  names, keep the shape (CLAUDE.md rule 9). No personal-provider mailboxes in
  code (`docs:check` enforces).
- **`main` is production.** Every task commits to the feature branch
  `feat/documents-repo`; nothing merges without Jay's explicit yes.
- **Commit before injecting any fault** (CLAUDE.md rule 6).
- **DB changes run against production** — there is no branch database. Every
  migration is first executed inside `begin; … rollback;` via the Supabase
  MCP `execute_sql`, and only then applied with `apply_migration`. This is
  the exact step that caught `min(uuid)` not existing before it became a
  broken live trigger (see `20260821_notice_multi_squad.sql`).
- **After any migration**, re-capture `db/schema/` (tables, policies,
  functions, grants, triggers) — `docs:check` rule 7 fails the build if a
  table grant is not represented in `db/schema/grants.sql`.
- **Feedback loop:** `npm run test:related -- <file>` (~5s) while working;
  `npm test` (~40s) only before push. `npm install --include=dev` if node
  modules are missing.
- Categories are exactly: `registration`, `fixtures`, `policies`,
  `coaching`, `other` (labels in Task 3). Staff-only READ role set is
  `('coach','manager','medic')`; UPLOAD/manage role set is
  `('coach','manager')` — medics read staff docs but don't manage them.
- Max file size 25 MB (`26214400` bytes); allowed types: PDF, Word, Excel,
  PowerPoint, JPEG/PNG/WebP.

---

### Task 0: Branch

- [x] **Step 1: Create the branch — in a worktree, not the shared clone.**
Two sessions have already collided in the shared cafnet tree; use the
`superpowers:using-git-worktrees` skill, or plainly:

```bash
git fetch origin
git worktree add ../quins-documents-repo -b feat/documents-repo origin/main
cd ../quins-documents-repo
npm install --include=dev
```

Copy `.env` from the main clone (it holds only the public URL and
publishable key).

---

### Task 1: Database migration

**Files:**
- Create: `db/migrations/20260831_documents.sql`
- Modify (Task 1 only re-captures; see Step 5): `db/schema/tables.sql`,
  `db/schema/policies.sql`, `db/schema/functions.sql`, `db/schema/grants.sql`

**Interfaces:**
- Produces (later tasks call these): `public.create_document(_title text,
  _category text, _staff_only boolean, _club_wide boolean, _team_ids uuid[],
  _storage_key text, _file_name text, _file_size bigint, _content_type text,
  _notify boolean) returns uuid`; `public.update_document(_id uuid, _title
  text, _category text, _staff_only boolean, _club_wide boolean, _team_ids
  uuid[]) returns void`; RLS-gated `select` on `documents` (embed
  `document_squads(team_id)`); RLS-gated `delete` on `documents`; storage
  bucket `documents` with read/write/delete policies;
  `public.document_push_subscriptions(_document uuid)` for Task 8.

- [x] **Step 1: Write the migration file.** Complete content:

```sql
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
alter table public.notification_opt_outs
  drop constraint if exists notification_opt_outs_category_check;
alter table public.notification_opt_outs
  add constraint notification_opt_outs_category_check
  check (category in ('notice','squad_chat','direct_messages','fixture',
                      'feedback_reply','availability_nudge','approval',
                      'document'));
```

⚠️ Before writing the constraint restatement above, read the CURRENT
constraint from production (`select pg_get_constraintdef(oid) from
pg_constraint where conname = 'notification_opt_outs_category_check'`) and
copy its exact list plus `'document'` — the list shown here was read from
`src/data/notificationPreferences.js` on 31 Aug and the database is the
authority. `tests/notification-categories.test.js` goes red if they drift.

- [x] **Step 2: Dry-run the whole migration inside a rolled-back
transaction.** Via the Supabase MCP `execute_sql`, run the entire file
wrapped in `begin;` … `rollback;`. Expected: completes with no error.
Any error here (a missing helper name, a type mismatch, `min(uuid)`-class
surprises) is a bug found for free.

- [x] **Step 3: Prove the rollback rolled back.** Still via `execute_sql`:
`select count(*) from information_schema.tables where table_name = 'documents'`
→ expected `0`, WITH the control
`select count(*) from information_schema.tables where table_name = 'announcements'`
→ expected `1` (proves the probe can see real tables).

- [x] **Step 4: Apply.** Supabase MCP `apply_migration` with name
`20260831_documents` and the file's content. Expected: success.

- [x] **Step 5: Re-capture `db/schema/`.** Follow the procedure at the top
of `db/schema/tables.sql` (each capture file documents its own query).
The new tables, policies, functions, and the two `grant` lines must appear.
Run `npm run docs:check` — expected: all green, including "table and column
grants captured".

- [x] **Step 6: Commit.**

```bash
git add db/migrations/20260831_documents.sql db/schema/tables.sql db/schema/policies.sql db/schema/functions.sql db/schema/grants.sql
git commit -m "feat(db): documents repo — tables, bucket, RLS, RPCs, push audience"
```

---

### Task 2: RLS harness

**Files:**
- Create: `db/tests/rls-documents.sql`

**Interfaces:**
- Consumes: everything Task 1 created.
- Produces: a harness `npm run db:check` runs; nothing imports it.

- [x] **Step 1: Write the harness**, copying the exact shape of
`db/tests/rls-social-upload.sql` (temp `_r` table, `set local role
authenticated` + `request.jwt.claims` per persona, the self-test `do` block
that raises on FAIL or on zero steps, `rollback` at the end, and a
fault-injection appendix). Personas (invented names, rule 9):

| Persona | Fixture |
|---|---|
| ADMIN | active `admin` membership |
| COACH1 | active `coach` on team T1 |
| MEDIC1 | active `medic` on T1 |
| PARENT1 | active `parent` on T1 (with a disposable probe child, per the `memberships_family_role_needs_player` trap the social harness documents) |
| PARENT2 | active `parent` on team T2 |
| PENDING | `parent` membership with `status='pending'` on T1 |

Fixtures: one members-tier document targeted at T1, one staff-only document
targeted at T1, one club-wide members-tier document — created via
`public.create_document` as ADMIN/COACH1 (which also exercises the RPC
paths). The probes, each `insert into _r` PASS/FAIL:

1. PARENT1 reads the T1 members-tier doc → ALLOWED (control — proves the
   probe can see something).
2. PARENT1 reads the T1 staff-only doc → REFUSED (0 rows from select).
3. PARENT2 reads either T1 doc → REFUSED.
4. PENDING reads anything → REFUSED (0 rows total).
5. MEDIC1 reads the T1 staff-only doc → ALLOWED.
6. COACH1 calls `create_document` targeting T2 (not staffed) → REFUSED
   (exception `42501`).
7. PARENT1 calls `create_document` for T1 → REFUSED.
8. COACH1 inserts into `storage.objects` under `club/` → REFUSED; under
   T1's prefix → ALLOWED; under T2's prefix → REFUSED.
9. PARENT2 deletes the T1 members doc → REFUSED (0 rows deleted); COACH1
   deletes it → ALLOWED.
10. Control: the `staff photo write` policy still exists (the
    wrong-bucket-fix canary, same as the social harness's step 4).

- [x] **Step 2: Run it and watch it pass.** `npm run db:check` (see
`claude/runbooks/db-harnesses.md`). Expected: `SELF-TEST PASSED` for
`rls-documents` and every other harness still green.

- [x] **Step 3: Commit, THEN inject the fault** (rule 6 — commit first).

```bash
git add db/tests/rls-documents.sql
git commit -m "test(db): documents RLS harness — tiers, targeting, prefixes"
```

Fault: inside a `begin;`/`rollback;` via `execute_sql`, replace
`private.can_read_document` with a body that drops the `staff_only` arm
(returns true for any active member of a targeted squad), re-run probes 1,
2, 5. Expected: probe 2 flips to FAIL, 1 and 5 stay green. If probe 2 stays
green, the harness is not testing the tier — fix the harness before
believing the policy. Record the injection's result in the harness's
appendix comment.

---

### Task 3: Pure helpers — `src/lib/documents.js`

**Files:**
- Create: `src/lib/documents.js`
- Test: `tests/documents-lib.test.js`

**Interfaces:**
- Consumes: `isAdmin`, `isActiveMembership` from `src/lib/scope.js`.
- Produces: `DOCUMENT_CATEGORIES` (array of `{key, label}`),
  `MAX_DOCUMENT_BYTES` (26214400), `ACCEPTED_DOCUMENT_TYPES` (object:
  mime → extension), `documentAccept()` (comma-joined accept attr),
  `validateDocumentFile(file) → string | null`,
  `canUploadDocuments(memberships) → boolean`,
  `uploadableTeamIds(memberships) → string[]`,
  `filterDocuments(docs, {category, teamId}) → docs`.

- [x] **Step 1: Write the failing tests** (`tests/documents-lib.test.js`):

```js
import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES, validateDocumentFile,
  canUploadDocuments, uploadableTeamIds, filterDocuments,
} from '../src/lib/documents.js'

const active = (role, teamId) => ({ role, team_id: teamId, status: 'active' })

describe('documents lib', () => {
  it('has the five agreed categories in order', () => {
    expect(DOCUMENT_CATEGORIES.map((c) => c.key)).toEqual(
      ['registration', 'fixtures', 'policies', 'coaching', 'other'])
  })

  it('rejects an oversized file with a friendly message', () => {
    const file = { name: 'huge.pdf', type: 'application/pdf',
                   size: MAX_DOCUMENT_BYTES + 1 }
    expect(validateDocumentFile(file)).toMatch(/25 MB/)
  })

  it('rejects a type the bucket would refuse, BEFORE the upload', () => {
    const file = { name: 'movie.mp4', type: 'video/mp4', size: 1000 }
    expect(validateDocumentFile(file)).toMatch(/PDF/)
  })

  it('accepts a PDF under the limit', () => {
    const file = { name: 'pack.pdf', type: 'application/pdf', size: 1000 }
    expect(validateDocumentFile(file)).toBeNull()
  })

  it('lets admins and squad staff upload; parents and pending staff not', () => {
    expect(canUploadDocuments([active('admin', null)])).toBe(true)
    expect(canUploadDocuments([active('coach', 't1')])).toBe(true)
    expect(canUploadDocuments([active('manager', 't1')])).toBe(true)
    expect(canUploadDocuments([active('medic', 't1')])).toBe(false)
    expect(canUploadDocuments([active('parent', 't1')])).toBe(false)
    expect(canUploadDocuments([{ role: 'coach', team_id: 't1',
      status: 'pending' }])).toBe(false)
  })

  it('uploadableTeamIds lists only actively staffed squads', () => {
    expect(uploadableTeamIds([
      active('coach', 't1'), active('parent', 't2'),
      { role: 'manager', team_id: 't3', status: 'pending' },
    ])).toEqual(['t1'])
  })

  it('filterDocuments narrows by category and squad', () => {
    const docs = [
      { id: 'a', category: 'policies', club_wide: true, document_squads: [] },
      { id: 'b', category: 'coaching', club_wide: false,
        document_squads: [{ team_id: 't1' }] },
    ]
    expect(filterDocuments(docs, {}).map((d) => d.id)).toEqual(['a', 'b'])
    expect(filterDocuments(docs, { category: 'coaching' })
      .map((d) => d.id)).toEqual(['b'])
    // A club-wide document belongs to EVERY squad filter.
    expect(filterDocuments(docs, { teamId: 't1' })
      .map((d) => d.id)).toEqual(['a', 'b'])
    expect(filterDocuments(docs, { teamId: 't2' })
      .map((d) => d.id)).toEqual(['a'])
  })
})
```

- [x] **Step 2: Run to verify failure.**
`npm run test:related -- tests/documents-lib.test.js`
Expected: FAIL — cannot resolve `src/lib/documents.js`.

- [x] **Step 3: Implement** (`src/lib/documents.js`):

```js
// Pure helpers for the documents repo. Everything permission-shaped here is
// a UI convenience ONLY — RLS is the enforcement (see
// db/migrations/20260831_documents.sql). Spec:
// claude/plans/2026-08-31-documents-repo.md.
import { isActiveMembership, isAdmin } from './scope'

export const DOCUMENT_CATEGORIES = [
  { key: 'registration', label: 'Registration' },
  { key: 'fixtures', label: 'Fixtures & Festivals' },
  { key: 'policies', label: 'Policies' },
  { key: 'coaching', label: 'Coaching' },
  { key: 'other', label: 'Other' },
]

export const MAX_DOCUMENT_BYTES = 26214400 // 25 MB — mirrors the bucket limit

// Mirrors the bucket's allowed_mime_types EXACTLY. A mismatch fails ugly:
// the storage API refuses with a raw error after the picker allowed it.
export const ACCEPTED_DOCUMENT_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function documentAccept() {
  return Object.keys(ACCEPTED_DOCUMENT_TYPES).join(',')
}

export function validateDocumentFile(file) {
  if (!file) return 'Choose a file first.'
  if (!ACCEPTED_DOCUMENT_TYPES[file.type]) {
    return 'That file type is not supported — use a PDF, Office document, or image.'
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return 'That file is over the 25 MB limit.'
  }
  return null
}

const UPLOAD_ROLES = new Set(['coach', 'manager'])

export function canUploadDocuments(memberships) {
  return isAdmin(memberships) || uploadableTeamIds(memberships).length > 0
}

export function uploadableTeamIds(memberships) {
  return (memberships ?? [])
    .filter((m) => isActiveMembership(m) && UPLOAD_ROLES.has(m.role) && m.team_id)
    .map((m) => m.team_id)
}

export function filterDocuments(docs, { category, teamId } = {}) {
  return (docs ?? []).filter((doc) => {
    if (category && doc.category !== category) return false
    if (teamId && !doc.club_wide
        && !(doc.document_squads ?? []).some((s) => s.team_id === teamId)) {
      return false
    }
    return true
  })
}
```

⚠️ Check `isActiveMembership`'s actual predicate at `src/lib/scope.js:95`
before leaning on it — if it checks a different field than `status`, adjust
the test fixtures, not the helper.

- [x] **Step 4: Run to verify pass.**
`npm run test:related -- tests/documents-lib.test.js` — expected: PASS.

- [x] **Step 5: Commit.**

```bash
git add src/lib/documents.js tests/documents-lib.test.js
git commit -m "feat(lib): documents pure helpers — categories, validation, upload scope"
```

---

### Task 4: Data layer — `src/data/documents.js`

**Files:**
- Create: `src/data/documents.js`
- Test: `tests/documents-data.test.js`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.js`;
  `ACCEPTED_DOCUMENT_TYPES` from Task 3; RPCs from Task 1.
- Produces: `listDocuments()`, `uploadDocument({file, title, category,
  staffOnly, clubWide, teamIds, prefixTeamId, notify})`,
  `signDocumentUrl(storageKey)`, `deleteDocument({id, storageKey})`,
  `updateDocument({id, title, category, staffOnly, clubWide, teamIds})`.

- [x] **Step 1: Write the failing tests** (`tests/documents-data.test.js`),
copying the chainable-and-thenable `createQueryBuilder` mock strategy from
the top of `tests/data.test.js` (read its header comment — a mock that is
only chainable OR only thenable passes for the wrong reasons):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  listDocuments, uploadDocument, deleteDocument,
} from '../src/data/documents.js'

function createQueryBuilder(result = { data: [], error: null }) {
  const builder = {}
  for (const method of ['select', 'order', 'delete', 'eq']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve) => resolve(result)
  return builder
}

function storageBucket() {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue(
      { data: { signedUrl: 'https://signed' }, error: null }),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('listDocuments', () => {
  it('selects documents with their squads, newest first', async () => {
    const builder = createQueryBuilder()
    supabase.from.mockReturnValue(builder)
    await listDocuments()
    expect(supabase.from).toHaveBeenCalledWith('documents')
    expect(builder.select).toHaveBeenCalledWith(
      expect.stringContaining('document_squads'))
    expect(builder.order).toHaveBeenCalledWith(
      'created_at', { ascending: false })
  })
})

describe('uploadDocument', () => {
  const file = { name: 'pack.pdf', type: 'application/pdf', size: 10 }

  it('uploads file first, then creates the row via the RPC', async () => {
    const bucket = storageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    supabase.rpc.mockResolvedValue({ data: 'doc-1', error: null })
    await uploadDocument({ file, title: 'Pack', category: 'registration',
      staffOnly: true, clubWide: false, teamIds: ['t1'], prefixTeamId: 't1' })
    expect(supabase.storage.from).toHaveBeenCalledWith('documents')
    const key = bucket.upload.mock.calls[0][0]
    expect(key).toMatch(/^t1\/[0-9a-f-]{36}\.pdf$/)
    expect(supabase.rpc).toHaveBeenCalledWith('create_document',
      expect.objectContaining({ _storage_key: key, _title: 'Pack' }))
  })

  it('files a club-wide upload under club/', async () => {
    const bucket = storageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    supabase.rpc.mockResolvedValue({ data: 'doc-1', error: null })
    await uploadDocument({ file, title: 'Code of conduct',
      category: 'policies', staffOnly: false, clubWide: true, teamIds: [] })
    expect(bucket.upload.mock.calls[0][0]).toMatch(/^club\//)
  })

  it('removes the orphan file when the row insert fails, then throws', async () => {
    const bucket = storageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    supabase.rpc.mockResolvedValue({ data: null,
      error: new Error('refused') })
    await expect(uploadDocument({ file, title: 'Pack',
      category: 'registration', staffOnly: true, clubWide: false,
      teamIds: ['t1'], prefixTeamId: 't1' })).rejects.toThrow('refused')
    expect(bucket.remove).toHaveBeenCalledWith(
      [bucket.upload.mock.calls[0][0]])
  })
})

describe('deleteDocument', () => {
  it('deletes the row FIRST, then best-effort removes the file', async () => {
    const order = []
    const builder = createQueryBuilder({ data: null, error: null })
    builder.delete = vi.fn(() => { order.push('row'); return builder })
    supabase.from.mockReturnValue(builder)
    const bucket = storageBucket()
    bucket.remove = vi.fn(() => { order.push('file')
      return Promise.resolve({ error: null }) })
    supabase.storage.from.mockReturnValue(bucket)
    await deleteDocument({ id: 'doc-1', storageKey: 't1/x.pdf' })
    expect(order).toEqual(['row', 'file'])
  })

  it('a failed file removal does not throw — the orphan is invisible', async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const bucket = storageBucket()
    bucket.remove = vi.fn().mockRejectedValue(new Error('storage down'))
    supabase.storage.from.mockReturnValue(bucket)
    await expect(deleteDocument({ id: 'doc-1', storageKey: 't1/x.pdf' }))
      .resolves.not.toThrow()
  })
})
```

- [x] **Step 2: Run to verify failure.**
`npm run test:related -- tests/documents-data.test.js` — expected: FAIL,
module not found.

- [x] **Step 3: Implement** (`src/data/documents.js`):

```js
// Data access for the documents repo. RLS scopes every read server-side;
// writes go through the create/update RPCs, never table inserts (see
// db/migrations/20260831_documents.sql for why). Upload order is FILE
// FIRST, then row — an orphaned file is signable by nobody, while a row
// without a file is a broken link on every reader's screen.
import { supabase } from '../lib/supabase'
import { ACCEPTED_DOCUMENT_TYPES } from '../lib/documents'

export const DOCUMENT_BUCKET = 'documents'
const SIGNED_URL_SECONDS = 600

const SELECT = 'id, title, category, staff_only, club_wide, storage_key, '
  + 'file_name, file_size, content_type, created_by, created_at, '
  + 'document_squads ( team_id )'

export async function listDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function uploadDocument({
  file, title, category, staffOnly, clubWide, teamIds, prefixTeamId, notify,
}) {
  const extension = ACCEPTED_DOCUMENT_TYPES[file.type] ?? 'bin'
  const prefix = clubWide ? 'club' : prefixTeamId
  if (!prefix) throw new Error('uploadDocument needs a prefix team.')
  const key = `${prefix}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase.rpc('create_document', {
    _title: title,
    _category: category,
    _staff_only: staffOnly,
    _club_wide: clubWide,
    _team_ids: clubWide ? [] : teamIds,
    _storage_key: key,
    _file_name: file.name,
    _file_size: file.size,
    _content_type: file.type,
    _notify: Boolean(notify),
  })
  if (error) {
    // Best-effort orphan cleanup — the file is invisible without a row,
    // so a failed cleanup costs storage, not correctness.
    try { await supabase.storage.from(DOCUMENT_BUCKET).remove([key]) }
    catch { /* retention is the storage card's problem, not this upload's */ }
    throw error
  }
  return data
}

export async function signDocumentUrl(storageKey) {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(storageKey, SIGNED_URL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

export async function deleteDocument({ id, storageKey }) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
  try { await supabase.storage.from(DOCUMENT_BUCKET).remove([storageKey]) }
  catch { /* row is gone; the orphan appears on no screen */ }
}

export async function updateDocument({
  id, title, category, staffOnly, clubWide, teamIds,
}) {
  const { error } = await supabase.rpc('update_document', {
    _id: id,
    _title: title,
    _category: category,
    _staff_only: staffOnly,
    _club_wide: clubWide,
    _team_ids: clubWide ? [] : teamIds,
  })
  if (error) throw error
}
```

- [x] **Step 4: Run to verify pass.**
`npm run test:related -- tests/documents-data.test.js` — expected: PASS.

- [x] **Step 5: Commit.**

```bash
git add src/data/documents.js tests/documents-data.test.js
git commit -m "feat(data): documents — list, file-first upload, sign, row-first delete"
```

---

### Task 5: Upload sheet — `src/components/DocumentUploadSheet.jsx`

**Files:**
- Create: `src/components/DocumentUploadSheet.jsx`
- Test: `tests/document-upload-sheet.test.jsx`

**Interfaces:**
- Consumes: `Sheet({ open, onClose, title, children })`, `Button`,
  `uploadDocument` (Task 4), `validateDocumentFile`, `documentAccept`,
  `DOCUMENT_CATEGORIES`, `uploadableTeamIds` (Task 3),
  `friendlyMessage(err, fallback)` from `src/lib/friendlyError.js`,
  `isAdmin` from `src/lib/scope.js`.
- Produces: `export default function DocumentUploadSheet({ open, onClose,
  teams, memberships, fixedTeamId, onUploaded })` — `teams` is the
  club team list; `fixedTeamId` (Squad Hub door) locks targeting to one
  squad and hides the picker; `onUploaded()` fires after success.

Behavioural contract (mirror `NoticeComposer` decisions — read its header
comments before writing):
- Tier defaults to **staff-only** (the spec's deliberate lazy-safe default).
- Notify tick defaults **off**.
- Non-admins: squad picker shows only `uploadableTeamIds(memberships)`
  squads; the whole-club switch is not rendered at all.
- Admins: multi-select squad checkboxes plus a separate whole-club switch
  that greys the squad checkboxes out (a separate flag, NOT a member of the
  picked set — the NoticeComposer ruling against expressing "whole club AND
  U12").
- Nothing chosen blocks submit; it never silently widens.
- `validateDocumentFile` runs on pick; its message renders inline and blocks
  submit.
- Submit calls `uploadDocument` with `prefixTeamId` = `fixedTeamId` ??
  first picked squad the caller staffs ?? first picked squad (admins);
  errors render via `friendlyMessage(err, 'Could not upload that document.')`
  — never the raw error.

- [x] **Step 1: Write the failing tests** — render with
`@testing-library/react` the way `tests/notice-composer.test.jsx` does
(read it first and copy its render/provider scaffolding). Cases:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const uploadDocumentMock = vi.fn().mockResolvedValue('doc-1')
vi.mock('../src/data/documents.js', () => ({
  uploadDocument: (...args) => uploadDocumentMock(...args),
}))

import DocumentUploadSheet from '../src/components/DocumentUploadSheet.jsx'

const TEAMS = [{ id: 't1', name: 'U12' }, { id: 't2', name: 'U14' }]
const coach = [{ role: 'coach', team_id: 't1', status: 'active' }]
const admin = [{ role: 'admin', team_id: null, status: 'active' }]

function pdf(name = 'pack.pdf') {
  return new File(['x'], name, { type: 'application/pdf' })
}

beforeEach(() => uploadDocumentMock.mockClear())

describe('DocumentUploadSheet', () => {
  it('defaults the tier to staff-only', () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} />)
    expect(screen.getByLabelText(/staff only/i)).toBeChecked()
  })

  it('hides the whole-club switch from non-admins and shows only staffed squads', () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} />)
    expect(screen.queryByLabelText(/whole club/i)).toBeNull()
    expect(screen.getByLabelText('U12')).toBeInTheDocument()
    expect(screen.queryByLabelText('U14')).toBeNull()
  })

  it('blocks submit with nothing targeted rather than widening', async () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={admin} />)
    fireEvent.change(screen.getByLabelText(/file/i),
      { target: { files: [pdf()] } })
    fireEvent.click(screen.getByRole('button', { name: /add document/i }))
    expect(uploadDocumentMock).not.toHaveBeenCalled()
    expect(await screen.findByText(/at least one age group/i)).toBeInTheDocument()
  })

  it('rejects a bad file type inline, before any upload', async () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} />)
    const bad = new File(['x'], 'movie.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText(/file/i),
      { target: { files: [bad] } })
    expect(await screen.findByText(/not supported/i)).toBeInTheDocument()
  })

  it('submits with the coach squad targeted and notify off by default', async () => {
    render(<DocumentUploadSheet open onClose={() => {}} teams={TEAMS}
      memberships={coach} onUploaded={() => {}} />)
    fireEvent.change(screen.getByLabelText(/file/i),
      { target: { files: [pdf()] } })
    fireEvent.change(screen.getByLabelText(/title/i),
      { target: { value: 'Festival pack' } })
    fireEvent.click(screen.getByRole('button', { name: /add document/i }))
    await waitFor(() => expect(uploadDocumentMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Festival pack', staffOnly: true,
        clubWide: false, teamIds: ['t1'], prefixTeamId: 't1',
        notify: false })))
  })
})
```

- [x] **Step 2: Run to verify failure.**
`npm run test:related -- tests/document-upload-sheet.test.jsx` — expected:
FAIL, component missing.

- [x] **Step 3: Implement the component.** Structure (complete the JSX with
the app's form idioms — copy field markup from `NoticeComposer`, which is
the same Sheet-with-checkbox-grid shape):

```jsx
import { useState } from 'react'
import Sheet from './Sheet'
import Button from './Button'
import { uploadDocument } from '../data/documents'
import {
  DOCUMENT_CATEGORIES, documentAccept, validateDocumentFile,
  uploadableTeamIds,
} from '../lib/documents'
import { isAdmin } from '../lib/scope'
import { friendlyMessage } from '../lib/friendlyError'

export default function DocumentUploadSheet({
  open, onClose, teams, memberships, fixedTeamId, onUploaded,
}) {
  const admin = isAdmin(memberships)
  const staffedIds = uploadableTeamIds(memberships)
  const pickable = fixedTeamId
    ? teams.filter((t) => t.id === fixedTeamId)
    : admin ? teams : teams.filter((t) => staffedIds.includes(t.id))

  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  const [staffOnly, setStaffOnly] = useState(true) // the lazy-safe default
  const [picked, setPicked] = useState(
    () => new Set(fixedTeamId ? [fixedTeamId] : pickable[0] ? [pickable[0].id] : []))
  const [wholeClub, setWholeClub] = useState(false)
  const [notify, setNotify] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function pickFile(event) {
    const next = event.target.files?.[0] ?? null
    setFile(next)
    setFileError(validateDocumentFile(next))
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''))
  }

  function toggleTeam(id) {
    setPicked((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file || fileError) { setError(fileError ?? 'Choose a file first.'); return }
    const teamIds = [...picked]
    if (!wholeClub && teamIds.length === 0) {
      setError('Choose at least one age group.'); return
    }
    setSaving(true); setError(null)
    try {
      await uploadDocument({
        file, title: title.trim() || file.name, category, staffOnly,
        clubWide: wholeClub, teamIds,
        prefixTeamId: fixedTeamId
          ?? teamIds.find((id) => staffedIds.includes(id))
          ?? teamIds[0],
        notify,
      })
      onUploaded?.()
      onClose()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not upload that document.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add document">
      <form onSubmit={handleSubmit}>
        {/* labelled file input using documentAccept(); fileError inline */}
        {/* labelled title input */}
        {/* category select over DOCUMENT_CATEGORIES */}
        {/* "Staff only" checkbox bound to staffOnly */}
        {/* squad checkboxes over `pickable` (hidden when fixedTeamId),
            disabled while wholeClub; whole-club switch rendered ONLY when
            admin && !fixedTeamId */}
        {/* "Notify people" checkbox bound to notify */}
        {/* error rendered inline; submit Button labelled "Add document",
            disabled while saving */}
      </form>
    </Sheet>
  )
}
```

The commented lines are the fields to write out — each is a labelled
control bound to the state above it; copy the exact input/checkbox markup
classes from `NoticeComposer` so it looks native. No new styling decisions.

- [x] **Step 4: Run to verify pass.**
`npm run test:related -- tests/document-upload-sheet.test.jsx` — expected:
PASS. If a label query fails, fix the component's labels (the tests state
the contract), not the test.

- [x] **Step 5: Commit.**

```bash
git add src/components/DocumentUploadSheet.jsx tests/document-upload-sheet.test.jsx
git commit -m "feat(ui): document upload sheet — tiers, targeting, validation"
```

---

### Task 6: Documents screen, route, More link

**Files:**
- Create: `src/screens/Documents.jsx`
- Modify: `src/App.jsx` (route, alongside the `/notices` route at
  `src/App.jsx:200`), `src/screens/More.jsx` (link card, next to the
  Notices card at `src/screens/More.jsx:432`), `src/components/Sidebar.jsx`
  (desktop entry — copy the shape of the existing Notices entry)
- Test: `tests/documents-screen.test.jsx`

**Interfaces:**
- Consumes: `listDocuments`, `signDocumentUrl`, `deleteDocument` (Task 4),
  `filterDocuments`, `DOCUMENT_CATEGORIES`, `canUploadDocuments` (Task 3),
  `DocumentUploadSheet` (Task 5), `useMemberships()` →
  `{ memberships, teams }`, `Card`, `Chip`, `Empty`, `Button`.
- Produces: route `/documents`.

Screen contract:
- Loads `listDocuments()` on mount; loading/error/empty states (empty copy:
  "No documents yet — the club and your coaches can share files here.").
- Category chips across the top filter via `filterDocuments`; a squad
  filter renders only when the viewer belongs to more than one squad.
- Each row: title, category label, "Whole club" or targeted squad names,
  file size, uploaded date; a "Staff only" `Chip` when `staff_only` (RLS
  means only staff ever receive such rows, so the badge tells staff what
  parents can't see).
- Tapping a row: `signDocumentUrl(doc.storage_key)` then
  `window.open(url, '_blank', 'noopener')`.
- "Add document" `Button` rendered only when
  `canUploadDocuments(memberships)`; opens `DocumentUploadSheet`; reloads
  the list on `onUploaded`.
- Delete: a per-row control shown when the viewer is the uploader, an
  admin, or staff of a targeted squad (client-side mirror only — RLS
  enforces); confirm before calling `deleteDocument`.

- [x] **Step 1: Write the failing tests** (`tests/documents-screen.test.jsx`)
— mock `../src/data/documents.js` and `../src/lib/memberships.jsx` (copy
the provider-mock scaffolding from `tests/notices.test.js` /
`tests/roster.test.jsx`, whichever mocks `useMemberships`; read one first).
Cases, with real assertions:
  1. renders rows from `listDocuments` (two fixture docs, invented data);
  2. shows the empty-state copy when the list is empty;
  3. category chip click narrows the list;
  4. "Add document" absent for a parent-only membership, present for a
     coach;
  5. row click calls `signDocumentUrl` with the row's `storage_key` and
     `window.open` with the signed URL (spy on `window.open`);
  6. staff-only rows carry the "Staff only" badge.

- [x] **Step 2: Run to verify failure.**
`npm run test:related -- tests/documents-screen.test.jsx` — expected: FAIL.

- [x] **Step 3: Implement the screen**, then register it:
  - `src/App.jsx`: `import Documents from './screens/Documents'` and, next
    to the notices route,
    `<Route path="/documents" element={<AppShell><Documents /></AppShell>} />`
  - `src/screens/More.jsx`: a card identical in shape to the Notices card
    at `More.jsx:432` — `SectionTitle` "Documents", link `to="/documents"`,
    copy "Club and squad documents".
  - `src/components/Sidebar.jsx`: an entry pointing at `/documents`,
    copying the Notices entry's markup.

- [x] **Step 4: Run to verify pass, plus neighbours.**
`npm run test:related -- src/screens/Documents.jsx` — expected: new tests
PASS, and the App/More/Sidebar suites (`tests/app.test.jsx`,
`tests/more.test.jsx`, `tests/sidebar-submenu.test.jsx`) still green.

- [x] **Step 5: Commit.**

```bash
git add src/screens/Documents.jsx src/App.jsx src/screens/More.jsx src/components/Sidebar.jsx tests/documents-screen.test.jsx
git commit -m "feat(ui): /documents screen — chips, signed opens, upload door"
```

---

### Task 7: Squad Hub section (the staff door)

**Files:**
- Create: `src/components/SquadDocumentsCard.jsx`
- Modify: `src/screens/SquadHub.jsx` (render the card in the per-squad
  body, alongside the existing attendance/match-sheet cards inside the
  `SquadHub` function at `src/screens/SquadHub.jsx:163`)
- Test: `tests/squad-documents-card.test.jsx`

**Interfaces:**
- Consumes: `listDocuments`, `signDocumentUrl` (Task 4), `filterDocuments`
  (Task 3), `DocumentUploadSheet` (Task 5) with `fixedTeamId`, `Card`,
  `Button`, `useMemberships()`.
- Produces: `export default function SquadDocumentsCard({ teamId, teamName })`.

Contract: a `Card` titled "Documents" listing
`filterDocuments(docs, { teamId })` (which includes club-wide docs —
deliberate: the hub shows staff everything their squad can see), newest
first, capped at 8 rows with a "See all" link to `/documents`; an "Add"
button opening `DocumentUploadSheet` with `fixedTeamId={teamId}`. Squad
Hub is staff-only by construction, so no extra gating in the card.

- [x] **Step 1: Write the failing tests**: renders that squad's and
club-wide docs but not another squad's; "Add" opens the sheet with the
squad locked (assert the sheet renders without squad checkboxes); row
click signs and opens. Mock the data layer as in Task 6.

- [x] **Step 2: Run to verify failure.**
`npm run test:related -- tests/squad-documents-card.test.jsx`

- [x] **Step 3: Implement the card and mount it in `SquadHub.jsx`.**

- [x] **Step 4: Run to verify pass, plus the hub's own suites.**
`npm run test:related -- src/screens/SquadHub.jsx` — expected: all green,
including `tests/squad-hub.test.jsx`.

- [x] **Step 5: Commit.**

```bash
git add src/components/SquadDocumentsCard.jsx src/screens/SquadHub.jsx tests/squad-documents-card.test.jsx
git commit -m "feat(ui): squad hub documents card — the staff door"
```

---

### Task 8: Push — edge branch, category toggle

**Files:**
- Modify: `supabase/functions/push-send/index.ts` (new `documentTargets` +
  payload branch, next to `noticeTargets` at
  `supabase/functions/push-send/index.ts:504`),
  `src/data/notificationPreferences.js` (add the `document` category to
  `NOTIFICATION_CATEGORIES`)
- Test: `tests/notification-categories.test.js` (existing — it will fail
  until both halves agree), plus the push suite `tests/push-sw.test.js`
  stays green.

**Interfaces:**
- Consumes: `public.document_push_subscriptions(_document uuid)` (Task 1),
  the vault-posted `{ document_id }` body `create_document` already sends.
- Produces: a push titled from the document, deep-linking `/documents`.

- [x] **Step 1: Run the categories test to see the current contract.**
`npm run test:related -- tests/notification-categories.test.js` — expected:
currently green (Task 1's migration restated the full list including
`document`; the app list doesn't know it yet — read the test's failure
direction carefully; if it is already red after Task 1, this task fixes it).

- [x] **Step 2: Add the category** to `NOTIFICATION_CATEGORIES` in
`src/data/notificationPreferences.js`:

```js
{
  key: 'document',
  label: 'New documents',
  hint: 'When the club or your coaches share a document with your squad.',
},
```

- [x] **Step 3: Run to verify the pair now agree.**
`npm run test:related -- tests/notification-categories.test.js` — expected:
PASS.

- [x] **Step 4: Add the edge branch.** In
`supabase/functions/push-send/index.ts`, copy `noticeTargets`
(`index.ts:504-518`) as `documentTargets(documentId)` calling
`document_push_subscriptions` with `{ _document: documentId }`, and add a
request branch: when the body carries `document_id`, load the document's
title and audience squads (service role), build
`{ title: 'New document' + (squadName ? ` for ${squadName}` : ''), body:
docTitle, url: '/documents' }`, and send to `documentTargets`. Follow the
existing notice branch line by line — same allowlisting, same 404/410
subscription purge.

- [x] **Step 5: Deploy the edge function** via Supabase MCP
`deploy_edge_function` (`push-send`). ⚠️ This is live the moment it
deploys, but it changes nothing until a `document_id` payload arrives, and
`create_document` only sends one when `_notify` is true — which no UI can
produce until this branch exists. Order is safe.

- [x] **Step 6: Prove it end-to-end against a fault.** Via `execute_sql`
(NOT rolled back — use a real but throwaway document created as yourself,
then delete it): call `create_document` with `_notify => true` on a
staff-only doc targeted at a squad with a known push subscription;
expected: a push arrives on the subscribed device. Then the fault: an
opted-out profile (insert an opt-out row for `document`, re-notify a fresh
doc) must NOT receive one. Delete the probe docs and the opt-out row after.

- [x] **Step 7: Commit.**

```bash
git add supabase/functions/push-send/index.ts src/data/notificationPreferences.js
git commit -m "feat(push): document category — edge branch, audience RPC wiring, toggle"
```

---

### Task 9: Sweep, docs, PR

**Files:**
- Modify: `claude/changelog.md`, `claude/state-of-play.md`, this plan's
  status line, `claude/plans/2026-08-31-documents-repo.md` status line.
- Check: `src/components/StorageCard.jsx` (or wherever
  `tests/storage-card.test.jsx` points) — if buckets are enumerated in
  code, add `documents`; if it reads all buckets dynamically, record that
  no change was needed.

- [x] **Step 1: Storage card.** `graft grep "player-photos" --in src/` to
find whether bucket names are hard-coded in the usage card; add
`documents` wherever siblings are listed, or note in the commit message
that usage is bucket-agnostic.

- [x] **Step 2: Full suite.** `npm test` — expected: everything green.
`npm run build` — expected: clean.

- [x] **Step 3: Docs.** Changelog entry (unSHA'd; check `claude/changelog.md`
head first — cite the newest merged squash SHA for any entry still marked
"(SHA follows)"). Flip this plan's status line to
"**Status: SHIPPED <date>**" and the spec's status line to point here.
`npm run docs:check` after the commit as well as before (the one-behind
trap).

- [x] **Step 4: Commit and open the PR.**

```bash
git add claude/changelog.md claude/state-of-play.md claude/plans/2026-08-31-documents-repo-implementation.md claude/plans/2026-08-31-documents-repo.md
git commit -m "docs: documents repo shipped — changelog, state, plan status"
git push -u origin feat/documents-repo
```

Open the PR with a `--body-file` (never inline backticks —
`claude/runbooks/session-and-push.md`). ⚠️ **Merging deploys production
(15 credits) and needs Jay's explicit yes** — the PR is the stopping point.

- [ ] **Step 5: After Jay merges — verify live.** Load
https://adhquins-clubhub.com as a staff account: upload a staff-only doc to
one squad, confirm a parent account of that squad cannot see it on
`/documents` (the negative must fail at the RLS gate — check the network
response is an empty list, not an error), confirm the signed URL opens, and
confirm the deploy id moved (this one SHOULD move — it is code).

⚠️ **THIS IS THE ONE BOX LEFT UNTICKED IN THE WHOLE PLAN, DELIBERATELY.**
Every other step is executed; this one happens AFTER Jay merges, so ticking it
would be a claim about something that has not happened.

⚠️ **ADD ONE CHECK TO IT, ON A REAL IPHONE: tap a document and confirm it
opens.** `src/screens/Documents.jsx` and `src/components/SquadDocumentsCard.jsx`
both fall back to `window.location.assign` when `window.open` returns null,
because the `await` on the signed URL ends the user-gesture context and iOS
blocks the popup silently — nothing throws, so no error path can catch it. The
fallback is reasoned from the popup rule and pinned by unit tests that stub
`window.open` to return null; it has **not** been measured on a device, and both
components' comments point here for that. Do the check as an installed PWA as
well as in Safari — the installed case is the stricter one.
