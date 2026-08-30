-- ══════════════════════════════════════════════════════════════════════════
--  HARNESS — role channels (20260830_role_channels): membership is derived
--  from roles, admins enter only by a chat-* tick, welfare only by the
--  welfare grant, and every refusal is proven alongside the access it guards.
--  Run via `npm run db:check`. SAFE ON PRODUCTION: one transaction, rolled
--  back. Re-runnable. All people below are SYNTHETIC — a whole invented club,
--  so nothing here reads or writes a real member's data.
-- ══════════════════════════════════════════════════════════════════════════

begin;

create temporary table _r (seq numeric, stage text, detail text) on commit drop;
grant select, insert on _r to authenticated;

-- An invented club with one squad and six people, one per access shape.
insert into clubs (id, name) values ('cccc0000-0000-4000-8000-00000000c1c1', 'Harness RFC');
insert into teams (id, club_id, name, sort_order)
values ('cccc0000-0000-4000-8000-00000000d1d1', 'cccc0000-0000-4000-8000-00000000c1c1', 'H1 Harness', 999);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, now(), '{}'::jsonb, now(), now()
from (values
  ('ccc00000-0000-4000-8000-0000000000a1'::uuid, 'h.parent@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a2'::uuid, 'h.headcoach@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a3'::uuid, 'h.plaincoach@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a4'::uuid, 'h.manager@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a5'::uuid, 'h.admin.plain@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a6'::uuid, 'h.admin.ticked@example.invalid')
) as x(id, email);

insert into profiles (id, full_name, email)
select x.id, x.name, x.email from (values
  ('ccc00000-0000-4000-8000-0000000000a1'::uuid, 'Harness Parent',     'h.parent@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a2'::uuid, 'Harness Headcoach',  'h.headcoach@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a3'::uuid, 'Harness Plaincoach', 'h.plaincoach@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a4'::uuid, 'Harness Manager',    'h.manager@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a5'::uuid, 'Harness Adminplain', 'h.admin.plain@example.invalid'),
  ('ccc00000-0000-4000-8000-0000000000a6'::uuid, 'Harness Adminticked','h.admin.ticked@example.invalid')
) as x(id, name, email)
on conflict (id) do nothing;

insert into players (id, club_id, team_id, full_name)
values ('ccc00000-0000-4000-8000-0000000000b1', 'cccc0000-0000-4000-8000-00000000c1c1',
        'cccc0000-0000-4000-8000-00000000d1d1', 'Harness Child');

insert into memberships (profile_id, club_id, team_id, role, player_id, status, is_head_coach, admin_rights)
values
  ('ccc00000-0000-4000-8000-0000000000a1', 'cccc0000-0000-4000-8000-00000000c1c1', 'cccc0000-0000-4000-8000-00000000d1d1', 'parent',  'ccc00000-0000-4000-8000-0000000000b1', 'active', false, '{}'),
  ('ccc00000-0000-4000-8000-0000000000a2', 'cccc0000-0000-4000-8000-00000000c1c1', 'cccc0000-0000-4000-8000-00000000d1d1', 'coach',   null, 'active', true,  '{}'),
  ('ccc00000-0000-4000-8000-0000000000a3', 'cccc0000-0000-4000-8000-00000000c1c1', 'cccc0000-0000-4000-8000-00000000d1d1', 'coach',   null, 'active', false, '{}'),
  ('ccc00000-0000-4000-8000-0000000000a4', 'cccc0000-0000-4000-8000-00000000c1c1', 'cccc0000-0000-4000-8000-00000000d1d1', 'manager', null, 'active', false, '{}'),
  ('ccc00000-0000-4000-8000-0000000000a5', 'cccc0000-0000-4000-8000-00000000c1c1', null, 'admin', null, 'active', false, '{}'),
  ('ccc00000-0000-4000-8000-0000000000a6', 'cccc0000-0000-4000-8000-00000000c1c1', null, 'admin', null, 'active', false, array['chat-managers','welfare']);

-- ── helper: run one probe as one person ────────────────────────────────────
create or replace function pg_temp.be(_who uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
                 json_build_object('sub', _who, 'role', 'authenticated')::text);
end $$;

-- ── 1. THE HEAD COACH posts in headcoaches. MUST work. ─────────────────────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a2');
  insert into messages (channel, body) values ('headcoaches', 'harness: from the head coach');
  insert into _r values (1, 'head coach posts in headcoaches', 'allowed');
exception when others then
  insert into _r values (1, 'head coach posts in headcoaches', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 2. THE PLAIN COACH cannot post there… ──────────────────────────────────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a3');
  insert into messages (channel, body) values ('headcoaches', 'harness: should be refused');
  insert into _r values (2, 'plain coach posts in headcoaches', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (2, 'plain coach posts in headcoaches', 'refused ('||sqlstate||')');
end $$;

-- ── 3. …and cannot READ it either. The control is step 4. ──────────────────
do $$
declare n int;
begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a3');
  select count(*) into n from messages where channel = 'headcoaches';
  if n = 0 then insert into _r values (3, 'plain coach reads headcoaches', 'sees nothing');
  else insert into _r values (3, 'plain coach reads headcoaches', 'SEES ' || n || ' <<< WRONG'); end if;
end $$;

-- ── 4. The head coach READS their own channel — the control for 3. ─────────
do $$
declare n int;
begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a2');
  select count(*) into n from messages where channel = 'headcoaches';
  if n >= 1 then insert into _r values (4, 'head coach reads headcoaches', 'sees the message');
  else insert into _r values (4, 'head coach reads headcoaches', 'SEES NOTHING <<< WRONG — either the post failed or the read rule is broken'); end if;
end $$;

-- ── 5. The PARENT is outside all of it: cannot post clubstaff. ─────────────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a1');
  insert into messages (channel, body) values ('clubstaff', 'harness: should be refused');
  insert into _r values (5, 'parent posts in clubstaff', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (5, 'parent posts in clubstaff', 'refused ('||sqlstate||')');
end $$;

-- ── 6. Every staff shape is in clubstaff: the plain coach posts there. ─────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a3');
  insert into messages (channel, body) values ('clubstaff', 'harness: from the plain coach');
  insert into _r values (6, 'plain coach posts in clubstaff', 'allowed');
exception when others then
  insert into _r values (6, 'plain coach posts in clubstaff', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 7. THE TICK IS THE DOOR: the plain admin cannot post in managers… ──────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a5');
  insert into messages (channel, body) values ('managers', 'harness: should be refused');
  insert into _r values (7, 'admin WITHOUT chat-managers posts in managers', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (7, 'admin WITHOUT chat-managers posts in managers', 'refused ('||sqlstate||')');
end $$;

-- ── 8. …and the ticked admin can. The pair is the whole design. ────────────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a6');
  insert into messages (channel, body) values ('managers', 'harness: from the ticked admin');
  insert into _r values (8, 'admin WITH chat-managers posts in managers', 'allowed');
exception when others then
  insert into _r values (8, 'admin WITH chat-managers posts in managers', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 9. WELFARE IS THE GRANT, NOT ADMINHOOD: plain admin refused… ───────────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a5');
  insert into messages (channel, body) values ('welfare', 'harness: should be refused');
  insert into _r values (9, 'admin WITHOUT welfare posts in welfare', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (9, 'admin WITHOUT welfare posts in welfare', 'refused ('||sqlstate||')');
end $$;

-- ── 10. …the welfare-granted admin allowed. ────────────────────────────────
do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a6');
  insert into messages (channel, body) values ('welfare', 'harness: from welfare');
  insert into _r values (10, 'admin WITH welfare posts in welfare', 'allowed');
exception when others then
  insert into _r values (10, 'admin WITH welfare posts in welfare', 'REFUSED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

-- ── 11. my_chats lists exactly the channels each person belongs to. ────────
do $$
declare hc int; mg int; cs int;
begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a2'); -- head coach
  select count(*) filter (where kind = 'headcoaches'),
         count(*) filter (where kind = 'managers'),
         count(*) filter (where kind = 'clubstaff')
    into hc, mg, cs from public.my_chats();
  if hc = 1 and mg = 0 and cs = 1 then
    insert into _r values (11, 'my_chats for the head coach', 'headcoaches + clubstaff, not managers');
  else
    insert into _r values (11, 'my_chats for the head coach',
      'WRONG <<< headcoaches='||hc||' managers='||mg||' clubstaff='||cs);
  end if;
end $$;

-- ── 12. The member sheet explains itself, and refuses an outsider. ─────────
do $$
declare reasons text; n int;
begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a2');
  select string_agg(cm.reason, ' | ' order by cm.full_name), count(*)
    into reasons, n
    from public.channel_members('headcoaches') cm;
  if n = 1 and reasons like 'Head coach — H1 Harness%' then
    insert into _r values (12, 'channel_members(headcoaches) with reason', 'one member, reason names the squad');
  else
    insert into _r values (12, 'channel_members(headcoaches) with reason',
      'WRONG <<< n='||coalesce(n,0)||' reasons='||coalesce(reasons,'(none)'));
  end if;
end $$;

do $$ begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a1'); -- the parent
  perform * from public.channel_members('headcoaches');
  insert into _r values (13, 'parent asks for the headcoaches member list', 'ALLOWED <<< WRONG');
exception when others then
  insert into _r values (13, 'parent asks for the headcoaches member list', 'refused ('||sqlstate||')');
end $$;

-- ── 14. The mention filter keeps a member and drops an outsider. ───────────
do $$
declare kept uuid[];
begin
  perform pg_temp.be('ccc00000-0000-4000-8000-0000000000a6'); -- ticked admin, in managers
  insert into messages (channel, body, mentions)
  values ('managers', 'harness: mention test',
          array['ccc00000-0000-4000-8000-0000000000a4'::uuid,   -- the manager: a member, kept
                'ccc00000-0000-4000-8000-0000000000a1'::uuid])  -- the parent: dropped
  returning mentions into kept;
  if kept = array['ccc00000-0000-4000-8000-0000000000a4'::uuid] then
    insert into _r values (14, 'mention filter in a role channel', 'member kept, outsider dropped');
  else
    insert into _r values (14, 'mention filter in a role channel', 'WRONG <<< kept=' || kept::text);
  end if;
exception when others then
  insert into _r values (14, 'mention filter in a role channel', 'ERRORED <<< WRONG ('||sqlstate||') '||sqlerrm);
end $$;

reset role;
select seq, stage, detail from _r order by seq;

-- ══ THE ASSERTIONS ═════════════════════════════════════════════════════════
do $$
declare _bad text;
begin
  if (select count(*) from _r) <> 14 then
    raise exception 'FAIL: expected 14 recorded steps, got %.', (select count(*) from _r);
  end if;
  select string_agg(seq || ': ' || stage || ' -> ' || detail, ' | ') into _bad
    from _r where detail like '%<<< WRONG%' or detail like '%WRONG <<<%';
  if _bad is not null then
    raise exception 'FAIL: %', _bad;
  end if;
  raise notice 'SELF-TEST PASSED — 14 steps: every refusal proven beside the access it guards.';
end $$;

rollback;

-- ══════════════════════════════════════════════════════════════════════════
--  EXPECTED — measured live 30 Aug 2026
--    1   head coach posts in headcoaches                      allowed
--    2   plain coach posts in headcoaches                     refused (42501)
--    3   plain coach reads headcoaches                        sees nothing
--    4   head coach reads headcoaches                         sees the message
--    5   parent posts in clubstaff                            refused (42501)
--    6   plain coach posts in clubstaff                       allowed
--    7   admin WITHOUT chat-managers posts in managers        refused (42501)
--    8   admin WITH chat-managers posts in managers           allowed
--    9   admin WITHOUT welfare posts in welfare               refused (42501)
--    10  admin WITH welfare posts in welfare                  allowed
--    11  my_chats for the head coach                          headcoaches + clubstaff, not managers
--    12  channel_members(headcoaches) with reason             one member, reason names the squad
--    13  parent asks for the headcoaches member list          refused (42501)
--    14  mention filter in a role channel                     member kept, outsider dropped
-- ══════════════════════════════════════════════════════════════════════════
