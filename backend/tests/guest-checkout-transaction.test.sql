-- Run only inside BEGIN; <migration>; fixture; ROLLBACK. The private runtime
-- context is supplied by the test harness, never committed with credentials.
do $guest_tests$
#variable_conflict use_variable
<<qa>>
declare
 ctx jsonb:=current_setting('lumo.guest.test_context',true)::jsonb;
 actor uuid;session_id uuid;token_hash text;merchant uuid;shop uuid;funding uuid;account_id uuid;consumer uuid;
 original_accounts bigint;opening_balance bigint;funding_balance bigint;
 response jsonb;link jsonb;second_link jsonb;attempt jsonb;receipt jsonb;ref uuid;request_id uuid;j uuid;amount bigint;records bigint;bad_count bigint;
 rate text:=repeat('a',64);recovery text:=repeat('b',64);test_id text:='guest-db-'||replace(gen_random_uuid()::text,'-','');
 i integer;failed boolean;total bigint:=0;
begin
 if ctx is null then raise exception 'Supply private lumo.guest.test_context from the QA HTTP fixture.';end if;
 actor:=(ctx->>'actor')::uuid;session_id:=(ctx->>'authSession')::uuid;token_hash:=ctx->>'merchantTokenHash';merchant:=(ctx->>'merchantId')::uuid;shop:=(ctx->>'shopId')::uuid;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 if not lumo_private.approved_live(actor,session_id) then raise exception 'QA actor is not live';end if;
 if not exists(select 1 from lumo_private.merchants where id=merchant and owner_user_id=actor and name ilike '%QA%') then raise exception 'Use an isolated QA merchant owned by the HTTP fixture';end if;
 select m.account_id into account_id from lumo_private.merchants m where id=merchant;
 select id,balance into funding,funding_balance from lumo_private.accounts where kind='test_funding';
 select id into consumer from lumo_private.accounts where owner_user_id=actor and kind='consumer';
 select balance into opening_balance from lumo_private.accounts where id=account_id;
 select count(*) into original_accounts from lumo_private.accounts;
 update lumo_private.shops set accepting=true where id=shop;
 update lumo_private.shop_settings set published=true where shop_id=shop;
 update lumo_private.approved_merchant_network set document=jsonb_set(document,array['businesses',merchant::text,'shops'],(select jsonb_agg(case when value->>'id'=shop::text then value||'{"published":true,"accepting":true,"open":true}'::jsonb else value end) from jsonb_array_elements(document#>array['businesses',merchant::text,'shops']))) where id;

 response:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'amount',2000,'description','QA remote order','validity','7d','attemptId',test_id||'-link'));
 if response->>'ok'<>'true' then raise exception 'Create fixed link failed: %',response;end if;link:=response->'link';request_id:=(link->>'requestId')::uuid;
 if (link->>'amount')::bigint<>2000 or (link->>'expiresAt')::timestamptz<clock_timestamp()+interval '6 days' then raise exception 'Online fixed amount/validity model incorrect';end if;
 response:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'amount',2000,'description','QA remote order','validity','7d','attemptId',test_id||'-link'));
 if response#>>'{link,id}'<>link->>'id' then raise exception 'Lost create response made a duplicate link';end if;
 response:=public.lumo_guest_checkout('quote',jsonb_build_object('link',link->>'publicToken','rateKey',rate));
 if response->>'ok'<>'true' or response#>>'{provider,mode}'<>'sandbox' or response#>>'{link,amount}'<>'2000' then raise exception 'Public quote incorrect: %',response;end if;
 response:=public.lumo_guest_checkout('initiate',jsonb_build_object('link',link->>'publicToken','rateKey',rate,'attemptId',test_id||'-bad','recoveryHash',recovery,'amount',2100,'phone','0241234567','network','mtn'));
 if response->>'code'<>'AMOUNT_CHANGED' or exists(select 1 from lumo_private.guest_momo_attempts where id=test_id||'-bad') then raise exception 'Fixed amount tampering initiated a charge';end if;
 response:=public.lumo_guest_checkout('initiate',jsonb_build_object('link',link->>'publicToken','rateKey',rate,'attemptId',test_id||'-a','recoveryHash',recovery,'amount',2000,'phone','0241234567','network','mtn'));
 if response->>'ok'<>'true' or response#>>'{attempt,status}'<>'pending' then raise exception 'Initiation failed: %',response;end if;
 attempt:=response->'attempt';
 if attempt->>'phoneMasked' not like '%4567' or attempt?'phone' then raise exception 'Guest phone disclosure';end if;
 response:=public.lumo_guest_checkout('initiate',jsonb_build_object('link',link->>'publicToken','rateKey',rate,'attemptId',test_id||'-a','recoveryHash',recovery,'amount',2000,'phone','0241234567','network','mtn'));
 if response#>>'{attempt,id}'<>attempt->>'id' then raise exception 'Lost initiation response did not recover same attempt';end if;
 response:=public.lumo_guest_checkout('initiate',jsonb_build_object('link',link->>'publicToken','rateKey',rate,'attemptId',test_id||'-other','recoveryHash',recovery,'amount',2000,'phone','0551234567','network','mtn'));
 if response->>'code'<>'REQUEST_PROCESSING' then raise exception 'Concurrent guest fixed request not reserved: %',response;end if;
 perform lumo_private.approved_actor_context(actor,session_id);
 failed:=false;
 begin perform lumo_private.post_money(actor,'merchant_payment',2000,funding,account_id,shop,request_id,null);exception when others then if SQLERRM='REQUEST_PROCESSING' then failed:=true;else raise;end if;end;
 if not failed then raise exception 'Wallet posting bypassed guest pending reservation';end if;
 failed:=false;
 begin perform lumo_private.guest_apply_result(attempt->>'id','approve',2001,'GHS',merchant,shop,attempt->>'providerReference');exception when others then if SQLERRM='PROVIDER_RESULT_MISMATCH' then failed:=true;else raise;end if;end;
 if not failed then raise exception 'Mismatched provider result accepted';end if;
 response:=public.lumo_guest_checkout('sandboxResult',jsonb_build_object('attemptId',attempt->>'id','recoveryHash',recovery,'rateKey',rate,'outcome','delay'));
 if response#>>'{attempt,status}'<>'pending' then raise exception 'Delay inferred payment success';end if;
 response:=public.lumo_guest_checkout('sandboxResult',jsonb_build_object('attemptId',attempt->>'id','recoveryHash',recovery,'rateKey',rate,'outcome','approve'));
 if response->>'ok'<>'true' or response#>>'{attempt,status}'<>'confirmed' then raise exception 'Provider approval failed or was silently reversed: %',response;end if;
 receipt:=response#>'{attempt,receipt}';
 if (receipt->>'amount')::bigint<>2000 or receipt->>'currency'<>'GHS' or receipt->>'shopId'<>shop::text then raise exception 'Receipt destination mismatch';end if;
 select journal_id into j from lumo_private.guest_momo_attempts where id=attempt->>'id';
 if not exists(select 1 from lumo_private.journals jn where jn.id=j and jn.amount=2000 and jn.payee_account_id=account_id and jn.payer_account_id=funding and jn.request_id=qa.request_id) then raise exception 'Canonical guest posting incorrect';end if;
 if (select count(*) from lumo_private.entries where journal_id=j)<>2 or (select sum(e.amount) from lumo_private.entries e where e.journal_id=j)<>0 then raise exception 'Guest ledger not balanced';end if;
 response:=public.lumo_guest_checkout('sandboxResult',jsonb_build_object('attemptId',attempt->>'id','recoveryHash',recovery,'rateKey',rate,'outcome','approve'));
 if response#>>'{attempt,receipt,reference}'<>receipt->>'reference' or (select count(*) from lumo_private.journals jn where jn.request_id=qa.request_id and jn.type='merchant_payment')<>1 then raise exception 'Duplicate callback posted twice';end if;
 total:=total+2000;
 response:=public.lumo_guest_merchant(actor,session_id,token_hash,'list','{}');
 if not exists(select 1 from jsonb_array_elements(response->'links') x where x->>'id'=link->>'id' and x#>>'{requestPayment,reference}'=receipt->>'reference' and x->>'guestConfirmedAmount'='2000' and x->>'lumoConfirmedAmount'='0') then raise exception 'Authoritative link completion summary incorrect';end if;

 -- Wrong recovery attempts remain throttled despite operation error handling.
 for i in 1..122 loop response:=public.lumo_guest_checkout('status',jsonb_build_object('attemptId',attempt->>'id','recoveryHash',repeat('c',64),'rateKey',repeat('d',64)));end loop;
 if response->>'code'<>'RATE_LIMITED' then raise exception 'Failed recovery attempts bypassed rate limit';end if;
 select count into bad_count from lumo_private.guest_checkout_rate_limits where key='guest:status:'||repeat('d',64);
 if bad_count<122 then raise exception 'Rate limit writes were rolled back on recovery errors';end if;

 -- Authorized refund returns to original provider funding, no guest wallet.
 perform lumo_private.approved_actor_context(actor,session_id);
 ref:=lumo_private.post_money(actor,'refund',500,account_id,funding,shop,request_id,j);
 if not exists(select 1 from lumo_private.guest_momo_refunds gr where gr.journal_id=ref and gr.attempt_id=attempt->>'id' and gr.amount=500 and gr.status='sandbox-completed') then raise exception 'Guest refund lost original provider reference';end if;
 total:=total-500;
 if consumer is not null then
  failed:=false;
  begin perform lumo_private.post_money(actor,'refund',100,account_id,consumer,shop,request_id,j);exception when others then if SQLERRM='REFUND_DESTINATION_UNAVAILABLE' then failed:=true;else raise;end if;end;
  if not failed then raise exception 'Guest refund went to a Lumo consumer wallet';end if;
 end if;

 -- Every stale provider approval must be explicitly reversed, not declined or
 -- credited to an expired/cancelled/paused destination.
 for i in 1..3 loop
  response:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'amount',300,'validity','24h','attemptId',test_id||'-late-link-'||i));
  if response->>'ok'<>'true' then raise exception 'Create late request failed: %',response;end if;second_link:=response->'link';
  response:=public.lumo_guest_checkout('initiate',jsonb_build_object('link',second_link->>'publicToken','rateKey',repeat('e',64),'attemptId',test_id||'-late-'||i,'recoveryHash',recovery,'amount',300,'phone','0241234567','network','mtn'));
  if response->>'ok'<>'true' then raise exception 'Late attempt init failed: %',response;end if;
  if i=1 then update lumo_private.payment_requests set status='cancelled' where id=(second_link->>'requestId')::uuid;
  elsif i=2 then update lumo_private.payment_requests set expires_at=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '1 day' where id=(second_link->>'requestId')::uuid;
  else update lumo_private.shops set accepting=false where id=shop;end if;
  response:=public.lumo_guest_checkout('sandboxResult',jsonb_build_object('attemptId',test_id||'-late-'||i,'recoveryHash',recovery,'rateKey',repeat('e',64),'outcome','approve'));
  if response->>'ok'<>'true' or response#>>'{attempt,status}'<>'reversed' or response#>>'{attempt,reversalReference}' is null or exists(select 1 from lumo_private.guest_momo_attempts where id=test_id||'-late-'||i and journal_id is not null) then raise exception 'Late provider approval was not safely reversed: %',response;end if;
  update lumo_private.shops set accepting=true where id=shop;
 end loop;

 -- Reusable links accept independent entered amounts and keep both references.
 response:=public.lumo_guest_merchant(actor,session_id,token_hash,'create',jsonb_build_object('shopId',shop,'attemptId',test_id||'-reusable'));second_link:=response->'link';
 if second_link->>'kind'<>'shop' or second_link->'amount'<>'null'::jsonb then raise exception 'Reusable shop link fixed its amount';end if;
 for i in 1..2 loop
  amount:=i*100;
  response:=public.lumo_guest_checkout('initiate',jsonb_build_object('link',second_link->>'publicToken','rateKey',repeat('f',64),'attemptId',test_id||'-reuse-'||i,'recoveryHash',recovery,'amount',amount,'phone','0501234567','network','telecel'));
  if response->>'ok'<>'true' then raise exception 'Reusable initiation failed: %',response;end if;
  response:=public.lumo_guest_checkout('sandboxResult',jsonb_build_object('attemptId',test_id||'-reuse-'||i,'recoveryHash',recovery,'rateKey',repeat('f',64),'outcome','approve'));
  if response#>>'{attempt,status}'<>'confirmed' then raise exception 'Reusable approval failed: %',response;end if;
  total:=total+amount;
 end loop;
 if (select count(*) from lumo_private.accounts)<>original_accounts then raise exception 'Guest checkout created a hidden wallet';end if;
 if (select balance from lumo_private.accounts where id=account_id)<>opening_balance+total or (select balance from lumo_private.accounts where id=funding)<>funding_balance-total then raise exception 'Guest funding and merchant balances did not reconcile';end if;
 if exists(select 1 from lumo_private.journals jn where jn.created_at>=transaction_timestamp() and jn.payee_account_id=account_id and jn.type='merchant_payment' and not exists(select 1 from lumo_private.guest_momo_attempts g where g.journal_id=jn.id and g.status='confirmed')) then raise exception 'Unmatched guest posting';end if;
 raise notice 'Guest checkout transaction assertions passed';
end $guest_tests$;
set constraints all immediate;
