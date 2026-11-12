-- Hosted integration test. Every fixture is rolled back, including auth rows, sessions and money.
-- Run as the project database administrator. No messages are sent and no password is installed.
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'Lumo integration check failed: %',label;end if;
 perform set_config('lumo.test.checks',(coalesce(nullif(current_setting('lumo.test.checks',true),''),'0')::integer+1)::text,true);
end $$;
-- Calls exercise the actual authenticated database role, then restore the fixture administrator.
create function pg_temp.call(command text,payload jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$
declare response jsonb;
begin
 execute 'set local role authenticated';
 response:=public.lumo_rpc(command,payload);
 execute 'reset role';
 return response;
exception when others then execute 'reset role';raise;
end $$;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); m uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();sm uuid:=gen_random_uuid();so uuid:=gen_random_uuid();
 pin text:=lpad((floor(random()*1000000)::integer)::text,6,'0'); wrong_pin text;
 r jsonb; other jsonb; original jsonb; fixed_payment jsonb; static_payment jsonb;
 account_a uuid;account_b uuid;merchant_id uuid;shop uuid;request uuid;expired_request uuid;merchant_account uuid;failed_attempt text; i integer;
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
begin
 wrong_pin:=case when pin='000000' then '111111' else '000000'end;
 perform set_config('lumo.test.checks','0',true);
 perform set_config('lumo.test.actor',a::text,true);perform set_config('lumo.test.session',sa::text,true);
 insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
 values(a,'authenticated','authenticated','lumo-fixture-a-'||suffix||'@example.invalid',now(),now(),now()),
 (b,'authenticated','authenticated','lumo-fixture-b-'||suffix||'@example.invalid',now(),now(),now()),
 (m,'authenticated','authenticated','lumo-fixture-m-'||suffix||'@example.invalid',now(),now(),now()),
 (outsider,'authenticated','authenticated','lumo-fixture-x-'||suffix||'@example.invalid',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at)values(sa,a,now(),now()),(sb,b,now(),now()),(sm,m,now(),now()),(so,outsider,now(),now());
 perform pg_temp.assert_true(not has_function_privilege('anon','public.lumo_rpc(text,jsonb)','EXECUTE'),'anonymous RPC forbidden');
 perform pg_temp.assert_true(has_function_privilege('authenticated','public.lumo_rpc(text,jsonb)','EXECUTE'),'signed-in RPC entry allowed');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','lumo_private.accounts','SELECT,INSERT,UPDATE,DELETE'),'no direct account access');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','lumo_private.entries','SELECT,INSERT,UPDATE,DELETE'),'no direct posting access');
 perform pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='lumo_private' and c.relkind='r' and not c.relrowsecurity),'every private table has RLS');
 perform set_config('request.jwt.claims','{}',true);
 r:=pg_temp.call('account.get');perform pg_temp.assert_true(r->>'code'='AUTH_REQUIRED','unauthenticated rejected');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',gen_random_uuid())::text,true);
 r:=pg_temp.call('account.open',jsonb_build_object('handle','a_'||suffix,'displayName','Student A','pin',pin));perform pg_temp.assert_true(r->>'code'='SESSION_REVOKED','nonexistent session rejected');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sa)::text,true);
 r:=pg_temp.call('account.open',jsonb_build_object('handle','a_'||suffix,'displayName',123,'pin',pin));perform pg_temp.assert_true(r->>'code'='INVALID_ACCOUNT','numeric display name rejected');
 r:=pg_temp.call('account.open',jsonb_build_object('handle','a_'||suffix,'displayName','Student A','pin',pin));account_a:=(r#>>'{account,id}')::uuid;
 perform pg_temp.assert_true((r->>'ok')::boolean and r#>>'{account,userId}'=a::text and (r#>>'{account,balance}')::bigint=0,'A starts at zero with server identity');
 r:=pg_temp.call('account.open',jsonb_build_object('handle','different_'||suffix,'displayName','Different','pin',wrong_pin));perform pg_temp.assert_true((r->>'existing')::boolean and r#>>'{account,id}'=account_a::text,'account open idempotent without replacing PIN');
 r:=pg_temp.call('wallet.fund',jsonb_build_object('amount',10000,'attemptId','fixture-fund-'||suffix));perform pg_temp.assert_true(r->>'code'='TEST_CONFIRMATION_REQUIRED' and (r->>'definitive')::boolean,'test funding explicit consent');
 r:=pg_temp.call('wallet.fund',jsonb_build_object('amount',10000,'confirmSandbox',true,'attemptId','fixture-approved-fund-'||suffix));
 perform pg_temp.assert_true((r->>'ok')::boolean and (r#>>'{account,balance}')::bigint=10000 and r#>>'{receipt,type}'='test_funding','explicit test funding posted');
 original:=r;
 r:=pg_temp.call('wallet.fund',jsonb_build_object('amount',10000,'confirmSandbox',true,'attemptId','fixture-approved-fund-'||suffix));perform pg_temp.assert_true((r->>'replayed')::boolean and r#>>'{receipt,id}'=original#>>'{receipt,id}' and (r#>>'{account,balance}')::bigint=10000,'funding retry once only');
 r:=pg_temp.call('wallet.fund',jsonb_build_object('amount',20000,'confirmSandbox',true,'attemptId','fixture-approved-fund-'||suffix));perform pg_temp.assert_true(r->>'code'='IDEMPOTENCY_MISMATCH','same funding ref cannot change amount');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id',sb)::text,true);
 r:=pg_temp.call('account.open',jsonb_build_object('handle','b_'||suffix,'displayName','Student B','pin',pin));account_b:=(r#>>'{account,id}')::uuid;perform pg_temp.assert_true((r->>'ok')::boolean,'B account opens');
 r:=pg_temp.call('attempt.lookup',jsonb_build_object('attemptId','fixture-approved-fund-'||suffix));perform pg_temp.assert_true(r->>'found'='false','another user cannot recover A attempt');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',sm)::text,true);
 r:=pg_temp.call('account.open',jsonb_build_object('handle','m_'||suffix,'displayName','Merchant Owner','pin',pin));perform pg_temp.assert_true((r->>'ok')::boolean,'owner consumer account opens');
 r:=pg_temp.call('merchant.create',jsonb_build_object('businessName','Fixture Kitchen','shopName','Night Market','attemptId','fixture-create-merchant-'||suffix));merchant_id:=(r#>>'{merchant,id}')::uuid;shop:=(r#>>'{shop,id}')::uuid;perform pg_temp.assert_true((r->>'ok')::boolean and shop is not null,'merchant creates owner-bound shop');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sa)::text,true);
 r:=pg_temp.call('recipient.lookup',jsonb_build_object('handle','b_'||suffix));perform pg_temp.assert_true(r#>>'{recipient,displayName}'='Student B','recipient name confirmation');
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount',5000,'pin',pin,'attemptId','fixture-transfer-'||suffix));original:=r;
 perform pg_temp.assert_true((r->>'ok')::boolean and (r#>>'{account,balance}')::bigint=5000 and r#>>'{receipt,payerAccountId}'=account_a::text and r#>>'{receipt,payeeAccountId}'=account_b::text and r#>>'{receipt,actorUserId}'=a::text,'A debited B credited same transfer');
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount',5000,'pin',pin,'attemptId','fixture-transfer-'||suffix));perform pg_temp.assert_true((r->>'replayed')::boolean and r#>>'{receipt,id}'=original#>>'{receipt,id}','P2P interrupted retry same receipt');
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'pin',pin,'attemptId','fixture-missing-amount-'||suffix));perform pg_temp.assert_true(r->>'code'='INVALID_AMOUNT','missing amount rejected cleanly');
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount','1','pin',pin,'attemptId','fixture-string-amount-'||suffix));perform pg_temp.assert_true(r->>'code'='INVALID_AMOUNT','string amount rejected');
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount',1.5,'pin',pin,'attemptId','fixture-fraction-amount-'||suffix));perform pg_temp.assert_true(r->>'code'='INVALID_AMOUNT','fractional pesewas rejected');
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount',6000,'pin',pin,'attemptId','fixture-insufficient-'||suffix));perform pg_temp.assert_true(r->>'code'='INSUFFICIENT_FUNDS' and (r->>'definitive')::boolean,'insufficient funds no debit');
 r:=pg_temp.call('attempt.lookup',jsonb_build_object('attemptId','fixture-insufficient-'||suffix));perform pg_temp.assert_true(r->>'found'='true' and r#>>'{result,code}'='INSUFFICIENT_FUNDS','authoritative rejection recoverable');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',sm)::text,true);
 r:=pg_temp.call('request.create',jsonb_build_object('shopId',shop,'amount',2000,'note','Lunch','attemptId','fixture-request-'||suffix));request:=(r#>>'{request,id}')::uuid;perform pg_temp.assert_true((r->>'ok')::boolean and request is not null,'owner creates fixed request');
 r:=pg_temp.call('request.create',jsonb_build_object('shopId',shop,'amount',500,'attemptId','fixture-expired-request-'||suffix));expired_request:=(r#>>'{request,id}')::uuid;
 update lumo_private.payment_requests set created_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' where id=expired_request;
 select account_id into merchant_account from lumo_private.merchants where id=merchant_id;
 -- Direct internal-helper regression proves its own post-lock expiry guard, independently of the earlier public validation.
 begin
  perform lumo_private.post_money(a,'merchant_payment',500,account_a,merchant_account,shop,expired_request);
  perform pg_temp.assert_true(false,'post-lock helper rejects expired request');
 exception when raise_exception then perform pg_temp.assert_true(sqlerrm='REQUEST_UNAVAILABLE','post-lock helper rejects expired request');end;

 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id',sb)::text,true);
 r:=pg_temp.call('account.get');perform pg_temp.assert_true((r#>>'{account,balance}')::bigint=5000 and jsonb_array_length(r->'activity')=1,'B sees incoming shared transfer');
 r:=pg_temp.call('merchant.get');perform pg_temp.assert_true(r->'merchants'='[]'::jsonb,'consumer cannot see another owner merchant ledger');
 r:=pg_temp.call('request.create',jsonb_build_object('shopId',shop,'amount',2000,'attemptId','fixture-foreign-request-'||suffix));perform pg_temp.assert_true(r->>'code'='FORBIDDEN','consumer cannot create merchant request');
 r:=pg_temp.call('payment.quote',jsonb_build_object('shopId',shop,'requestId',request));perform pg_temp.assert_true((r#>>'{request,amount}')::bigint=2000 and r#>>'{request,status}'='open','fixed quote amount authoritative');
 r:=pg_temp.call('payment.pay',jsonb_build_object('shopId',shop,'requestId',expired_request,'amount',500,'pin',pin,'attemptId','fixture-expired-payment-'||suffix));perform pg_temp.assert_true(r->>'code'='REQUEST_UNAVAILABLE','expired open request rejects without debit');

 r:=pg_temp.call('payment.quote',jsonb_build_object('shopId',shop,'requestId',''));perform pg_temp.assert_true(r->>'code'='INVALID_QR','empty fixed request never downgraded');
 r:=pg_temp.call('payment.quote',jsonb_build_object('shopId',shop,'requestId',null));perform pg_temp.assert_true(r->>'code'='INVALID_QR','null fixed request never downgraded');
 r:=pg_temp.call('payment.pay',jsonb_build_object('shopId',shop,'requestId',request,'amount',1000,'pin',pin,'attemptId','fixture-forged-fixed-'||suffix));perform pg_temp.assert_true(r->>'code'='AMOUNT_LOCKED','fixed amount tamper rejected');
 r:=pg_temp.call('payment.pay',jsonb_build_object('shopId',shop,'requestId',request,'amount',2000,'pin',pin,'attemptId','fixture-fixed-pay-'||suffix));fixed_payment:=r;
 perform pg_temp.assert_true((r->>'ok')::boolean and (r#>>'{account,balance}')::bigint=3000 and r#>>'{receipt,requestId}'=request::text,'fixed payment posts');
 r:=pg_temp.call('payment.quote',jsonb_build_object('shopId',shop,'requestId',request));perform pg_temp.assert_true(r->>'code'='REQUEST_UNAVAILABLE','paid request unavailable');
 r:=pg_temp.call('payment.pay',jsonb_build_object('shopId',shop,'requestId',request,'amount',2000,'pin',pin,'attemptId','fixture-fixed-pay-'||suffix));perform pg_temp.assert_true((r->>'replayed')::boolean and r#>>'{receipt,id}'=fixed_payment#>>'{receipt,id}','committed fixed retry before used request check');
 r:=pg_temp.call('attempt.lookup',jsonb_build_object('attemptId','fixture-fixed-pay-'||suffix));perform pg_temp.assert_true(r->>'found'='true' and r#>>'{result,receipt,id}'=fixed_payment#>>'{receipt,id}','lost fixed payment recoverable without PIN storage');
 r:=pg_temp.call('payment.pay',jsonb_build_object('shopId',shop,'requestId',request,'amount',2000,'pin',pin,'attemptId','fixture-duplicate-fixed-'||suffix));perform pg_temp.assert_true(r->>'code'='REQUEST_UNAVAILABLE','new ref cannot pay fixed request twice');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sa)::text,true);
 r:=pg_temp.call('payment.quote',jsonb_build_object('shopId',shop));perform pg_temp.assert_true(r->'request'='null'::jsonb,'static QR has no locked amount');
 r:=pg_temp.call('payment.pay',jsonb_build_object('shopId',shop,'amount',1000,'pin',pin,'attemptId','fixture-static-pay-'||suffix));static_payment:=r;perform pg_temp.assert_true((r->>'ok')::boolean and (r#>>'{account,balance}')::bigint=4000,'static payment entered amount posts');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',sm)::text,true);
 r:=pg_temp.call('merchant.get');perform pg_temp.assert_true((r#>>'{merchants,0,balance}')::bigint=3000 and (r#>>'{merchants,0,shops,0,netCollected}')::bigint=3000 and r#>>'{merchants,0,activity,0,reference}' in (fixed_payment#>>'{receipt,reference}',static_payment#>>'{receipt,reference}'),'merchant matching receipts and aggregated balance');
 r:=pg_temp.call('payment.refund',jsonb_build_object('paymentId',fixed_payment#>>'{receipt,id}','amount',2000,'pin',pin,'attemptId','fixture-refund-fixed-'||suffix));original:=r;perform pg_temp.assert_true((r->>'ok')::boolean and r#>>'{receipt,payeeAccountId}'=account_b::text,'refund returns to original B account');
 r:=pg_temp.call('payment.refund',jsonb_build_object('paymentId',fixed_payment#>>'{receipt,id}','amount',2000,'pin',pin,'attemptId','fixture-refund-fixed-'||suffix));perform pg_temp.assert_true((r->>'replayed')::boolean and r#>>'{receipt,id}'=original#>>'{receipt,id}','refund replay once');
 r:=pg_temp.call('payment.refund',jsonb_build_object('paymentId',fixed_payment#>>'{receipt,id}','amount',1,'pin',pin,'attemptId','fixture-over-refund-'||suffix));perform pg_temp.assert_true(r->>'code'='REFUND_EXCEEDS_PAYMENT','cumulative refund cap');
 r:=pg_temp.call('payment.refund',jsonb_build_object('paymentId',static_payment#>>'{receipt,id}','amount',500,'pin',pin,'attemptId','fixture-partial-refund-'||suffix));perform pg_temp.assert_true((r->>'ok')::boolean,'partial refund posts');
 r:=pg_temp.call('merchant.close',jsonb_build_object('shopId',shop,'attemptId','fixture-close-shop-'||suffix));perform pg_temp.assert_true((r->>'ok')::boolean and (r->>'balance')::bigint=500,'close day retains real ledger balance');
 r:=pg_temp.call('merchant.get');perform pg_temp.assert_true((r#>>'{merchants,0,shops,0,netCollected}')::bigint=0,'close day resets trading view only');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','session_id',sa)::text,true);
 r:=pg_temp.call('payment.pay',jsonb_build_object('shopId',shop,'amount',300,'pin',pin,'attemptId','fixture-after-close-'||suffix));perform pg_temp.assert_true((r->>'ok')::boolean,'payment after close posts');
 for i in 1..5 loop
  r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount',100,'pin',wrong_pin,'attemptId','fixture-pin-fail-'||i||'-'||suffix));
  perform pg_temp.assert_true(r->>'code'='PIN_REQUIRED' and r->>'definitive'='false','wrong PIN rejected without consuming attempt');
 end loop;
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount',100,'pin',pin,'attemptId','fixture-pin-retry-'||suffix));perform pg_temp.assert_true(r->>'code'='PIN_REQUIRED','correct PIN blocked during cooldown');
 perform pg_temp.assert_true((select pin_failures from lumo_private.profiles where user_id=a)=5,'PIN failures persist through JSON errors');
 update lumo_private.profiles set pin_locked_until=clock_timestamp()-interval '1 second' where user_id=a;
 r:=pg_temp.call('transfer',jsonb_build_object('recipientHandle','b_'||suffix,'amount',100,'pin',pin,'attemptId','fixture-pin-retry-'||suffix));perform pg_temp.assert_true((r->>'ok')::boolean,'same unconsumed ref works after cooldown');
 r:=pg_temp.call('account.get');perform pg_temp.assert_true((r#>>'{account,balance}')::bigint=4100,'A final balance exact');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id',sb)::text,true);
 r:=pg_temp.call('account.get');perform pg_temp.assert_true((r#>>'{account,balance}')::bigint=5100,'B final balance exact');
 r:=pg_temp.call('payment.refund',jsonb_build_object('paymentId',static_payment#>>'{receipt,id}','amount',1,'pin',pin,'attemptId','fixture-foreign-refund-'||suffix));perform pg_temp.assert_true(r->>'code'='FORBIDDEN','consumer cannot refund merchant');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m,'role','authenticated','session_id',sm)::text,true);
 r:=pg_temp.call('merchant.get');perform pg_temp.assert_true((r#>>'{merchants,0,balance}')::bigint=800 and (r#>>'{merchants,0,shops,0,netCollected}')::bigint=300,'merchant final and new trading view exact');
 update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=sm;
 r:=pg_temp.call('merchant.get');perform pg_temp.assert_true(r->>'code'='SESSION_REVOKED','expired session row rejected');
 delete from auth.sessions where id=sb;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','session_id',sb)::text,true);
 r:=pg_temp.call('account.get');perform pg_temp.assert_true(r->>'code'='SESSION_REVOKED','revoked JWT rejected before reading account');
 perform pg_temp.assert_true((select sum(balance) from lumo_private.accounts)=0,'total ledger balances including funding offset conserved');
 perform pg_temp.assert_true(not exists(select 1 from lumo_private.journals j left join lumo_private.entries e on e.journal_id=j.id group by j.id having count(e.id)<>2 or sum(e.amount)<>0),'all journals balanced exactly twice');
 perform pg_temp.assert_true(not exists(select 1 from lumo_private.accounts a where a.balance<>(select coalesce(sum(amount),0) from lumo_private.entries e where e.account_id=a.id)),'balance projection equals immutable entries');
 begin
  update lumo_private.entries set amount=amount+1 where journal_id=(fixed_payment#>>'{receipt,id}')::uuid;
  perform pg_temp.assert_true(false,'posted entries immutable');
 exception when raise_exception then perform pg_temp.assert_true(sqlerrm='Posted ledger records are immutable','posted entries immutable');end;
 perform set_config('lumo.test.report',jsonb_build_object('checks',current_setting('lumo.test.checks')::integer,'flow','A funds10000, sends5000 to B; B pays2000 fixed; A pays1000 static; merchant refunds2500, closes shop; A pays300 then transfers100','balances',jsonb_build_object('consumerA',4100,'consumerB',5100,'merchant',800),'testFixturesRolledBack',true)::text,true);
end $$;
-- Flush deferred posting invariants under the ordinary application role, not postgres.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('lumo.test.actor'),'role','authenticated','session_id',current_setting('lumo.test.session'))::text,true);
set constraints all immediate;
select current_setting('lumo.test.report')::jsonb as lumo_shared_ledger_test;
rollback;
