-- Add current gateway-verified attribution without inventing historical actors.
alter table lumo_private.operation_events add column actor_user_id uuid, add column merchant_id uuid, add column sampled_read boolean not null default false;
create index operation_events_actor_time on lumo_private.operation_events(actor_user_id,created_at desc) where actor_user_id is not null;
create index operation_events_merchant_time on lumo_private.operation_events(merchant_id,created_at desc) where merchant_id is not null;
CREATE OR REPLACE FUNCTION public.lumo_record_operation_event(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare verified_actor uuid;verified_merchant uuid;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 -- Only the service-role gateway can send Auth-verified context. No request
 -- token/session ID or supplied customer fields are retained in this table.
 verified_actor:=nullif(p_payload->>'actorId','')::uuid;
 if verified_actor is not null and not exists(select 1 from auth.users u where u.id=verified_actor) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 select case when count(*)=1 then min(x.id::text)::uuid else null end into verified_merchant from (
  select m.id from lumo_private.merchants m where m.owner_user_id=verified_actor
  union select sh.merchant_id from lumo_private.staff_memberships sm join lumo_private.shops sh on sh.id=sm.shop_id where sm.user_id=verified_actor and sm.status='active'
 ) x;
 insert into lumo_private.operation_events(request_id,service_id,action,attempt_id,channel,outcome,error_code,http_status,duration_ms,actor_user_id,merchant_id,sampled_read)
 values((p_payload->>'requestId')::uuid,p_payload->>'serviceId',p_payload->>'action',nullif(p_payload->>'attemptId',''),p_payload->>'channel',p_payload->>'outcome',nullif(p_payload->>'errorCode',''),(p_payload->>'httpStatus')::integer,(p_payload->>'durationMs')::integer,verified_actor,verified_merchant,coalesce(p_payload->>'sampledRead','false')='true')
 on conflict(request_id) do nothing;
 return jsonb_build_object('ok',true);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $function$
;
CREATE OR REPLACE FUNCTION public.lumo_admin_events(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;sid uuid;staff lumo_private.admin_staff%rowtype;pg integer;ps integer;off integer;rows jsonb;total bigint;q text;svc text;outcome_filter text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;
 if actor is null or sid is null or not exists(select 1 from auth.sessions se join auth.users u on u.id=se.user_id where se.id=sid and se.user_id=actor and (se.not_after is null or se.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and coalesce(u.is_anonymous,false)=false) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 select * into staff from lumo_private.admin_staff where user_id=actor and status='active';
 if not found then return jsonb_build_object('ok',false,'code','STAFF_REQUIRED');end if;
 if lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then return jsonb_build_object('ok',false,'code','MFA_REQUIRED');end if;
 pg:=greatest(1,least(coalesce((p_payload->>'page')::integer,1),100000));ps:=greatest(1,least(coalesce((p_payload->>'pageSize')::integer,25),100));off:=(pg-1)*ps;
 q:=left(trim(coalesce(p_payload->>'attemptId',p_payload->>'q','')),120);svc:=nullif(p_payload->>'serviceId','');outcome_filter:=nullif(coalesce(p_payload->>'outcome',p_payload->>'status'),'');
 select count(*) into total from lumo_private.operation_events e where(q='' or e.attempt_id=q or e.request_id::text=q or e.error_code=q or e.actor_user_id::text=q or e.merchant_id::text=q) and(svc is null or e.service_id=svc) and(outcome_filter is null or e.outcome=outcome_filter);
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into rows from(
  select e.created_at,jsonb_build_object('id',e.id,'requestId',e.request_id,'serviceId',e.service_id,'action',e.action,'attemptId',e.attempt_id,'channel',e.channel,'actorId',e.actor_user_id,'merchantId',e.merchant_id,'sampledRead',e.sampled_read,'outcome',e.outcome,'status',e.outcome,'errorCode',e.error_code,'httpStatus',e.http_status,'durationMs',e.duration_ms,'createdAt',e.created_at,'evidence','Gateway outcome; actor is attached only after Auth verification. Merchant attribution is unambiguous current membership, not proof of a payment. Missing context is unknown. Recover unknown outcomes by original attempt.') item
  from lumo_private.operation_events e where(q='' or e.attempt_id=q or e.request_id::text=q or e.error_code=q or e.actor_user_id::text=q or e.merchant_id::text=q) and(svc is null or e.service_id=svc) and(outcome_filter is null or e.outcome=outcome_filter)
  order by e.created_at desc,e.id limit ps offset off)x;
 perform lumo_private.admin_log(actor,staff.role,'operations.list','operation_events',null,null,null,null,null);
 return jsonb_build_object('ok',true,'data',jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps,'limitations',jsonb_build_array('Events start when this release is deployed; earlier failed attempts cannot be reconstructed.','Mutations, failed reads and a 1% sample of successful reads are recorded. Missing telemetry does not prove a request never happened.','A gateway timeout is an unknown outcome, not proof that money did not move.')));
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $function$
;
revoke all on function public.lumo_record_operation_event(jsonb) from public,anon,authenticated;
grant execute on function public.lumo_record_operation_event(jsonb) to service_role;
revoke all on function public.lumo_admin_events(jsonb) from public,anon,authenticated;
grant execute on function public.lumo_admin_events(jsonb) to service_role;

