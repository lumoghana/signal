-- Actual Postgres compatibility boundary checks. Every fixture is rolled back.
begin;
create function pg_temp.merchant_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Approved merchant check failed: %',label;end if;
 perform set_config('lumo.merchant.checks',(coalesce(nullif(current_setting('lumo.merchant.checks',true),''),'0')::integer+1)::text,true);
end $$;
do $$
#variable_conflict use_variable
declare owner_id uuid:=gen_random_uuid();payer_id uuid:=gen_random_uuid();staff_id uuid:=gen_random_uuid();owner_session uuid:=gen_random_uuid();payer_session uuid:=gen_random_uuid();staff_session uuid:=gen_random_uuid();
 merchant_id uuid:=gen_random_uuid();shop_id uuid:=gen_random_uuid();request_id uuid:=gen_random_uuid();payment_id uuid;proposal_id uuid;merchant_account uuid;payer_account uuid;out jsonb;loaded jsonb;doc jsonb;business jsonb;user_owner jsonb;refund jsonb;prior_stamp text;
 token text:=repeat('a',64);suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,12);pin text:='452913';at text:=clock_timestamp()::text;
begin
 perform set_config('lumo.merchant.checks','0',true);
 insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at)values
 (owner_id,'authenticated','authenticated','mo_'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now()),
 (payer_id,'authenticated','authenticated','mp_'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now()),
 (staff_id,'authenticated','authenticated','ms_'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_session,owner_id,now(),now()),(payer_session,payer_id,now(),now()),(staff_session,staff_id,now(),now());
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 out:=public.lumo_approved_service('provision',jsonb_build_object('actor',owner_id,'session',owner_session,'handle','mo_'||suffix,'displayName','Merchant Owner','pin',pin));
 perform pg_temp.merchant_assert(out->>'ok'='true','owner shared identity provisioned');
 out:=public.lumo_approved_service('provision',jsonb_build_object('actor',payer_id,'session',payer_session,'handle','mp_'||suffix,'displayName','Payer','pin',pin));
 perform pg_temp.merchant_assert(out->>'ok'='true','consumer shared identity provisioned');
 out:=public.lumo_approved_service('provision',jsonb_build_object('actor',staff_id,'session',staff_session,'handle','ms_'||suffix,'displayName','Cashier','pin',pin));
 perform pg_temp.merchant_assert(out->>'ok'='true','staff shared identity provisioned');
 loaded:=public.lumo_approved_merchant_read(owner_id,owner_session);doc:=loaded->'state';
 business:=jsonb_build_object('version',1,'business',jsonb_build_object('id',merchant_id,'name','Merchant fixture','ownerName','Owner','accountNumber','9900'||suffix,'sandbox',true),
 'openingBalance',0,'shops',jsonb_build_array(jsonb_build_object('id',shop_id,'name','Night Market fixture','code','LUM'||suffix,'lat',5.65,'lng',-.18,'area','Legon','accepting',true,'open',true,'published',false,'testAcceptanceToken',token)),
 'requests','[]'::jsonb,'refunds','[]'::jsonb,'transactions','[]'::jsonb,'closings','[]'::jsonb,'staff','[]'::jsonb,'settlements','[]'::jsonb,'audit','[]'::jsonb,'tickets','[]'::jsonb);
 user_owner:=jsonb_build_object('id','owner-'||suffix,'businessId',merchant_id,'role','owner','active',true,'shopIds',jsonb_build_array(shop_id),'_sharedUserId',owner_id);
 doc:=jsonb_set(doc,array['businesses',merchant_id::text],business);doc:=jsonb_set(doc,'{users}',(doc->'users')||jsonb_build_array(user_owner));
 out:=public.lumo_approved_merchant_commit(owner_id,owner_session,(loaded->>'revision')::bigint,loaded->>'ledgerStamp',doc,false);
 perform pg_temp.merchant_assert(out->>'ok'='true','original business and shop commit atomically to canonical accounts');
 select m.account_id into merchant_account from lumo_private.merchants m where m.id=merchant_id;
 perform pg_temp.merchant_assert(merchant_account is not null and exists(select 1 from lumo_private.shops s where s.id=shop_id and s.merchant_id=merchant_id),'canonical shop belongs to canonical merchant');
 out:=public.lumo_approved_merchant_access(shop_id,null);perform pg_temp.merchant_assert(out->>'ok'='false' and out->>'code'='SHOP_NOT_READY','unpublished shop needs private test key');
 out:=public.lumo_approved_merchant_access(shop_id,token);perform pg_temp.merchant_assert(out->>'ok'='true','private original test QR key accepted');
 out:=public.lumo_approved_merchant_access(shop_id,repeat('b',64));perform pg_temp.merchant_assert(out->>'ok'='false','wrong private QR key rejected');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',payer_id,'session_id',payer_session,'role','authenticated')::text,true);
 out:=public.lumo_rpc('wallet.fund',jsonb_build_object('amount',10000,'confirmSandbox',true,'attemptId','merchant-fixture-fund-'||suffix));
 set constraints all immediate;set constraints all deferred;
 payer_account:=(out#>>'{account,id}')::uuid;perform pg_temp.merchant_assert(out->>'ok'='true','consumer actual test funds posted');
 out:=public.lumo_rpc('payment.pay',jsonb_build_object('shopId',shop_id,'amount',5000,'pin',pin,'attemptId','merchant-private-bypass-'||suffix));
 perform pg_temp.merchant_assert(out->>'ok'='false' and (select balance from lumo_private.accounts where id=payer_account)=10000,'legacy direct payment cannot bypass unpublished shop guard');
 perform set_config('lumo.approved.merchant_shop',shop_id::text,true);
 payment_id:=lumo_private.post_money(payer_id,'merchant_payment',5000,payer_account,merchant_account,shop_id);
 set constraints all immediate;set constraints all deferred;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform pg_temp.merchant_assert(current_setting('lumo.approved.merchant_shop',true)='','private QR permission is consumed per canonical posting');
 loaded:=public.lumo_approved_merchant_read(owner_id,owner_session);doc:=loaded->'state';
 perform pg_temp.merchant_assert(exists(select 1 from jsonb_array_elements(loaded->'ledger') j where j.value->>'id'=payment_id::text and (j.value->>'amount')::integer=5000),'canonical consumer receipt is available to original merchant adapter');
 refund:=jsonb_build_object('id','refund-'||suffix,'transactionId',payment_id,'shopId',shop_id,'amount',1250,'status','paid','createdAt',at,'reason','Fixture return');
 doc:=jsonb_set(doc,array['businesses',merchant_id::text,'refunds'],jsonb_build_array(refund));
 out:=public.lumo_approved_merchant_commit(owner_id,owner_session,(loaded->>'revision')::bigint,loaded->>'ledgerStamp',doc,false);
 perform pg_temp.merchant_assert(out->>'code'='STEP_UP_REQUIRED' and (select balance from lumo_private.accounts where id=merchant_account)=5000,'refund without trusted original proof leaves funds unchanged');
 out:=public.lumo_approved_merchant_commit(owner_id,owner_session,(loaded->>'revision')::bigint,loaded->>'ledgerStamp',doc,true);
 set constraints all immediate;set constraints all deferred;
 perform pg_temp.merchant_assert(out->>'ok'='true' and (select balance from lumo_private.accounts where id=merchant_account)=3750 and (select balance from lumo_private.accounts where id=payer_account)=6250,'approved refund posts once to original payer atomically');
 loaded:=public.lumo_approved_merchant_read(owner_id,owner_session);out:=public.lumo_approved_merchant_commit(owner_id,owner_session,(loaded->>'revision')::bigint,loaded->>'ledgerStamp',loaded->'state',false);
 perform pg_temp.merchant_assert(out->>'ok'='true' and (select count(*) from lumo_private.journals where original_payment_id=payment_id)=1,'retried stored refund does not post twice');
 loaded:=public.lumo_approved_merchant_read(owner_id,owner_session);doc:=loaded->'state';
 doc:=jsonb_set(doc,array['businesses',merchant_id::text,'closings'],jsonb_build_array(jsonb_build_object('id','close-'||suffix,'shopId',shop_id,'createdAt',clock_timestamp(),'gross',5000,'refunds',1250,'net',3750)));
 doc:=jsonb_set(doc,'{users}',(doc->'users')||jsonb_build_array(jsonb_build_object('id','staff-'||suffix,'businessId',merchant_id,'role','cashier','active',true,'shopIds',jsonb_build_array(shop_id),'_sharedUserId',staff_id)));
 out:=public.lumo_approved_merchant_commit(owner_id,owner_session,(loaded->>'revision')::bigint,loaded->>'ledgerStamp',doc,false);
 perform pg_temp.merchant_assert(out->>'ok'='true' and exists(select 1 from lumo_private.staff_memberships s where s.shop_id=shop_id and s.user_id=staff_id and s.role='cashier' and s.status='active'),'accepted original staff membership reaches canonical scope');
 perform pg_temp.merchant_assert((select balance from lumo_private.accounts where id=merchant_account)=3750 and exists(select 1 from lumo_private.shops s where s.id=shop_id and s.trading_since>(select created_at from lumo_private.journals where id=payment_id)),'closing resets trading window while preserving master funds');
 out:=public.lumo_approved_merchant_commit(owner_id,gen_random_uuid(),(out->>'revision')::bigint,loaded->>'ledgerStamp',doc,true);perform pg_temp.merchant_assert(out->>'code'='SESSION_REVOKED','forged shared session cannot mutate merchant store');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'session_id',owner_session,'role','authenticated')::text,true);
 out:=public.lumo_rpc('payment.refund',jsonb_build_object('paymentId',payment_id,'amount',1,'pin',pin,'attemptId','legacy-denied-refund-'||suffix));
 perform pg_temp.merchant_assert(out->>'code'='APPROVED_MERCHANT_REQUIRED','legacy refund rejected before original journal lock');
 insert into lumo_private.refund_proposals(payment_id,requested_by,amount) values(payment_id,owner_id,1) returning id into proposal_id;
 out:=public.lumo_rpc('refund.decide',jsonb_build_object('proposalId',proposal_id,'approve',true,'pin',pin,'attemptId','legacy-denied-decision-'||suffix));
 perform pg_temp.merchant_assert(out->>'code'='APPROVED_MERCHANT_REQUIRED','legacy refund decision rejected before proposal and journal locks');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
 out:=public.lumo_rpc('payment.refund',jsonb_build_object('paymentId',payment_id,'amount',1,'pin',pin));
 perform pg_temp.merchant_assert(out->>'code'='SESSION_REVOKED','legacy boundary validates live session before identifier lookup');
 perform pg_temp.merchant_assert(not has_function_privilege('anon','public.lumo_approved_merchant_read(uuid,uuid)','execute') and not has_function_privilege('authenticated','public.lumo_approved_merchant_commit(uuid,uuid,bigint,text,jsonb,boolean)','execute'),'raw merchant state and mutation RPCs are service-only');
 perform pg_temp.merchant_assert(not has_table_privilege('authenticated','lumo_private.approved_merchant_network','select,insert,update,delete'),'private credential network has no client table grants');
end $$;
select current_setting('lumo.merchant.checks')::integer as approved_merchant_postgres_checks;
rollback;
