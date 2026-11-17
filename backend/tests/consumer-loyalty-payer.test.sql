-- Synthetic canonical money checks, all fixtures rolled back.
begin;
create function pg_temp.loyalty_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Consumer loyalty check failed: %',label;end if;
 perform set_config('test.loyalty.checks',(coalesce(nullif(current_setting('test.loyalty.checks',true),''),'0')::int+1)::text,true);
end $$;
do $test$
declare owner_id uuid:=gen_random_uuid();payer_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();
 owner_session uuid:=gen_random_uuid();payer_session uuid:=gen_random_uuid();other_session uuid:=gen_random_uuid();
 merchant_id uuid:=gen_random_uuid();shop_id uuid:=gen_random_uuid();bound_request uuid:=gen_random_uuid();cashier_request uuid:=gen_random_uuid();
 merchant_account uuid;payer_account uuid;other_account uuid;payment_id uuid;refund_id uuid;out jsonb;loaded jsonb;doc jsonb;business jsonb;owner_user jsonb;
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,12);pin text:='452913';failed boolean:=false;
begin
 perform set_config('test.loyalty.checks','0',true);
 insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at) values
 (owner_id,'authenticated','authenticated','lo_'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now()),
 (payer_id,'authenticated','authenticated','lp_'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now()),
 (other_id,'authenticated','authenticated','lx_'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(owner_session,owner_id,now(),now()),(payer_session,payer_id,now(),now()),(other_session,other_id,now(),now());
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 out:=public.lumo_approved_service('provision',jsonb_build_object('actor',owner_id,'session',owner_session,'mode','merchant','handle','lo_'||suffix,'displayName','Owner','pin',pin));
 perform pg_temp.loyalty_assert(out->>'ok'='true','merchant identity provisioned');
 out:=public.lumo_approved_service('provision',jsonb_build_object('actor',payer_id,'session',payer_session,'mode','consumer','handle','lp_'||suffix,'displayName','Purchaser','phone','0240000001','pin',pin));
 perform pg_temp.loyalty_assert(out->>'ok'='true','bound personal consumer provisioned');
 out:=public.lumo_approved_service('provision',jsonb_build_object('actor',other_id,'session',other_session,'mode','consumer','handle','lx_'||suffix,'displayName','Another consumer','phone','0240000002','pin',pin));
 perform pg_temp.loyalty_assert(out->>'ok'='true','other personal consumer provisioned');
 loaded:=public.lumo_approved_merchant_read(owner_id,owner_session);doc:=loaded->'state';
 business:=jsonb_build_object('version',1,'business',jsonb_build_object('id',merchant_id,'name','Loyalty fixture','sandbox',true),'openingBalance',0,
 'shops',jsonb_build_array(jsonb_build_object('id',shop_id,'name','Night Market','code','LUM'||suffix,'lat',5.65,'lng',-.18,'area','Legon','accepting',true,'open',true,'published',true)),
 'requests',jsonb_build_array(jsonb_build_object('id',bound_request,'shopId',shop_id,'amount',2000,'description','Discounted purchase','status','open','createdAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '15 minutes','_consumerUserId',payer_id),jsonb_build_object('id',cashier_request,'shopId',shop_id,'amount',1000,'description','Cashier request','status','open','createdAt',clock_timestamp(),'expiresAt',clock_timestamp()+interval '15 minutes')),
 'refunds','[]'::jsonb,'transactions','[]'::jsonb,'closings','[]'::jsonb,'staff','[]'::jsonb,'settlements','[]'::jsonb,'audit','[]'::jsonb,'tickets','[]'::jsonb);
 owner_user:=jsonb_build_object('id','owner-'||suffix,'businessId',merchant_id,'role','owner','active',true,'shopIds',jsonb_build_array(shop_id),'_sharedUserId',owner_id);
 doc:=jsonb_set(doc,array['businesses',merchant_id::text],business);doc:=jsonb_set(doc,'{users}',(doc->'users')||jsonb_build_array(owner_user));
 out:=public.lumo_approved_merchant_commit(owner_id,owner_session,(loaded->>'revision')::bigint,loaded->>'ledgerStamp',doc,false);
 perform pg_temp.loyalty_assert(out->>'ok'='true','consumer binding and canonical fixed requests commit together');
 select m.account_id into merchant_account from lumo_private.merchants m where m.id=merchant_id;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',payer_id,'session_id',payer_session,'role','authenticated')::text,true);
 out:=public.lumo_rpc('wallet.fund',jsonb_build_object('amount',10000,'confirmSandbox',true,'attemptId','loyalty-fund-payer-'||suffix));payer_account:=(out#>>'{account,id}')::uuid;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',other_id,'session_id',other_session,'role','authenticated')::text,true);
 out:=public.lumo_rpc('wallet.fund',jsonb_build_object('amount',10000,'confirmSandbox',true,'attemptId','loyalty-fund-other-'||suffix));other_account:=(out#>>'{account,id}')::uuid;
 perform pg_temp.loyalty_assert(payer_account is not null and other_account is not null,'both personal wallets funded through canonical service');
 begin perform lumo_private.post_money(other_id,'merchant_payment',2000,other_account,merchant_account,shop_id,bound_request);exception when others then if SQLERRM='REQUEST_UNAVAILABLE' then failed:=true;else raise;end if;end;
 perform pg_temp.loyalty_assert(failed,'another authenticated actor cannot spend the held consumer reward');
 perform pg_temp.loyalty_assert((select balance=10000 from lumo_private.accounts where id=other_account) and (select balance=0 from lumo_private.accounts where id=merchant_account),'wrong actor rejection posts no entries or balances');
 perform pg_temp.loyalty_assert(not exists(select 1 from lumo_private.journals where request_id=bound_request),'wrong actor leaves no payment journal');
 payment_id:=lumo_private.post_money(payer_id,'merchant_payment',2000,payer_account,merchant_account,shop_id,bound_request);
 perform pg_temp.loyalty_assert(payment_id is not null and (select balance=8000 from lumo_private.accounts where id=payer_account),'bound actor pays only canonical net amount');
 payment_id:=lumo_private.post_money(other_id,'merchant_payment',1000,other_account,merchant_account,shop_id,cashier_request);
 perform pg_temp.loyalty_assert(payment_id is not null and (select balance=9000 from lumo_private.accounts where id=other_account),'ordinary cashier request retains bearer-presented payment');
 refund_id:=lumo_private.post_money(owner_id,'refund',500,merchant_account,other_account,shop_id,cashier_request,payment_id);
 perform pg_temp.loyalty_assert(refund_id is not null and (select balance=9500 from lumo_private.accounts where id=other_account),'merchant returns use original payer and are not blocked by loyalty guard');
 perform pg_temp.loyalty_assert(not has_function_privilege('anon','lumo_private.guard_consumer_loyalty_payer()','execute') and not has_function_privilege('authenticated','lumo_private.guard_consumer_loyalty_payer()','execute') and not has_function_privilege('service_role','lumo_private.guard_consumer_loyalty_payer()','execute'),'guard has no direct client/service execute grant');
 perform pg_temp.loyalty_assert(exists(select 1 from pg_trigger where tgname='consumer_loyalty_payer_guard' and tgrelid='lumo_private.journals'::regclass and not tgisinternal),'guard is installed at canonical journal insert');
 set constraints all immediate;
end $test$;
select current_setting('test.loyalty.checks')::int as consumer_loyalty_checks;
rollback;
