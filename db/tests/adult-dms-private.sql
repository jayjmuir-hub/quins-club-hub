-- Harness for db/migrations/20260823_adult_dms_private.sql.
-- Run with `npm run db:check -- adult-dms`, or paste into the SQL editor.
-- SAFE ON PRODUCTION: everything runs inside a transaction that ROLLS BACK.
-- The migration is INLINED VERBATIM below. Cast borrowed from squad-chat-phase3.
-- ⚠️ A SYNTHETIC CLUB, AND EVERY NAME IS INVENTED — CLAUDE.md rule 9.
--
--  1. PARENT <-> PARENT2 (adults): ADMIN cannot read the conversation or its
--     messages, the Welfare overview does not list it, log_welfare_access refuses
--  2. ...and a participant still can (control), and involves_minor says false
--  3. PARENT2 reports a message: now ADMIN reads it, the overview lists it as
--     "reported", the open logs, and ADMIN may remove the message
--  4. PARENT <-> MINOR (guardian): reviewable from the first message, overview
--     says "involves a minor", involves_minor is true for the admin
--  5. involves_minor is NULL for someone outside a conversation (OUTSIDER)

begin;

create temporary table _log(seq serial, line text) on commit drop;
grant insert, select on _log to authenticated;
grant usage on sequence _log_seq_seq to authenticated;

insert into clubs (id, name) values ('f0000000-0000-4000-8000-0000000000c5','ZZ Adultdm Probe Club');

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at) values
 ('f0000000-0000-4000-8000-000000000041','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-adultdm-coach@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000042','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-adultdm-parent@example.invalid',  now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000043','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-adultdm-parent2@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000044','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-adultdm-minor@example.invalid',   now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000045','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-adultdm-unknown@example.invalid', now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000046','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-adultdm-outsider@example.invalid',now(),'{}'::jsonb, now(), now()),
 ('f0000000-0000-4000-8000-000000000047','00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-adultdm-admin@example.invalid',   now(),'{}'::jsonb, now(), now());

insert into teams (id, club_id, name, sort_order) values
 ('f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000c5','U16B ZZ Probe', 1001),
 ('f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000c5','U10 ZZ Probe', 1002);

insert into players (id, club_id, team_id, full_name) values
 ('f0000000-0000-4000-8000-0000000000d1','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Sixteen'),
 ('f0000000-0000-4000-8000-0000000000d2','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Nodob'),
 ('f0000000-0000-4000-8000-0000000000d3','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','Zz Probe Childseven'),
 ('f0000000-0000-4000-8000-0000000000d4','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','Zz Probe Childeight');

insert into player_private (player_id, date_of_birth) values
 ('f0000000-0000-4000-8000-0000000000d1', current_date - interval '16 years');

insert into memberships (profile_id, club_id, team_id, player_id, role, status) values
 ('f0000000-0000-4000-8000-000000000041','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe', null, 'coach','active'),
 ('f0000000-0000-4000-8000-000000000042','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','parent','active'),
 ('f0000000-0000-4000-8000-000000000043','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d3','parent','active'),
 ('f0000000-0000-4000-8000-000000000044','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d1','player','active'),
 ('f0000000-0000-4000-8000-000000000045','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000fe','f0000000-0000-4000-8000-0000000000d2','player','active'),
 ('f0000000-0000-4000-8000-000000000046','f0000000-0000-4000-8000-0000000000c5','f0000000-0000-4000-8000-0000000000ff','f0000000-0000-4000-8000-0000000000d4','parent','active'),
 ('f0000000-0000-4000-8000-000000000047','f0000000-0000-4000-8000-0000000000c5', null, null, 'admin','active');

insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values
 ('f0000000-0000-4000-8000-000000000041','https://push.example.invalid/zz-adultdm-coach','k','a'),
 ('f0000000-0000-4000-8000-000000000042','https://push.example.invalid/zz-adultdm-parent','k','a'),
 ('f0000000-0000-4000-8000-000000000043','https://push.example.invalid/zz-adultdm-parent2','k','a'),
 ('f0000000-0000-4000-8000-000000000047','https://push.example.invalid/zz-adultdm-admin','k','a');

create function pg_temp.as_user(_id text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', _id), true);
  set local role authenticated;
end $$;

-- Whether a conversation is open to admin review at all (no caller check).
create or replace function private.conversation_reviewable(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and (private.is_minor_profile(c.profile_a)
         or private.is_minor_profile(c.profile_b)
         or exists (select 1 from message_reports r
                      join messages x on x.id = r.message_id
                     where x.conversation_id = c.id)))
$$;
revoke all on function private.conversation_reviewable(uuid) from public, anon;
grant execute on function private.conversation_reviewable(uuid) to authenticated;

-- The caller is an admin of the conversation's club AND it is reviewable.
create or replace function private.admin_may_review(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversations c
     where c.id = _conversation
       and private.is_admin(c.club_id)
       and private.conversation_reviewable(c.id))
$$;
revoke all on function private.admin_may_review(uuid) from public, anon;
grant execute on function private.admin_may_review(uuid) to authenticated;

-- For the thread's notice: does this conversation involve a minor? Only a
-- participant or a reviewer gets an answer; anyone else gets null.
create or replace function public.conversation_involves_minor(_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
    from conversations c
   where c.id = _conversation
     and (private.in_conversation(c.id) or private.admin_may_review(c.id))
$$;
revoke all on function public.conversation_involves_minor(uuid) from public, anon;
grant execute on function public.conversation_involves_minor(uuid) to authenticated;

-- ── Policies ──────────────────────────────────────────────────────────────

drop policy "conversation read" on public.conversations;
create policy "conversation read" on public.conversations
  for select using ((select auth.uid()) in (profile_a, profile_b) or private.admin_may_review(id));

drop policy "message read" on public.messages;
create policy "message read" on public.messages
  for select using (
    case channel
      when 'squad' then
        case when team_id is null then exists (
               select 1 from memberships m
                where m.profile_id = (select auth.uid())
                  and m.club_id = messages.club_id and m.status = 'active')
             else private.can_see_team(team_id) end
      when 'staff' then private.can_edit_team(team_id)
      when 'dm' then private.in_conversation(conversation_id) or private.admin_may_review(conversation_id)
      else false
    end
  );

drop policy "message edit" on public.messages;
create policy "message edit" on public.messages
  for update using (
    (author_id = (select auth.uid()) and created_at > now() - interval '15 minutes')
    or (channel in ('squad', 'staff') and team_id is not null and private.can_edit_team(team_id))
    or (channel = 'squad' and team_id is null and private.is_admin(club_id))
    -- an admin may REMOVE a DM message only in a conversation they may review
    or (channel = 'dm' and private.admin_may_review(conversation_id))
  ) with check (channel in ('squad','staff','dm'));

-- ── The access log only accepts an open that was allowed ─────────────────

create or replace function public.log_welfare_access(_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  me uuid := auth.uid();
  conv public.conversations;
begin
  select * into conv from conversations where id = _conversation;
  if conv.id is null then raise exception 'no such conversation' using errcode = 'P0002'; end if;
  if me in (conv.profile_a, conv.profile_b) then return; end if;
  if not private.admin_may_review(_conversation) then raise exception 'not reviewable' using errcode = '42501'; end if;
  insert into welfare_access_log (club_id, admin_id, conversation_id) values (conv.club_id, me, _conversation);
end;
$function$;

-- ── The overview lists only what an admin may open ────────────────────────

create or replace function public.welfare_overview()
returns table (kind text, id uuid, label text, detail text, members bigint, last_at timestamptz, open_reports bigint)
language sql
stable
security definer
set search_path = public
as $function$
  with me as (select auth.uid() as id),
  club as (select m.club_id as id from memberships m, me
            where m.profile_id = me.id and m.status = 'active' order by m.created_at limit 1),
  ok as (select private.is_admin(club.id) as yes from club)
  select rows.kind, rows.id, rows.label, rows.detail, rows.members, rows.last_at, rows.open_reports from (
    select 'squad'::text as kind, t.id as id, t.name as label,
           case when private.channel_announce_only(t.id) then 'Squad · announce-only' else 'Squad · open chat' end as detail,
           (select count(*) from private.notice_audience(t.club_id, t.id)) as members,
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'squad') as last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'squad' and r.resolved_at is null) as open_reports
      from teams t, club where t.club_id = club.id
    union all
    select 'staff', t.id, t.name, 'Staff',
           (select count(*) from private.staff_audience(t.id)),
           (select max(created_at) from messages x where x.team_id = t.id and x.channel = 'staff'),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.team_id = t.id and x.channel = 'staff' and r.resolved_at is null)
      from teams t, club where t.club_id = club.id
    union all
    select 'club', club.id, 'Whole club', 'Club-wide · admins post',
           (select count(distinct profile_id) from memberships m where m.club_id = club.id and m.status = 'active'),
           (select max(created_at) from messages x where x.club_id = club.id and x.channel = 'squad' and x.team_id is null),
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.club_id = club.id and x.channel = 'squad' and x.team_id is null and r.resolved_at is null)
      from club
    union all
    select 'dm', c.id, pa.full_name || ' · ' || pb.full_name,
           case when private.is_minor_profile(c.profile_a) or private.is_minor_profile(c.profile_b)
                then 'Direct message · involves a minor' else 'Direct message · reported' end,
           2::bigint, c.last_at,
           (select count(*) from message_reports r join messages x on x.id = r.message_id
             where x.conversation_id = c.id and r.resolved_at is null)
      from club
      cross join conversations c
      join profiles pa on pa.id = c.profile_a
      join profiles pb on pb.id = c.profile_b
     where c.club_id = club.id
       and private.conversation_reviewable(c.id)
  ) rows, ok
  where ok.yes
  order by last_at desc nulls last;
$function$;


create function pg_temp.assert_adultdm() returns void language plpgsql as $fn$
declare
  n int; caught text; conv uuid; conv_minor uuid; msg uuid; d text; b boolean;
  parent constant uuid := 'f0000000-0000-4000-8000-000000000042';
  parent2 constant uuid := 'f0000000-0000-4000-8000-000000000043';
  minor constant uuid := 'f0000000-0000-4000-8000-000000000044';
  outsider constant uuid := 'f0000000-0000-4000-8000-000000000046';
  admin constant uuid := 'f0000000-0000-4000-8000-000000000047';
begin
  -- adults talk
  perform pg_temp.as_user(parent::text);
  conv := public.open_conversation(parent2);
  insert into messages (conversation_id, channel, body) values (conv, 'dm', 'Two seats in the car Saturday') returning id into msg;
  reset role;

  -- 1
  perform pg_temp.as_user(admin::text);
  select count(*) into n from conversations where id = conv;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: admin sees the adults'' conversation'; end if;
  select count(*) into n from messages where conversation_id = conv;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: admin sees % adult DM message(s)', n; end if;
  select count(*) into n from public.welfare_overview() where kind = 'dm' and id = conv;
  if n <> 0 then raise exception 'ASSERT 1 FAILED: overview lists the adults'' DM'; end if;
  begin perform public.log_welfare_access(conv); caught := null; exception when others then caught := sqlerrm; end;
  if caught is null then raise exception 'ASSERT 1 FAILED: log_welfare_access accepted an unreviewable open'; end if;
  reset role;
  insert into _log(line) values ('1 adults'' DM: admin cannot read it, list it, or log an open of it');

  -- 2 control
  perform pg_temp.as_user(parent2::text);
  select count(*) into n from messages where conversation_id = conv;
  b := public.conversation_involves_minor(conv);
  reset role;
  if n <> 1 then raise exception 'ASSERT 2 FAILED: participant sees % message(s)', n; end if;
  if b is distinct from false then raise exception 'ASSERT 2 FAILED: involves_minor = %', b; end if;
  insert into _log(line) values ('2 control: the other participant reads it, and involves_minor is false');

  -- 3 report
  perform pg_temp.as_user(parent2::text);
  insert into message_reports (message_id, reason) values (msg, 'Not about rugby');
  reset role;
  perform pg_temp.as_user(admin::text);
  select count(*) into n from messages where conversation_id = conv;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: after a report admin sees % message(s)', n; end if;
  select detail into d from public.welfare_overview() where kind = 'dm' and id = conv;
  if d is distinct from 'Direct message · reported' then raise exception 'ASSERT 3 FAILED: overview detail = %', coalesce(d,'(absent)'); end if;
  perform public.log_welfare_access(conv);
  update messages set deleted_at = now() where id = msg;
  select count(*) into n from messages where id = msg and deleted_at is not null;
  reset role;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: admin could not remove the reported message'; end if;
  select count(*) into n from welfare_access_log where conversation_id = conv and admin_id = admin;
  if n <> 1 then raise exception 'ASSERT 3 FAILED: % access-log row(s)', n; end if;
  insert into _log(line) values ('3 once reported: admin reads it, the overview lists it as reported, the open is logged, the message can be removed');

  -- 4 minor
  perform pg_temp.as_user(parent::text);
  conv_minor := public.open_conversation(minor);
  insert into messages (conversation_id, channel, body) values (conv_minor, 'dm', 'Boots are in the bag');
  reset role;
  perform pg_temp.as_user(admin::text);
  select count(*) into n from messages where conversation_id = conv_minor;
  select detail into d from public.welfare_overview() where kind = 'dm' and id = conv_minor;
  b := public.conversation_involves_minor(conv_minor);
  reset role;
  if n <> 1 then raise exception 'ASSERT 4 FAILED: admin sees % message(s) in the minor''s DM', n; end if;
  if d is distinct from 'Direct message · involves a minor' then raise exception 'ASSERT 4 FAILED: detail = %', coalesce(d,'(absent)'); end if;
  if b is distinct from true then raise exception 'ASSERT 4 FAILED: involves_minor = %', b; end if;
  insert into _log(line) values ('4 a minor''s DM is reviewable from the first message, listed as such');

  -- 5
  perform pg_temp.as_user(outsider::text);
  b := public.conversation_involves_minor(conv_minor);
  reset role;
  if b is not null then raise exception 'ASSERT 5 FAILED: outsider got %', b; end if;
  insert into _log(line) values ('5 involves_minor answers nothing to an outsider');
end $fn$;

select pg_temp.assert_adultdm();
select line from _log order by seq;

rollback;
