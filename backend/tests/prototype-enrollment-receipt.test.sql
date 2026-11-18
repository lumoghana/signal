-- Synthetic account and encrypted-template fixtures. No real face data.
begin;
create function pg_temp.receipt_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Prototype receipt check failed: %',label;end if;
 perform set_config('test.receipt.checks',(coalesce(nullif(current_setting('test.receipt.checks',true),''),'0')::int+1)::text,true);
end $$;
do $test$
declare actor uuid:=gen_random_uuid();other uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();other_sid uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();payload jsonb;result jsonb;before_audit int;before_revision bigint;protected_definition text;
 frames jsonb:=jsonb_build_array(repeat('1',64),repeat('2',64),repeat('3',64));
begin
 perform set_config('test.receipt.checks','0',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 protected_definition:=pg_get_functiondef('public.lumo_access_service(text,jsonb)'::regprocedure);
 insert into auth.users(id,email,raw_app_meta_data) values(actor,'receipt@pilot.lumo.invalid','{"lumo_pilot":true}'),(other,'receipt_other@pilot.lumo.invalid','{"lumo_pilot":true}');
 insert into auth.sessions(id,user_id) values(sid,actor),(other_sid,other);
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash,status) values(actor,'actor_'||substr(replace(actor::text,'-',''),1,15),'Synthetic actor',extensions.crypt('1234',extensions.gen_salt('bf',4)),'active'),(other,'other_'||substr(replace(other::text,'-',''),1,15),'Synthetic other',extensions.crypt('1234',extensions.gen_salt('bf',4)),'active');
 insert into lumo_private.approved_profiles(user_id,personal_account,phone) values(actor,true,'0240123456'),(other,true,'0240654321');
 insert into lumo_private.access_requests(id,module,purpose,method,user_id,auth_session,reference_id,face_digests,otp_hash,phone)
 values(rid,'consumer','enrollment','sms',actor,sid,tid,frames,repeat('a',64),'+233240123456');
 insert into lumo_private.access_face_templates(id,module,user_id,enrollment_request_id,consent_version,model_id,model_sha256,key_version,ciphertext,state)
 values(tid,'consumer',actor,rid,'2026-11-16.face.1','opencv-sface-2021dec-v1','0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79','fixture-key',repeat('A',200),'ready');
 payload:=jsonb_build_object('module','consumer','actor',actor,'session',sid,'requestId',rid,'otpHash',repeat('a',64));
 result:=public.lumo_access_prototype_service('enroll.verify',payload);
 perform pg_temp.receipt_assert(result->>'ok'='true' and result->>'templateEnrolled'='true','first confirmation activates the staged face');
 select count(*) into before_audit from lumo_private.access_audit;
 select revision into before_revision from lumo_private.access_enrollments where module='consumer' and user_id=actor;
 result:=public.lumo_access_prototype_service('enroll.verify',payload);
 perform pg_temp.receipt_assert(result->>'ok'='true' and result->>'templateEnrolled'='true','lost success response can be retried');
 perform pg_temp.receipt_assert(result#>>'{enrollment,backupKeyReady}'='false' and not(result?'backupKey') and not(result?'keyReference'),'retry returns no key');
 perform pg_temp.receipt_assert(position('ciphertext' in result::text)=0 and position(repeat('A',80) in result::text)=0,'retry exposes no biometric ciphertext');
 perform pg_temp.receipt_assert((select revision=before_revision and capability_hash is null from lumo_private.access_enrollments where module='consumer' and user_id=actor),'retry does not change enrollment authority');
 perform pg_temp.receipt_assert((select count(*)=before_audit from lumo_private.access_audit),'retry does not repeat activation or audit mutation');
 result:=public.lumo_access_prototype_service('enroll.verify',payload||jsonb_build_object('actor',other,'session',other_sid));
 perform pg_temp.receipt_assert(result->>'ok'='false','another account cannot replay the receipt');
 result:=public.lumo_access_prototype_service('enroll.verify',payload||jsonb_build_object('session',other_sid));
 perform pg_temp.receipt_assert(result->>'ok'='false','another session cannot replay the receipt');
 result:=public.lumo_access_prototype_service('enroll.verify',payload||jsonb_build_object('module','merchant'));
 perform pg_temp.receipt_assert(result->>'ok'='false','another module cannot replay the receipt');
 result:=public.lumo_access_prototype_service('enroll.verify',payload||jsonb_build_object('unexpected',true));
 perform pg_temp.receipt_assert(result->>'ok'='false','receipt cannot bypass payload validation');
 update lumo_private.access_enrollments set revision=revision+1 where module='consumer' and user_id=actor;
 result:=public.lumo_access_prototype_service('enroll.verify',payload);
 perform pg_temp.receipt_assert(result->>'ok'='false','a later authority revision invalidates the old receipt');
 update lumo_private.access_enrollments set revision=before_revision where module='consumer' and user_id=actor;
 update lumo_private.access_face_templates set state='revoked',ciphertext=null where id=tid;
 result:=public.lumo_access_prototype_service('enroll.verify',payload);
 perform pg_temp.receipt_assert(result->>'ok'='false','removed face cannot be reactivated by receipt retry');
 update lumo_private.access_face_templates set state='active',ciphertext=repeat('A',200) where id=tid;
 delete from auth.sessions where id=sid;
 result:=public.lumo_access_prototype_service('enroll.verify',payload);
 perform pg_temp.receipt_assert(result->>'ok'='false','revoked session cannot replay receipt');
 perform pg_temp.receipt_assert(pg_get_functiondef('public.lumo_access_service(text,jsonb)'::regprocedure)=protected_definition,'protected recovery RPC is unchanged');
 perform pg_temp.receipt_assert(not has_function_privilege('service_role','lumo_private.access_prototype_face_dispatch(text,jsonb)','execute'),'private dispatcher remains inaccessible directly');
end $test$;
select current_setting('test.receipt.checks')::int as checks;
rollback;
