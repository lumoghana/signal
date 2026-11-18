-- Synthetic Auth/processor fixtures only. No real face data, password or account.
begin;
create function pg_temp.face_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Stored face check failed: %',label;end if;
 perform set_config('test.face.checks',(coalesce(nullif(current_setting('test.face.checks',true),''),'0')::int+1)::text,true);
end $$;
do $test$
declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();proof uuid:=gen_random_uuid();other_sid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();recovery uuid;aid uuid;grant_id uuid;second uuid;next_sid uuid:=gen_random_uuid();next_proof uuid:=gen_random_uuid();
 mod text:='consumer';phone text:='+233240123456';cap text:=repeat('a',64);otp text:=repeat('b',64);reset_hash text:=repeat('c',64);fp text:=repeat('d',64);digests jsonb:=jsonb_build_array(repeat('1',64),repeat('2',64),repeat('3',64));fresh jsonb:=jsonb_build_array(repeat('4',64),repeat('5',64),repeat('6',64));model text:='opencv-sface-2021dec-v1';sha text:='0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79';base jsonb;payload jsonb;out jsonb;context jsonb;i int;before_count int;before_revision bigint;
begin
 perform set_config('test.face.checks','0',true);
 insert into auth.users(id,email,raw_app_meta_data) values(actor,'face_'||substr(replace(actor::text,'-',''),1,16)||'@pilot.lumo.invalid','{"lumo_pilot":true}'),(other,'face_'||substr(replace(other::text,'-',''),1,16)||'@pilot.lumo.invalid','{"lumo_pilot":true}');
 insert into auth.sessions(id,user_id) values(sid,actor),(proof,actor),(other_sid,other);
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash,status) values(actor,'actor_'||substr(replace(actor::text,'-',''),1,15),'Synthetic actor',extensions.crypt('1234',extensions.gen_salt('bf',4)),'active'),(other,'other_'||substr(replace(other::text,'-',''),1,15),'Synthetic other',extensions.crypt('1234',extensions.gen_salt('bf',4)),'active');
 insert into lumo_private.approved_profiles(user_id,personal_account,phone) values(actor,true,'0'||right(phone,9)),(other,true,'0240654321');
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 base:=jsonb_build_object('module',mod,'actor',actor,'session',sid,'proofSession',proof);
 perform pg_temp.face_assert(not has_table_privilege('authenticated','lumo_private.access_face_templates','select'),'customers cannot fetch biometric ciphertext');
 perform pg_temp.face_assert(not has_table_privilege('service_role','lumo_private.access_face_templates','select'),'Data API service role has no direct table grant');
 perform pg_temp.face_assert(not has_function_privilege('authenticated','public.lumo_access_service(text,jsonb)','execute'),'anonymous/customer cannot invoke privileged access RPC');
 perform pg_temp.face_assert(not has_function_privilege('service_role','lumo_private.access_service_before_stored_face(text,jsonb)','execute'),'old hash-only function cannot be invoked directly');
 out:=public.lumo_access_service('status',base);perform pg_temp.face_assert(out#>>'{enrollment,templateEnrolled}'='false','fresh account has no synthetic template');
 payload:=base||jsonb_build_object('requestId',rid,'phone',phone,'faceDigests',digests,'otpHash',otp,'referenceId',tid);
 out:=public.lumo_access_service('enroll.begin',payload);perform pg_temp.face_assert(out->>'code'='FACE_CONSENT_REQUIRED','old hash-only enrollment blocked');
 payload:=(payload-'referenceId')||jsonb_build_object('templateId',tid,'consentVersion','2026-11-16.face.1','consentAccepted',false);
 out:=public.lumo_access_service('biometric.enroll.reserve',payload);perform pg_temp.face_assert(out->>'code'='FACE_CONSENT_REQUIRED','explicit storage consent required');
 out:=public.lumo_access_service('biometric.enroll.reserve',payload||jsonb_build_object('consentAccepted',true));perform pg_temp.face_assert(out->>'ok'='true','valid password-proof enrollment reserves before model inference');
 perform pg_temp.face_assert((select state='processing' and ciphertext is null from lumo_private.access_face_templates where id=tid),'processing template has no fabricated embedding');
 out:=public.lumo_access_service('enroll.verify',base||jsonb_build_object('requestId',rid,'otpHash',otp,'capabilityHash',cap,'keyReference',gen_random_uuid()));perform pg_temp.face_assert(out->>'code'='FACE_SETUP_REQUIRED','cannot activate before processor result');
 payload:=base||jsonb_build_object('requestId',rid,'templateId',tid,'templateVersion',1,'faceDigests',digests,'modelId',model,'modelSha256',sha,'keyVersion','fixture-key-1','templateCiphertext',repeat('A',200));
 out:=public.lumo_access_service('biometric.enroll.store',payload||jsonb_build_object('actor',other,'session',other_sid));perform pg_temp.face_assert(out->>'ok'='false','another signed-in account cannot install template');
 out:=public.lumo_access_service('biometric.enroll.store',payload||jsonb_build_object('modelSha256',repeat('f',64)));perform pg_temp.face_assert(out->>'code'='IDENTITY_UNAVAILABLE','unreviewed model rejected');
 out:=public.lumo_access_service('biometric.enroll.store',payload);perform pg_temp.face_assert(out->>'ok'='true','opaque processor ciphertext staged');
 out:=public.lumo_access_service('enroll.verify',base||jsonb_build_object('requestId',rid,'otpHash',otp,'capabilityHash',cap,'keyReference',gen_random_uuid()));perform pg_temp.face_assert(out->>'ok'='true' and out->>'templateEnrolled'='true','confirmed setup activates encrypted template');
 perform pg_temp.face_assert(out#>>'{enrollment,templateVersion}'='1' and out#>>'{enrollment,faceConsentVersion}'='2026-11-16.face.1','versioned storage receipt exposed without biometric payload');
 perform pg_temp.face_assert(position('ciphertext' in lower(out::text))=0 and position(repeat('A',80) in out::text)=0,'public enrollment DTO contains no ciphertext');
 perform pg_temp.face_assert((select state='active' and ciphertext=repeat('A',200) and consent_at is not null from lumo_private.access_face_templates where id=tid),'encrypted biometric material and server consent timestamp retained');
 recovery:=gen_random_uuid();payload:=jsonb_build_object('module',mod,'requestId',recovery,'identifier','face_'||substr(replace(actor::text,'-',''),1,16),'method','face','otpHash',otp,'rateKey',repeat('7',64));
 out:=public.lumo_access_service('recovery.start',payload);perform pg_temp.face_assert(out->>'ok'='true' and not(out?'ownerId'),'public start does not reveal account identity');
 payload:=jsonb_build_object('module',mod,'requestId',recovery,'capabilityHash',cap);
 out:=public.lumo_access_service('recovery.verify',payload||jsonb_build_object('method','face','faceDigests',fresh,'resetTokenHash',reset_hash));perform pg_temp.face_assert(out->>'ok'='false','old simulator cannot grant reset from three hashes');
 out:=public.lumo_access_service('biometric.face.begin',payload||jsonb_build_object('capabilityHash',repeat('f',64)));perform pg_temp.face_assert(out->>'code'='PROOF_INVALID' and not(out?'templateCiphertext'),'private key is required before retrieving encrypted template');
 context:=public.lumo_access_service('biometric.face.begin',payload);aid:=(context->>'attemptId')::uuid;perform pg_temp.face_assert(context->>'ok'='true' and context->>'templateCiphertext'=repeat('A',200),'matching uses the stored encrypted template');
 perform pg_temp.face_assert((select attempts=2 from lumo_private.access_requests where id=recovery),'attempt budget charged before processor inference');
 out:=public.lumo_access_service('biometric.face.begin',payload);perform pg_temp.face_assert(out->>'code'='FACE_PENDING','parallel matching cannot duplicate one inference slot');
 out:=public.lumo_access_service('biometric.face.finish',payload||jsonb_build_object('attemptId',aid,'matched',false));perform pg_temp.face_assert(out->>'code'='FACE_NO_MATCH','actual mismatch cannot create reset grant');
 perform pg_temp.face_assert((select state='pending' and reset_token_hash is null from lumo_private.access_requests where id=recovery),'mismatch retains no reset authority');
 context:=public.lumo_access_service('biometric.face.begin',payload);aid:=(context->>'attemptId')::uuid;
 out:=public.lumo_access_service('biometric.face.finish',payload||jsonb_build_object('attemptId',aid,'matched',true,'faceDigests',fresh,'modelId',model,'modelSha256',sha,'keyVersion','fixture-key-1'));grant_id:=(out->>'faceProofId')::uuid;perform pg_temp.face_assert(out->>'ok'='true' and grant_id=aid,'processor match creates one-use request-bound proof');
 out:=public.lumo_access_service('recovery.verify',payload||jsonb_build_object('method','face','faceDigests',digests,'faceProofId',grant_id,'resetTokenHash',reset_hash));perform pg_temp.face_assert(out->>'ok'='false','proof does not authorize different submitted photos');
 out:=public.lumo_access_service('recovery.verify',payload||jsonb_build_object('method','face','faceDigests',fresh,'faceProofId',grant_id,'resetTokenHash',reset_hash));perform pg_temp.face_assert(out->>'ok'='true' and out->>'faceMatched'='true','real match and key produce ordinary bounded reset grant');
 out:=public.lumo_access_service('recovery.verify',payload||jsonb_build_object('method','face','faceDigests',fresh,'faceProofId',grant_id,'resetTokenHash',reset_hash));perform pg_temp.face_assert(out->>'ok'='false','match proof is single-use');
 out:=public.lumo_access_service('complete.begin',jsonb_build_object('module',mod,'requestId',recovery,'resetTokenHash',reset_hash,'passwordFingerprint',fp));perform pg_temp.face_assert(out->>'resetState'='applying','password write still uses existing two-phase reset');
 out:=public.lumo_access_service('complete.finish',jsonb_build_object('module',mod,'requestId',recovery,'resetTokenHash',reset_hash,'passwordFingerprint',fp));perform pg_temp.face_assert(out->>'completed'='true','existing reset finalizes');
 perform pg_temp.face_assert(not exists(select 1 from auth.sessions where user_id=actor),'reset revokes all existing sessions');
 perform pg_temp.face_assert((select state='active' and ciphertext=repeat('A',200) from lumo_private.access_face_templates where id=tid),'successful password reset preserves enrolled face for later verification');
 insert into auth.sessions values(next_sid,actor,null),(next_proof,actor,null);base:=jsonb_build_object('module',mod,'actor',actor,'session',next_sid,'proofSession',next_proof);
 out:=public.lumo_access_service('key.rotate',base||jsonb_build_object('capabilityHash',cap,'keyReference',gen_random_uuid()));perform pg_temp.face_assert(out->>'ok'='true' and out#>>'{enrollment,templateEnrolled}'='true','new recovery key retains face template after reset');
 -- Make another permitted request without waiting in this synthetic transaction.
 update lumo_private.access_requests set created_at=created_at-interval '2 minutes' where user_id=actor;
 second:=gen_random_uuid();out:=public.lumo_access_service('recovery.start',jsonb_build_object('module',mod,'requestId',second,'identifier','face_'||substr(replace(actor::text,'-',''),1,16),'method','face','otpHash',otp,'rateKey',repeat('8',64)));
 payload:=jsonb_build_object('module',mod,'requestId',second,'capabilityHash',cap);
 -- The fifth successfully matched capture must remain usable after four misses.
 for i in 1..5 loop
  context:=public.lumo_access_service('biometric.face.begin',payload);perform pg_temp.face_assert(context->>'ok'='true','bounded attempt slot '||i);aid:=(context->>'attemptId')::uuid;
  out:=public.lumo_access_service('biometric.face.finish',payload||jsonb_build_object('attemptId',aid,'matched',i=5,'faceDigests',fresh,'modelId',model,'modelSha256',sha,'keyVersion','fixture-key-1'));
  if i<5 then perform pg_temp.face_assert(out->>'code'='FACE_NO_MATCH','mismatch consumes attempt '||i);else grant_id:=(out->>'faceProofId')::uuid;end if;
 end loop;
 out:=public.lumo_access_service('recovery.verify',payload||jsonb_build_object('method','face','faceDigests',fresh,'faceProofId',grant_id,'resetTokenHash',reset_hash));perform pg_temp.face_assert(out->>'ok'='true','fifth successful comparison is valid and cannot exceed cap');
 -- Removing the saved face is independent of the processor and keeps the key.
 out:=public.lumo_access_service('biometric.remove',base||jsonb_build_object('proofSession',next_sid));perform pg_temp.face_assert(out->>'code'='STEP_UP_REQUIRED','removal requires a fresh password proof session');
 out:=public.lumo_access_service('biometric.remove',base);perform pg_temp.face_assert(out->>'removed'='true' and out#>>'{enrollment,templateEnrolled}'='false' and out#>>'{enrollment,backupKeyReady}'='true','opt-out removes face while preserving recovery key');
 perform pg_temp.face_assert((select state='revoked' and ciphertext is null from lumo_private.access_face_templates where id=tid),'opt-out erases stored biometric ciphertext');
 out:=public.lumo_access_service('complete.begin',jsonb_build_object('module',mod,'requestId',second,'resetTokenHash',reset_hash,'passwordFingerprint',fp));perform pg_temp.face_assert(out->>'ok'='false','removal invalidates a previously issued face reset grant');
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);out:=public.lumo_access_service('status',base);perform pg_temp.face_assert(out->>'code'='FORBIDDEN','untrusted roles cannot invoke service-only face RPC');
end $test$;
-- Additional stale-proof and boundary fixtures deliberately bypass enrollment setup
-- only to isolate the authorization state machine already exercised above.
create function pg_temp.face_request(actor uuid,template uuid) returns uuid language plpgsql as $$
declare request uuid:=gen_random_uuid();begin
 insert into lumo_private.access_requests(id,module,purpose,method,user_id,enrollment_revision,reference_id)
 select request,'consumer','recovery','face',actor,revision,template from lumo_private.access_enrollments where module='consumer' and user_id=actor;
 return request;
end $$;
do $edges$
declare actor uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();proof uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();enroll uuid:=gen_random_uuid();rid uuid;aid uuid;saved_revision bigint;i integer;result jsonb;context jsonb;base jsonb;payload jsonb;
 cap text:=repeat('a',64);frames jsonb:=jsonb_build_array(repeat('7',64),repeat('8',64),repeat('9',64));metadata jsonb:=jsonb_build_object('matched',true,'faceDigests',jsonb_build_array(repeat('7',64),repeat('8',64),repeat('9',64)),'modelId','opencv-sface-2021dec-v1','modelSha256','0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79','keyVersion','fixture-key');
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_app_meta_data) values(actor,'boundary@pilot.lumo.invalid','{"lumo_pilot":true}');
 insert into auth.sessions(id,user_id) values(sid,actor),(proof,actor);
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash,status) values(actor,'actor_'||substr(replace(actor::text,'-',''),1,15),'Synthetic actor',extensions.crypt('1234',extensions.gen_salt('bf',4)),'active');
 insert into lumo_private.approved_profiles(user_id,personal_account,phone) values(actor,true,'0240765432');
 insert into lumo_private.access_requests(id,module,purpose,method,user_id,auth_session,reference_id,state) values(enroll,'consumer','enrollment','sms',actor,sid,tid,'completed');
 insert into lumo_private.access_enrollments(module,user_id,phone,reference_id,face_digests,capability_hash,key_reference) values('consumer',actor,'+233240123456',tid,frames,cap,gen_random_uuid());
 base:=jsonb_build_object('module','consumer','actor',actor,'session',sid,'proofSession',proof);
 result:=public.lumo_access_service('status',base);perform pg_temp.face_assert(result#>>'{enrollment,reEnrollmentRequired}'='true' and result#>>'{enrollment,templateEnrolled}'='false' and result#>>'{enrollment,backupKeyReady}'='true','hash-only enrollments retain key but require actual template enrollment');
 rid:=pg_temp.face_request(actor,tid);payload:=jsonb_build_object('module','consumer','requestId',rid,'capabilityHash',cap);
 result:=public.lumo_access_service('biometric.face.begin',payload);perform pg_temp.face_assert(result->>'code'='FACE_SETUP_REQUIRED','hash-only enrollment cannot reach matcher');
 insert into lumo_private.access_face_templates(id,module,user_id,enrollment_request_id,consent_version,model_id,model_sha256,key_version,ciphertext,state) values(tid,'consumer',actor,enroll,'2026-11-16.face.1','opencv-sface-2021dec-v1','0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79','fixture-key',repeat('B',200),'active');
 result:=public.lumo_access_service('biometric.face.begin',payload||jsonb_build_object('module','merchant'));perform pg_temp.face_assert(result->>'ok'='false' and not(result?'templateCiphertext'),'cross-module request cannot fetch template');
 context:=public.lumo_access_service('biometric.face.begin',payload);aid:=(context->>'attemptId')::uuid;
 update lumo_private.access_face_attempts set expires_at=clock_timestamp()-interval '1 second' where id=aid;
 result:=public.lumo_access_service('biometric.face.finish',payload||metadata||jsonb_build_object('attemptId',aid));perform pg_temp.face_assert(result->>'code'='PROOF_INVALID','expired inference cannot mint proof');
 context:=public.lumo_access_service('biometric.face.begin',payload);perform pg_temp.face_assert(context->>'ok'='true','expired processing slot can be retried within budget');aid:=(context->>'attemptId')::uuid;
 perform pg_temp.face_assert((select attempts=2 from lumo_private.access_requests where id=rid),'expired processing still consumes attempt budget');
 result:=public.lumo_access_service('biometric.face.finish',payload||metadata||jsonb_build_object('attemptId',aid));perform pg_temp.face_assert(result->>'ok'='true','unexpired next comparison can match');
 update lumo_private.access_face_attempts set expires_at=clock_timestamp()-interval '1 second' where id=aid;
 result:=public.lumo_access_service('recovery.verify',payload||jsonb_build_object('method','face','faceDigests',frames,'faceProofId',aid,'resetTokenHash',repeat('c',64)));perform pg_temp.face_assert(result->>'code'='PROOF_INVALID','expired match proof cannot create grant');
 rid:=pg_temp.face_request(actor,tid);payload:=payload||jsonb_build_object('requestId',rid);context:=public.lumo_access_service('biometric.face.begin',payload);aid:=(context->>'attemptId')::uuid;
 result:=public.lumo_access_service('biometric.face.finish',payload||metadata||jsonb_build_object('attemptId',aid));perform pg_temp.face_assert(result->>'ok'='true','fresh request owns its comparison proof');
 result:=public.lumo_access_service('key.rotate',base||jsonb_build_object('capabilityHash',cap,'keyReference',gen_random_uuid()));perform pg_temp.face_assert(result->>'ok'='true','key rotation succeeds while invalidating older revisions');
 result:=public.lumo_access_service('recovery.verify',payload||jsonb_build_object('method','face','faceDigests',frames,'faceProofId',aid,'resetTokenHash',repeat('c',64)));perform pg_temp.face_assert(result->>'code'='PROOF_INVALID','key rotation invalidates prior matched proof even with same capability fixture');
 perform pg_temp.face_assert((select state='active' and ciphertext is not null from lumo_private.access_face_templates where id=tid),'key rotation preserves usable template');
 rid:=pg_temp.face_request(actor,tid);payload:=payload||jsonb_build_object('requestId',rid);
 for i in 1..5 loop
  context:=public.lumo_access_service('biometric.face.begin',payload);perform pg_temp.face_assert(context->>'ok'='true','mismatch budget slot '||i);
  result:=public.lumo_access_service('biometric.face.finish',payload||jsonb_build_object('attemptId',context->>'attemptId','matched',false));
 end loop;
 perform pg_temp.face_assert((select attempts=5 and state='locked' and reset_token_hash is null from lumo_private.access_requests where id=rid),'fifth mismatch locks request without grant');
 result:=public.lumo_access_service('biometric.face.begin',payload);perform pg_temp.face_assert(result->>'code'='PROOF_INVALID','sixth inference cannot run');
 rid:=pg_temp.face_request(actor,tid);payload:=payload||jsonb_build_object('requestId',rid);context:=public.lumo_access_service('biometric.face.begin',payload);aid:=(context->>'attemptId')::uuid;
 update lumo_private.access_enrollments set revision=revision+1 where module='consumer' and user_id=actor;
 result:=public.lumo_access_service('biometric.face.finish',payload||metadata||jsonb_build_object('attemptId',aid));perform pg_temp.face_assert(result->>'code'='PROOF_INVALID','enrollment revision change invalidates in-flight comparison');
 update lumo_private.access_enrollments set capability_hash=null where module='consumer' and user_id=actor;
 result:=public.lumo_access_service('biometric.remove',base);perform pg_temp.face_assert(result->>'removed'='true' and result#>>'{enrollment,backupKeyReady}'='false' and result#>>'{enrollment,keyRotationAvailable}'='true','consumed key plus removal still permits fresh key setup');
 select e.revision into saved_revision from lumo_private.access_enrollments e where module='consumer' and user_id=actor;
 result:=public.lumo_access_service('biometric.remove',base);perform pg_temp.face_assert(result->>'removed'='true' and (select e.revision=saved_revision from lumo_private.access_enrollments e where module='consumer' and user_id=actor),'repeated removal is harmless and does not churn revision');
 delete from auth.sessions where id=sid;result:=public.lumo_access_service('biometric.remove',base);perform pg_temp.face_assert(result->>'code'='AUTH_REQUIRED','revoked session cannot remove face');
end $edges$;
select current_setting('test.face.checks')::int as checks,'Local fixture processor uses opaque test ciphertext only; matcher cryptography is verified separately.' as scope;
rollback;
