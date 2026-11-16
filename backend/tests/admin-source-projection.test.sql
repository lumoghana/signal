-- Entirely transactional verification: all principals, source reports and audit rows are rolled back.
begin;
create function pg_temp.projection_assert(p_value boolean,p_label text) returns void language plpgsql as $$begin
 if p_value is distinct from true then raise exception 'Admin projection check failed: %',p_label;end if;
 perform set_config('lumo.admin.projection_checks',(coalesce(nullif(current_setting('lumo.admin.projection_checks',true),''),'0')::integer+1)::text,true);
end $$;
do $test$
#variable_conflict use_variable
declare staff_id uuid:=gen_random_uuid();staff_session uuid:=gen_random_uuid();technical_id uuid:=gen_random_uuid();technical_session uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();customer_session uuid:=gen_random_uuid();merchant uuid:=gen_random_uuid();merchant_account uuid;retained uuid;case_id uuid;merchant_case uuid;revision_before bigint;
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);payload jsonb;out jsonb;source_id text;
begin
 perform set_config('lumo.admin.projection_checks','0',true);
 insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at) values
 (staff_id,'authenticated','authenticated','projection-staff-'||suffix||'@example.test','{}',now(),now(),now()),
 (technical_id,'authenticated','authenticated','projection-technical-'||suffix||'@example.test','{}',now(),now(),now()),
 (customer,'authenticated','authenticated','projection-customer-'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(staff_session,staff_id,now(),now()),(technical_session,technical_id,now(),now()),(customer_session,customer,now(),now());
 insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) values
 (gen_random_uuid(),staff_id,'Projection fixture','totp','verified','fixture-not-a-real-secret',now(),now()),
 (gen_random_uuid(),technical_id,'Projection fixture','totp','verified','fixture-not-a-real-secret',now(),now());
 insert into lumo_private.admin_staff(user_id,display_name,email,role) values(staff_id,'Projection supervisor','projection-staff-'||suffix||'@example.test','supervisor'),(technical_id,'Projection technical','projection-technical-'||suffix||'@example.test','technical');
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(customer,'projection_'||suffix,'Projection customer','fixture');
 insert into lumo_private.approved_profiles(user_id,personal_account) values(customer,true);
 insert into lumo_private.accounts(owner_user_id,kind) values(customer,'consumer');
 insert into lumo_private.approved_states(user_id,state) values(customer,jsonb_build_object('account',jsonb_build_object('supportCases',jsonb_build_array(jsonb_build_object('id','projected-'||suffix,'title','Support report on write','body','The source should appear immediately','status','open','createdAt',clock_timestamp(),'updates','[]'::jsonb))),'boxes','[]'::jsonb,'ious','[]'::jsonb,'groups','[]'::jsonb,'transactions','[]'::jsonb,'budget',jsonb_build_object('created',true,'items',jsonb_build_array(jsonb_build_object('id','food','name','Food','amount',1200,'spent',200)))));
 source_id:='consumer:'||customer::text||':projected-'||suffix;
 select c.id into case_id from lumo_private.admin_cases c where c.source_id=source_id;
 perform pg_temp.projection_assert(case_id is not null,'consumer case appears at source INSERT before any admin read');
 insert into lumo_private.support_tickets(user_id,subject,body) values(customer,'Retained source fixture','Projected immediately') returning id into retained;
 perform pg_temp.projection_assert(exists(select 1 from lumo_private.admin_cases c where c.source_id='ticket:'||retained::text),'retained support table projects at INSERT');
 insert into lumo_private.accounts(owner_user_id,kind) values(customer,'merchant') returning id into merchant_account;
 insert into lumo_private.merchants(id,owner_user_id,account_id,name) values(merchant,customer,merchant_account,'Projection merchant');
 update lumo_private.approved_merchant_network set document=jsonb_set(document,array['businesses',merchant::text],jsonb_build_object('business',jsonb_build_object('id',merchant,'name','Projection merchant'),'tickets',jsonb_build_array(jsonb_build_object('id','projected-ticket-'||suffix,'subject','Merchant write report','message','Please check the counter','status','open','createdAt',clock_timestamp())))),revision=revision+1 where id;
 select c.id into merchant_case from lumo_private.admin_cases c where c.source_id='merchant:'||merchant::text||':projected-ticket-'||suffix;
 perform pg_temp.projection_assert(merchant_case is not null,'merchant case appears in source write transaction');
 select revision into revision_before from lumo_private.admin_cases where id=case_id;
 update lumo_private.approved_states set state=state||'{"buffer":1234}',revision=revision+1 where user_id=customer;
 perform pg_temp.projection_assert((select revision from lumo_private.admin_cases where id=case_id)=revision_before,'unrelated customer save leaves support projection unchanged');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 payload:=jsonb_build_object('actor',staff_id,'session',staff_session,'aal','aal2');
 out:=public.lumo_admin_service('cases.update',payload||jsonb_build_object('id',case_id,'status','resolved','resolution','Source projection verified'));
 perform pg_temp.projection_assert(out->>'ok'='true' and (select status from lumo_private.admin_cases where id=case_id)='resolved','admin resolution remains authoritative');
 perform pg_temp.projection_assert((select count(*) from lumo_private.admin_cases c where c.source_id=source_id)=1,'consumer source-sync trigger cannot duplicate cases');
 perform pg_temp.projection_assert((select state#>>'{account,supportCases,0,status}' from lumo_private.approved_states where user_id=customer)='resolved','consumer resolution still synchronises to product state');
 out:=public.lumo_admin_service('cases.update',payload||jsonb_build_object('id',merchant_case,'status','resolved','resolution','Counter source verified'));
 perform pg_temp.projection_assert(out->>'ok'='true' and (select document#>>array['businesses',merchant::text,'tickets','0','status'] from lumo_private.approved_merchant_network where id)='resolved','merchant resolution sync survives projection trigger');
 perform pg_temp.projection_assert((select count(*) from lumo_private.admin_cases c where c.source_id='merchant:'||merchant::text||':projected-ticket-'||suffix)=1,'merchant status sync does not create a recursive duplicate');
 update lumo_private.approved_states set state=jsonb_set(state,'{account,supportCases}',(state#>'{account,supportCases}')||jsonb_build_array(jsonb_build_object('id','invalid-date-'||suffix,'title','Historical import','body','Timestamp fallback','status','open','createdAt','not-a-date'))),revision=revision+1 where user_id=customer;
 perform pg_temp.projection_assert(exists(select 1 from lumo_private.admin_cases c where c.source_id='consumer:'||customer::text||':invalid-date-'||suffix),'malformed imported timestamp cannot break a source write');
 out:=public.lumo_admin_summary(payload||jsonb_build_object('id',customer));
 perform pg_temp.projection_assert(out->>'ok'='true' and out#>>'{data,snapshot,account,userId}'=customer::text,'summary returns exact existing consumer snapshot to trusted server');
 perform pg_temp.projection_assert(out#>>'{data,snapshot,account,balance}'='0','summary canonical balance comes from ledger account');
 perform pg_temp.projection_assert(out#>>'{data,snapshot,state,budget,items,0,amount}'='1200','domain input preserves integer-pesewa budget amount');
 out:=public.lumo_admin_summary(payload||jsonb_build_object('id',customer,'aal','aal1'));perform pg_temp.projection_assert(out->>'code'='MFA_REQUIRED','summary requires MFA');
 out:=public.lumo_admin_summary(jsonb_build_object('actor',technical_id,'session',technical_session,'aal','aal2','id',customer));perform pg_temp.projection_assert(out->>'code'='FORBIDDEN','technical staff cannot obtain private summary input');
 out:=public.lumo_admin_summary(jsonb_build_object('actor',customer,'session',customer_session,'aal','aal2','id',customer));perform pg_temp.projection_assert(out->>'code'='STAFF_REQUIRED','consumer cannot impersonate support for summary');
 out:=public.lumo_admin_summary(payload||jsonb_build_object('id',customer,'session',gen_random_uuid()));perform pg_temp.projection_assert(out->>'code'='SESSION_REVOKED','summary validates live staff session');
 perform pg_temp.projection_assert(not has_function_privilege('anon','public.lumo_admin_summary(jsonb)','execute') and not has_function_privilege('authenticated','public.lumo_admin_summary(jsonb)','execute'),'raw snapshot RPC unavailable to browsers');
 perform pg_temp.projection_assert(exists(select 1 from lumo_private.admin_audit where actor_id=staff_id and action='customer.summary' and entity_id=customer::text),'raw summary input access audited');
 perform pg_temp.projection_assert(strpos(pg_get_functiondef('public.lumo_admin_service(text,jsonb)'::regprocedure),'Import existing source tickets once')=0,'admin reads no longer perform global source imports');
 perform pg_temp.projection_assert(not exists(select 1 from lumo_private.journals where actor_user_id in(staff_id,technical_id,customer)),'projection and summary never move money');
end $test$;
select current_setting('lumo.admin.projection_checks')::integer as admin_projection_postgres_checks;
rollback;
