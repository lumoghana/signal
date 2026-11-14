-- All users, sessions, merchants, shops and ledger records are rolled back. No messages are sent.
begin;
create function pg_temp.shop_assert(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Shop integration failed: %',label;end if;perform set_config('lumo.shop.checks',(coalesce(nullif(current_setting('lumo.shop.checks',true),''),'0')::integer+1)::text,true);end $$;
create function pg_temp.shop_call(command text,payload jsonb default '{}') returns jsonb language plpgsql as $$
declare result jsonb;
begin execute 'set local role authenticated';result:=public.lumo_rpc(command,payload);execute 'reset role';return result;exception when others then execute 'reset role';raise;end $$;
do $$
declare
 owner_id uuid:=gen_random_uuid(); payer_id uuid:=gen_random_uuid();owner_session uuid:=gen_random_uuid();payer_session uuid:=gen_random_uuid();
 pin text:=lpad(floor(random()*1000000)::integer::text,6,'0');suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
 result jsonb;first_result jsonb;v_merchant_id uuid;first_shop uuid;second_shop uuid;merchant_account uuid;accounts_before bigint;journals_before bigint;i integer;
begin
 perform set_config('lumo.shop.checks','0',true);
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,created_at,updated_at)
 values(owner_id,'authenticated','authenticated','shop-fixture-owner-'||suffix||'@example.invalid',now(),'{"lumo_pilot":true}',now(),now()),
 (payer_id,'authenticated','authenticated','shop-fixture-payer-'||suffix||'@example.invalid',now(),'{"lumo_pilot":true}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at)values(owner_session,owner_id,now(),now()),(payer_session,payer_id,now(),now());
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true);
 result:=pg_temp.shop_call('account.open',jsonb_build_object('handle','shop_owner_'||suffix,'displayName','Shop owner fixture','pin',pin));perform pg_temp.shop_assert(result->>'ok'='true','owner opens account');
 result:=pg_temp.shop_call('merchant.create',jsonb_build_object('businessName','Two Shop Fixture','shopName','Night Market','attemptId','shop-fixture-business-'||suffix));
 v_merchant_id:=(result#>>'{merchant,id}')::uuid;first_shop:=(result#>>'{shop,id}')::uuid;merchant_account:=(result#>>'{merchant,accountId}')::uuid;
 perform pg_temp.shop_assert(v_merchant_id is not null and first_shop is not null,'first shop belongs to merchant');
 select count(*) into accounts_before from lumo_private.accounts;select count(*) into journals_before from lumo_private.journals;
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Pent Hall','attemptId','shop-fixture-add-'||suffix));first_result:=result;second_shop:=(result#>>'{shop,id}')::uuid;
 perform pg_temp.shop_assert(result->>'ok'='true' and second_shop<>first_shop and result->>'selectedShopId'=second_shop::text and result#>>'{shop,merchantId}'=v_merchant_id::text,'owner creates second receiving shop');
 perform pg_temp.shop_assert((select count(*) from lumo_private.accounts)=accounts_before and (select count(*) from lumo_private.journals)=journals_before,'new shop creates no account or money movement');
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Pent Hall','attemptId','shop-fixture-add-'||suffix));
 perform pg_temp.shop_assert(result->>'replayed'='true' and result#>>'{shop,id}'=second_shop::text and (select count(*) from lumo_private.shops where shops.merchant_id=v_merchant_id)=2,'retry creates exactly one second shop');
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Different','attemptId','shop-fixture-add-'||suffix));perform pg_temp.shop_assert(result->>'code'='IDEMPOTENCY_MISMATCH','same attempt cannot change shop');
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','  pent hall  ','attemptId','shop-fixture-duplicate-'||suffix));perform pg_temp.shop_assert(result->>'code'='SHOP_NAME_TAKEN','normalized duplicate name rejected');
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',gen_random_uuid(),'name','Forged','attemptId','shop-fixture-forged-'||suffix));perform pg_temp.shop_assert(result->>'code'='FORBIDDEN','forged merchant cannot create shop');
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name',123,'attemptId','shop-fixture-numeric-'||suffix));perform pg_temp.shop_assert(result->>'code'='INVALID_SHOP','numeric name rejected');
 result:=pg_temp.shop_call('merchant.get');perform pg_temp.shop_assert(jsonb_array_length(result#>'{merchants,0,shops}')=2 and result#>>'{merchants,0,accountId}'=merchant_account::text and (result#>>'{merchants,0,balance}')::bigint=0,'owner sees two shops and one aggregate account');
 perform pg_temp.shop_assert(not has_function_privilege('authenticated','lumo_private.shop_create(jsonb)','EXECUTE') and not has_function_privilege('anon','lumo_private.shop_create(jsonb)','EXECUTE'),'private helper cannot bypass guarded dispatcher');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',payer_id,'role','authenticated','session_id',payer_session)::text,true);
 result:=pg_temp.shop_call('account.open',jsonb_build_object('handle','shop_payer_'||suffix,'displayName','Payer fixture','pin',pin));perform pg_temp.shop_assert(result->>'ok'='true','payer opens account');
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Foreign Shop','attemptId','shop-fixture-foreign-'||suffix));perform pg_temp.shop_assert(result->>'code'='FORBIDDEN','outsider cannot add shop');
 result:=pg_temp.shop_call('merchant.get');perform pg_temp.shop_assert(result->'merchants'='[]'::jsonb,'outsider cannot view merchant aggregate');
 result:=pg_temp.shop_call('wallet.fund',jsonb_build_object('amount',5000,'confirmSandbox',true,'attemptId','shop-fixture-fund-'||suffix));perform pg_temp.shop_assert(result->>'ok'='true','payer receives explicit test funds');
 result:=pg_temp.shop_call('payment.pay',jsonb_build_object('shopId',first_shop,'amount',1000,'pin',pin,'attemptId','shop-fixture-pay-one-'||suffix));perform pg_temp.shop_assert(result->>'ok'='true','first shop receives payment');
 result:=pg_temp.shop_call('payment.pay',jsonb_build_object('shopId',second_shop,'amount',2000,'pin',pin,'attemptId','shop-fixture-pay-two-'||suffix));perform pg_temp.shop_assert(result->>'ok'='true','second shop receives payment');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated','session_id',owner_session)::text,true);
 result:=pg_temp.shop_call('merchant.get');perform pg_temp.shop_assert((result#>>'{merchants,0,balance}')::bigint=3000 and result#>>'{merchants,0,accountId}'=merchant_account::text,'both shops credit the same merchant balance');
 perform pg_temp.shop_assert((select sum((s->>'netCollected')::bigint) from jsonb_array_elements(result#>'{merchants,0,shops}') s)=3000,'shop collection views sum to aggregate');
 perform pg_temp.shop_assert((select balance from lumo_private.accounts where id=merchant_account)=3000,'underlying merchant account has exact sum');
 for i in 3..20 loop
  result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Fixture shop '||i,'attemptId','shop-fixture-cap-'||i||'-'||suffix));perform pg_temp.shop_assert(result->>'ok'='true','shop cap allows up to twenty');
 end loop;
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Twenty One','attemptId','shop-fixture-over-cap-'||suffix));perform pg_temp.shop_assert(result->>'code'='SHOP_LIMIT','twenty-first shop rejected');
 update lumo_private.merchants set status='paused' where id=v_merchant_id;
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Paused Shop','attemptId','shop-fixture-paused-'||suffix));perform pg_temp.shop_assert(result->>'code'='SHOP_PAUSED','paused merchant cannot add shop');
 delete from auth.sessions where id=owner_session;
 result:=pg_temp.shop_call('shop.create',jsonb_build_object('merchantId',v_merchant_id,'name','Revoked Shop','attemptId','shop-fixture-revoked-'||suffix));perform pg_temp.shop_assert(result->>'code'='SESSION_REVOKED','revoked session cannot add shop');
 perform set_config('lumo.shop.report',jsonb_build_object('checks',current_setting('lumo.shop.checks')::integer,'merchantBalance',3000,'shopCount',20,'testFixturesRolledBack',true)::text,true);
 -- The remaining live payer session is used while flushing deferred ledger invariants.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',payer_id,'role','authenticated','session_id',payer_session)::text,true);
end $$;
set local role authenticated;
set constraints all immediate;
select current_setting('lumo.shop.report')::jsonb as lumo_shop_creation_test;
rollback;
