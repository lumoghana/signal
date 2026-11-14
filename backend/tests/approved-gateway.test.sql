-- Service-only atomic primitives. Original business rules are exercised in approved-engine.test.mjs.
-- All synthetic identities, sessions, journal entries and test funds roll back.
begin;
create function pg_temp.assert_approved(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Approved gateway assertion failed: %',label;end if;
 perform set_config('lumo.approved.checks',(coalesce(nullif(current_setting('lumo.approved.checks',true),''),'0')::integer+1)::text,true);
end $$;
create function pg_temp.approved(command text,payload jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin
 execute 'set local role service_role';result:=public.lumo_approved_service(command,payload);execute 'set constraints all immediate';execute 'set constraints all deferred';execute 'reset role';return result;
 exception when others then execute 'reset role';raise;
end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();evil uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();se uuid:=gen_random_uuid();suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);ha text;hb text;
 result jsonb;payload jsonb;before_count bigint;balance_a bigint;balance_b bigint;challenge_id uuid;
begin
 perform set_config('lumo.approved.checks','0',true);perform set_config('request.jwt.claim.sub','',true);ha:='9a.'||suffix;hb:='9b-'||suffix;
 perform pg_temp.assert_approved(not has_function_privilege('anon','public.lumo_approved_service(text,jsonb)','EXECUTE'),'anonymous cannot call trusted state/ledger service');
 perform pg_temp.assert_approved(not has_function_privilege('authenticated','public.lumo_approved_service(text,jsonb)','EXECUTE'),'authenticated client cannot send a trusted state');
 perform pg_temp.assert_approved(has_function_privilege('service_role','public.lumo_approved_service(text,jsonb)','EXECUTE'),'Edge service has explicit execute');
 perform pg_temp.assert_approved(not has_table_privilege('service_role','lumo_private.approved_states','SELECT,INSERT,UPDATE,DELETE'),'even service uses the guarded RPC, not raw state tables');
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (a,'authenticated','authenticated',ha||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now()),
 (b,'authenticated','authenticated',hb||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now()),
 (evil,'authenticated','authenticated','evil.'||suffix||'@pilot.lumo.invalid',now(),'{}','{"lumo_pilot":true}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,now(),now()),(sb,b,now(),now()),(se,evil,now(),now());
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 result:=pg_temp.approved('load',jsonb_build_object('actor',a,'session',sa));perform pg_temp.assert_approved(result->>'code'='FORBIDDEN','SQL role claim must also be trusted service');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=pg_temp.approved('load',jsonb_build_object('actor',evil,'session',se));perform pg_temp.assert_approved(result->>'code'='SESSION_REVOKED','editable user_metadata cannot grant pilot authority');
 result:=pg_temp.approved('load',jsonb_build_object('actor',a,'session',sb));perform pg_temp.assert_approved(result->>'code'='SESSION_REVOKED','session cannot be replayed under another actor');
 result:=pg_temp.approved('provision',jsonb_build_object('actor',a,'session',sa,'handle',ha,'displayName','Ama fixture','phone','0249999901','pin','3159'));perform pg_temp.assert_approved(result->>'ok'='true' and result->'account'->>'balance'='0','approved leading digit/dot username opens zero account');
 result:=pg_temp.approved('provision',jsonb_build_object('actor',b,'session',sb,'handle',hb,'displayName','Kojo fixture','phone','0249999902','pin','2653'));perform pg_temp.assert_approved(result->>'ok'='true','approved hyphen username opens zero account');
 result:=pg_temp.approved('resolve',jsonb_build_object('actor',a,'session',sa,'query','+233249999902'));perform pg_temp.assert_approved(result->'recipient'->>'userId'=b::text,'phone alias resolves real registered identity');
 result:=pg_temp.approved('resolve',jsonb_build_object('actor',a,'session',sa,'query',b));perform pg_temp.assert_approved(result->'recipient'->>'userId'=b::text,'canonical request UUID resolves only an actual account');
 payload:=jsonb_build_object('actor',a,'session',sa,'attemptId','approved-fund-fixture','fingerprint',repeat('1',64),'expectedRevision',0,'expectedWallet',0,'state',jsonb_build_object('wallet',10000,'groups','[]'::jsonb,'settings',jsonb_build_object('pin','must-not-persist')),'groups','[]'::jsonb,'boxes','[]'::jsonb,'requests','[]'::jsonb,'partners','[]'::jsonb,'requiresAuth',true,'pin','9999','result','{"ok":true}',
 'intents',jsonb_build_array(jsonb_build_object('kind','test_funding','amount',10000,'source','{"kind":"funding"}'::jsonb,'destination','{"kind":"wallet"}'::jsonb,'transactionId','approved-test-fund')));
 result:=pg_temp.approved('commit',payload);perform pg_temp.assert_approved(result->>'code'='PIN_REQUIRED','incorrect PIN cannot fund or persist state');
 perform pg_temp.assert_approved((select pin_failures=1 from lumo_private.profiles where user_id=a),'PIN failure survives a rejected mutation');
 result:=pg_temp.approved('commit',payload||'{"pin":"3159"}');perform pg_temp.assert_approved(result->>'ok'='true','test funds and state commit together');
 perform pg_temp.assert_approved(not (select state->'settings' ? 'pin' from lumo_private.approved_states where user_id=a),'original model PIN is not persisted');
 select count(*) into before_count from lumo_private.journals where actor_user_id=a;
 result:=pg_temp.approved('commit',payload||'{"pin":"3159"}');perform pg_temp.assert_approved(result->>'replayed'='true' and (select count(*) from lumo_private.journals where actor_user_id=a)=before_count,'same reference replays without another posting');
 result:=pg_temp.approved('commit',payload||jsonb_build_object('fingerprint',repeat('2',64)));perform pg_temp.assert_approved(result->>'code'='IDEMPOTENCY_CONFLICT','same reference rejects different original details');
 payload:=payload||jsonb_build_object('attemptId','approved-pay-fixture','fingerprint',repeat('3',64),'expectedRevision',1,'expectedWallet',10000,'state','{"wallet":7000,"groups":[],"settings":{}}'::jsonb,'pin','3159','intents',jsonb_build_array(jsonb_build_object('kind','transfer','amount',3000,'source','{"kind":"wallet"}'::jsonb,'destination',jsonb_build_object('kind','user','id',b),'transactionId','approved-test-pay')));
 result:=pg_temp.approved('commit',payload);perform pg_temp.assert_approved(result->>'ok'='true','cross-identity transfer commits');
 select balance into balance_a from lumo_private.accounts where owner_user_id=a and kind='consumer';select balance into balance_b from lumo_private.accounts where owner_user_id=b and kind='consumer';
 perform pg_temp.assert_approved(balance_a=7000 and balance_b=3000,'recipient wallet is actually credited exactly once');
 perform pg_temp.assert_approved(not exists(select 1 from lumo_private.journals j join lumo_private.entries e on e.journal_id=j.id where j.actor_user_id=a group by j.id having sum(e.amount)<>0 or count(*)<>2),'every posted journal has exactly two balanced entries');
 result:=pg_temp.approved('load',jsonb_build_object('actor',b,'session',sb));perform pg_temp.assert_approved(jsonb_array_length(result->'receipts')=1 and result->'account'->>'balance'='3000','other consumer sees its receipt on next snapshot');
 result:=pg_temp.approved('commit',payload||jsonb_build_object('attemptId','approved-stale-attempt','fingerprint',repeat('4',64)));perform pg_temp.assert_approved(result->>'code'='REVISION_CONFLICT','stale personal revision cannot double spend');
 payload:=payload||jsonb_build_object('attemptId','approved-unbacked-test','fingerprint',repeat('5',64),'expectedRevision',2,'expectedWallet',7000,'state','{"wallet":6901,"groups":[],"settings":{}}'::jsonb,'boxes',jsonb_build_array(jsonb_build_object('id','box-rollback-'||suffix,'before',0,'after',0)),'intents',jsonb_build_array(jsonb_build_object('kind','transfer','amount',100,'source','{"kind":"wallet"}'::jsonb,'destination',jsonb_build_object('kind','user','id',b))));
 result:=pg_temp.approved('commit',payload);perform pg_temp.assert_approved(result->>'code'='UNBACKED_STATE','engine/ledger conservation mismatch is rejected');
 perform pg_temp.assert_approved((select balance=7000 from lumo_private.accounts where owner_user_id=a and kind='consumer') and (select balance=3000 from lumo_private.accounts where owner_user_id=b and kind='consumer'),'unbacked state rolls back BOTH ledger sides');
 perform pg_temp.assert_approved(not exists(select 1 from lumo_private.approved_boxes where id='box-rollback-'||suffix),'failed atomic commit also rolls back created ledger account mapping');
 result:=pg_temp.approved('device.register',jsonb_build_object('actor',a,'session',sa,'deviceId','fixture-device-one','publicKey',repeat('A',100),'algorithm','ES256','pin','3159'));perform pg_temp.assert_approved(result->>'ok'='true','PIN authorizes registering public device proof key');
 result:=pg_temp.approved('device.challenge',jsonb_build_object('actor',a,'session',sa,'deviceId','fixture-device-one','challenge','opaque-bound-challenge','fingerprint',repeat('6',64),'attemptId','approved-device-test'));challenge_id:=(result->>'challengeId')::uuid;
 payload:=jsonb_build_object('actor',a,'session',sa,'attemptId','approved-device-test','fingerprint',repeat('6',64),'expectedRevision',2,'expectedWallet',7000,'state','{"wallet":7000,"groups":[],"settings":{}}'::jsonb,'groups','[]'::jsonb,'boxes','[]'::jsonb,'requests','[]'::jsonb,'partners','[]'::jsonb,'intents','[]'::jsonb,'requiresAuth',true,'verifiedChallengeId',challenge_id,'result','{"ok":true}');
 result:=pg_temp.approved('commit',payload);perform pg_temp.assert_approved(result->>'ok'='true' and (select consumed_at is not null from lumo_private.approved_challenges where id=challenge_id),'Edge-verified challenge consumes atomically with the exact mutation');
 result:=pg_temp.approved('device.get',jsonb_build_object('actor',a,'session',sa,'deviceId','fixture-device-one','challengeId',challenge_id));perform pg_temp.assert_approved(result->>'code'='DEVICE_PROOF_INVALID','consumed challenge cannot authorize a second action');
 update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=sa;
 result:=pg_temp.approved('load',jsonb_build_object('actor',a,'session',sa));perform pg_temp.assert_approved(result->>'code'='SESSION_REVOKED','revoked live session blocks reads and money even with unexpired JWT');
end $$;
select jsonb_build_object('checks',current_setting('lumo.approved.checks')::integer,'fixturesRolledBack',true) as approved_gateway_verification;
rollback;
