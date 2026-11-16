-- Run only after the external_simulation journal-kind migration is applied.
-- All Auth fixtures, balances, journal entries, PIN attempts and saved states
-- are created inside this transaction and are removed by the final ROLLBACK.
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $external_transfer_tests$
#variable_conflict use_variable
declare
 actor uuid:=gen_random_uuid(); actor_session uuid:=gen_random_uuid();
 staff uuid:=gen_random_uuid(); staff_session uuid:=gen_random_uuid();
 handle text:='qaext'||left(replace(gen_random_uuid()::text,'-',''),20);
 staff_handle text:='qaextstaff'||left(replace(gen_random_uuid()::text,'-',''),18);
 pin text:='638274'; test_id text:='qa-ext-'||replace(gen_random_uuid()::text,'-','');
 own uuid; staff_own uuid; funding uuid; funding_open bigint; account_count bigint;
 state jsonb; staff_state jsonb; payload jsonb; replay_payload jsonb; response jsonb; receipt jsonb;
 recipient jsonb:='{"rail":"momo","name":"QA unverified recipient","number":"0241234567","network":"MTN MoMo","lookupSource":"sandbox"}'::jsonb;
 journal uuid; momo_journal uuid; bank_journal uuid; before_journals bigint; failure_code text;
begin
 select count(*) into account_count from lumo_private.accounts;
 select id,balance into funding,funding_open from lumo_private.accounts where kind='test_funding' and status='active';
 if funding is null then raise exception 'Active pilot test-funding account required';end if;
 -- Isolated Auth identities use the same live-session/provisioning boundary as
 -- normal consumer and merchant sessions. No existing user's PIN is changed.
 insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values(actor,'authenticated','authenticated',handle||'@pilot.lumo.invalid','{"lumo_pilot":true}'::jsonb,'{}',now(),now()),
       (staff,'authenticated','authenticated',staff_handle||'@pilot.lumo.invalid','{"lumo_pilot":true}'::jsonb,'{}',now(),now());
 insert into auth.sessions(id,user_id,created_at,updated_at,aal,not_after)
 values(actor_session,actor,now(),now(),'aal1',now()+interval '1 hour'),
       (staff_session,staff,now(),now(),'aal1',now()+interval '1 hour');
 response:=lumo_private.approved_service('provision',jsonb_build_object('actor',actor,'session',actor_session,'mode','consumer','handle',handle,'displayName','QA External Transfer','pin',pin));
 if response->>'ok' is distinct from 'true' then raise exception 'Consumer fixture provisioning failed: %',response;end if;
 response:=lumo_private.approved_service('provision',jsonb_build_object('actor',staff,'session',staff_session,'mode','merchant','handle',staff_handle,'displayName','QA External Staff Recovery','pin',pin));
 if response->>'ok' is distinct from 'true' then raise exception 'Staff fixture provisioning failed: %',response;end if;
 own:=lumo_private.approved_resolve_account(actor,'{"kind":"wallet"}');
 staff_own:=lumo_private.approved_resolve_account(staff,'{"kind":"wallet"}');
 if not lumo_private.personal_recipient(actor) or lumo_private.personal_recipient(staff) then raise exception 'Fixture personal enrollment incorrect';end if;
 state:='{"version":1,"onboardingDone":true,"profile":{"name":"QA External Transfer","phone":""},"wallet":10000,"buffer":0,"income":{"amount":0,"nextDate":""},"budget":{"created":true,"periodId":"qa-external-period","items":[{"id":"qa-food","name":"Food","amount":5000,"spent":0}]},"boxes":[],"transactions":[],"ious":[],"groups":[],"externalBalances":[],"settings":{"hideBalance":false},"account":{"status":"active"}}'::jsonb;
 -- Initial virtual issuance also passes through the normal authenticated commit.
 payload:=jsonb_build_object('actor',actor,'session',actor_session,'attemptId',test_id||'-fund','fingerprint',repeat('a',64),'expectedRevision',0,'expectedWallet',0,'state',state,'groups','[]'::jsonb,'boxes','[]'::jsonb,'intents',jsonb_build_array(jsonb_build_object('kind','test_funding','amount',10000,'source',jsonb_build_object('kind','funding'),'destination',jsonb_build_object('kind','wallet'),'transactionId',test_id||'-income')),'requiresAuth',true,'pin',pin,'result',jsonb_build_object('ok',true));
 response:=lumo_private.approved_service('commit',payload);
 if response->>'ok' is distinct from 'true' or (response#>>'{snapshot,account,balance}')::bigint<>10000 then raise exception 'Virtual funding fixture failed: %',response;end if;

 state:=jsonb_set(jsonb_set(state,'{wallet}','8950'::jsonb),'{budget,items,0,spent}','1000'::jsonb);
 state:=jsonb_set(state,'{transactions}',jsonb_build_array(jsonb_build_object('id',test_id||'-momo','type','payment','direction','out','amount',1000,'fee',50,'total',1050,'rail','momo','status','success','walletDebited',true,'budgetItemId','qa-food','budgetSpentAmount',1000,'externalSimulation',true,'simulation',true,'providerMode','sandbox','recipient',recipient)));
 payload:=jsonb_build_object('actor',actor,'session',actor_session,'attemptId',test_id||'-momo','fingerprint',repeat('b',64),'expectedRevision',1,'expectedWallet',10000,'state',state,'groups','[]'::jsonb,'boxes','[]'::jsonb,'intents',jsonb_build_array(jsonb_build_object('kind','external_simulation','amount',1050,'source',jsonb_build_object('kind','wallet'),'destination',jsonb_build_object('kind','funding'),'transactionId',test_id||'-momo','metadata',jsonb_build_object('principalAmount',1000,'simulationFee',50,'totalDebited',1050,'rail','momo','recipient',recipient,'providerMode','sandbox','externalSimulation',true,'simulation',true,'labelUnverified',true))),'requiresAuth',true,'pin',pin,'result',jsonb_build_object('ok',true));
 -- Wrong authorization must not create a terminal attempt or debit any funds.
 response:=lumo_private.approved_service('commit',payload||jsonb_build_object('pin','000000'));
 if response->>'code' is distinct from 'PIN_REQUIRED' or (select balance from lumo_private.accounts where id=own)<>10000 or exists(select 1 from lumo_private.approved_attempts where user_id=actor and attempt_id=test_id||'-momo') then raise exception 'Wrong PIN moved virtual funds or finalized the attempt: %',response;end if;
 response:=lumo_private.approved_service('commit',payload||jsonb_build_object('expectedWallet',9999));
 if response->>'code' is distinct from 'REVISION_CONFLICT' or (select balance from lumo_private.accounts where id=own)<>10000 then raise exception 'Stale wallet snapshot was accepted: %',response;end if;
 response:=lumo_private.approved_service('commit',payload);
 if response->>'ok' is distinct from 'true' then raise exception 'MoMo simulation commit failed: %',response;end if;
 momo_journal:=(response#>>'{receipts,0,id}')::uuid;
 if (select balance from lumo_private.accounts where id=own)<>8950 then raise exception 'MoMo principal+fee debit incorrect';end if;
 if not exists(select 1 from lumo_private.journals where id=momo_journal and type='external_simulation' and amount=1050 and payer_account_id=own and payee_account_id=funding and original_payment_id is null and shop_id is null and request_id is null) then raise exception 'MoMo canonical journal incorrect';end if;
 select value into receipt from jsonb_array_elements(lumo_private.approved_receipts(actor)) where value->>'id'=momo_journal::text;
 if receipt is null or (receipt->>'amount')::bigint<>1050 or receipt->>'principalAmount'<>'1000' or receipt->>'simulationFee'<>'50' or receipt->>'totalDebited'<>'1050' or receipt->>'providerMode'<>'sandbox' or receipt->>'rail'<>'momo' or receipt#>>'{recipient,number}'<>'0241234567' or receipt->>'labelUnverified'<>'true' then raise exception 'MoMo receipt lost canonical amount or simulation metadata: %',receipt;end if;
 -- A repeated request recovers the same journal even with the old revision,
 -- without consuming another PIN or charging principal/fee a second time.
 replay_payload:=payload-'pin';
 response:=lumo_private.approved_service('commit',replay_payload);
 if response->>'ok' is distinct from 'true' or response->>'replayed'<>'true' or response#>>'{receipts,0,id}'<>momo_journal::text or (select balance from lumo_private.accounts where id=own)<>8950 then raise exception 'MoMo retry debited twice or lost its reference: %',response;end if;
 response:=lumo_private.approved_service('commit',payload||jsonb_build_object('fingerprint',repeat('c',64)));
 if response->>'code' is distinct from 'IDEMPOTENCY_CONFLICT' then raise exception 'Changed action reused an external attempt: %',response;end if;

 recipient:='{"rail":"bank","name":"QA unverified bank recipient","number":"001234567890","bank":"QA Bank","lookupSource":"sandbox"}'::jsonb;
 state:=jsonb_set(jsonb_set(state,'{wallet}','6850'::jsonb),'{budget,items,0,spent}','3000'::jsonb);
 state:=jsonb_set(state,'{transactions}',(state->'transactions')||jsonb_build_array(jsonb_build_object('id',test_id||'-bank','type','payment','direction','out','amount',2000,'fee',100,'total',2100,'rail','bank','status','success','walletDebited',true,'budgetItemId','qa-food','budgetSpentAmount',2000,'externalSimulation',true,'simulation',true,'providerMode','sandbox','recipient',recipient)));
 payload:=payload||jsonb_build_object('attemptId',test_id||'-bank','fingerprint',repeat('d',64),'expectedRevision',2,'expectedWallet',8950,'state',state,'intents',jsonb_build_array(jsonb_build_object('kind','external_simulation','amount',2100,'source',jsonb_build_object('kind','wallet'),'destination',jsonb_build_object('kind','funding'),'transactionId',test_id||'-bank','metadata',jsonb_build_object('principalAmount',2000,'simulationFee',100,'totalDebited',2100,'rail','bank','recipient',recipient,'providerMode','sandbox','externalSimulation',true,'simulation',true,'labelUnverified',true))));
 response:=lumo_private.approved_service('commit',payload);
 if response->>'ok' is distinct from 'true' then raise exception 'Bank simulation commit failed: %',response;end if;
 bank_journal:=(response#>>'{receipts,0,id}')::uuid;
 if (select balance from lumo_private.accounts where id=own)<>6850 then raise exception 'Bank principal+fee debit incorrect';end if;
 select value into receipt from jsonb_array_elements(lumo_private.approved_receipts(actor)) where value->>'id'=bank_journal::text;
 if receipt is null or receipt->>'amount'<>'2100' or receipt->>'principalAmount'<>'2000' or receipt->>'simulationFee'<>'100' or receipt->>'rail'<>'bank' or receipt#>>'{recipient,number}'<>'001234567890' then raise exception 'Bank receipt principal, fee or leading zeros lost: %',receipt;end if;
 if (select state#>>'{budget,items,0,spent}' from lumo_private.approved_states where user_id=actor)<>'3000' then raise exception 'Committed budget allocation did not persist';end if;
 select count(*) into before_journals from lumo_private.journals where actor_user_id=actor;
 -- The canonical source wallet cannot spend more than its live ledger balance.
 payload:=payload||jsonb_build_object('attemptId',test_id||'-insufficient','fingerprint',repeat('e',64),'expectedRevision',3,'expectedWallet',6850,'state',jsonb_set(state,'{wallet}','0'::jsonb),'intents',jsonb_build_array(jsonb_build_object('kind','external_simulation','amount',6851,'source',jsonb_build_object('kind','wallet'),'destination',jsonb_build_object('kind','funding'),'transactionId',test_id||'-insufficient')));
 response:=lumo_private.approved_service('commit',payload);
 if response->>'code' is distinct from 'INSUFFICIENT_FUNDS' or (select balance from lumo_private.accounts where id=own)<>6850 or (select count(*) from lumo_private.journals where actor_user_id=actor)<>before_journals or exists(select 1 from lumo_private.approved_attempts where user_id=actor and attempt_id=test_id||'-insufficient') then raise exception 'Insufficient-funds attempt mutated ledger/state: %',response;end if;
 -- A forged saved-state delta rolls the entire prospective journal back.
 payload:=payload||jsonb_build_object('attemptId',test_id||'-unbacked','fingerprint',repeat('f',64),'state',jsonb_set(state,'{wallet}','6749'::jsonb),'intents',jsonb_build_array(jsonb_build_object('kind','external_simulation','amount',100,'source',jsonb_build_object('kind','wallet'),'destination',jsonb_build_object('kind','funding'),'transactionId',test_id||'-unbacked')));
 response:=lumo_private.approved_service('commit',payload);
 if response->>'code' is distinct from 'UNBACKED_STATE' or (select balance from lumo_private.accounts where id=own)<>6850 or (select count(*) from lumo_private.journals where actor_user_id=actor)<>before_journals then raise exception 'Unbacked state did not roll back the prospective posting: %',response;end if;

 -- Merchant-only enrollment remains absent from personal recipient resolution,
 -- while its existing source wallet remains readable and can recover funds by
 -- the original PIN-protected internal transfer path.
 response:=lumo_private.approved_service('resolve',jsonb_build_object('actor',staff,'session',staff_session,'query',staff::text));
 if response->>'code' is distinct from 'RECIPIENT_NOT_FOUND' then raise exception 'Merchant-only fixture gained personal enrollment';end if;
 response:=lumo_private.approved_service('load',jsonb_build_object('actor',staff,'session',staff_session));
 if response->>'ok' is distinct from 'true' then raise exception 'Existing staff wallet recovery load was blocked';end if;
 staff_state:=jsonb_set(jsonb_set(state,'{wallet}','500'::jsonb),'{transactions}','[]'::jsonb);
 payload:=jsonb_build_object('actor',staff,'session',staff_session,'attemptId',test_id||'-staff-fund','fingerprint',repeat('1',64),'expectedRevision',0,'expectedWallet',0,'state',staff_state,'groups','[]'::jsonb,'boxes','[]'::jsonb,'intents',jsonb_build_array(jsonb_build_object('kind','test_funding','amount',500,'source',jsonb_build_object('kind','funding'),'destination',jsonb_build_object('kind','wallet'),'transactionId',test_id||'-staff-income')),'requiresAuth',true,'pin',pin,'result',jsonb_build_object('ok',true));
 response:=lumo_private.approved_service('commit',payload);
 if response->>'ok' is distinct from 'true' then raise exception 'Staff recovery balance fixture failed: %',response;end if;
 payload:=payload||jsonb_build_object('attemptId',test_id||'-staff-recovery','fingerprint',repeat('2',64),'expectedRevision',1,'expectedWallet',500,'state',jsonb_set(staff_state,'{wallet}','400'::jsonb),'intents',jsonb_build_array(jsonb_build_object('kind','transfer','amount',100,'source',jsonb_build_object('kind','wallet'),'destination',jsonb_build_object('kind','user','id',actor),'transactionId',test_id||'-staff-recovery')));
 response:=lumo_private.approved_service('commit',payload);
 if response->>'ok' is distinct from 'true' or (select balance from lumo_private.accounts where id=staff_own)<>400 or (select balance from lumo_private.accounts where id=own)<>6950 or lumo_private.personal_recipient(staff) then raise exception 'Existing staff source recovery or enrollment changed: %',response;end if;

 foreach journal in array array[momo_journal,bank_journal] loop
  if (select count(*) from lumo_private.entries where journal_id=journal)<>2 or (select sum(amount) from lumo_private.entries where journal_id=journal)<>0 or not exists(select 1 from lumo_private.entries e join lumo_private.journals j on j.id=e.journal_id where j.id=journal and e.account_id=j.payer_account_id and e.amount=-j.amount) or not exists(select 1 from lumo_private.entries e join lumo_private.journals j on j.id=e.journal_id where j.id=journal and e.account_id=j.payee_account_id and e.amount=j.amount) then raise exception 'External journal entries are not exactly balanced';end if;
 end loop;
 if (select count(*) from lumo_private.journals where actor_user_id=actor and type='external_simulation')<>2 or (select count(*) from lumo_private.approved_attempts where user_id=actor)<>3 then raise exception 'External retries created duplicate postings or attempts';end if;
 if (select balance from lumo_private.accounts where id=funding)<>funding_open-7350 or (select count(*) from lumo_private.accounts)<>account_count+2 then raise exception 'Simulation created hidden accounts or failed funding conservation';end if;
 if exists(select 1 from lumo_private.accounts where owner_user_id in(actor,staff) and balance<0) then raise exception 'Simulation created consumer debt';end if;
 raise notice 'External sandbox ledger, PIN, retry, rollback, receipt and legacy staff-recovery assertions passed';
end $external_transfer_tests$;
-- Force deferred actor and journal-balance checks before rolling fixtures back.
set constraints all immediate;
rollback;
