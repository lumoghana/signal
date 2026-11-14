-- Synthetic users and sessions only. Every fixture and repair rolls back.
begin;
create function pg_temp.assert_pin_repair(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'PIN repair assertion failed: %',label;end if;
 perform set_config('lumo.pin_repair.checks',(coalesce(nullif(current_setting('lumo.pin_repair.checks',true),''),'0')::integer+1)::text,true);
end $$;
create function pg_temp.repair(command text,payload jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin
 execute 'set local role service_role';result:=public.lumo_approved_pin_repair(command,payload);execute 'reset role';return result;
 exception when others then execute 'reset role';raise;
end $$;
create function pg_temp.approved_pin(command text,payload jsonb) returns jsonb language plpgsql as $$declare result jsonb;begin
 execute 'set local role service_role';result:=public.lumo_approved_service(command,payload);execute 'reset role';return result;
 exception when others then execute 'reset role';raise;
end $$;
do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();evil uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();sc uuid:=gen_random_uuid();se uuid:=gen_random_uuid();sa2 uuid:=gen_random_uuid();old_proof uuid:=gen_random_uuid();fresh_proof uuid:=gen_random_uuid();
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);ha text;hb text;hc text;
 result jsonb;request_id uuid;second_id uuid;hash_before text;domain_before jsonb;wallet_before bigint;new_pin text:='0426';device_id text:='pin-repair-fixture-device';n integer;
begin
 perform set_config('lumo.pin_repair.checks','0',true);ha:='repair.a.'||suffix;hb:='repair.b.'||suffix;hc:='repair.c.'||suffix;
 perform pg_temp.assert_pin_repair(not has_function_privilege('anon','public.lumo_approved_pin_repair(text,jsonb)','EXECUTE'),'anon cannot call privileged repair');
 perform pg_temp.assert_pin_repair(not has_function_privilege('authenticated','public.lumo_approved_pin_repair(text,jsonb)','EXECUTE'),'signed-in clients cannot forge proof RPC');
 perform pg_temp.assert_pin_repair(has_function_privilege('service_role','public.lumo_approved_pin_repair(text,jsonb)','EXECUTE'),'only gateway role has RPC execute');
 perform pg_temp.assert_pin_repair(not has_table_privilege('service_role','lumo_private.approved_pin_repairs','SELECT,INSERT,UPDATE,DELETE'),'service cannot bypass guarded repair through raw tables');
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (a,'authenticated','authenticated',ha||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now()),
 (b,'authenticated','authenticated',hb||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true,"lumo_approved_password":true}','{}',now(),now()),
 (c,'authenticated','authenticated',hc||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now()),
 (evil,'authenticated','authenticated','repair.e.'||suffix||'@pilot.lumo.invalid',now(),'{}','{"lumo_pilot":true}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,now(),now()),(sb,b,now(),now()),(sc,c,now(),now()),(se,evil,now(),now()),(sa2,a,now(),now()),(old_proof,a,now()-interval '1 hour',now());
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 result:=pg_temp.approved_pin('provision',jsonb_build_object('actor',a,'session',sa,'handle',ha,'displayName','Legacy fixture','phone','0248889901','pin','3159'));
 perform pg_temp.assert_pin_repair(result->>'ok'='true','first new registration still provisions');
 perform pg_temp.approved_pin('provision',jsonb_build_object('actor',b,'session',sb,'handle',hb,'displayName','New fixture','phone','0248889902','pin','2653'));
 perform pg_temp.approved_pin('provision',jsonb_build_object('actor',c,'session',sc,'handle',hc,'displayName','Rate fixture','phone','0248889903','pin','4762'));
 select pin_hash into hash_before from lumo_private.profiles where user_id=a;
 select balance into wallet_before from lumo_private.accounts where owner_user_id=a and kind='consumer';
 domain_before:='{"wallet":0,"groups":[],"settings":{},"account":{"status":"active"}}';
 insert into lumo_private.approved_states(user_id,state) values(a,domain_before);
 result:=pg_temp.repair('status',jsonb_build_object('actor',a,'session',sb));perform pg_temp.assert_pin_repair(result->>'code'='SESSION_REVOKED','another owner session cannot inspect eligibility');
 result:=pg_temp.repair('status',jsonb_build_object('actor',evil,'session',se));perform pg_temp.assert_pin_repair(result->>'code'='SESSION_REVOKED','editable metadata cannot grant test eligibility');
 result:=pg_temp.repair('status',jsonb_build_object('actor',a,'session',sa));perform pg_temp.assert_pin_repair(result->>'eligible'='true' and result->>'repaired'='false','legacy owner is eligible before one-time repair');
 perform pg_temp.assert_pin_repair(not exists(select 1 from lumo_private.approved_pin_repair_attempts where user_id=a),'status read creates no proof or rate attempt');
 result:=pg_temp.repair('begin',jsonb_build_object('actor',b,'session',sb));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_UNAVAILABLE','new approved accounts cannot use legacy repair');
 update lumo_private.approved_states set state=jsonb_set(state,'{account,status}','"closed"') where user_id=a;
 result:=pg_temp.repair('begin',jsonb_build_object('actor',a,'session',sa));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_UNAVAILABLE','canonical closed state cannot repair a PIN');
 update lumo_private.approved_states set state=domain_before where user_id=a;
 result:=pg_temp.approved_pin('provision',jsonb_build_object('actor',a,'session',sa,'handle',ha,'displayName','Legacy fixture','phone','0248889901','pin',new_pin));
 perform pg_temp.assert_pin_repair(result->>'code'='EXISTING_ACCOUNT' and (select pin_hash=hash_before from lumo_private.profiles where user_id=a),'repeated registration cannot silently ignore a different newly chosen PIN');
 result:=pg_temp.approved_pin('pin.change',jsonb_build_object('actor',a,'session',sa,'oldPin','1111','newPin',new_pin));
 perform pg_temp.assert_pin_repair(result->>'code'='PIN_REQUIRED' and (select pin_hash=hash_before from lumo_private.profiles where user_id=a),'ordinary PIN change still requires existing PIN');
 result:=pg_temp.repair('begin',jsonb_build_object('actor',a,'session',sa));request_id:=(result->>'requestId')::uuid;
 perform pg_temp.assert_pin_repair(result->>'ok'='true','eligible attempt is reserved before a password check');
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',request_id,'proofSession',sb,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_EXPIRED','another user password session cannot authorize repair');
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',request_id,'proofSession',old_proof,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_EXPIRED','an old same-user session is not fresh password proof');
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',request_id,'proofSession',sa,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_EXPIRED','original caller session cannot be its own reauthentication proof');
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa2,'requestId',request_id,'proofSession',old_proof,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_EXPIRED','repair attempt cannot migrate to another caller session');
 update lumo_private.approved_pin_repair_attempts set expires_at=clock_timestamp()-interval '1 second' where id=request_id;
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',request_id,'proofSession',old_proof,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_EXPIRED','expired request cannot authorize repair');
 perform pg_temp.assert_pin_repair((select pin_hash=hash_before from lumo_private.profiles where user_id=a) and not exists(select 1 from lumo_private.approved_pin_repairs where user_id=a),'failed checks preserve original hash and one-time eligibility');
 result:=pg_temp.repair('begin',jsonb_build_object('actor',a,'session',sa));second_id:=(result->>'requestId')::uuid;
 insert into auth.sessions(id,user_id,created_at,updated_at) values(fresh_proof,a,clock_timestamp(),clock_timestamp());
 update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=sa;
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',second_id,'proofSession',fresh_proof,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'code'='SESSION_REVOKED','revoked caller is rechecked before commit');
 update auth.sessions set not_after=null where id=sa;
 update auth.users set raw_app_meta_data=raw_app_meta_data||'{"lumo_approved_password":true}' where id=a;
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',second_id,'proofSession',fresh_proof,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_UNAVAILABLE','legacy metadata is rechecked at commit');
 update auth.users set raw_app_meta_data=raw_app_meta_data-'lumo_approved_password' where id=a;
 insert into lumo_private.approved_devices(id,user_id,session_id,public_key,algorithm) values(device_id,a,sa,'fixture-public-key','ES256');
 insert into lumo_private.approved_challenges(user_id,session_id,device_id,challenge,fingerprint,attempt_id) values(a,sa,device_id,'fixture-challenge','fixture-fingerprint','repair-fixture-attempt');
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',second_id,'proofSession',fresh_proof,'newPin',new_pin));perform pg_temp.assert_pin_repair(result->>'ok'='true' and result->>'repaired'='true','fresh same-owner password proof commits one legacy repair');
 perform pg_temp.assert_pin_repair((select pin_hash<>hash_before and extensions.crypt(new_pin,pin_hash)=pin_hash and pin_failures=0 and pin_locked_until is null from lumo_private.profiles where user_id=a),'new leading-zero PIN is hashed exactly and failure state cleared');
 perform pg_temp.assert_pin_repair((select consumed_at is not null from lumo_private.approved_pin_repair_attempts where id=second_id) and (select count(*)=1 from lumo_private.approved_pin_repairs where user_id=a),'proof consumption and one-time audit marker commit together');
 perform pg_temp.assert_pin_repair(not exists(select 1 from lumo_private.approved_devices where user_id=a and revoked_at is null) and not exists(select 1 from lumo_private.approved_challenges where user_id=a and consumed_at is null),'all prior biometric devices and challenges are invalidated');
 perform pg_temp.assert_pin_repair((select balance=wallet_before from lumo_private.accounts where owner_user_id=a and kind='consumer') and (select state=domain_before from lumo_private.approved_states where user_id=a) and not exists(select 1 from lumo_private.journals where actor_user_id=a),'repair leaves balances, ledger and domain state unchanged');
 perform pg_temp.assert_pin_repair(exists(select 1 from lumo_private.inbox where user_id=a and kind='security.pin_repaired' and body not like '%'||new_pin||'%'),'security notification contains no raw PIN');
 result:=pg_temp.repair('status',jsonb_build_object('actor',a,'session',sa));perform pg_temp.assert_pin_repair(result->>'eligible'='false' and result->>'repaired'='true','completed status reports only own one-time repair');
 result:=pg_temp.repair('begin',jsonb_build_object('actor',a,'session',sa));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_UNAVAILABLE','repair cannot be used a second time');
 result:=pg_temp.repair('commit',jsonb_build_object('actor',a,'session',sa,'requestId',second_id,'proofSession',fresh_proof,'newPin','5555'));perform pg_temp.assert_pin_repair(result->>'code'='PIN_REPAIR_UNAVAILABLE','replayed successful proof cannot replace repaired PIN');
 for n in 1..5 loop result:=pg_temp.repair('begin',jsonb_build_object('actor',c,'session',sc));perform pg_temp.assert_pin_repair(result->>'ok'='true','bounded per-user password-check attempt');end loop;
 result:=pg_temp.repair('begin',jsonb_build_object('actor',c,'session',sc));perform pg_temp.assert_pin_repair(result->>'code'='RATE_LIMITED','sixth password-check request is denied before credential verification');
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 result:=pg_temp.repair('status',jsonb_build_object('actor',a,'session',sa));perform pg_temp.assert_pin_repair(result->>'code'='FORBIDDEN','trusted role assertion is checked in addition to execute grants');
end $$;
set constraints all immediate;
select current_setting('lumo.pin_repair.checks')::integer as passed_pin_repair_database_checks;
rollback;
