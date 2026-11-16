-- Hosted primitive verification only. Run as one transaction and retain the ROLLBACK.
-- Random synthetic users/sessions, product states and attempts never persist.
begin;
create function pg_temp.assert_maintenance(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Money maintenance assertion failed: %',label;end if;
 perform set_config('lumo.maintenance.checks',(coalesce(nullif(current_setting('lumo.maintenance.checks',true),''),'0')::integer+1)::text,true);
end $$;
create function pg_temp.maintenance_service(command text,payload jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin
 execute 'set local role service_role';result:=public.lumo_approved_service(command,payload);
 execute 'set constraints all immediate';execute 'set constraints all deferred';execute 'reset role';return result;
 exception when others then execute 'reset role';raise;
end $$;
do $$
declare actor_a uuid:=gen_random_uuid();actor_b uuid:=gen_random_uuid();session_a uuid:=gen_random_uuid();session_b uuid:=gen_random_uuid();
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,12);handle_a text;handle_b text;
 result jsonb;payload jsonb;state_a jsonb;state_b jsonb;journals_before bigint;attempts_before bigint;
begin
 perform set_config('lumo.maintenance.checks','0',true);handle_a:='maint-a-'||suffix;handle_b:='maint-b-'||suffix;
 perform pg_temp.assert_maintenance(not has_function_privilege('anon','public.lumo_approved_service(text,jsonb)','EXECUTE'),'anonymous cannot submit trusted state');
 perform pg_temp.assert_maintenance(not has_function_privilege('authenticated','public.lumo_approved_service(text,jsonb)','EXECUTE'),'authenticated clients cannot bypass the Edge boundary');
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (actor_a,'authenticated','authenticated',handle_a||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now()),
 (actor_b,'authenticated','authenticated',handle_b||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(session_a,actor_a,now(),now()),(session_b,actor_b,now(),now());
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=pg_temp.maintenance_service('provision',jsonb_build_object('actor',actor_a,'session',session_a,'mode','consumer','handle',handle_a,'displayName','Maintenance fixture A','pin','3159'));
 perform pg_temp.assert_maintenance(result->>'ok'='true' and result->'account'->>'balance'='0','first synthetic account starts with zero ledger funds');
 result:=pg_temp.maintenance_service('provision',jsonb_build_object('actor',actor_b,'session',session_b,'mode','consumer','handle',handle_b,'displayName','Maintenance fixture B','pin','2653'));
 perform pg_temp.assert_maintenance(result->>'ok'='true','second isolated synthetic account exists');
 select count(*) into journals_before from lumo_private.journals;
 select count(*) into attempts_before from lumo_private.approved_attempts where user_id=actor_a;
 state_a:=jsonb_build_object('wallet',0,'settings','{}'::jsonb,'groups','[]'::jsonb,
  'moneyMaintenance',jsonb_build_object('version',1,'revision',1,'experience','minimal','checkDay',1,'lastCheckAt',null,'recurringKeys',jsonb_build_array('fixture-food')),
  'externalBalances',jsonb_build_array(jsonb_build_object('id','fixture-cash','type','cash','name','Cash fixture','balance',2500,'revision',1,'updatedAt',now(),'confirmedAt',now())),
  'externalBalanceHistory',jsonb_build_array(jsonb_build_object('id','fixture-record-only','externalBalanceId','fixture-cash','amount',500,'direction','out')),
  'budget',jsonb_build_object('created',true,'periodId','fixture-period','items',jsonb_build_array(jsonb_build_object('id','fixture-food','name','Food','amount',5000,'spent',500))),
  'budgetHistory','[]'::jsonb);
 payload:=jsonb_build_object('actor',actor_a,'session',session_a,'attemptId','maintenance-fixture-one','fingerprint',repeat('a',64),
  'expectedRevision',0,'expectedWallet',0,'state',state_a,'groups','[]'::jsonb,'boxes','[]'::jsonb,'requests','[]'::jsonb,'partners','[]'::jsonb,
  'privateReports','[]'::jsonb,'intents','[]'::jsonb,'requiresAuth',false,'result','{"ok":true,"message":"Record-only fixture"}'::jsonb);
 result:=pg_temp.maintenance_service('commit',payload);
 perform pg_temp.assert_maintenance(result->>'ok'='true' and jsonb_array_length(result->'receipts')=0,'record-only state commits without a PIN or ledger receipt');
 perform pg_temp.assert_maintenance((select state->'moneyMaintenance'=state_a->'moneyMaintenance' and state->'externalBalances'=state_a->'externalBalances' and state->'budget'=state_a->'budget' from lumo_private.approved_states where user_id=actor_a),'maintenance metadata round-trips through existing private JSON state');
 perform pg_temp.assert_maintenance((select count(*) from lumo_private.journals)=journals_before,'record-only save creates no ledger journals');
 perform pg_temp.assert_maintenance((select balance=0 from lumo_private.accounts where owner_user_id=actor_a and kind='consumer'),'manual outside balance never becomes wallet funds');
 result:=pg_temp.maintenance_service('commit',payload);
 perform pg_temp.assert_maintenance(result->>'replayed'='true' and (select revision=1 from lumo_private.approved_states where user_id=actor_a),'same reference replays without another state revision');
 perform pg_temp.assert_maintenance((select count(*) from lumo_private.approved_attempts where user_id=actor_a)=attempts_before+1,'one original reference is persisted once');
 result:=pg_temp.maintenance_service('commit',payload||jsonb_build_object('fingerprint',repeat('b',64)));
 perform pg_temp.assert_maintenance(result->>'code'='IDEMPOTENCY_CONFLICT','same reference rejects changed details');
 result:=pg_temp.maintenance_service('commit',payload||jsonb_build_object('attemptId','maintenance-fixture-stale','fingerprint',repeat('c',64)));
 perform pg_temp.assert_maintenance(result->>'code'='REVISION_CONFLICT','stale state cannot overwrite a newer record');
 result:=pg_temp.maintenance_service('load',jsonb_build_object('actor',actor_a,'session',session_b));
 perform pg_temp.assert_maintenance(result->>'code'='SESSION_REVOKED','another user session cannot load the first user records');
 result:=pg_temp.maintenance_service('load',jsonb_build_object('actor',actor_b,'session',session_b));state_b:=result->'state';
 perform pg_temp.assert_maintenance(result->>'ok'='true' and (state_b is null or state_b='null'::jsonb),'second user does not receive first user maintenance state');
 result:=pg_temp.maintenance_service('commit',payload||jsonb_build_object('attemptId','maintenance-fixture-unbacked','fingerprint',repeat('d',64),'expectedRevision',1,'state',jsonb_set(state_a,'{wallet}','1000'::jsonb)));
 perform pg_temp.assert_maintenance(result->>'code'='UNBACKED_STATE','even trusted state cannot invent wallet money without a ledger source');
 perform pg_temp.assert_maintenance((select revision=1 and state=state_a from lumo_private.approved_states where user_id=actor_a),'failed unbacked update leaves saved metadata unchanged');
 perform pg_temp.assert_maintenance((select count(*) from lumo_private.journals)=journals_before,'all replay and rejection probes leave journals unchanged');
 update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=session_a;
 result:=pg_temp.maintenance_service('load',jsonb_build_object('actor',actor_a,'session',session_a));
 perform pg_temp.assert_maintenance(result->>'code'='SESSION_REVOKED','expired live session cannot read maintenance metadata');
end $$;
select jsonb_build_object('checks',current_setting('lumo.maintenance.checks')::integer,'fixturesRolledBack',true,'newLedgerJournals',0) as money_maintenance_persistence_verification;
rollback;
