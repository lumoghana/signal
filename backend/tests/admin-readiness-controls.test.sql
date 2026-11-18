-- Synthetic local fixture only. Every action, policy and canonical posting rolls back.
begin;
create function pg_temp.admin_ready_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Admin readiness check failed: %',label;end if;
 perform set_config('lumo.admin_ready.checks',(coalesce(nullif(current_setting('lumo.admin_ready.checks',true),''),'0')::integer+1)::text,true);
end $$;
do $fixture$
#variable_conflict use_variable
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();support uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();merchant_user uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();ss uuid:=gen_random_uuid();sc uuid:=gen_random_uuid();sm uuid:=gen_random_uuid();
 base jsonb;other jsonb;sup jsonb;out jsonb;payload jsonb;case_id uuid;restore_id uuid;suspend_id uuid;ident uuid;key uuid:=gen_random_uuid();decision_key uuid:=gen_random_uuid();
 funding uuid;wallet uuid;merchant_account uuid;merchant uuid;shop uuid;payment uuid;approval_id uuid;keys uuid[]:='{}';i integer;page integer;seen uuid[]:='{}';row jsonb;
begin
 perform set_config('lumo.admin_ready.checks','0',true);
 insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values(a,'admin-ready-a@example.test',now(),'{}'),(b,'admin-ready-b@example.test',now(),'{}'),(support,'admin-ready-support@example.test',now(),'{}'),(customer,'admin-ready-c@pilot.lumo.invalid',now(),'{"lumo_pilot":true}'),(merchant_user,'admin-ready-m@pilot.lumo.invalid',now(),'{"lumo_pilot":true}');
 insert into auth.sessions(id,user_id) values(sa,a),(sb,b),(ss,support),(sc,customer),(sm,merchant_user);
 insert into lumo_private.admin_staff(user_id,display_name,email,role) values(a,'Access administrator','admin-ready-a@example.test','super_admin'),(b,'Independent reviewer','admin-ready-b@example.test','supervisor'),(support,'Support reviewer','admin-ready-support@example.test','support');
 insert into auth.mfa_factors(id,user_id,factor_type,status) values(gen_random_uuid(),a,'totp','verified'),(gen_random_uuid(),b,'totp','verified');
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(customer,'admin_ready_customer','Synthetic customer','synthetic'),(merchant_user,'admin_ready_merchant','Synthetic merchant','synthetic');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 base:=jsonb_build_object('actor',a,'session',sa,'aal','aal2');other:=jsonb_build_object('actor',b,'session',sb,'aal','aal2');sup:=jsonb_build_object('actor',support,'session',ss,'aal','aal2');
 insert into lumo_private.admin_cases(subject,customer_id,created_by) values('Controlled synthetic restriction',customer,a) returning id into case_id;

 perform pg_temp.admin_ready_assert(not has_function_privilege('anon','public.lumo_admin_service(text,jsonb)','execute'),'anonymous cannot call admin wrapper');
 perform pg_temp.admin_ready_assert(not has_function_privilege('service_role','lumo_private.lumo_admin_service_before_approval_controls(text,jsonb)','execute'),'old approval paths are not directly callable by service role');
 perform pg_temp.admin_ready_assert(not has_table_privilege('service_role','lumo_private.admin_target_revisions','select,insert,update,delete'),'target versions remain private');
 payload:=base||jsonb_build_object('action','account.restore','entityId',customer,'caseId',case_id,'reason','Original restoration evidence');
 out:=public.lumo_admin_service('approvals.create',payload);perform pg_temp.admin_ready_assert(out->>'code'='INVALID_INPUT','creation requires stable request key');
 payload:=payload||jsonb_build_object('requestId',key);
 out:=public.lumo_admin_service('approvals.create',payload);restore_id:=(out#>>'{data,id}')::uuid;
 perform pg_temp.admin_ready_assert(out->>'ok'='true' and out#>>'{data,record,targetRevision}'='0','proposal captures existing target version');
 out:=public.lumo_admin_service('approvals.create',payload);
 perform pg_temp.admin_ready_assert(out#>>'{data,id}'=restore_id::text and out#>>'{data,replayed}'='true','lost-response retry returns original proposal');
 perform pg_temp.admin_ready_assert((select count(*) from lumo_private.admin_approvals where requested_by=a and request_key=key)=1,'one stored proposal per actor/request key');
 perform pg_temp.admin_ready_assert((select count(*) from lumo_private.admin_audit where action='approvals.create' and entity_id=restore_id::text)=1,'replay creates no second creation audit');
 out:=public.lumo_admin_service('approvals.create',payload||'{"reason":"Different evidence"}');perform pg_temp.admin_ready_assert(out->>'code'='IDEMPOTENCY_CONFLICT','same reference cannot change evidence');
 out:=public.lumo_admin_service('approvals.decide',base||jsonb_build_object('id',restore_id,'expectedRevision',1,'requestId',gen_random_uuid(),'decision','approve','reason','Attempt own approval'));
 perform pg_temp.admin_ready_assert(out->>'code'='SELF_APPROVAL_FORBIDDEN','requester still cannot approve own action');

 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','account.suspend','entityId',customer,'caseId',case_id,'reason','Newer fraud evidence'));
 suspend_id:=(out#>>'{data,id}')::uuid;
 payload:=other||jsonb_build_object('id',suspend_id,'expectedRevision',1,'requestId',decision_key,'decision','approve','reason','Newer restriction reviewed');
 out:=public.lumo_admin_service('approvals.decide',payload);
 perform pg_temp.admin_ready_assert(out->>'ok'='true' and out#>>'{data,status}'='executed' and (select status from lumo_private.profiles where user_id=customer)='suspended','newer suspension executes');
 perform pg_temp.admin_ready_assert((select revision from lumo_private.admin_target_revisions where target_type='account' and entity_id=customer)=1,'restriction advances target version');
 out:=public.lumo_admin_service('approvals.decide',payload);perform pg_temp.admin_ready_assert(out#>>'{data,replayed}'='true','decision lost-response retry returns original execution');
 out:=public.lumo_admin_service('approvals.decide',other||jsonb_build_object('id',restore_id,'expectedRevision',1,'requestId',gen_random_uuid(),'decision','approve','reason','Stale original evidence'));
 perform pg_temp.admin_ready_assert(out->>'code'='STALE_APPROVAL' and (select status from lumo_private.profiles where user_id=customer)='suspended','old restore cannot undo later suspension');
 perform pg_temp.admin_ready_assert((select status from lumo_private.admin_approvals where id=restore_id)='superseded','older pending action is explicitly superseded');

 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','account.restore','entityId',customer,'caseId',case_id,'reason','Current independent evidence'));ident:=(out#>>'{data,id}')::uuid;
 out:=public.lumo_admin_service('approvals.decide',other||jsonb_build_object('id',ident,'expectedRevision',99,'requestId',gen_random_uuid(),'decision','approve','reason','Wrong viewed revision'));
 perform pg_temp.admin_ready_assert(out->>'code'='STALE_APPROVAL','reviewed request revision must match');
 update lumo_private.admin_approvals set expires_at=clock_timestamp()-interval '1 second' where id=ident;
 out:=public.lumo_admin_service('approvals.decide',other||jsonb_build_object('id',ident,'expectedRevision',1,'requestId',gen_random_uuid(),'decision','approve','reason','Expired viewed proposal'));
 perform pg_temp.admin_ready_assert(out->>'code'='APPROVAL_EXPIRED' and (select status from lumo_private.admin_approvals where id=ident)='expired','expired proposals cannot execute');
 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','account.restore','entityId',customer,'caseId',case_id,'reason','Later restoration evidence'));ident:=(out#>>'{data,id}')::uuid;
 update lumo_private.profiles set status='active' where user_id=customer;
 out:=public.lumo_admin_service('approvals.decide',other||jsonb_build_object('id',ident,'expectedRevision',1,'requestId',gen_random_uuid(),'decision','approve','reason','Target already changed'));
 perform pg_temp.admin_ready_assert(out->>'code'='STALE_APPROVAL','a status update outside approvals invalidates captured target');
 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','account.suspend','entityId',customer,'caseId',case_id,'reason','Withdrawn investigation'));ident:=(out#>>'{data,id}')::uuid;
 payload:=base||jsonb_build_object('id',ident,'expectedRevision',1,'requestId',gen_random_uuid(),'reason','Evidence no longer supports request');
 out:=public.lumo_admin_service('approvals.cancel',payload);perform pg_temp.admin_ready_assert(out#>>'{data,status}'='cancelled','requester can withdraw without executing');
 out:=public.lumo_admin_service('approvals.cancel',payload);perform pg_temp.admin_ready_assert(out#>>'{data,replayed}'='true','withdrawal retries original outcome');
 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','payment.refund','entityId',customer,'caseId',case_id,'reason','Unbounded refund attempt'));
 perform pg_temp.admin_ready_assert(out->>'code'='INVALID_INPUT','unbounded general refund proposals are excluded');

 -- 101 real bounded pending records against one canonical merchant payment.
 insert into lumo_private.accounts(owner_user_id,kind) values(customer,'consumer') returning id into wallet;
 out:=public.lumo_admin_service('approvals.create',base||jsonb_build_object('requestId',gen_random_uuid(),'action','account.restore','entityId',customer,'caseId',case_id,'reason','Account status revision evidence'));ident:=(out#>>'{data,id}')::uuid;
 update lumo_private.accounts set status='suspended' where id=wallet;
 update lumo_private.accounts set status='active' where id=wallet;
 out:=public.lumo_admin_service('approvals.decide',other||jsonb_build_object('id',ident,'expectedRevision',1,'requestId',gen_random_uuid(),'decision','approve','reason','Original snapshot looks identical'));
 perform pg_temp.admin_ready_assert(out->>'code'='STALE_APPROVAL','an account status round trip invalidates its old revision even when the snapshot matches again');
 insert into lumo_private.accounts(owner_user_id,kind) values(merchant_user,'merchant') returning id into merchant_account;
 select id into funding from lumo_private.accounts where kind='test_funding';
 insert into lumo_private.merchants(owner_user_id,account_id,name) values(merchant_user,merchant_account,'Pagination fixture') returning id into merchant;
 insert into lumo_private.shops(merchant_id,name) values(merchant,'Pagination shop') returning id into shop;
 insert into lumo_private.shop_settings(shop_id,published,location) values(shop,true,'Legon');
 insert into auth.sessions(id,user_id) values(gen_random_uuid(),customer) returning id into sc;
 perform lumo_private.approved_actor_context(customer,sc);
 perform lumo_private.post_money(customer,'test_funding',5000,funding,wallet);
 payment:=lumo_private.post_money(customer,'merchant_payment',1000,wallet,merchant_account,shop);
 set constraints all immediate;set constraints all deferred;
 for i in 1..101 loop
  insert into lumo_private.admin_approvals(action,entity_id,reason,case_id,requested_by) values('payment.refund',payment::text,'Bounded pagination fixture',case_id,a) returning id into approval_id;
  insert into lumo_private.admin_refund_controls(approval_id,original_payment_id,amount,request_key,requested_by) values(approval_id,payment,1,gen_random_uuid(),a);
 end loop;
 for page in 1..5 loop
  out:=public.lumo_admin_financial('financial.exceptions.list',base||jsonb_build_object('page',1,'pageSize',25,'refundPage',page,'refundPageSize',25));
  perform pg_temp.admin_ready_assert(out#>>'{data,refundTotal}'='101' and (out#>>'{data,refundPage}')::integer=page,'separate refund pagination exposes total/page');
  for row in select value from jsonb_array_elements(out#>'{data,refunds}') loop seen:=array_append(seen,(row->>'id')::uuid);end loop;
 end loop;
 perform pg_temp.admin_ready_assert(array_length(seen,1)=101 and (select count(distinct x) from unnest(seen)x)=101,'all 101 refunds reachable exactly once');
 perform pg_temp.admin_ready_assert(out#>>'{data,refundHasMore}'='false','last refund page reports terminal boundary');
 out:=public.lumo_admin_financial('financial.exceptions.list',base||'{"refundPage":0}');perform pg_temp.admin_ready_assert(out->>'code'='INVALID_INPUT','invalid refund pagination rejected');

 -- Safe MFA rollout: the current pilot remains usable until everyone is ready.
 out:=public.lumo_admin_security('security.policy',base||'{"aal":"aal1"}');
 perform pg_temp.admin_ready_assert(out#>>'{data,policy,staffToEnrol}'='1' and out#>>'{data,policy,readyToEnforce}'='false','missing staff enrolment visible before enforcing');
 out:=public.lumo_admin_security('security.mfa.enable',base||jsonb_build_object('expectedRevision',1,'requestId',gen_random_uuid(),'reason','Require enrolled staff'));
 perform pg_temp.admin_ready_assert(out->>'code'='STAFF_MFA_ENROLMENT_REQUIRED' and not lumo_private.admin_mfa_required(),'cannot lock out an unenrolled colleague');
 insert into auth.mfa_factors(id,user_id,factor_type,status) values(gen_random_uuid(),support,'totp','verified');
 out:=public.lumo_admin_security('security.mfa.enable',base||jsonb_build_object('expectedRevision',1,'requestId',key,'reason','All staff enrolled and verified'));
 perform pg_temp.admin_ready_assert(out->>'ok'='true' and lumo_private.admin_mfa_required(),'enrolled access administrator can safely require MFA');
 out:=public.lumo_admin_service('overview',base||'{"aal":"aal1"}');perform pg_temp.admin_ready_assert(out->>'code'='MFA_REQUIRED','password-only operational access blocked after rollout');
 out:=public.lumo_admin_security('security.mode.production',base||jsonb_build_object('expectedRevision',2,'requestId',gen_random_uuid(),'reason','Production safety gate'));
 perform pg_temp.admin_ready_assert(out->>'code'='SECOND_ACCESS_ADMIN_REQUIRED','production requires independent enrolled access administrator');
 update lumo_private.admin_staff set role='super_admin' where user_id=b;
 out:=public.lumo_admin_security('security.mode.production',base||jsonb_build_object('expectedRevision',2,'requestId',gen_random_uuid(),'reason','Two access administrators verified'));
 perform pg_temp.admin_ready_assert(out#>>'{data,policy,environment}'='production','production sign-in policy enabled only after readiness');
 update lumo_private.admin_auth_policy set require_mfa=false where id;
 perform pg_temp.admin_ready_assert(lumo_private.admin_mfa_required(),'production remains fail-closed even if pilot toggle is false');
 out:=public.lumo_admin_security('security.policy',sup);perform pg_temp.admin_ready_assert(out->>'code'='FORBIDDEN','support cannot change access policy');
 out:=public.lumo_admin_security('recovery.resets.list',sup||'{"aal":"aal1"}');perform pg_temp.admin_ready_assert(out->>'code'='MFA_REQUIRED','recovery records require actual MFA even in pilot');
 -- The public active schema excludes the private F05 Auth-write fence. The
 -- gateway rejects this staged queue before its privileged SQL can be called.
 perform pg_temp.admin_ready_assert(
  not exists(select 1 from information_schema.columns where table_schema='lumo_private' and table_name='access_prototype_reset_executions' and column_name='requires_auth_marker')
  and not exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where t.tgname='lumo_fence_reset_auth_write' and n.nspname='auth' and c.relname='users')
  and to_regprocedure('lumo_private.fence_reset_auth_write()') is null
  and to_regprocedure('lumo_private.access_reconcile_applied_reset(uuid,text)') is null
  and to_regprocedure('lumo_private.access_cancel_pending_reset(uuid,text)') is null,
  'excluded F05 marker column, managed Auth trigger and private resolution helpers remain absent');
 perform pg_temp.admin_ready_assert(not has_function_privilege('anon','public.lumo_admin_security(text,jsonb)','execute') and not has_function_privilege('authenticated','public.lumo_admin_security(text,jsonb)','execute'),'security RPC is service-only');
 perform pg_temp.admin_ready_assert(not has_table_privilege('service_role','lumo_private.admin_auth_policy','select,insert,update,delete'),'policy is not exposed through Data API');
end $fixture$;
select current_setting('lumo.admin_ready.checks')::integer as admin_readiness_checks;
rollback;
