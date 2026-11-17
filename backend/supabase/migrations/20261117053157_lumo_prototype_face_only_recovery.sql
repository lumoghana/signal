-- Explicit prototype-only alternative. The protected recovery RPC is unchanged.
-- Only the trusted Edge handler can select this service-role-only RPC, and that
-- handler additionally requires sandbox providers plus the approved pilot host.
-- Clone the installed credential state machine with asserted narrow seams so
-- tenant/account/session fixes are retained without replaying a schema snapshot.
do $clone$
declare definition text;old text;replacement text;expected integer;changes jsonb;
begin
 definition:=pg_get_functiondef('lumo_private.access_service_before_stored_face(text,jsonb)'::regprocedure);
 definition:=replace(definition,'lumo_private.access_service_before_stored_face(', 'lumo_private.access_prototype_face_base(');
 definition:=replace(definition,'lumo_private.access_enrollment_json(', 'lumo_private.access_prototype_enrollment_json(');
 for changes in select value from jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('old','if rid is null or cap is null or cap!~''^[a-f0-9]{64}$'' or otp is null or otp!~''^[a-f0-9]{64}$'' or kref is null then','new','if rid is null or cap is not null or kref is not null or otp is null or otp!~''^[a-f0-9]{64}$'' then'),
  jsonb_build_object('old','if e.capability_hash is null then who:=null;end if;','new','if e.user_id is null then who:=null;end if;'),
  jsonb_build_object('old','if rid is null or cap is null or cap!~''^[a-f0-9]{64}$'' then','new','if rid is null or cap is not null then'),
  jsonb_build_object('old','r.user_id is null or e.capability_hash is null or e.capability_hash is distinct from cap or e.revision<>r.enrollment_revision','new','r.user_id is null or e.user_id is null or r.method<>''face'' or e.revision<>r.enrollment_revision'),
  jsonb_build_object('old','e.user_id is null or e.revision<>r.enrollment_revision or e.capability_hash is null then','new','e.user_id is null or e.revision<>r.enrollment_revision or r.method<>''face'' then')
 )) loop
  old:=changes->>'old';replacement:=changes->>'new';expected:=(length(definition)-length(replace(definition,old,'')))/length(old);
  if expected<>1 then raise exception 'Prototype recovery base seam changed: %',old;end if;
  definition:=replace(definition,old,replacement);
 end loop;
 execute definition;
 definition:=pg_get_functiondef('lumo_private.access_enrollment_json(text,uuid)'::regprocedure);
 definition:=replace(definition,'lumo_private.access_enrollment_json(', 'lumo_private.access_prototype_enrollment_json(');
 old:='''backupKeyReady'',e.capability_hash is not null,''keyRotationAvailable'',e.user_id is not null,''keyReference'',e.key_reference';
 if strpos(definition,old)=0 then raise exception 'Prototype enrollment projection seam changed';end if;
 execute replace(definition,old,'''backupKeyReady'',false,''keyRotationAvailable'',false');
 definition:=pg_get_functiondef('lumo_private.access_stored_face(text,jsonb)'::regprocedure);
 definition:=replace(definition,'lumo_private.access_stored_face(', 'lumo_private.access_prototype_stored_face(');
 definition:=replace(definition,'lumo_private.access_service_before_stored_face(', 'lumo_private.access_prototype_face_base(');
 definition:=replace(definition,'lumo_private.access_enrollment_json(', 'lumo_private.access_prototype_enrollment_json(');
 old:=' or e.capability_hash is distinct from p_payload->>''capabilityHash''';
 if (length(definition)-length(replace(definition,old,'')))/length(old)<>1 then raise exception 'Prototype face finish key seam changed';end if;
 execute replace(definition,old,'');
 definition:=pg_get_functiondef('public.lumo_access_service(text,jsonb)'::regprocedure);
 definition:=replace(definition,'public.lumo_access_service(', 'lumo_private.access_prototype_face_dispatch(');
 definition:=replace(definition,'lumo_private.access_stored_face(', 'lumo_private.access_prototype_stored_face(');
 definition:=replace(definition,'lumo_private.access_service_before_stored_face(', 'lumo_private.access_prototype_face_base(');
 definition:=replace(definition,'lumo_private.access_enrollment_json(', 'lumo_private.access_prototype_enrollment_json(');
 execute definition;
end $clone$;

create function public.lumo_access_prototype_service(p_command text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r lumo_private.access_requests%rowtype;rid uuid;mod text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>24000 or p_payload ?| array['capabilityHash','keyReference','backupKey','prototypeOnly','recoveryMode'] then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if p_command not in('guard','status','auth.rate','proof.close','biometric.enroll.reserve','biometric.enroll.store','enroll.verify','biometric.face.begin','biometric.face.finish','biometric.remove','recovery.start','recovery.verify','complete.begin','complete.finish') or p_command is null then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 mod:=p_payload->>'module';rid:=nullif(p_payload->>'requestId','')::uuid;
 if mod is null or mod not in('consumer','merchant','admin') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if p_command in('recovery.start','recovery.verify') and p_payload->>'method' is distinct from 'face' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_command in('biometric.face.begin','biometric.face.finish','recovery.verify','complete.begin','complete.finish') then
  select * into r from lumo_private.access_requests where id=rid and module=mod;
  if r.id is null or r.purpose<>'recovery' or r.method<>'face' or r.environment<>'sandbox' then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
 end if;
 return lumo_private.access_prototype_face_dispatch(p_command,p_payload);
exception when invalid_text_representation or check_violation or unique_violation or datetime_field_overflow then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;

revoke all on function lumo_private.access_prototype_face_base(text,jsonb),lumo_private.access_prototype_enrollment_json(text,uuid),lumo_private.access_prototype_stored_face(text,jsonb),lumo_private.access_prototype_face_dispatch(text,jsonb),public.lumo_access_prototype_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_access_prototype_service(text,jsonb) to service_role;
