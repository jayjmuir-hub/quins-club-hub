-- 1 Sep 2026 — chat attachments carry METADATA, not just a storage key.
-- Follows 20260901_message_attachment_list.sql the same day, before any app
-- code was written against it. Jay: "ok go", after being shown the now-vs-later
-- cost.
--
-- ══ WHY, IN ONE SENTENCE ══════════════════════════════════════════════════
-- A photo needs no name because you look at it. ⚠️ A DOCUMENT IS USELESS
-- WITHOUT ITS ORIGINAL FILENAME, and that name is UNRECOVERABLE: storage keys
-- are `<uuid>/<random>.pdf`, deliberately unguessable, so a PDF in a chat
-- could only ever render as "a PDF". Jay wants documents in chat and rejected
-- a share-a-link alternative, so the list has to be able to hold a name.
--
-- Done NOW because nothing writes the column yet (9 rows, no app code). Later
-- it is a migration over live album data plus rewritten composer and album
-- code. The window closed the moment plan 2 started, so it did not start.
--
-- ══ ⚠️ THE SECURITY-CRITICAL SQL IS DELIBERATELY UNTOUCHED ════════════════
-- `chat media read` still reads `name = any(x.attachment_paths)`, exactly as
-- it did an hour ago. attachment_paths is now DERIVED from `attachments` by
-- trigger rather than written directly.
--
-- That is the whole design, and it is a direct answer to the argument AGAINST
-- this reshape: a jsonb-reading policy (unnest, or a containment test) would
-- have made the one piece of SQL protecting photographs of children harder to
-- read, and would have re-opened a boundary proved by fault injection an hour
-- earlier. Deriving a plain text[] means db/tests/chat-album-media.sql's six
-- original arms and its self-test keep asserting the same thing, unchanged.
--
-- ⚠️ AND THE `EXISTS` STAYS INLINE AND INVOKER. Its safety is INHERITED from
-- messages' RLS and invisible in its own text — see the header of
-- 20260901_message_attachment_list.sql. Nothing here changes that; nothing
-- later should either.
--
-- ══ THREE COLUMNS, ONE TRUTH ══════════════════════════════════════════════
--   attachments      jsonb   [{file, type, size, name}, ...]   <- the truth
--   attachment_paths text[]  derived: the keys, in order       <- the policy
--   attachment_path  text    derived: element 1                <- old clients
--
-- The trigger fills whichever two the writer did not set, so ALL THREE agree
-- whoever writes:
--   new code writes `attachments`         -> paths + path derived
--   plan-1-era code writes attachment_paths -> attachments + path derived
--   a CACHED PWA BUNDLE writes attachment_path -> the other two derived
-- ⚠️ That third case is why nothing is dropped. A phone running a stale
-- service worker still writes the single column, and if its write did not
-- reach attachment_paths its photo would be unreadable by everyone the
-- moment the policy looked at a list it was not in.

begin;

alter table public.messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

comment on column public.messages.attachments is
  'Every attachment on this message, in display order, max 10, as '
  '[{file, type, size, name}, ...]. `file` is the storage key; `name` is the '
  'ORIGINAL filename, which the key cannot carry and a document is useless '
  'without. attachment_paths and attachment_path are DERIVED from this by '
  'private.sync_attachment_paths() — do not write them directly.';

-- Backfill from the list shipped an hour ago. Photos only, so `name` is
-- absent rather than invented: a wrong name is worse than no name, and every
-- existing row is a photo or a voice note, neither of which displays one.
update public.messages
   set attachments = (
     select jsonb_agg(jsonb_build_object('file', p) order by ord)
       from unnest(attachment_paths) with ordinality as t(p, ord))
 where cardinality(attachment_paths) > 0
   and jsonb_array_length(attachments) = 0;

-- The cap now counts the truth, not the derived copy.
alter table public.messages drop constraint if exists messages_attachment_cap;
alter table public.messages add constraint messages_attachment_cap
  check (jsonb_array_length(attachments) <= 10);

-- ⚠️ Shape guard. Without it a client could write a bare string or an object
-- with no `file`, and the derived key list would contain a NULL — which
-- `name = any(...)` treats as no match, silently hiding the attachment from
-- everyone including its sender.
--
-- ⚠️ IT LIVES IN A FUNCTION BECAUSE A CHECK CONSTRAINT MAY NOT CONTAIN A
-- SUBQUERY — the inline version was written first and refused with
-- `0A000: cannot use subquery in check constraint`. IMMUTABLE is what makes
-- it usable in a constraint at all. Caveat for whoever edits it: Postgres does
-- NOT re-validate existing rows when a function used by a constraint changes,
-- so loosening this function silently leaves old rows unchecked, and
-- tightening it does not find the rows that already violate it.
create or replace function private.attachments_well_formed(_a jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(_a) = 'array'
     and not exists (
       select 1 from jsonb_array_elements(_a) e
        where jsonb_typeof(e) <> 'object'
           or nullif(btrim(coalesce(e ->> 'file', '')), '') is null)
$$;

alter table public.messages drop constraint if exists messages_attachments_shape;
alter table public.messages add constraint messages_attachments_shape
  check (private.attachments_well_formed(attachments));

create or replace function private.sync_attachment_paths()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Whoever wrote, the other two follow. Order of the arms IS the precedence:
  -- the richest write wins.
  if jsonb_array_length(new.attachments) > 0 then
    select array_agg(e ->> 'file' order by ord)
      into new.attachment_paths
      from jsonb_array_elements(new.attachments) with ordinality as t(e, ord);
  elsif cardinality(new.attachment_paths) > 0 then
    select jsonb_agg(jsonb_build_object('file', p) order by ord)
      into new.attachments
      from unnest(new.attachment_paths) with ordinality as t(p, ord);
  elsif new.attachment_path is not null then
    new.attachments      := jsonb_build_array(jsonb_build_object('file', new.attachment_path));
    new.attachment_paths := array[new.attachment_path];
  end if;

  new.attachment_path := new.attachment_paths[1];
  return new;
end $$;

-- The body rule counts the truth too.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  length(btrim(body)) <= 2000
  and (length(btrim(body)) >= 1 or jsonb_array_length(attachments) > 0)
);

do $$
declare bad int;
begin
  select count(*) into bad from public.messages
   where cardinality(attachment_paths) <> jsonb_array_length(attachments);
  if bad <> 0 then
    raise exception 'ABORTING: % row(s) have attachments and attachment_paths of different lengths.', bad;
  end if;

  select count(*) into bad from public.messages
   where attachment_path is distinct from attachment_paths[1];
  if bad <> 0 then
    raise exception 'ABORTING: % row(s) have attachment_path out of step with element 1.', bad;
  end if;

  raise notice 'guards passed: all three columns agree on every row';
end $$;

commit;
