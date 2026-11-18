-- Behaviour and authorisation checks. Every fixture and action is rolled back.
begin;
-- Exercise the enforced production policy explicitly; the live pilot exception is tested separately.
update lumo_private.admin_auth_policy set require_mfa=true where id;
create function pg_temp.admin_assert(p_value boolean,p_label text) returns void language plpgsql as $$begin
 if p_value is distinct from true then raise exception 'Admin check failed: %',p_label;end if;
 perform set_config('lumo.admin.checks',(coalesce(nullif(current_setting('lumo.admin.checks',true),''),'0')::integer+1)::text,true);
end $$;
do $test$
#variable_conflict use_variable
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();tech uuid:=gen_random_uuid();aud uuid:=gen_random_uuid();setup_user uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();sc uuid:=gen_random_uuid();sd uuid:=gen_random_uuid();st uuid:=gen_random_uuid();su uuid:=gen_random_uuid();
 ca uuid;da uuid;ma uuid;merchant uuid:=gen_random_uuid();shop uuid:=gen_random_uuid();payment uuid;funding uuid;
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);email text;tok text:=encode(extensions.gen_random_bytes(32),'hex');base jsonb;other jsonb;out jsonb;cmd text;case_id uuid;source_case uuid;incident uuid;approval uuid;balance_before bigint;
begin
 perform set_config('lumo.admin.checks','0',true);
 email:='setup-'||suffix||'@example.test';
 insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at) values
 (a,'authenticated','authenticated','admin-'||suffix||'@example.test','{}',now(),now(),now()),
 (b,'authenticated','authenticated','supervisor-'||suffix||'@example.test','{}',now(),now(),now()),
 (tech,'authenticated','authenticated','technical-'||suffix||'@example.test','{}',now(),now(),now()),
 (aud,'authenticated','authenticated','auditor-'||suffix||'@example.test','{}',now(),now(),now()),
 (c,'authenticated','authenticated','consumer-'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now()),
 (d,'authenticated','authenticated','recipient-'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now()),
 (setup_user,'authenticated','authenticated',email,'{}',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,now(),now()),(sb,b,now(),now()),(sc,c,now(),now()),(sd,d,now(),now()),(st,tech,now(),now()),(su,aud,now(),now());
 insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) values
 (gen_random_uuid(),a,'Fixture','totp','verified','fixture-not-a-real-secret',now(),now()),(gen_random_uuid(),b,'Fixture','totp','verified','fixture-not-a-real-secret',now(),now()),(gen_random_uuid(),tech,'Fixture','totp','verified','fixture-not-a-real-secret',now(),now()),(gen_random_uuid(),aud,'Fixture','totp','verified','fixture-not-a-real-secret',now(),now());
 insert into lumo_private.admin_staff(user_id,display_name,email,role) values(a,'Admin fixture','admin-'||suffix||'@example.test','super_admin'),(b,'Supervisor fixture','supervisor-'||suffix||'@example.test','supervisor'),(tech,'Technical fixture','technical-'||suffix||'@example.test','technical'),(aud,'Auditor fixture','auditor-'||suffix||'@example.test','auditor');
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(c,'consumer_'||suffix,'Consumer fixture','fixture'),(d,'recipient_'||suffix,'Recipient fixture','fixture');
 insert into lumo_private.approved_profiles(user_id,phone,personal_account) values(c,null,true),(d,null,true);
 insert into lumo_private.accounts(owner_user_id,kind) values(c,'consumer') returning id into ca;
 insert into lumo_private.accounts(owner_user_id,kind) values(d,'consumer') returning id into da;
 insert into lumo_private.accounts(owner_user_id,kind) values(d,'merchant') returning id into ma;
 insert into lumo_private.merchants(id,owner_user_id,account_id,name) values(merchant,d,ma,'Merchant fixture '||suffix);
 insert into lumo_private.shops(id,merchant_id,name) values(shop,merchant,'Shop fixture');
 insert into lumo_private.shop_settings(shop_id,location,published) values(shop,'Legon',true);
 insert into lumo_private.approved_states(user_id,state) values(c,jsonb_build_object('onboardingDone',true,'account',jsonb_build_object('supportCases',jsonb_build_array(jsonb_build_object('id','source-'||suffix,'title','Consumer source case','body','Missing payment receipt','status','open','createdAt',clock_timestamp(),'updates','[]'::jsonb))),'budget',jsonb_build_object('created',true,'items',jsonb_build_array(jsonb_build_object('id','food','name','Food','amount',1000,'spent',200))),'boxes','[]'::jsonb,'ious','[]'::jsonb,'externalBalances','[]'::jsonb));
 update lumo_private.approved_merchant_network set document=jsonb_set(document,array['businesses',merchant::text],jsonb_build_object('business',jsonb_build_object('id',merchant,'name','Merchant fixture'),'tickets',jsonb_build_array(jsonb_build_object('id','merchant-ticket-'||suffix,'subject','Merchant source case','message','Please check the counter','status','open','createdAt',clock_timestamp())),'counterDevices','[]'::jsonb,'closings','[]'::jsonb)),revision=revision+1 where id;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform lumo_private.approved_actor_context(c,sc);
 select id into funding from lumo_private.accounts where kind='test_funding';
 perform lumo_private.post_money(c,'test_funding',5000,funding,ca);
 payment:=lumo_private.post_money(c,'transfer',1000,ca,da);
 set constraints all immediate;set constraints all deferred;
 base:=jsonb_build_object('actor',a,'session',sa,'aal','aal2');other:=jsonb_build_object('actor',b,'session',sb,'aal','aal2');
 perform pg_temp.admin_assert(not has_function_privilege('anon','public.lumo_admin_service(text,jsonb)','execute'),'anonymous cannot invoke admin RPC');
 perform pg_temp.admin_assert(not has_function_privilege('authenticated','public.lumo_admin_service(text,jsonb)','execute'),'consumer JWT cannot invoke admin RPC');
 perform pg_temp.admin_assert(not has_table_privilege('service_role','lumo_private.admin_staff','select,insert,update,delete'),'staff table exposed only by approved RPC');
 perform pg_temp.admin_assert(not has_table_privilege('authenticated','lumo_private.admin_audit','select,insert,update,delete'),'audit table private');
 out:=public.lumo_admin_service('session',base||'{"aal":"aal1"}');perform pg_temp.admin_assert(out->>'ok'='true' and out#>>'{data,requiresMfa}'='true','session enrolment state available without operational data');
 out:=public.lumo_admin_service('overview',base||'{"aal":"aal1"}');perform pg_temp.admin_assert(out->>'code'='MFA_REQUIRED','all operational reads require MFA');
 out:=public.lumo_admin_service('overview',base||jsonb_build_object('session',gen_random_uuid()));perform pg_temp.admin_assert(out->>'code'='SESSION_REVOKED','forged live session rejected');
 out:=public.lumo_admin_service('overview',jsonb_build_object('actor',c,'session',sc,'aal','aal2'));perform pg_temp.admin_assert(out->>'code'='STAFF_REQUIRED','consumer identities do not become staff');
 out:=public.lumo_admin_service('products.get',jsonb_build_object('actor',tech,'session',st,'aal','aal2','id',c));perform pg_temp.admin_assert(out->>'code'='FORBIDDEN','technical role cannot inspect personal plans');
 out:=public.lumo_admin_service('cases.create',jsonb_build_object('actor',aud,'session',su,'aal','aal2','subject','Forbidden'));perform pg_temp.admin_assert(out->>'code'='FORBIDDEN','auditor is read-only');
 out:=public.lumo_admin_service('staff.list',other);perform pg_temp.admin_assert(out->>'code'='FORBIDDEN','supervisor cannot provision staff');
 foreach cmd in array array['overview','customers.list','merchants.list','transactions.list','guest.list','cases.list','products.list','incidents.list','reconciliation.list','reports','staff.list','audit.list','approvals.list'] loop
  out:=public.lumo_admin_service(cmd,base);perform pg_temp.admin_assert(out->>'ok'='true','read command '||cmd);
 end loop;
 out:=public.lumo_admin_service('search',base||jsonb_build_object('q',suffix));perform pg_temp.admin_assert(out->>'ok'='true' and jsonb_array_length(out#>'{data,results}')>=2,'universal search links fixture customers and merchant');
 out:=public.lumo_admin_service('customers.get',base||jsonb_build_object('id',c));perform pg_temp.admin_assert(out->>'ok'='true' and (out#>>'{data,record,balance}')::bigint=4000 and out#>>'{data,products,plannedRemaining}'='800','customer detail reads canonical balance and essentials');
 perform pg_temp.admin_assert(position('fixture-not-a-real-secret' in out::text)=0 and position('pin_hash' in out::text)=0,'customer projection omits credentials');
 out:=public.lumo_admin_service('merchants.get',base||jsonb_build_object('id',merchant));perform pg_temp.admin_assert(out->>'ok'='true' and jsonb_array_length(out#>'{data,shops}')=1,'merchant detail scoped shops');
 out:=public.lumo_admin_service('products.get',base||jsonb_build_object('id',c));perform pg_temp.admin_assert(out->>'ok'='true','products detail works');
 out:=public.lumo_admin_service('transactions.get',base||jsonb_build_object('id',payment));perform pg_temp.admin_assert(out->>'ok'='true' and jsonb_array_length(out#>'{data,entries}')=2,'transaction timeline contains balanced entries');
 out:=public.lumo_admin_service('transactions.get',base||jsonb_build_object('id',(select reference from lumo_private.journals where id=payment)));perform pg_temp.admin_assert(out->>'ok'='true','human payment reference resolves without UUID cast failure');
 perform pg_temp.admin_assert(exists(select 1 from lumo_private.admin_cases where source_id='consumer:'||c::text||':source-'||suffix),'consumer source report appears in admin queue');
 perform pg_temp.admin_assert(exists(select 1 from lumo_private.admin_cases where source_id='merchant:'||merchant::text||':merchant-ticket-'||suffix),'merchant source report appears in admin queue');
 out:=public.lumo_admin_service('cases.create',base||jsonb_build_object('subject','Admin fixture case','body','Investigating fixture payment','category','payment','priority','high','customerId',c,'transactionId',payment));case_id:=(out#>>'{data,record,id}')::uuid;perform pg_temp.admin_assert(out->>'ok'='true' and case_id is not null,'case creation links payment and customer');
 out:=public.lumo_admin_service('cases.note',base||jsonb_build_object('id',case_id,'body','Private diagnostic note'));perform pg_temp.admin_assert(out->>'ok'='true','case internal note persisted');
 out:=public.lumo_admin_service('cases.get',base||jsonb_build_object('id',case_id));perform pg_temp.admin_assert(out->>'ok'='true' and jsonb_array_length(out#>'{data,notes}')=1,'case read contains authored note');
 out:=public.lumo_admin_service('cases.update',base||jsonb_build_object('id',case_id,'status','resolved'));perform pg_temp.admin_assert(out->>'code'='RESOLUTION_REQUIRED','case cannot close without resolution');
 out:=public.lumo_admin_service('cases.update',base||jsonb_build_object('id',case_id,'status','resolved','resolution','Payment confirmed'));perform pg_temp.admin_assert(out->>'ok'='true' and out#>>'{data,record,status}'='resolved','case closes with recorded resolution');
 select id into source_case from lumo_private.admin_cases where source_id='consumer:'||c::text||':source-'||suffix;
 out:=public.lumo_admin_service('cases.update',base||jsonb_build_object('id',source_case,'status','resolved','resolution','Receipt is confirmed'));perform pg_temp.admin_assert(out->>'ok'='true' and exists(select 1 from lumo_private.approved_states s cross join lateral jsonb_array_elements(s.state#>'{account,supportCases}') x where s.user_id=c and x.value->>'id'='source-'||suffix and x.value->>'status'='resolved'),'consumer support status synchronises with revisioned product state');
 select id into source_case from lumo_private.admin_cases where source_id='merchant:'||merchant::text||':merchant-ticket-'||suffix;
 out:=public.lumo_admin_service('cases.update',base||jsonb_build_object('id',source_case,'status','resolved','resolution','Counter is confirmed'));perform pg_temp.admin_assert(out->>'ok'='true' and (select document#>>array['businesses',merchant::text,'tickets','0','status'] from lumo_private.approved_merchant_network where id)='resolved','merchant support resolution synchronises without deleting ledger history');
 out:=public.lumo_admin_service('incidents.create',base||jsonb_build_object('name','Fixture incident','severity','high','description','Test incident'));incident:=(out#>>'{data,record,id}')::uuid;perform pg_temp.admin_assert(out->>'ok'='true','incident creation');
 out:=public.lumo_admin_service('incidents.get',base||jsonb_build_object('id',incident));perform pg_temp.admin_assert(out->>'ok'='true','incident detail');
 out:=public.lumo_admin_service('incidents.update',base||jsonb_build_object('id',incident,'status','resolved'));perform pg_temp.admin_assert(out->>'code'='RESOLUTION_REQUIRED','incident closure requires resolution');
 out:=public.lumo_admin_service('incidents.update',base||jsonb_build_object('id',incident,'status','resolved','resolution','Recovery verified'));perform pg_temp.admin_assert(out->>'ok'='true','incident resolution recorded');
 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','account.suspend','entityId',c,'caseId',case_id,'reason','Suspected account takeover'));approval:=(out#>>'{data,id}')::uuid;perform pg_temp.admin_assert(out->>'ok'='true','controlled restriction requested');
 out:=public.lumo_admin_service('approvals.get',base||jsonb_build_object('id',approval));perform pg_temp.admin_assert(out->>'ok'='true' and out#>>'{data,record,status}'='pending','approval detail links request');
 out:=public.lumo_admin_service('approvals.decide',base||jsonb_build_object('id',approval,'expectedRevision',1,'requestId',gen_random_uuid(),'decision','approve','reason','Self approval attempt'));perform pg_temp.admin_assert(out->>'code'='SELF_APPROVAL_FORBIDDEN','requester cannot approve own restriction');
 select balance into balance_before from lumo_private.accounts where id=ca;
 out:=public.lumo_admin_service('approvals.decide',other||jsonb_build_object('id',approval,'expectedRevision',1,'requestId',gen_random_uuid(),'decision','approve','reason','Identity checks support restriction'));perform pg_temp.admin_assert(out->>'ok'='true' and out#>>'{data,status}'='executed' and (select status from lumo_private.profiles where user_id=c)='suspended','independent approval executes supported restriction');
 perform pg_temp.admin_assert(not exists(select 1 from auth.sessions where user_id=c) and (select balance from lumo_private.accounts where id=ca)=balance_before,'restriction revokes sessions and preserves money');
 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','payment.refund','entityId',payment,'caseId',case_id,'reason','Refund review requested'));
 perform pg_temp.admin_assert(out->>'code'='INVALID_INPUT','unbounded general refund action requires the separate bounded financial workflow');
 out:=public.lumo_admin_service('staff.update',base||jsonb_build_object('id',a,'role','support','reason','Self role mutation'));perform pg_temp.admin_assert(out->>'code'='SELF_CHANGE_FORBIDDEN','staff cannot mutate own administrative access');
 out:=public.lumo_admin_service('staff.invite',base||jsonb_build_object('email','invite-'||suffix||'@example.test','name','Invite fixture','role','support','tokenHash',encode(extensions.digest(tok,'sha256'),'hex')));perform pg_temp.admin_assert(out->>'ok'='true' and position(tok in out::text)=0,'invitation stores hash and does not return secret');
 insert into lumo_private.admin_setup_tokens(token_hash,email,display_name,role) values(tok,email,'Setup fixture','support');
 out:=public.lumo_admin_service('setup.reserve',jsonb_build_object('tokenHash',tok,'email',email,'name','Setup fixture'));perform pg_temp.admin_assert(out->>'ok'='true','setup reservation binds invitation email');
 out:=public.lumo_admin_service('setup.reserve',jsonb_build_object('tokenHash',tok,'email','wrong@example.test'));perform pg_temp.admin_assert(out->>'code'='SETUP_INVALID','another email cannot claim reserved invitation');
 out:=public.lumo_admin_service('setup.complete',jsonb_build_object('tokenHash',tok,'email',email,'name','Setup fixture','userId',setup_user));perform pg_temp.admin_assert(out->>'ok'='true' and exists(select 1 from lumo_private.admin_staff where user_id=setup_user and role='support'),'verified matching identity completes setup');
 out:=public.lumo_admin_service('setup.complete',jsonb_build_object('tokenHash',tok,'email',email,'name','Setup fixture','userId',setup_user));perform pg_temp.admin_assert(out->>'ok'='true' and out#>>'{data,completed}'='true','lost setup response is safely idempotent');
 out:=public.lumo_admin_service('setup.complete',jsonb_build_object('tokenHash',tok,'email',email,'name','Setup fixture','userId',d));perform pg_temp.admin_assert(out->>'code'='SETUP_INVALID','used invitation cannot enrol a different identity');
 perform pg_temp.admin_assert(exists(select 1 from lumo_private.admin_audit where actor_id=a and action='customers.get' and entity_id=c::text),'sensitive record reads audited');
 begin update lumo_private.admin_audit set reason='Changed' where actor_id=a;raise exception 'Audit mutation unexpectedly permitted';exception when raise_exception then perform pg_temp.admin_assert(SQLERRM='Posted ledger records are immutable','audit trail is append-only');end;
 delete from auth.sessions where id=sa;
 out:=public.lumo_admin_service('overview',base);perform pg_temp.admin_assert(out->>'code'='SESSION_REVOKED','revoked staff session cannot continue with stale JWT');
end $test$;
select current_setting('lumo.admin.checks')::integer as admin_core_postgres_checks;
rollback;
