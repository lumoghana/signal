-- Shared scheduled transfers: all fixtures, mandates, outcomes and postings roll back.
begin;
create function pg_temp.schedule_assert(p_value boolean,p_label text) returns void language plpgsql as $$
begin if p_value is distinct from true then raise exception 'Schedule integration failed: %',p_label;end if;perform set_config('lumo.schedule.checks',(coalesce(nullif(current_setting('lumo.schedule.checks',true),''),'0')::integer+1)::text,true);end $$;
create function pg_temp.schedule_call(p_command text,p_payload jsonb default '{}') returns jsonb language plpgsql as $$
declare r jsonb;begin
 if p_command not in ('account.open','account.get','schedule.list') and not(p_payload?'attemptId') then p_payload:=p_payload||jsonb_build_object('attemptId','schedule-'||gen_random_uuid()::text);end if;
 execute 'set local role authenticated';r:=public.lumo_rpc(p_command,p_payload);execute 'reset role';return r;
 exception when others then execute 'reset role';raise;end $$;
create function pg_temp.schedule_actor(p_user uuid,p_session uuid) returns void language sql as $$select set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','session_id',p_session)::text,true);$$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();
 pin text:=lpad(floor(random()*1000000)::integer::text,6,'0');suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);r jsonb;v_payload jsonb;sid uuid;daily_id uuid;failed_id uuid;cancel_id uuid;future_due timestamptz:=clock_timestamp()+interval '2 hours';account_a uuid;account_b uuid;v_attempt text:='schedule-replay-'||gen_random_uuid()::text;
begin
 perform set_config('lumo.schedule.checks','0',true);
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,created_at,updated_at)values(a,'authenticated','authenticated','schedule-a-'||suffix||'@example.invalid',now(),'{"lumo_pilot":true}',now(),now()),(b,'authenticated','authenticated','schedule-b-'||suffix||'@example.invalid',now(),'{"lumo_pilot":true}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at)values(sa,a,now(),now()),(sb,b,now(),now());
 perform pg_temp.schedule_actor(a,sa);r:=pg_temp.schedule_call('account.open',jsonb_build_object('handle','schedule_a_'||suffix,'displayName','Schedule A fixture','pin',pin));account_a:=(r#>>'{account,id}')::uuid;
 perform pg_temp.schedule_actor(b,sb);r:=pg_temp.schedule_call('account.open',jsonb_build_object('handle','schedule_b_'||suffix,'displayName','Schedule B fixture','pin',pin));account_b:=(r#>>'{account,id}')::uuid;
 perform pg_temp.schedule_actor(a,sa);r:=pg_temp.schedule_call('wallet.fund',jsonb_build_object('amount',10000,'confirmSandbox',true));perform pg_temp.schedule_assert(r->>'ok'='true','explicit test funds');
 v_payload:=jsonb_build_object('recipientHandle','schedule_b_'||suffix,'amount',1000,'frequency','once','firstDue',to_char(future_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'maxOccurrences',1,'pin',pin,'attemptId',v_attempt);
 r:=pg_temp.schedule_call('schedule.create',v_payload);sid:=(r#>>'{schedule,id}')::uuid;
 perform pg_temp.schedule_assert(sid is not null and r#>>'{schedule,status}'='active','one-off mandate created');
 perform pg_temp.schedule_assert((select balance from lumo_private.accounts where id=account_a)=10000,'mandate creation does not debit money');
 r:=pg_temp.schedule_call('schedule.create',v_payload);perform pg_temp.schedule_assert(r#>>'{schedule,id}'=sid::text and r->>'replayed'='true','lost create response recovers same mandate');
 r:=pg_temp.schedule_call('schedule.create',v_payload||jsonb_build_object('amount',1100));perform pg_temp.schedule_assert(r->>'code'='IDEMPOTENCY_MISMATCH','same attempt cannot change mandate amount');
 update lumo_private.transfer_schedules set next_due=clock_timestamp()-interval '1 second' where id=sid;
 r:=lumo_private.run_schedules();perform pg_temp.schedule_assert(r->>'posted'='1' and r->>'failed'='0','due one-off executes once');
 perform pg_temp.schedule_assert((select balance from lumo_private.accounts where id=account_a)=9000 and(select balance from lumo_private.accounts where id=account_b)=1000,'scheduled debit and credit match');
 perform pg_temp.schedule_assert((select status from lumo_private.transfer_schedules where id=sid)='completed' and(select count(*)from lumo_private.schedule_occurrences where schedule_id=sid)=1,'one-off completes with one immutable occurrence');
 r:=lumo_private.run_schedules();perform pg_temp.schedule_assert(r->>'posted'='0' and(select count(*)from lumo_private.schedule_occurrences where schedule_id=sid)=1,'repeated worker tick does not duplicate transfer');
 r:=pg_temp.schedule_call('schedule.list');perform pg_temp.schedule_assert(r#>>'{schedules,0,occurrences,0,receipt,scheduleId}'=sid::text and r#>>'{schedules,0,occurrences,0,receipt,type}'='transfer','schedule history contains real receipt');
 perform pg_temp.schedule_actor(b,sb);r:=pg_temp.schedule_call('schedule.list');perform pg_temp.schedule_assert(r->'schedules'='[]'::jsonb,'recipient cannot see payer mandates');
 r:=pg_temp.schedule_call('schedule.cancel',jsonb_build_object('scheduleId',sid,'pin',pin));perform pg_temp.schedule_assert(r->>'code'='FORBIDDEN','recipient cannot cancel payer mandate');
 perform pg_temp.schedule_actor(a,sa);
 r:=pg_temp.schedule_call('schedule.create',jsonb_build_object('recipientHandle','schedule_b_'||suffix,'amount',2000,'frequency','daily','firstDue',to_char(future_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'maxOccurrences',2,'pin',pin));daily_id:=(r#>>'{schedule,id}')::uuid;perform pg_temp.schedule_assert(daily_id is not null,'bounded daily mandate created');
 update lumo_private.transfer_schedules set next_due=clock_timestamp()-interval '2 days' where id=daily_id;
 r:=lumo_private.run_schedules();perform pg_temp.schedule_assert(r->>'posted'='1' and(select completed_occurrences from lumo_private.transfer_schedules where id=daily_id)=1,'one overdue occurrence per mandate per tick');
 r:=lumo_private.run_schedules();perform pg_temp.schedule_assert(r->>'posted'='1' and(select status from lumo_private.transfer_schedules where id=daily_id)='completed','second due occurrence respects count and ends mandate');
 perform pg_temp.schedule_assert((select balance from lumo_private.accounts where id=account_a)=5000 and(select balance from lumo_private.accounts where id=account_b)=5000,'bounded daily execution conserves funds');
 r:=pg_temp.schedule_call('schedule.create',jsonb_build_object('recipientHandle','schedule_b_'||suffix,'amount',9000,'frequency','once','firstDue',to_char(future_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'pin',pin));failed_id:=(r#>>'{schedule,id}')::uuid;
 update lumo_private.transfer_schedules set next_due=clock_timestamp()-interval '1 second' where id=failed_id;
 r:=lumo_private.run_schedules();perform pg_temp.schedule_assert(r->>'failed'='1' and(select last_failure from lumo_private.transfer_schedules where id=failed_id)='INSUFFICIENT_FUNDS','insufficient actual funds stops mandate');
 perform pg_temp.schedule_assert((select balance from lumo_private.accounts where id=account_a)=5000 and(select balance from lumo_private.accounts where id=account_b)=5000,'failed occurrence moves no funds');
 r:=lumo_private.run_schedules();perform pg_temp.schedule_assert(r->>'posted'='0' and r->>'failed'='0','failed mandate does not silently retry');
 r:=pg_temp.schedule_call('schedule.create',jsonb_build_object('recipientHandle','schedule_b_'||suffix,'amount',1000,'frequency','once','firstDue',to_char(future_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'pin',pin));cancel_id:=(r#>>'{schedule,id}')::uuid;
 r:=pg_temp.schedule_call('schedule.cancel',jsonb_build_object('scheduleId',cancel_id,'pin',pin));perform pg_temp.schedule_assert(r#>>'{schedule,status}'='cancelled' and r#>'{schedule,nextDue}'='null'::jsonb,'payer cancels future mandate');
 r:=pg_temp.schedule_call('schedule.create',jsonb_build_object('recipientHandle','schedule_b_'||suffix,'amount',1000,'frequency','daily','firstDue',to_char(future_due at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'pin',pin));perform pg_temp.schedule_assert(r->>'code'='END_CONDITION_REQUIRED','unbounded recurring mandate rejected');
 r:=pg_temp.schedule_call('schedule.create',jsonb_build_object('recipientHandle','schedule_b_'||suffix,'amount',1000,'frequency','once','firstDue','2020-01-01T00:00:00Z','pin',pin));perform pg_temp.schedule_assert(r->>'code'='INVALID_INPUT','backdated creation rejected');
 perform pg_temp.schedule_assert(lumo_private.schedule_next_due('2028-01-31T10:15:00Z','monthly',31)='2028-02-29T10:15:00Z'::timestamptz and lumo_private.schedule_next_due('2028-02-29T10:15:00Z','monthly',31)='2028-03-31T10:15:00Z'::timestamptz,'monthly schedule preserves anchored day across short months');
 perform pg_temp.schedule_assert(not has_function_privilege('authenticated','lumo_private.run_schedules(integer)','EXECUTE') and not has_function_privilege('service_role','lumo_private.run_schedules(integer)','EXECUTE') and not has_table_privilege('authenticated','lumo_private.transfer_schedules','SELECT'),'worker and mandate tables cannot be invoked directly by clients');
 perform set_config('lumo.schedule.report',jsonb_build_object('checks',current_setting('lumo.schedule.checks')::integer,'testFixturesRolledBack',true,'finalConsumerA',5000,'finalConsumerB',5000)::text,true);
end $$;
set constraints all immediate;
select current_setting('lumo.schedule.report')::jsonb as lumo_schedule_test;
rollback;
