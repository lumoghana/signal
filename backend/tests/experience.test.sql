-- Connected extras integration checks. All Auth, account, directory and financial fixtures roll back.
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin
 if value is distinct from true then raise exception 'Lumo experience check failed: %',label;end if;
 perform set_config('lumo.experience.checks',(coalesce(nullif(current_setting('lumo.experience.checks',true),''),'0')::integer+1)::text,true);
end $$;
create function pg_temp.call(command text,payload jsonb default '{}'::jsonb) returns jsonb language plpgsql as $$
declare response jsonb;
begin
 execute 'set local role authenticated';response:=public.lumo_rpc(command,payload);execute 'reset role';return response;
exception when others then execute 'reset role';raise;
end $$;
create function pg_temp.actor(p_user uuid,p_session uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user,'role','authenticated','session_id',p_session)::text,true);end $$;
do $$
declare
 a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();x uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();sx uuid:=gen_random_uuid();
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);pin text:='583901';
 r jsonb;o jsonb;saved jsonb;shop uuid;shop2 uuid;merchant uuid;request uuid;request2 uuid;fav uuid;code text;ac uuid;bc uuid;
begin
 perform set_config('lumo.experience.checks','0',true);
 insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data)
 values(a,'authenticated','authenticated','extras-a-'||suffix||'@example.invalid',now(),now(),now(),'{"lumo_pilot":true}'),
 (b,'authenticated','authenticated','extras-b-'||suffix||'@example.invalid',now(),now(),now(),'{"lumo_pilot":true}'),
 (x,'authenticated','authenticated','extras-x-'||suffix||'@example.invalid',now(),now(),now(),'{"lumo_pilot":true}');
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,now(),now()),(sb,b,now(),now()),(sx,x,now(),now());
 perform pg_temp.actor(a,sa);r:=pg_temp.call('account.open',jsonb_build_object('handle','exa_'||suffix,'displayName','Extras A','pin',pin));ac:=(r#>>'{account,id}')::uuid;
 perform pg_temp.assert_true(r->>'ok'='true','A account opened');
 perform pg_temp.actor(b,sb);r:=pg_temp.call('account.open',jsonb_build_object('handle','exb_'||suffix,'displayName','Extras B','pin',pin));bc:=(r#>>'{account,id}')::uuid;
 perform pg_temp.assert_true(r->>'ok'='true','B account opened');
 r:=pg_temp.call('wallet.fund',jsonb_build_object('amount',10000,'confirmSandbox',true,'attemptId','extras-fund-'||suffix));perform pg_temp.assert_true(r->>'ok'='true','B test funds added');
 perform pg_temp.actor(x,sx);r:=pg_temp.call('account.open',jsonb_build_object('handle','exx_'||suffix,'displayName','Extras X','pin',pin));perform pg_temp.assert_true(r->>'ok'='true','outsider account opened');
 perform pg_temp.actor(a,sa);
 r:=pg_temp.call('merchant.create',jsonb_build_object('businessName','Extras Fixture '||suffix,'shopName','Near Night Market','attemptId','extras-merchant-'||suffix));shop:=(r#>>'{shop,id}')::uuid;merchant:=(r#>>'{merchant,id}')::uuid;
 r:=pg_temp.call('shop.create',jsonb_build_object('merchantId',merchant,'name','Far Campus','attemptId','extras-shop-'||suffix));shop2:=(r#>>'{shop,id}')::uuid;
 r:=pg_temp.call('shop.discovery.get',jsonb_build_object('shopId',shop));code:=r#>>'{discovery,code}';
 perform pg_temp.assert_true(code ~ '^LM-[A-F0-9]{12}$' and r#>>'{discovery,published}'='false','new receiving shop has opaque unpublished code');
 r:=pg_temp.call('merchant.discover',jsonb_build_object('code',code));perform pg_temp.assert_true(jsonb_array_length(r->'shops')=0,'unpublished exact code hidden');
 r:=pg_temp.call('shop.discovery',jsonb_build_object('shopId',shop,'published',true,'latitude',5.65,'longitude',-0.187,'campus','Legon','category','Food','attemptId','extras-publish-'||suffix));
 perform pg_temp.assert_true(r->>'ok'='true' and r#>>'{discovery,published}'='true','owner opts shop into directory');
 r:=pg_temp.call('shop.discovery',jsonb_build_object('shopId',shop2,'published',true,'latitude',5.70,'longitude',-0.10,'campus','Legon','category','Food','attemptId','extras-publish-far-'||suffix));
 r:=pg_temp.call('merchant.discover',jsonb_build_object('query','Extras Fixture '||suffix,'latitude',5.65,'longitude',-0.187));
 perform pg_temp.assert_true(jsonb_array_length(r->'shops')=2 and r#>>'{shops,0,shopId}'=shop::text and (r#>>'{shops,0,distanceKm}')::numeric=0,'actual nearby published shop ordered first');
 r:=pg_temp.call('merchant.discover',jsonb_build_object('code',code));perform pg_temp.assert_true(jsonb_array_length(r->'shops')=1 and r#>>'{shops,0,shopId}'=shop::text,'opaque code resolves correct published shop');
 r:=pg_temp.call('shop.discovery',jsonb_build_object('shopId',shop,'published',true,'latitude',200,'longitude',0,'attemptId','extras-bad-coords-'||suffix));perform pg_temp.assert_true(r->>'ok'='false','out-of-range coordinates rejected');
 perform pg_temp.actor(b,sb);r:=pg_temp.call('shop.discovery',jsonb_build_object('shopId',shop,'published',false,'attemptId','extras-forbidden-shop-'||suffix));perform pg_temp.assert_true(r->>'code'='FORBIDDEN','other consumer cannot change publication');
 r:=pg_temp.call('shop.discovery.get',jsonb_build_object('shopId',shop));perform pg_temp.assert_true(r->>'code'='FORBIDDEN','other consumer cannot inspect private discovery settings');
 perform pg_temp.actor(a,sa);r:=pg_temp.call('merchant.settings',jsonb_build_object('shopId',shop,'published',false,'attemptId','extras-unpublish-'||suffix));
 r:=pg_temp.call('merchant.discover',jsonb_build_object('code',code));perform pg_temp.assert_true(jsonb_array_length(r->'shops')=0,'merchant settings unpublish shares same privacy boundary');
 r:=pg_temp.call('favourite.save',jsonb_build_object('handle','exb_'||suffix,'label','Roommate','attemptId','extras-fav-'||suffix));fav:=(r#>>'{favourite,id}')::uuid;saved:=r;
 perform pg_temp.assert_true(r->>'ok'='true' and r#>>'{favourite,handle}'='exb_'||suffix,'exact active favourite saved');
 r:=pg_temp.call('favourite.save',jsonb_build_object('handle','exb_'||suffix,'label','Roommate','attemptId','extras-fav-'||suffix));perform pg_temp.assert_true(r->>'replayed'='true' and r#>>'{favourite,id}'=fav::text,'saved favourite retry reuses original');
 r:=pg_temp.call('favourite.save',jsonb_build_object('handle','exb_'||suffix,'label','New label','attemptId','extras-fav-update-'||suffix));perform pg_temp.assert_true(r#>>'{favourite,id}'=fav::text and r#>>'{favourite,label}'='New label','same person updated without duplicate');
 perform pg_temp.actor(b,sb);r:=pg_temp.call('favourite.list');perform pg_temp.assert_true(jsonb_array_length(r->'favourites')=0,'favourites private per user');
 r:=pg_temp.call('favourite.delete',jsonb_build_object('favouriteId',fav,'attemptId','extras-fav-delete-other-'||suffix));perform pg_temp.assert_true(r->>'code'='FORBIDDEN','other account cannot delete favourite');
 perform pg_temp.actor(a,sa);r:=pg_temp.call('favourite.save',jsonb_build_object('handle','exa_'||suffix,'attemptId','extras-self-fav-'||suffix));perform pg_temp.assert_true(r->>'ok'='false','self favourite rejected');
 r:=pg_temp.call('person.request.create',jsonb_build_object('payerHandle','exb_'||suffix,'amount',2500,'note','Shared lunch','attemptId','extras-request-'||suffix));request:=(r->>'requestId')::uuid;
 perform pg_temp.assert_true(r->>'ok'='true' and r#>>'{paymentRequest,status}'='open','targeted amount request created without moving money');
 r:=pg_temp.call('account.get');perform pg_temp.assert_true((r#>>'{account,balance}')::bigint=0,'request alone never credits requester');
 r:=pg_temp.call('person.request.pay',jsonb_build_object('requestId',request,'amount',2500,'pin',pin,'attemptId','extras-self-pay-request-'||suffix));perform pg_temp.assert_true(r->>'code'='FORBIDDEN','requester cannot approve on payer behalf');
 perform pg_temp.actor(x,sx);r:=pg_temp.call('person.request.list');perform pg_temp.assert_true(jsonb_array_length(r->'paymentRequests')=0,'outside account cannot see payment requests');
 r:=pg_temp.call('person.request.cancel',jsonb_build_object('requestId',request,'attemptId','extras-stranger-cancel-'||suffix));perform pg_temp.assert_true(r->>'code'='FORBIDDEN','outside account cannot cancel request');
 perform pg_temp.actor(b,sb);r:=pg_temp.call('person.request.list');perform pg_temp.assert_true(jsonb_array_length(r->'paymentRequests')=1,'nominated payer sees shared request');
 r:=pg_temp.call('person.request.pay',jsonb_build_object('requestId',request,'amount',2400,'pin',pin,'attemptId','extras-tamper-request-'||suffix));perform pg_temp.assert_true(r->>'code'='AMOUNT_LOCKED','request amount tampering rejected');
 r:=pg_temp.call('person.request.pay',jsonb_build_object('requestId',request,'amount',2500,'pin',pin,'attemptId','extras-pay-request-'||suffix));saved:=r;
 perform pg_temp.assert_true(r->>'ok'='true' and r#>>'{paymentRequest,status}'='paid' and r#>>'{receipt,type}'='transfer' and (r#>>'{account,balance}')::bigint=7500,'request payment actually debits nominated payer');
 perform pg_temp.assert_true((select balance from lumo_private.accounts where id=ac)=2500,'request payment credits original requester');
 perform pg_temp.assert_true(r#>>'{receipt,personalRequestId}'=request::text,'receipt bound to shared personal request');
 r:=pg_temp.call('person.request.pay',jsonb_build_object('requestId',request,'amount',2500,'pin',pin,'attemptId','extras-pay-request-'||suffix));perform pg_temp.assert_true(r->>'replayed'='true' and r#>>'{receipt,id}'=saved#>>'{receipt,id}','request payment retry returns same receipt');
 r:=pg_temp.call('person.request.pay',jsonb_build_object('requestId',request,'amount',2500,'pin',pin,'attemptId','extras-second-pay-'||suffix));perform pg_temp.assert_true(r->>'code'='REQUEST_UNAVAILABLE','new attempt cannot pay used request twice');
 perform pg_temp.actor(a,sa);r:=pg_temp.call('person.request.create',jsonb_build_object('payerHandle','exb_'||suffix,'amount',100,'attemptId','extras-request-cancel-'||suffix));request2:=(r->>'requestId')::uuid;
 perform pg_temp.actor(b,sb);r:=pg_temp.call('person.request.cancel',jsonb_build_object('requestId',request2,'attemptId','extras-request-cancelled-'||suffix));perform pg_temp.assert_true(r#>>'{paymentRequest,status}'='cancelled','nominated payer can decline by cancellation');
 r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','clarity-basics','completed',true,'score',80,'revision',0,'attemptId','extras-learn-'||suffix));perform pg_temp.assert_true(r->>'ok'='true' and r#>>'{progress,revision}'='1','learning completion saved centrally');
 r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','clarity-basics','completed',true,'score',90,'revision',0,'attemptId','extras-learn-stale-'||suffix));perform pg_temp.assert_true(r->>'code'='REVISION_CONFLICT','learning optimistic concurrency rejects stale device');
 r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','clarity-basics','completed',true,'score',90,'revision',1,'attemptId','extras-learn-fresh-'||suffix));perform pg_temp.assert_true(r#>>'{progress,revision}'='2','learning update uses current revision');
 r:=pg_temp.call('learning.save',jsonb_build_object('moduleId','clarity-basics','completed',true,'score',101,'revision',2,'attemptId','extras-learn-invalid-'||suffix));perform pg_temp.assert_true(r->>'ok'='false','invalid learning score rejected');
 perform pg_temp.actor(a,sa);r:=pg_temp.call('learning.get');perform pg_temp.assert_true(jsonb_array_length(r->'progress')=0,'learning progress private to user');
 r:=pg_temp.call('money.chat',jsonb_build_object('question','What do I have available?'));perform pg_temp.assert_true(r->>'ok'='true' and r->>'grounded'='true','chat answer grounded in actual ledger');
 r:=pg_temp.call('chat.history');perform pg_temp.assert_true(jsonb_array_length(r->'messages')=1 and length(r#>>'{messages,0,answer}')>0,'grounded answer persisted for same account on other device');
 perform pg_temp.actor(b,sb);r:=pg_temp.call('chat.history');perform pg_temp.assert_true(jsonb_array_length(r->'messages')=0,'chat history private');
 perform pg_temp.actor(a,sa);r:=pg_temp.call('chat.clear',jsonb_build_object('attemptId','extras-clear-chat-'||suffix));perform pg_temp.assert_true(r->>'cleared'='true','explicit clear recorded');
 r:=pg_temp.call('chat.history');perform pg_temp.assert_true(jsonb_array_length(r->'messages')=0,'cleared chat no longer listed');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','lumo_private.person_requests','SELECT,INSERT,UPDATE,DELETE'),'no direct personal request access');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','lumo_private.chat_history','SELECT,INSERT,UPDATE,DELETE'),'no direct chat access');
 perform pg_temp.assert_true(not has_function_privilege('authenticated','lumo_private.experience_command(text,jsonb)','EXECUTE'),'private handler unavailable directly');
 perform pg_temp.assert_true(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='lumo_private' and c.relkind='r' and not c.relrowsecurity),'all private tables keep RLS');
end $$;
select current_setting('lumo.experience.checks')::integer as checks_passed;
rollback;
