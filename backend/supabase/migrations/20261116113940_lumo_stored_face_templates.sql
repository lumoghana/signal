-- Store only processor-encrypted face templates. Raw photographs and embeddings
-- never enter these tables. The separate processor owns the encryption key.
create table lumo_private.access_face_templates(
 id uuid primary key,module text not null check(module in('consumer','merchant','admin')),
 user_id uuid not null references auth.users(id),enrollment_request_id uuid not null unique references lumo_private.access_requests(id),
 version integer not null default 1 check(version=1),consent_version text not null check(consent_version='2026-11-16.face.1'),
 consent_at timestamptz not null default clock_timestamp(),model_id text,model_sha256 text,key_version text,ciphertext text,
 state text not null default 'processing' check(state in('processing','ready','active','revoked')),
 created_at timestamptz not null default clock_timestamp(),activated_at timestamptz,revoked_at timestamptz,
 check(ciphertext is null or length(ciphertext) between 64 and 16384 and ciphertext ~ '^[A-Za-z0-9_-]+$'),
 check(model_id is null or model_id='opencv-sface-2021dec-v1'),
 check(model_sha256 is null or model_sha256='0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79'),
 check(key_version is null or key_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
 check(state not in('ready','active') or ciphertext is not null and model_id is not null and model_sha256 is not null and key_version is not null)
);
create unique index access_face_one_active on lumo_private.access_face_templates(module,user_id) where state='active';
create index access_face_owner on lumo_private.access_face_templates(user_id,module,created_at desc);
create table lumo_private.access_face_attempts(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references lumo_private.access_requests(id),
 template_id uuid not null references lumo_private.access_face_templates(id),enrollment_revision bigint not null,
 state text not null default 'processing' check(state in('processing','matched','rejected','failed','consumed','expired')),
 frame_digests jsonb,created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '90 seconds',consumed_at timestamptz
);
create unique index access_face_one_processing on lumo_private.access_face_attempts(request_id) where state='processing';
create index access_face_attempt_request on lumo_private.access_face_attempts(request_id,created_at desc);
alter table lumo_private.access_face_templates enable row level security;
alter table lumo_private.access_face_attempts enable row level security;
revoke all on lumo_private.access_face_templates,lumo_private.access_face_attempts from public,anon,authenticated,service_role;

-- Preserve the current credential/session implementation and tenant helpers.
-- The old public face/hash path becomes private and cannot be called directly.
alter function public.lumo_access_service(text,jsonb) set schema lumo_private;
alter function lumo_private.lumo_access_service(text,jsonb) rename to access_service_before_stored_face;
revoke all on function lumo_private.access_service_before_stored_face(text,jsonb) from public,anon,authenticated,service_role;
do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('lumo_private.access_service_before_stored_face(text,jsonb)'::regprocedure);
 needle:='or r.attempts>=5 then return base||jsonb_build_object(''ok'',false,''code'',''PROOF_INVALID'');end if;';
 if strpos(definition,needle)=0 then raise exception 'Reviewed recovery-attempt seam changed';end if;
 -- An attempt is charged BEFORE inference. The fifth successful comparison
 -- remains usable only after the new wrapper validates its one-use proof.
 execute replace(definition,needle,$body$or (r.attempts>=5 and not(p_command='recovery.verify' and r.method='face' and exists(select 1 from lumo_private.access_face_attempts fa where fa.request_id=r.id and fa.state='matched' and fa.expires_at>clock_timestamp()))) then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;$body$);
end $patch$;

create or replace function lumo_private.access_enrollment_json(p_module text,p_user uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('phoneMasked',case when e.phone is null then '' else '+233••••'||right(e.phone,4) end,
  'phoneVerified',false,'phoneSimulation',true,'faceEnrolled',f.id is not null,'faceSimulation',false,
  'backupKeyReady',e.capability_hash is not null,'keyRotationAvailable',e.user_id is not null,'keyReference',e.key_reference,
  'templateEnrolled',f.id is not null,'templateVersion',f.version,'faceConsentVersion',f.consent_version,
  'reEnrollmentRequired',e.user_id is not null and f.id is null)
 from (select 1) singleton left join lumo_private.access_enrollments e on e.module=p_module and e.user_id=p_user
 left join lumo_private.access_face_templates f on f.module=e.module and f.user_id=e.user_id and f.id=e.reference_id and f.state='active';
$$;

create function lumo_private.access_stored_face(p_command text,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare mod text;actor uuid;rid uuid;tid uuid;aid uuid;changed integer;result jsonb;r lumo_private.access_requests%rowtype;e lumo_private.access_enrollments%rowtype;t lumo_private.access_face_templates%rowtype;a lumo_private.access_face_attempts%rowtype;
begin
 mod:=p_payload->>'module';rid:=(p_payload->>'requestId')::uuid;
 if p_command='biometric.remove' then
  actor:=(p_payload->>'actor')::uuid;
  if actor is null or not lumo_private.access_live(mod,actor,(p_payload->>'session')::uuid) then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');end if;
  if (p_payload->>'proofSession')::uuid is null or p_payload->>'proofSession'=p_payload->>'session' or not lumo_private.access_live(mod,actor,(p_payload->>'proofSession')::uuid) then return jsonb_build_object('ok',false,'code','STEP_UP_REQUIRED');end if;
  perform pg_advisory_xact_lock(hashtextextended('lumo-access:'||actor::text,0));
  if exists(select 1 from lumo_private.access_requests q where q.user_id=actor and q.state='applying') or exists(select 1 from lumo_private.access_credential_writes q where q.user_id=actor and q.state='applying') then return jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=actor for update;
  update lumo_private.access_face_templates set state='revoked',revoked_at=clock_timestamp(),ciphertext=null where module=mod and user_id=actor and state<>'revoked';get diagnostics changed=row_count;
  -- Version invalidation avoids taking request-row locks after the credential
  -- writer lock. Existing face grants and pending enrollments then fail closed.
  if changed>0 or coalesce(e.face_digests,'[]'::jsonb)<>'[]'::jsonb then
   update lumo_private.access_enrollments set revision=revision+1,face_digests='[]'::jsonb,updated_at=clock_timestamp() where module=mod and user_id=actor;
   insert into lumo_private.access_audit(module,user_id,action) values(mod,actor,'face.template.removed');
  end if;
  return jsonb_build_object('ok',true,'removed',true,'enrollment',lumo_private.access_enrollment_json(mod,actor));
 end if;
 if p_command='biometric.enroll.reserve' then
  if p_payload->>'consentVersion' is distinct from '2026-11-16.face.1' or p_payload->'consentAccepted' is distinct from 'true'::jsonb then return jsonb_build_object('ok',false,'code','FACE_CONSENT_REQUIRED');end if;
  actor:=(p_payload->>'actor')::uuid;tid:=(p_payload->>'templateId')::uuid;
  if tid is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  result:=lumo_private.access_service_before_stored_face('enroll.begin',(p_payload-array['templateId','consentVersion','consentAccepted'])||jsonb_build_object('referenceId',tid));
  if result->>'ok' is distinct from 'true' then return result;end if;
  insert into lumo_private.access_face_templates(id,module,user_id,enrollment_request_id,consent_version) values(tid,mod,actor,rid,'2026-11-16.face.1');
  return result||jsonb_build_object('templateId',tid,'templateVersion',1,'consentVersion','2026-11-16.face.1');
 end if;
 if p_command='biometric.enroll.store' then
  actor:=(p_payload->>'actor')::uuid;
  if not lumo_private.access_live(mod,actor,(p_payload->>'session')::uuid) then return jsonb_build_object('ok',false,'code','AUTH_REQUIRED');end if;
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  select * into t from lumo_private.access_face_templates where enrollment_request_id=rid for update;
  if r.id is null or r.purpose<>'enrollment' or r.user_id is distinct from actor or r.auth_session is distinct from (p_payload->>'session')::uuid or r.state<>'pending' or r.expires_at<=clock_timestamp() or t.state<>'processing' or t.user_id is distinct from actor or t.id is distinct from (p_payload->>'templateId')::uuid or p_payload->'templateVersion' is distinct from '1'::jsonb or p_payload->'faceDigests' is distinct from r.face_digests then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  if p_payload->>'modelId' is distinct from 'opencv-sface-2021dec-v1' or p_payload->>'modelSha256' is distinct from '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79' then return jsonb_build_object('ok',false,'code','IDENTITY_UNAVAILABLE');end if;
  update lumo_private.access_face_templates set state='ready',ciphertext=p_payload->>'templateCiphertext',model_id=p_payload->>'modelId',model_sha256=p_payload->>'modelSha256',key_version=p_payload->>'keyVersion' where id=t.id;
  return jsonb_build_object('ok',true);
 end if;
 if p_command='biometric.face.begin' then
  -- Existing key, current revision, subject status and expiry checks run first.
  result:=lumo_private.access_service_before_stored_face('recovery.context',p_payload);
  if result->>'ok' is distinct from 'true' then return result;end if;
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=r.user_id for update;
  select * into t from lumo_private.access_face_templates where id=e.reference_id and module=mod and user_id=r.user_id and state='active' for update;
  if r.method<>'face' then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  if t.id is null then return jsonb_build_object('ok',false,'code','FACE_SETUP_REQUIRED');end if;
  if exists(select 1 from lumo_private.access_face_attempts where request_id=rid and state='processing' and expires_at>clock_timestamp()) then return jsonb_build_object('ok',false,'code','FACE_PENDING');end if;
  update lumo_private.access_face_attempts set state='expired' where request_id=rid and state='processing';
  update lumo_private.access_requests set attempts=attempts+1 where id=rid;
  insert into lumo_private.access_face_attempts(request_id,template_id,enrollment_revision) values(rid,t.id,e.revision) returning id into aid;
  return jsonb_build_object('ok',true,'attemptId',aid,'ownerId',r.user_id,'templateId',t.id,'templateVersion',t.version,'consentVersion',t.consent_version,'modelId',t.model_id,'modelSha256',t.model_sha256,'keyVersion',t.key_version,'templateCiphertext',t.ciphertext);
 end if;
 if p_command='biometric.face.finish' then
  aid:=(p_payload->>'attemptId')::uuid;
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=r.user_id for update;
  select * into t from lumo_private.access_face_templates where id=e.reference_id and module=mod and user_id=r.user_id and state='active' for update;
  select * into a from lumo_private.access_face_attempts where id=aid and request_id=rid for update;
  if r.id is null or r.purpose<>'recovery' or r.method<>'face' or r.state<>'pending' or r.expires_at<=clock_timestamp() or r.attempts>5 or a.id is null or a.state<>'processing' or a.expires_at<=clock_timestamp() or t.id is null or a.template_id<>t.id or a.enrollment_revision<>e.revision or r.enrollment_revision<>e.revision or e.capability_hash is distinct from p_payload->>'capabilityHash' or not lumo_private.access_account_allowed(mod,r.user_id) then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  if p_payload->'matched' is distinct from 'true'::jsonb then
   update lumo_private.access_face_attempts set state=case when p_payload->>'failure'='unavailable' then 'failed' else 'rejected' end where id=aid;
   update lumo_private.access_requests set state=case when attempts>=5 then 'locked' else state end where id=rid;
   insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,r.user_id,rid,'face.comparison.rejected');
   return jsonb_build_object('ok',false,'code',case when p_payload->>'failure'='unavailable' then 'IDENTITY_UNAVAILABLE' else 'FACE_NO_MATCH' end);
  end if;
  if not coalesce(lumo_private.access_face_digests(p_payload->'faceDigests'),false) or p_payload->>'modelId' is distinct from t.model_id or p_payload->>'modelSha256' is distinct from t.model_sha256 or p_payload->>'keyVersion' is distinct from t.key_version then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  update lumo_private.access_face_attempts set state='matched',frame_digests=p_payload->'faceDigests',expires_at=least(r.expires_at,clock_timestamp()+interval '60 seconds') where id=aid;
  insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,r.user_id,rid,'face.comparison.matched');
  return jsonb_build_object('ok',true,'faceProofId',aid);
 end if;
 return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;

create function public.lumo_access_service(p_command text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare result jsonb;rid uuid;actor uuid;mod text;r lumo_private.access_requests%rowtype;e lumo_private.access_enrollments%rowtype;t lumo_private.access_face_templates%rowtype;a lumo_private.access_face_attempts%rowtype;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>24000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 mod:=p_payload->>'module';rid:=nullif(p_payload->>'requestId','')::uuid;
 if mod not in('consumer','merchant','admin') or mod is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if p_command in('biometric.enroll.reserve','biometric.enroll.store','biometric.face.begin','biometric.face.finish','biometric.remove') then return lumo_private.access_stored_face(p_command,p_payload);end if;
 -- An older handler cannot create another hash-only face enrollment.
 if p_command='enroll.begin' then return jsonb_build_object('ok',false,'code','FACE_CONSENT_REQUIRED');end if;
 if p_command='enroll.verify' then
  actor:=(p_payload->>'actor')::uuid;
  -- Match the retained enrollment/credential writer's account-first lock order.
  perform pg_advisory_xact_lock(hashtextextended('lumo-access:'||actor::text,0));
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  select * into t from lumo_private.access_face_templates where enrollment_request_id=rid for update;
  if t.id is null or t.state<>'ready' or t.user_id is distinct from actor or t.id is distinct from r.reference_id then return jsonb_build_object('ok',false,'code','FACE_SETUP_REQUIRED');end if;
  result:=lumo_private.access_service_before_stored_face(p_command,p_payload);
  if result->>'ok' is distinct from 'true' then return result;end if;
  update lumo_private.access_face_templates set state='revoked',revoked_at=clock_timestamp(),ciphertext=null where module=mod and user_id=actor and state='active' and id<>t.id;
  update lumo_private.access_face_templates set state='active',activated_at=clock_timestamp() where id=t.id;
  return result||jsonb_build_object('templateEnrolled',true,'templateVersion',t.version,'faceConsentVersion',t.consent_version,'enrollment',lumo_private.access_enrollment_json(mod,actor));
 end if;
 if p_command='recovery.verify' and p_payload->>'method'='face' then
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=r.user_id for update;
  select * into a from lumo_private.access_face_attempts where id=(p_payload->>'faceProofId')::uuid and request_id=rid for update;
  if a.id is null or a.state<>'matched' or a.expires_at<=clock_timestamp() or a.template_id is distinct from e.reference_id or a.enrollment_revision is distinct from e.revision or a.frame_digests is distinct from p_payload->'faceDigests' then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  result:=lumo_private.access_service_before_stored_face(p_command,p_payload-'faceProofId');
  if result->>'ok' is distinct from 'true' then return result;end if;
  update lumo_private.access_face_attempts set state='consumed',consumed_at=clock_timestamp() where id=a.id;
  return result||jsonb_build_object('faceMatched',true);
 end if;
 return lumo_private.access_service_before_stored_face(p_command,p_payload);
exception when invalid_text_representation or check_violation or unique_violation or datetime_field_overflow then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function lumo_private.access_stored_face(text,jsonb),lumo_private.access_enrollment_json(text,uuid),public.lumo_access_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_access_service(text,jsonb) to service_role;
