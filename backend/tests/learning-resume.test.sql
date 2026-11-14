-- Bounded authored-learning state, cross-device revisions and owner privacy. Fixtures roll back.
begin;
create function pg_temp.assert_true(value boolean,label text)returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Learning resume failed: %',label;end if;
perform set_config('lumo.learning.checks',(coalesce(nullif(current_setting('lumo.learning.checks',true),''),'0')::integer+1)::text,true);end $$;
create function pg_temp.call(command text,payload jsonb default '{}'::jsonb)returns jsonb language plpgsql as $$
declare r jsonb;begin execute 'set local role authenticated';r:=public.lumo_rpc(command,payload);execute 'reset role';return r;exception when others then execute 'reset role';raise;end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);r jsonb;v_state jsonb;bad jsonb;i integer:=0;
begin
perform set_config('lumo.learning.checks','0',true);
insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data)values(a,'authenticated','authenticated','learn-a-'||suffix||'@example.invalid',now(),now(),now(),'{"lumo_pilot":true}'),(b,'authenticated','authenticated','learn-b-'||suffix||'@example.invalid',now(),now(),now(),'{"lumo_pilot":true}');
insert into auth.sessions(id,user_id,created_at,updated_at)values(sa,a,now(),now()),(sb,b,now(),now());
perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sa)::text,true);
r:=pg_temp.call('account.open',jsonb_build_object('handle','lra_'||suffix,'displayName','Learning A','pin','583901'));
v_state:='{"questionIndex":1,"correct":1,"phase":"lesson"}'::jsonb;
r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','planning-allowance','completed',false,'score',50,'revision',0,'state',v_state,'attemptId','learn-start-'||suffix));
perform pg_temp.assert_true(r->>'ok'='true' and r#>'{progress,state}'=v_state,'lesson position stored');
r:=pg_temp.call('learning.get');perform pg_temp.assert_true(r#>'{progress,0,state}'=v_state,'same account retrieves position across clients');
r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','planning-allowance','completed',false,'score',50,'revision',1,'attemptId','learn-no-state-'||suffix));perform pg_temp.assert_true(r#>'{progress,state}'=v_state,'omitting state preserves previous position');
r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','planning-allowance','completed',true,'score',100,'revision',1,'state','{"questionIndex":2,"correct":2,"phase":"completed"}'::jsonb,'attemptId','learn-stale-'||suffix));perform pg_temp.assert_true(r->>'code'='REVISION_CONFLICT','stale second-device position rejected');
v_state:='{"questionIndex":2,"correct":2,"phase":"completed"}'::jsonb;
r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','planning-allowance','completed',true,'score',100,'revision',2,'state',v_state,'attemptId','learn-finish-'||suffix));perform pg_temp.assert_true(r#>'{progress,state}'=v_state and r#>>'{progress,revision}'='3','current position can complete lesson');
v_state:='{"path":[0,2,1],"phase":"consequence"}'::jsonb;
r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','campus-night-market','completed',false,'score',0,'revision',0,'state',v_state,'attemptId','learn-story-'||suffix));perform pg_temp.assert_true(r#>'{progress,state}'=v_state,'branching story path stored');
for bad in select value from jsonb_array_elements('[null,[],{"unexpected":"secret"},{"questionIndex":101},{"questionIndex":0.5},{"correct":-1},{"path":[3]},{"path":["0"]},{"phase":"admin"}]'::jsonb)loop
 i:=i+1;r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','bad-state-'||i,'completed',false,'score',0,'revision',0,'state',bad,'attemptId','learn-bad-'||suffix||'-'||i));perform pg_temp.assert_true(r->>'ok'='false','invalid state rejected '||i);
end loop;
r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','false-complete','completed',false,'score',0,'revision',0,'state','{"phase":"completed"}'::jsonb,'attemptId','learn-false-complete-'||suffix));perform pg_temp.assert_true(r->>'ok'='false','state cannot claim completed while record incomplete');
perform pg_temp.assert_true(not lumo_private.learning_state_valid(jsonb_build_object('path',(select jsonb_agg(0)from generate_series(1,101)))),'long path rejected');
perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id',sb)::text,true);
r:=pg_temp.call('account.open',jsonb_build_object('handle','lrb_'||suffix,'displayName','Learning B','pin','583901'));
r:=pg_temp.call('learning.get');perform pg_temp.assert_true(jsonb_array_length(r->'progress')=0,'other account cannot read learning state');
perform pg_temp.assert_true(not has_function_privilege('authenticated','lumo_private.learning_state_valid(jsonb)','EXECUTE'),'private validator not exposed');
end $$;
select current_setting('lumo.learning.checks')::integer as checks_passed;
rollback;
