-- A lost success response must not turn completed keyless face setup into a
-- setup-required error. Only acknowledge the existing receipt; do not activate
-- or replace a template, issue a key, or relax the protected recovery service.
do $patch$
declare definition text;needle text;replacement text;
begin
 definition:=pg_get_functiondef('lumo_private.access_prototype_face_dispatch(text,jsonb)'::regprocedure);
 needle:='  if t.id is null or t.state<>''ready'' or t.user_id is distinct from actor or t.id is distinct from r.reference_id then return jsonb_build_object(''ok'',false,''code'',''FACE_SETUP_REQUIRED'');end if;';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Prototype enrollment receipt seam changed';end if;
 replacement:=$receipt$  if r.state='completed' and r.purpose='enrollment' and r.environment='sandbox'
   and r.user_id=actor and r.auth_session=(p_payload->>'session')::uuid
   and lumo_private.access_live(mod,actor,(p_payload->>'session')::uuid)
   and t.id=r.reference_id and t.module=mod and t.user_id=actor and t.state='active'
   and t.version=1 and t.consent_version='2026-11-16.face.1'
   and (p_payload-array['module','actor','session','requestId','otpHash'])='{}'::jsonb
   and coalesce(p_payload->>'otpHash','')~'^[a-f0-9]{64}$'
   and exists(select 1 from lumo_private.access_enrollments receipt_enrollment where receipt_enrollment.module=mod and receipt_enrollment.user_id=actor and receipt_enrollment.reference_id=t.id and receipt_enrollment.revision=r.enrollment_revision+1) then
   return jsonb_build_object('ok',true,'templateEnrolled',true,'templateVersion',t.version,
    'faceConsentVersion',t.consent_version,'phoneMasked','+233••••'||right(r.phone,4),
    'enrollment',lumo_private.access_prototype_enrollment_json(mod,actor));
  end if;
$receipt$||needle;
 execute replace(definition,needle,replacement);
end $patch$;
