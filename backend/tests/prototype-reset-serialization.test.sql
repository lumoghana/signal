-- Synthetic verified grant: exercises execution ownership, not face inference.
begin;
create function pg_temp.writer_assert(value boolean,label text) returns void language plpgsql as $$begin
 if value is distinct from true then raise exception 'Prototype writer check failed: %',label;end if;
 perform set_config('test.writer.checks',(coalesce(nullif(current_setting('test.writer.checks',true),''),'0')::int+1)::text,true);
end $$;
do $test$
declare actor uuid:=gen_random_uuid();rid uuid:=gen_random_uuid();tid uuid:=gen_random_uuid();execution uuid:=gen_random_uuid();other_execution uuid:=gen_random_uuid();payload jsonb;result jsonb;
begin
 perform set_config('test.writer.checks','0',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 insert into auth.users(id,email,raw_app_meta_data) values(actor,'writer@pilot.lumo.invalid','{"lumo_pilot":true}');
 insert into lumo_private.profiles(user_id,handle,display_name,pin_hash,status) values(actor,'actor_'||substr(replace(actor::text,'-',''),1,15),'Synthetic actor',extensions.crypt('1234',extensions.gen_salt('bf',4)),'active');
 insert into lumo_private.approved_profiles(user_id,personal_account,phone) values(actor,true,'0240123456');
 insert into lumo_private.access_enrollments(module,user_id,phone,reference_id,face_digests)
 values('consumer',actor,'+233240123456',tid,jsonb_build_array(repeat('1',64),repeat('2',64),repeat('3',64)));
 insert into lumo_private.access_requests(id,module,purpose,method,user_id,enrollment_revision,reference_id,state,reset_token_hash)
 values(rid,'consumer','recovery','face',actor,1,tid,'verified',repeat('a',64));
 payload:=jsonb_build_object('module','consumer','requestId',rid,'resetTokenHash',repeat('a',64),'passwordFingerprint',repeat('b',64),'executionId',execution);
 result:=public.lumo_access_prototype_service('complete.begin',payload-'executionId');
 perform pg_temp.writer_assert(result->>'code'='FORBIDDEN','legacy unclaimed begin path is closed');
 result:=public.lumo_access_prototype_service('complete.claim',payload);
 perform pg_temp.writer_assert(result->>'resetState'='applying' and result->>'executionId'=execution::text,'first writer owns the external write');
 result:=public.lumo_access_prototype_service('complete.claim',payload||jsonb_build_object('executionId',other_execution));
 perform pg_temp.writer_assert(result->>'code'='RESET_IN_PROGRESS','second invocation cannot issue an external write');
 result:=public.lumo_access_prototype_service('complete.finish',payload);
 perform pg_temp.writer_assert(result->>'code'='RESET_IN_PROGRESS','unconfirmed write cannot release the account guard');
 result:=public.lumo_access_prototype_service('complete.applied',payload||jsonb_build_object('executionId',other_execution));
 perform pg_temp.writer_assert(result->>'code'='PROOF_INVALID','another execution cannot confirm this write');
 update lumo_private.access_prototype_reset_executions set created_at=created_at-interval '1 day',updated_at=updated_at-interval '1 day' where request_id=rid;
 result:=public.lumo_access_prototype_service('complete.claim',payload||jsonb_build_object('executionId',other_execution));
 perform pg_temp.writer_assert(result->>'code'='RESET_IN_PROGRESS','elapsed time cannot hand pending write authority to another invocation');
 result:=public.lumo_access_prototype_service('complete.applied',payload);
 perform pg_temp.writer_assert(result->>'ok'='true','matching execution can record acknowledged Auth result');
 result:=public.lumo_access_prototype_service('complete.failed',payload);
 perform pg_temp.writer_assert(result->>'code'='RESET_IN_PROGRESS','confirmed Auth write cannot be released as a rejection');
 result:=public.lumo_access_prototype_service('complete.claim',payload||jsonb_build_object('executionId',other_execution));
 perform pg_temp.writer_assert(result->>'resetState'='confirming' and result->>'executionId'=execution::text,'retry receives finish-only reconciliation authority');
 result:=public.lumo_access_prototype_service('complete.finish',payload);
 perform pg_temp.writer_assert(result->>'completed'='true','confirmed write finalizes reset');
 result:=public.lumo_access_prototype_service('complete.claim',payload||jsonb_build_object('executionId',other_execution));
 perform pg_temp.writer_assert(result->>'resetState'='completed' and not(result?'executionId'),'completed retry grants no new external write authority');
 perform pg_temp.writer_assert((select state='completed' from lumo_private.access_prototype_reset_executions where request_id=rid),'durable execution receipt is completed');
 perform pg_temp.writer_assert(not has_table_privilege('service_role','lumo_private.access_prototype_reset_executions','select'),'service role has no direct execution-record access');
 perform pg_temp.writer_assert(not has_function_privilege('service_role','lumo_private.access_prototype_reset_execution(text,jsonb)','execute'),'private execution state machine has no direct execute grant');
end $test$;
select current_setting('test.writer.checks')::int as checks;
rollback;
