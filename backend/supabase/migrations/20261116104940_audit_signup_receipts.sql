-- Versioned, non-sensitive setup receipt. No biometric media, legal names or verification authority.
alter table lumo_private.approved_profiles add column onboarding_receipt jsonb;
comment on column lumo_private.approved_profiles.onboarding_receipt is 'Server-received setup acceptance and disclosed simulated verification metadata; never proof of identity or phone ownership.';
create function lumo_private.checked_onboarding_receipt(p_value jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare accepted_at timestamptz;completed_at timestamptz;t jsonb;v jsonb;
begin
 if p_value is null then return null;end if;
 if jsonb_typeof(p_value) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_value) k where k not in('termsAcceptance','verification')) then raise exception 'INVALID_ONBOARDING_RECEIPT';end if;
 t:=p_value->'termsAcceptance';v:=p_value->'verification';
 if jsonb_typeof(t) is distinct from 'object' or jsonb_typeof(v) is distinct from 'object'
  or t->>'version' is distinct from '2026-11-08.1'
  or exists(select 1 from jsonb_object_keys(t) k where k not in('version','acceptedAt'))
  or exists(select 1 from jsonb_object_keys(v) k where k not in('mode','capture','status','method','liveness','sampleIdentity','detailsConfirmed','completedAt'))
  or v->>'mode' is distinct from 'simulation' or v->>'capture' is distinct from 'live-camera'
  or v->>'status' is distinct from 'complete' or v->>'method' is distinct from 'ghana-card-number'
  or v->>'liveness' is distinct from 'guided-camera' or v->'sampleIdentity' is distinct from 'true'::jsonb or v->'detailsConfirmed' is distinct from 'true'::jsonb
 then raise exception 'INVALID_ONBOARDING_RECEIPT';end if;
 accepted_at:=(t->>'acceptedAt')::timestamptz;completed_at:=(v->>'completedAt')::timestamptz;
 if accepted_at is null or completed_at is null or not isfinite(accepted_at) or not isfinite(completed_at)
  or accepted_at<timestamptz '2026-11-08 00:00:00+00' or accepted_at>statement_timestamp()+interval '5 minutes'
  or completed_at<statement_timestamp()-interval '24 hours' or completed_at>statement_timestamp()+interval '5 minutes'
 then raise exception 'INVALID_ONBOARDING_RECEIPT';end if;
 return jsonb_build_object('termsAcceptance',jsonb_build_object('version','2026-11-08.1','acceptedAt',accepted_at),
  'verification',v,'receivedAt',statement_timestamp());
end $$;
revoke all on function lumo_private.checked_onboarding_receipt(jsonb) from public,anon,authenticated,service_role;

-- Patch the current implementation in place and fail if its reviewed seam changed.
do $patch$
declare definition text;before_text text;after_text text;
begin
 definition:=pg_get_functiondef('lumo_private.approved_service(text,jsonb)'::regprocedure);
 before_text:='  insert into lumo_private.approved_profiles(user_id,phone,personal_account) values(actor,v_phone,p_payload->>''mode''=''consumer'') on conflict(user_id) do nothing;';
 after_text:='  insert into lumo_private.approved_profiles(user_id,phone,personal_account,onboarding_receipt) values(actor,v_phone,p_payload->>''mode''=''consumer'',case when p_payload->>''mode''=''consumer'' then lumo_private.checked_onboarding_receipt(p_payload->''onboarding'') else null end) on conflict(user_id) do nothing;';
 if strpos(definition,before_text)=0 then raise exception 'Reviewed signup provision seam changed';end if;
 execute replace(definition,before_text,after_text);
 definition:=pg_get_functiondef('lumo_private.approved_load(uuid)'::regprocedure);
 before_text:=' ''phone'',(select phone from lumo_private.approved_profiles where user_id=p_actor),';
 after_text:=before_text||E'\n ''onboarding'',(select onboarding_receipt from lumo_private.approved_profiles where user_id=p_actor),';
 if strpos(definition,before_text)=0 then raise exception 'Reviewed signup load seam changed';end if;
 execute replace(definition,before_text,after_text);
end $patch$;
