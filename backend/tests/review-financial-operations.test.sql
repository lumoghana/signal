-- All fixtures, ledger entries and administrative actions roll back.
begin;
create function pg_temp.financial_assert(p_value boolean,p_label text) returns void language plpgsql as $$begin
 if p_value is distinct from true then raise exception 'Financial operations check failed: %',p_label;end if;
 perform set_config('lumo.financial.checks',(coalesce(nullif(current_setting('lumo.financial.checks',true),''),'0')::integer+1)::text,true);
end $$;
do $test$
declare maker uuid:=gen_random_uuid();reviewer uuid:=gen_random_uuid();auditor uuid:=gen_random_uuid();support uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();merchant_user uuid:=gen_random_uuid();
 sm uuid:=gen_random_uuid();sr uuid:=gen_random_uuid();sa uuid:=gen_random_uuid();ss uuid:=gen_random_uuid();sc uuid:=gen_random_uuid();smer uuid:=gen_random_uuid();funding uuid;wallet uuid;merchant_account uuid;merchant uuid;shop uuid;link uuid;payment uuid;transfer_id uuid;refund_id uuid;
 case_id uuid;guest_case uuid;request_key uuid:=gen_random_uuid();guest_key text:='review-fixture-'||gen_random_uuid()::text;approval_id uuid;exception_id uuid;other_exception uuid;
 base jsonb;other jsonb;aud jsonb;sup jsonb;payload jsonb;out jsonb;before_balance bigint;journal_count bigint;due timestamptz:=clock_timestamp()+interval '1 hour';suffix text:=substr(replace(gen_random_uuid()::text,'-',''),1,8);
begin
 perform set_config('lumo.financial.checks','0',true);
 insert into auth.users(id,aud,role,email,raw_app_meta_data,email_confirmed_at,created_at,updated_at) values
 (maker,'authenticated','authenticated','fin-maker-'||suffix||'@example.test','{}',now(),now(),now()),(reviewer,'authenticated','authenticated','fin-reviewer-'||suffix||'@example.test','{}',now(),now(),now()),
 (auditor,'authenticated','authenticated','fin-auditor-'||suffix||'@example.test','{}',now(),now(),now()),(support,'authenticated','authenticated','fin-support-'||suffix||'@example.test','{}',now(),now(),now()),
 (customer,'authenticated','authenticated','fin-customer-'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now()),(merchant_user,'authenticated','authenticated','fin-merchant-'||suffix||'@pilot.lumo.invalid','{"lumo_pilot":true}',now(),now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at) values(sm,maker,now(),now()),(sr,reviewer,now(),now()),(sa,auditor,now(),now()),(ss,support,now(),now()),(sc,customer,now(),now()),(smer,merchant_user,now(),now());
 insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) values
 (gen_random_uuid(),maker,'Fixture','totp','verified','fixture-not-live',now(),now()),(gen_random_uuid(),reviewer,'Fixture','totp','verified','fixture-not-live',now(),now()),(gen_random_uuid(),auditor,'Fixture','totp','verified','fixture-not-live',now(),now()),(gen_random_uuid(),support,'Fixture','totp','verified','fixture-not-live',now(),now());
 insert into lumo_private.admin_staff(user_id,display_name,email,role) values(maker,'Finance maker','fin-maker-'||suffix||'@example.test','finance'),(reviewer,'Finance reviewer','fin-reviewer-'||suffix||'@example.test','finance'),(auditor,'Audit reader','fin-auditor-'||suffix||'@example.test','auditor'),(support,'Support maker','fin-support-'||suffix||'@example.test','support');
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(customer,'fin_c_'||suffix,'Customer fixture','fixture'),(merchant_user,'fin_m_'||suffix,'Merchant fixture','fixture');
 insert into lumo_private.accounts(owner_user_id,kind) values(customer,'consumer') returning id into wallet;
 insert into lumo_private.accounts(owner_user_id,kind) values(merchant_user,'merchant') returning id into merchant_account;
 insert into lumo_private.accounts(kind) values('test_funding') on conflict do nothing;
 select id into funding from lumo_private.accounts where kind='test_funding';
 insert into lumo_private.merchants(owner_user_id,account_id,name) values(merchant_user,merchant_account,'Financial fixture') returning id into merchant;
 insert into lumo_private.shops(merchant_id,name) values(merchant,'Financial fixture shop') returning id into shop;
 insert into lumo_private.shop_settings(shop_id,published,location) values(shop,true,'Legon');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 -- Canonical ledger writer is used for fixtures and for the eventual merchant refund.
 perform lumo_private.approved_actor_context(customer,sc);
 perform lumo_private.post_money(customer,'test_funding',5000,funding,wallet);
 payment:=lumo_private.post_money(customer,'merchant_payment',1000,wallet,merchant_account,shop);
 transfer_id:=lumo_private.post_money(customer,'transfer',100,wallet,merchant_account);
 insert into lumo_private.admin_cases(subject,transaction_id,customer_id,created_by) values('Financial refund fixture',payment,customer,maker) returning id into case_id;
 base:=jsonb_build_object('actor',maker,'session',sm,'aal','aal2');other:=jsonb_build_object('actor',reviewer,'session',sr,'aal','aal2');aud:=jsonb_build_object('actor',auditor,'session',sa,'aal','aal2');sup:=jsonb_build_object('actor',support,'session',ss,'aal','aal2');
 perform pg_temp.financial_assert(not has_function_privilege('anon','public.lumo_admin_financial(text,jsonb)','execute'),'anonymous cannot execute operations');
 perform pg_temp.financial_assert(not has_function_privilege('authenticated','public.lumo_admin_financial(text,jsonb)','execute'),'consumer cannot execute operations');
 perform pg_temp.financial_assert(not has_table_privilege('service_role','lumo_private.admin_refund_controls','insert,update,delete'),'table not exposed to service Data API');
 out:=public.lumo_admin_financial('financial.exceptions.list',base||jsonb_build_object('session',gen_random_uuid()));perform pg_temp.financial_assert(out->>'code'='SESSION_REVOKED','revoked session cannot read finance queue');
 out:=public.lumo_admin_financial('financial.exceptions.create',aud||jsonb_build_object('reason','Attempt auditor write'));perform pg_temp.financial_assert(out->>'code'='FORBIDDEN','auditor remains read-only');
 payload:=jsonb_build_object('entityId',payment,'caseId',case_id,'amount',400,'requestId',request_key,'reason','Partial merchant refund with original case');
 out:=public.lumo_admin_financial('financial.refund.create',base||payload);approval_id:=(out#>>'{data,record,id}')::uuid;
 perform pg_temp.financial_assert(out->>'ok'='true' and out#>>'{data,record,amount}'='400' and out#>>'{data,moneyMoved}'='false','exact bounded amount recorded without moving money');
 out:=public.lumo_admin_financial('financial.refund.create',base||payload);perform pg_temp.financial_assert(out#>>'{data,record,id}'=approval_id::text and out#>>'{data,replayed}'='true','same creation reference replays');
 out:=public.lumo_admin_financial('financial.refund.create',base||payload||'{"amount":401}');perform pg_temp.financial_assert(out->>'code'='IDEMPOTENCY_CONFLICT','changed amount cannot reuse request');
 out:=public.lumo_admin_financial('financial.refund.create',base||payload||jsonb_build_object('requestId',gen_random_uuid(),'amount',700));perform pg_temp.financial_assert(out->>'code'='REFUND_EXCEEDS_PAYMENT','concurrent pending approvals reserve original capacity');
 out:=public.lumo_admin_financial('financial.refund.create',base||payload||jsonb_build_object('requestId',gen_random_uuid(),'entityId',transfer_id));perform pg_temp.financial_assert(out->>'code'='INVALID_REFUND','plain transfer is not merchant refund');
 out:=public.lumo_admin_financial('financial.refund.decide',base||jsonb_build_object('id',approval_id,'decision','approve','reason','Cannot self approve'));perform pg_temp.financial_assert(out->>'code'='SELF_APPROVAL_FORBIDDEN','maker cannot approve');
 out:=public.lumo_admin_financial('financial.refund.decide',sup||jsonb_build_object('id',approval_id,'decision','approve','reason','Support not authorised'));perform pg_temp.financial_assert(out->>'code'='FORBIDDEN','support cannot approve');
 out:=public.lumo_admin_financial('financial.refund.decide',other||jsonb_build_object('id',approval_id,'reason','Missing explicit decision'));perform pg_temp.financial_assert(out->>'code'='INVALID_INPUT','missing decision never approves');
 out:=public.lumo_admin_financial('financial.refund.decide',other||jsonb_build_object('id',approval_id,'decision','approve','reason','Checked original receipt and amount'));perform pg_temp.financial_assert(out#>>'{data,record,status}'='approved_pending_execution','independent approval awaits merchant execution');
 out:=public.lumo_admin_financial('financial.refund.complete',other||jsonb_build_object('id',approval_id,'journalId',payment,'evidence','This is not a refund','reason','Validate wrong original'));perform pg_temp.financial_assert(out->>'code'='REFUND_EVIDENCE_MISMATCH','original payment cannot fake refund completion');
 perform lumo_private.approved_actor_context(merchant_user,smer);
 refund_id:=lumo_private.post_money(merchant_user,'refund',400,merchant_account,wallet,shop,null,payment);
 select balance into before_balance from lumo_private.accounts where id=wallet;select count(*) into journal_count from lumo_private.journals;
 out:=public.lumo_admin_financial('financial.refund.complete',other||jsonb_build_object('id',approval_id,'journalId',refund_id,'evidence','Posted merchant refund journal verified','reason','Exact original and destination checked'));
 perform pg_temp.financial_assert(out#>>'{data,record,status}'='executed' and out#>>'{data,record,confirmedJournalId}'=refund_id::text,'only actual matching refund completes');
 perform pg_temp.financial_assert((select balance=before_balance from lumo_private.accounts where id=wallet) and (select count(*)=journal_count from lumo_private.journals),'completion cannot move money or write another journal');
 out:=public.lumo_admin_financial('financial.refund.complete',other||jsonb_build_object('id',approval_id,'journalId',refund_id,'evidence','Retry verified merchant journal','reason','Recover original completion'));perform pg_temp.financial_assert(out#>>'{data,replayed}'='true','completion retries do not duplicate');
 -- Owned exceptions cannot be closed by an arbitrary timer or without evidence.
 payload:=jsonb_build_object('kind','ledger','reference','FIXTURE-ORIGINAL','summary','Investigate fixture mismatch','caseId',case_id,'ownerId',maker,'dueAt',due,'evidence','Canonical fixture journal evidence','reason','Assign named review responsibility','requestId',gen_random_uuid());
 out:=public.lumo_admin_financial('financial.exceptions.create',base||payload);other_exception:=(out#>>'{data,record,id}')::uuid;perform pg_temp.financial_assert(out->>'ok'='true','owned reconciliation exception created');
 out:=public.lumo_admin_financial('financial.exceptions.create',base||payload);perform pg_temp.financial_assert(out#>>'{data,replayed}'='true','exception request idempotency');
 out:=public.lumo_admin_financial('financial.exceptions.update',other||jsonb_build_object('id',other_exception,'expectedRevision',2,'status','investigating','ownerId',reviewer,'dueAt',due,'evidence','Review evidence','reason','Stale update'));perform pg_temp.financial_assert(out->>'code'='REVISION_CONFLICT','stale reviewer cannot overwrite exception');
 out:=public.lumo_admin_financial('financial.exceptions.update',other||jsonb_build_object('id',other_exception,'expectedRevision',1,'status','resolved','ownerId',reviewer,'dueAt',due,'evidence','Reviewed posted fixture','reason','Attempt closure with no resolution'));perform pg_temp.financial_assert(out->>'code'='RESOLUTION_REQUIRED','closing requires explicit resolution');
 out:=public.lumo_admin_financial('financial.exceptions.update',other||jsonb_build_object('id',other_exception,'expectedRevision',1,'status','resolved','ownerId',reviewer,'dueAt',due,'evidence','Reviewed original entries','resolution','Matched exact canonical entries; no adjustment needed','reason','Reviewer completed evidence comparison'));perform pg_temp.financial_assert(out#>>'{data,record,status}'='resolved','resolution evidence retained');
 -- A lost browser is resolved only through an explicit independently reviewed sandbox result.
 insert into lumo_private.merchant_payment_links(public_token,merchant_id,shop_id,kind,attribution,operator_id,attempt_id,fingerprint,created_by) values(repeat('a',64),merchant,shop,'shop','shop',merchant_user::text,'fixture-link-'||suffix,'fixture',merchant_user) returning id into link;
 insert into lumo_private.guest_momo_attempts(id,recovery_hash,link_id,merchant_id,shop_id,amount,phone,network,expires_at) values(guest_key,repeat('b',64),link,merchant,shop,200,'0200000000','mtn',clock_timestamp()-interval '1 minute');
 insert into lumo_private.admin_cases(subject,guest_id,created_by) values('Guest unknown fixture',guest_key,maker) returning id into guest_case;
 payload:=jsonb_build_object('guestId',guest_key,'caseId',guest_case,'ownerId',maker,'dueAt',due,'requestId',gen_random_uuid(),'outcome','approve','sandboxConfirmed',true,'evidence','Explicit simulated provider approval','reason','Resolve original guest attempt');
 out:=public.lumo_admin_financial('financial.guest.propose',base||payload);exception_id:=(out#>>'{data,record,id}')::uuid;perform pg_temp.financial_assert(out#>>'{data,record,status}'='awaiting_review','unknown guest preserved for independent review');
 perform pg_temp.financial_assert((select status='pending' from lumo_private.guest_momo_attempts where id=guest_key),'expired guest never auto-fails or auto-posts');
 out:=public.lumo_admin_financial('financial.exceptions.update',other||jsonb_build_object('id',exception_id,'expectedRevision',1,'status','resolved','ownerId',reviewer,'dueAt',due,'evidence','Generic close attempt','resolution','Cannot bypass independent result','reason','Try generic closure'));perform pg_temp.financial_assert(out->>'code'='OUTCOME_REVIEW_REQUIRED','generic queue closure cannot clear unknown payment');
 out:=public.lumo_admin_financial('financial.guest.resolve',base||jsonb_build_object('id',exception_id,'expectedRevision',1,'decision','approve','evidence','Maker approval disallowed','reason','Try self review'));perform pg_temp.financial_assert(out->>'code'='SELF_APPROVAL_FORBIDDEN','guest proposer cannot approve own outcome');
 out:=public.lumo_admin_financial('financial.guest.resolve',other||jsonb_build_object('id',exception_id,'expectedRevision',1,'decision','reject','evidence','Need further provider evidence','reason','Evidence is insufficient'));perform pg_temp.financial_assert(out#>>'{data,record,status}'='investigating' and (select status='pending' from lumo_private.guest_momo_attempts where id=guest_key),'rejected proposal leaves unknown attempt open');
 payload:=payload||jsonb_build_object('id',exception_id,'expectedRevision',2,'requestId',gen_random_uuid(),'evidence','Explicit sandbox result rechecked against original');
 out:=public.lumo_admin_financial('financial.guest.propose',base||payload);perform pg_temp.financial_assert(out#>>'{data,record,revision}'='3','rejected proposal can be resubmitted without losing case');
 select count(*) into journal_count from lumo_private.journals;
 out:=public.lumo_admin_financial('financial.guest.resolve',other||jsonb_build_object('id',exception_id,'expectedRevision',3,'decision','approve','evidence','Exact original sandbox result confirmed','reason','Independent review of original amount and reference'));
 perform pg_temp.financial_assert(out#>>'{data,record,status}'='resolved' and out#>>'{data,moneyMoved}'='true' and (select status='confirmed' from lumo_private.guest_momo_attempts where id=guest_key),'reviewed sandbox result uses canonical posting path');
 perform pg_temp.financial_assert((select count(*)=journal_count+1 from lumo_private.journals),'one guest confirmation produces one original journal');
 out:=public.lumo_admin_financial('financial.guest.resolve',other||jsonb_build_object('id',exception_id,'expectedRevision',3,'decision','approve','evidence','Exact original sandbox result confirmed','reason','Independent review of original amount and reference'));perform pg_temp.financial_assert(out#>>'{data,replayed}'='true' and (select count(*)=journal_count+1 from lumo_private.journals),'exact reviewed-result replay never posts twice');
 out:=public.lumo_admin_financial('financial.exceptions.list',aud||'{"pageSize":1}');perform pg_temp.financial_assert(out->>'ok'='true' and jsonb_array_length(out#>'{data,rows}')=1,'read-only auditor can inspect paginated owned evidence');
 set constraints all immediate;
 perform pg_temp.financial_assert((select count(*) from lumo_private.entries e where e.journal_id=(select journal_id from lumo_private.guest_momo_attempts where id=guest_key))=2,'guest confirmation preserves paired postings');
end $test$;
select current_setting('lumo.financial.checks')::integer as checks;
rollback;
