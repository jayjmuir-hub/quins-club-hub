-- ══════════════════════════════════════════════════════════════════════════
--  FEEDBACK THREAD HARNESS — the reporter and the club's admins may read and
--  write a report's thread; nobody else may; an admin's message becomes the
--  reply the reporter is pushed about, and the reporter's does not.
--  Run with `npm run db:check -- feedback-thread`.
--  SAFE ON PRODUCTION: one transaction, rolled back. The only report and
--  messages it touches are disposable ones it created itself.
-- ══════════════════════════════════════════════════════════════════════════
--
-- db/migrations/20260915_feedback_thread.sql. Jay, 4 Sep 2026: "there is no
-- thread of messages."
--
-- ⚠️ NO REAL PERSON IS NAMED ANYWHERE IN THIS FILE. CLAUDE.md rule 9. Actors
-- are chosen from live data by shape, by id only.
--
-- ⚠️ EVERY "cannot read" IS PAIRED WITH A CONTROL that the same row IS read by
-- someone who may — the trap db/tests/feedback-delete.sql is built around: an
-- invisible row and a refused row are the same observation.

begin;

create temporary table _r(step text, outcome text) on commit drop;
grant insert, select on _r to authenticated, anon;

do $$
declare
  v_club uuid; v_admin uuid; v_author uuid; v_other uuid;
  v_id uuid; v_msg uuid; n int; note text; handled uuid;
begin
  select m.club_id, m.profile_id into v_club, v_admin
    from public.memberships m
   where m.status = 'active' and m.role = 'admin'
     and (m.is_super or coalesce(array_length(m.admin_rights, 1), 0) > 0)
   limit 1;
  select m.profile_id into v_author
    from public.memberships m
   where m.status = 'active' and m.club_id = v_club and m.role <> 'admin' and m.profile_id <> v_admin
   limit 1;
  select m.profile_id into v_other
    from public.memberships m
   where m.status = 'active' and m.club_id = v_club and m.role <> 'admin'
     and m.profile_id not in (v_admin, v_author)
   limit 1;
  if v_club is null or v_admin is null or v_author is null or v_other is null then
    raise exception 'FEEDBACK THREAD: need an admin and two ordinary members in one club';
  end if;

  -- The disposable report, down the real member path (the BEFORE INSERT
  -- trigger stamps club_id and submitted_by).
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  insert into public.feedback (kind, body) values ('bug', 'db:check disposable fixture — rolls back') returning id into v_id;

  -- 1. the reporter opens the thread: empty, readable
  select count(*) into n from public.feedback_messages where feedback_id = v_id;
  insert into _r values ('1 the reporter reads an empty thread', case when n = 0 then 'PASS' else 'FAIL ' || n end);

  -- 2. the admin writes
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.feedback_messages (feedback_id, club_id, author_id, body)
       values (v_id, v_club, v_admin, 'Looking into it now.') returning id into v_msg;
  insert into _r values ('2 an admin writes on the thread', case when v_msg is not null then 'PASS' else 'FAIL' end);

  -- 3. the trigger made it the reply the reporter is pushed about
  perform set_config('role', 'postgres', true);
  select admin_note, handled_by into note, handled from public.feedback where id = v_id;
  insert into _r values ('3 the admin message became feedback.admin_note (the push)', case when note = 'Looking into it now.' and handled = v_admin then 'PASS' else 'FAIL ' || coalesce(note, 'null') end);

  -- 4. the reporter reads it and answers
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  select count(*) into n from public.feedback_messages where feedback_id = v_id;
  insert into _r values ('4 the reporter reads the admin message', case when n = 1 then 'PASS' else 'FAIL ' || n end);
  insert into public.feedback_messages (feedback_id, club_id, author_id, body) values (v_id, v_club, v_author, 'Still blank today.');
  select count(*) into n from public.feedback_messages where feedback_id = v_id;
  insert into _r values ('5 the reporter answers on the thread', case when n = 2 then 'PASS' else 'FAIL ' || n end);

  -- 6. the reporter's message did NOT touch the feedback row (no self-push)
  perform set_config('role', 'postgres', true);
  select admin_note into note from public.feedback where id = v_id;
  insert into _r values ('6 the reporter''s message leaves admin_note alone', case when note = 'Looking into it now.' then 'PASS' else 'FAIL ' || coalesce(note, 'null') end);

  -- 7. the admin reads both
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select count(*) into n from public.feedback_messages where feedback_id = v_id;
  insert into _r values ('7 CONTROL: the admin reads both messages', case when n = 2 then 'PASS' else 'FAIL ' || n end);

  -- 8/9. another member reads nothing and may not write
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  select count(*) into n from public.feedback_messages where feedback_id = v_id;
  insert into _r values ('8 another member reads NONE of the thread', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  begin
    insert into public.feedback_messages (feedback_id, club_id, author_id, body) values (v_id, v_club, v_other, 'nosy');
    insert into _r values ('9 another member may not write on it', 'FAIL inserted');
  exception when insufficient_privilege then
    insert into _r values ('9 another member may not write on it', 'PASS');
  end;

  -- 10. the reporter may not write as somebody else
  perform set_config('request.jwt.claims', json_build_object('sub', v_author, 'role', 'authenticated')::text, true);
  begin
    insert into public.feedback_messages (feedback_id, club_id, author_id, body) values (v_id, v_club, v_admin, 'forged');
    insert into _r values ('10 a message cannot be written under another name', 'FAIL inserted');
  exception when insufficient_privilege then
    insert into _r values ('10 a message cannot be written under another name', 'PASS');
  end;

  -- 11. anon holds nothing
  perform set_config('role', 'postgres', true);
  insert into _r values ('11 anon has no privilege on the table', case when not has_table_privilege('anon', 'public.feedback_messages', 'select') then 'PASS' else 'FAIL' end);

  -- ⚠️ A FAIL ROW MUST STOP THE RUN — scripts/db-check.mjs reports `ok` for any
  -- harness whose SQL executes without error.
  if exists (select 1 from _r where outcome not like 'PASS%') then
    raise exception 'feedback-thread: assertion(s) FAILED — %',
      (select string_agg(step || ' → ' || outcome, ' | ' order by (regexp_match(step, '^\d+'))[1]::int)
         from _r where outcome not like 'PASS%');
  end if;
end $$;

select * from _r order by (regexp_match(step, '^\d+'))[1]::int;
rollback;
