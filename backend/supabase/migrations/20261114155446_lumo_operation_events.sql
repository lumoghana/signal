-- Diagnostic events contain routing and final gateway outcomes, never bodies,
-- credentials, balances, amounts, phone numbers, chat content or session IDs.
create table lumo_private.operation_events (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 service_id text not null check(service_id ~ '^[a-z_]{1,60}$'),
 action text not null check(action ~ '^[A-Za-z][A-Za-z0-9_.]{0,79}$'),
 attempt_id text check(attempt_id ~ '^[A-Za-z0-9_.:-]{10,100}$'),
 channel text not null check(channel in('consumer_web','merchant_web','guest_web','unknown')),
 outcome text not null check(outcome in('ok','rejected','unknown')),
 error_code text check(error_code ~ '^[A-Z_]{1,80}$'),
 http_status integer not null check(http_status between 100 and 599),
 duration_ms integer not null check(duration_ms between 0 and 300000),
 created_at timestamptz not null default clock_timestamp()
);
create index operation_events_time on lumo_private.operation_events(created_at desc,id);
create index operation_events_attempt on lumo_private.operation_events(attempt_id,created_at desc) where attempt_id is not null;
create index operation_events_service on lumo_private.operation_events(service_id,created_at desc);
create index operation_events_outcome on lumo_private.operation_events(outcome,created_at desc);
alter table lumo_private.operation_events enable row level security;
revoke all on lumo_private.operation_events from public,anon,authenticated,service_role;

create function public.lumo_record_operation_event(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>2000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 insert into lumo_private.operation_events(request_id,service_id,action,attempt_id,channel,outcome,error_code,http_status,duration_ms)
 values((p_payload->>'requestId')::uuid,p_payload->>'serviceId',p_payload->>'action',nullif(p_payload->>'attemptId',''),p_payload->>'channel',p_payload->>'outcome',nullif(p_payload->>'errorCode',''),(p_payload->>'httpStatus')::integer,(p_payload->>'durationMs')::integer)
 on conflict(request_id) do nothing;
 return jsonb_build_object('ok',true);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation or not_null_violation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function public.lumo_record_operation_event(jsonb) from public,anon,authenticated;
grant execute on function public.lumo_record_operation_event(jsonb) to service_role;

create function public.lumo_admin_events(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;sid uuid;staff lumo_private.admin_staff%rowtype;pg integer;ps integer;off integer;rows jsonb;total bigint;q text;svc text;outcome_filter text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;
 if actor is null or sid is null or not exists(select 1 from auth.sessions se join auth.users u on u.id=se.user_id where se.id=sid and se.user_id=actor and (se.not_after is null or se.not_after>clock_timestamp()) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and coalesce(u.is_anonymous,false)=false) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 select * into staff from lumo_private.admin_staff where user_id=actor and status='active';
 if not found then return jsonb_build_object('ok',false,'code','STAFF_REQUIRED');end if;
 if p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors where user_id=actor and factor_type='totp' and status='verified') then return jsonb_build_object('ok',false,'code','MFA_REQUIRED');end if;
 pg:=greatest(1,least(coalesce((p_payload->>'page')::integer,1),100000));ps:=greatest(1,least(coalesce((p_payload->>'pageSize')::integer,25),100));off:=(pg-1)*ps;
 q:=left(trim(coalesce(p_payload->>'attemptId',p_payload->>'q','')),120);svc:=nullif(p_payload->>'serviceId','');outcome_filter:=nullif(coalesce(p_payload->>'outcome',p_payload->>'status'),'');
 select count(*) into total from lumo_private.operation_events e where(q='' or e.attempt_id=q or e.request_id::text=q or e.error_code=q) and(svc is null or e.service_id=svc) and(outcome_filter is null or e.outcome=outcome_filter);
 select coalesce(jsonb_agg(x.item order by x.created_at desc),'[]'::jsonb) into rows from(
  select e.created_at,jsonb_build_object('id',e.id,'requestId',e.request_id,'serviceId',e.service_id,'action',e.action,'attemptId',e.attempt_id,'channel',e.channel,'outcome',e.outcome,'status',e.outcome,'errorCode',e.error_code,'httpStatus',e.http_status,'durationMs',e.duration_ms,'createdAt',e.created_at,'evidence','Gateway response; caller reference is correlation only, not proof of identity. Unknown outcomes require original-attempt recovery.') item
  from lumo_private.operation_events e where(q='' or e.attempt_id=q or e.request_id::text=q or e.error_code=q) and(svc is null or e.service_id=svc) and(outcome_filter is null or e.outcome=outcome_filter)
  order by e.created_at desc,e.id limit ps offset off)x;
 perform lumo_private.admin_log(actor,staff.role,'operations.list','operation_events',null,null,null,null,null);
 return jsonb_build_object('ok',true,'data',jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps,'limitations',jsonb_build_array('Events start when this release is deployed; earlier failed attempts cannot be reconstructed.','Only mutations and failed reads are recorded. Missing telemetry does not prove a request never happened.','A gateway timeout is an unknown outcome, not proof that money did not move.')));
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function public.lumo_admin_events(jsonb) from public,anon,authenticated;
grant execute on function public.lumo_admin_events(jsonb) to service_role;
