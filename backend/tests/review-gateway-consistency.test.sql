-- Run after approved-gateway.test.sql helpers, or use scripts/verify-review-database.mjs.
-- Synthetic users/sessions, money, reports and closure decisions always roll back.
do $review$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();
 suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);ha text;hb text;g text;ga uuid;out jsonb;p jsonb;before_journals bigint;
begin
 ha:='review-a-'||suffix;hb:='review-b-'||suffix;g:='review-group-'||suffix;
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (a,'authenticated','authenticated',ha||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now()),
 (b,'authenticated','authenticated',hb||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,now(),now()),(sb,b,now(),now());
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 out:=pg_temp.approved('provision',jsonb_build_object('actor',a,'session',sa,'handle',ha,'displayName','Review A','pin','3159'));
 perform pg_temp.assert_approved(out->>'ok'='true','new review account A provisioned');
 out:=pg_temp.approved('provision',jsonb_build_object('actor',b,'session',sb,'handle',hb,'displayName','Review B','pin','2718'));
 perform pg_temp.assert_approved(out->>'ok'='true','new review account B provisioned');
 insert into lumo_private.accounts(owner_user_id,kind) values(a,'group') returning id into ga;
 insert into lumo_private.approved_groups(id,account_id,state) values(g,ga,jsonb_build_object('id',g,'name','Review group','creatorId',a,'status','open','members',jsonb_build_array(jsonb_build_object('id',a,'status','active','role','approver'),jsonb_build_object('id',b,'status','active','role','contributor')),'chat',jsonb_build_object('reports','[]'::jsonb,'messages',jsonb_build_array(jsonb_build_object('id','review-message','senderId',b,'status','sent','text','A test message')))));
 p:=jsonb_build_object('actor',a,'session',sa,'attemptId','review-report-'||suffix,'fingerprint',repeat('a',64),'expectedRevision',0,'expectedWallet',0,'state','{"wallet":0,"groups":[],"account":{"status":"active"},"settings":{}}'::jsonb,'groups','[]'::jsonb,'boxes','[]'::jsonb,'requests','[]'::jsonb,'partners','[]'::jsonb,'intents','[]'::jsonb,'requiresAuth',false,'privateReports',jsonb_build_array(jsonb_build_object('id','report-'||g,'groupId',g,'messageId','review-message','reporterId',a,'reason','Private test reason')),'result','{"ok":true}'::jsonb);
 out:=pg_temp.approved('commit',p);
 perform pg_temp.assert_approved(out->>'ok'='true','private group report commits separately');
 perform pg_temp.assert_approved((select reason='Private test reason' from lumo_private.approved_group_reports where id='report-'||g),'report details are retained in private storage');
 out:=pg_temp.approved('load',jsonb_build_object('actor',b,'session',sb));
 perform pg_temp.assert_approved(not exists(select 1 from jsonb_array_elements(out->'groups') x where jsonb_array_length(coalesce(x#>'{state,chat,reports}','[]'::jsonb))<>0),'reported member receives no private reports');
 perform pg_temp.assert_approved(not has_table_privilege('anon','lumo_private.approved_group_reports','SELECT') and not has_table_privilege('authenticated','lumo_private.approved_group_reports','SELECT') and not has_table_privilege('service_role','lumo_private.approved_group_reports','SELECT'),'private reports have no client or direct service table grants');
 out:=pg_temp.approved('commit',p||jsonb_build_object('attemptId','review-forged-'||suffix,'fingerprint',repeat('b',64),'expectedRevision',1,'privateReports',jsonb_build_array(jsonb_build_object('id','forged-'||g,'groupId',g,'messageId','review-message','reporterId',b,'reason','Forged reporter'))));
 perform pg_temp.assert_approved(out->>'code'='REPORT_UNAVAILABLE' and not exists(select 1 from lumo_private.approved_group_reports where id='forged-'||g),'reporter cannot be forged and failed report leaves no partial record');
 p:=p||jsonb_build_object('attemptId','review-close-'||suffix,'fingerprint',repeat('c',64),'expectedRevision',1,'privateReports','[]'::jsonb,'requiresAuth',true,'pin','3159','state','{"wallet":0,"groups":[],"account":{"status":"closed"},"settings":{}}'::jsonb);
 out:=pg_temp.approved('commit',p);
 perform pg_temp.assert_approved(out->>'code'='CLOSURE_BLOCKED','an active open group blocks closure even with zero balance');
 update lumo_private.approved_groups set state=jsonb_set(state,'{status}','"closed"'::jsonb) where id=g;
 out:=pg_temp.approved('commit',p||jsonb_build_object('pin','0000'));
 perform pg_temp.assert_approved(out->>'code'='PIN_REQUIRED' and (select status='active' from lumo_private.accounts where owner_user_id=a and kind='consumer'),'wrong PIN cannot close ledger eligibility');
 out:=pg_temp.approved('commit',p);
 perform pg_temp.assert_approved(out->>'ok'='true' and (select status='closed' from lumo_private.accounts where owner_user_id=a and kind='consumer'),'closure changes ledger status atomically');
 out:=pg_temp.approved('load',jsonb_build_object('actor',a,'session',sa));
 perform pg_temp.assert_approved(out->>'ok'='true' and out#>>'{state,account,status}'='closed','closed owner retains read-only record access');
 out:=pg_temp.approved('attempt',jsonb_build_object('actor',a,'session',sa,'attemptId','review-close-'||suffix,'fingerprint',repeat('c',64)));
 perform pg_temp.assert_approved(out->>'found'='true','closure original reference remains recoverable');
 out:=pg_temp.approved('resolve',jsonb_build_object('actor',b,'session',sb,'query',ha));
 perform pg_temp.assert_approved(out->>'code'='RECIPIENT_NOT_FOUND','closed accounts are not resolvable recipients');
 out:=pg_temp.approved('commit',p||jsonb_build_object('attemptId','review-reopen-'||suffix,'fingerprint',repeat('d',64),'expectedRevision',2,'state','{"wallet":0,"groups":[],"account":{"status":"active"},"settings":{}}'::jsonb));
 perform pg_temp.assert_approved(out->>'code'='ACCOUNT_CLOSED','a state write cannot reopen a closed ledger account');
 p:=jsonb_build_object('actor',b,'session',sb,'attemptId','review-fund-'||suffix,'fingerprint',repeat('e',64),'expectedRevision',0,'expectedWallet',0,'state','{"wallet":100,"groups":[],"settings":{}}'::jsonb,'groups','[]'::jsonb,'boxes','[]'::jsonb,'requests','[]'::jsonb,'privateReports','[]'::jsonb,'partners','[]'::jsonb,'intents',jsonb_build_array(jsonb_build_object('kind','test_funding','amount',100,'source','{"kind":"funding"}'::jsonb,'destination','{"kind":"wallet"}'::jsonb)),'requiresAuth',true,'pin','2718','result','{"ok":true}'::jsonb);
 out:=pg_temp.approved('commit',p);perform pg_temp.assert_approved(out->>'ok'='true','review sender funding is confirmed');
 select count(*) into before_journals from lumo_private.journals;
 p:=p||jsonb_build_object('attemptId','review-rejected-send-'||suffix,'fingerprint',repeat('f',64),'expectedRevision',1,'expectedWallet',100,'state','{"wallet":90,"groups":[],"settings":{}}'::jsonb,'intents',jsonb_build_array(jsonb_build_object('kind','transfer','amount',10,'source','{"kind":"wallet"}'::jsonb,'destination',jsonb_build_object('kind','user','id',a))));
 out:=pg_temp.approved('commit',p);
 perform pg_temp.assert_approved(out->>'code'='ACCOUNT_UNAVAILABLE','incoming transfer to closed recipient rejects definitively');
 perform pg_temp.assert_approved((select balance=100 from lumo_private.accounts where owner_user_id=b and kind='consumer') and (select balance=0 from lumo_private.accounts where owner_user_id=a and kind='consumer') and (select count(*)=before_journals from lumo_private.journals),'rejected closed-recipient send changes neither balance nor journal');
end $review$;
select jsonb_build_object('checks',current_setting('lumo.approved.checks')::integer,'fixturesRolledBack',true,'reviewClosureAndPrivacy',true) as review_gateway_verification;
-- A real merchant refund to a closed group remains group money until the creator
-- authorises exact original-source returns. Closed destinations reject before debit.
do $group_refund$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();sb uuid:=gen_random_uuid();suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);
 ga uuid;ma uuid;mid uuid:=gen_random_uuid();sh uuid:=gen_random_uuid();funding uuid;wa uuid;payment uuid;refund uuid;gid text;gstate jsonb;out jsonb;p jsonb;stamp bigint;rejected boolean:=false;before_journals bigint;
begin
 gid:='refund-group-'||suffix;
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 (a,'authenticated','authenticated','rg-a-'||suffix||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now()),
 (b,'authenticated','authenticated','rg-b-'||suffix||'@pilot.lumo.invalid',now(),'{"lumo_pilot":true}','{}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sa,a,now(),now()),(sb,b,now(),now());
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform pg_temp.approved('provision',jsonb_build_object('actor',a,'session',sa,'handle','rg-a-'||suffix,'displayName','Refund creator','pin','3159'));
 perform pg_temp.approved('provision',jsonb_build_object('actor',b,'session',sb,'handle','rg-b-'||suffix,'displayName','Refund merchant','pin','2718'));
 select id into wa from lumo_private.accounts where owner_user_id=a and kind='consumer';
 select id into funding from lumo_private.accounts where kind='test_funding';
 insert into lumo_private.accounts(owner_user_id,kind) values(a,'group') returning id into ga;
 insert into lumo_private.accounts(owner_user_id,kind) values(b,'merchant') returning id into ma;
 insert into lumo_private.merchants(id,owner_user_id,account_id,name) values(mid,b,ma,'Refund fixture merchant');
 insert into lumo_private.shops(id,merchant_id,name) values(sh,mid,'Refund fixture counter');
 gstate:=jsonb_build_object('id',gid,'name','Refund fixture group','creatorId',a,'status','closed','balance',0,'members',jsonb_build_array(jsonb_build_object('id',a,'status','active','role','approver')),'contributions',jsonb_build_array(jsonb_build_object('id','original-contribution','memberId',a,'status','success','amount',100,'refundedAmount',0)),'payouts','[]'::jsonb,'refunds','[]'::jsonb,'chat',jsonb_build_object('messages','[]'::jsonb,'reports','[]'::jsonb));
 insert into lumo_private.approved_groups(id,account_id,state) values(gid,ga,gstate);
 perform lumo_private.approved_actor_context(a,sa);
 perform lumo_private.post_money(a,'test_funding',100,funding,wa);
 perform lumo_private.post_money(a,'group_contribution',100,wa,ga);
 perform set_config('lumo.approved.merchant_shop',sh::text,true);
 payment:=lumo_private.post_money(a,'merchant_payment',100,ga,ma,sh);
 perform lumo_private.approved_actor_context(b,sb);
 refund:=lumo_private.post_money(b,'refund',50,ma,ga,sh,null,payment);
 perform pg_temp.assert_approved((select balance=50 from lumo_private.accounts where id=ga) and (select balance=0 from lumo_private.accounts where id=wa),'late merchant refund credits group, never personal money');
 out:=pg_temp.approved('load',jsonb_build_object('actor',a,'session',sa));
 perform pg_temp.assert_approved(exists(select 1 from jsonb_array_elements(out->'groups') gr where gr->>'id'=gid and jsonb_array_length(gr->'merchantRefunds')=1 and gr#>>'{merchantRefunds,0,id}'=refund::text),'late refund has an authoritative shared group timeline record');
 gstate:=jsonb_set(gstate,'{contributions,0,refundedAmount}','50');
 p:=jsonb_build_object('actor',a,'session',sa,'attemptId','late-return-one-'||suffix,'fingerprint',repeat('1',64),'expectedRevision',0,'expectedWallet',0,'state','{"wallet":50,"groups":[],"account":{"status":"active"},"settings":{}}'::jsonb,'groups',jsonb_build_array(jsonb_build_object('id',gid,'expectedRevision',1,'state',gstate)),'boxes','[]'::jsonb,'requests','[]'::jsonb,'privateReports','[]'::jsonb,'partners','[]'::jsonb,'intents',jsonb_build_array(jsonb_build_object('kind','group_refund','amount',50,'source',jsonb_build_object('kind','group','id',gid),'destination','{"kind":"wallet"}'::jsonb,'groupId',gid)),'requiresAuth',true,'pin','3159','result','{"ok":true}'::jsonb);
 out:=pg_temp.approved('commit',p);
 perform pg_temp.assert_approved(out->>'ok'='true' and (select balance=0 from lumo_private.accounts where id=ga) and (select balance=50 from lumo_private.accounts where id=wa),'creator returns closed-group refund through confirmed ledger source');
 perform lumo_private.approved_actor_context(b,sb);
 refund:=lumo_private.post_money(b,'refund',25,ma,ga,sh,null,payment);
 out:=pg_temp.approved('commit',p);
 perform pg_temp.assert_approved(out->>'replayed'='true' and (select balance=25 from lumo_private.accounts where id=ga) and (select balance=50 from lumo_private.accounts where id=wa),'old return attempt cannot consume a newly arrived refund');
 gstate:=jsonb_set(gstate,'{contributions,0,refundedAmount}','75');
 p:=p||jsonb_build_object('attemptId','late-return-two-'||suffix,'fingerprint',repeat('2',64),'expectedRevision',1,'expectedWallet',50,'state','{"wallet":75,"groups":[],"account":{"status":"active"},"settings":{}}'::jsonb,'groups',jsonb_build_array(jsonb_build_object('id',gid,'expectedRevision',2,'state',gstate)),'intents',jsonb_build_array(jsonb_build_object('kind','group_refund','amount',25,'source',jsonb_build_object('kind','group','id',gid),'destination','{"kind":"wallet"}'::jsonb,'groupId',gid)));
 out:=pg_temp.approved('commit',p);
 perform pg_temp.assert_approved(out->>'ok'='true' and (select balance=0 from lumo_private.accounts where id=ga) and (select balance=75 from lumo_private.accounts where id=wa),'a fresh authorised attempt returns only the new refund');
 update lumo_private.accounts set status='closed' where id=wa;
 select count(*) into before_journals from lumo_private.journals;
 perform lumo_private.approved_actor_context(b,sb);
 begin
  perform lumo_private.post_money(b,'refund',10,ma,ga,sh,null,payment);
 exception when sqlstate 'P0001' then rejected:=sqlerrm='REFUND_DESTINATION_UNAVAILABLE';end;
 perform pg_temp.assert_approved(rejected and (select balance=25 from lumo_private.accounts where id=ma) and (select balance=0 from lumo_private.accounts where id=ga) and (select count(*)=before_journals from lumo_private.journals),'closed creator/source rejects refund before merchant debit or group credit');
end $group_refund$;
select jsonb_build_object('checks',current_setting('lumo.approved.checks')::integer,'fixturesRolledBack',true,'reviewClosurePrivacyAndLateGroupRefund',true) as review_complete_gateway_verification;
