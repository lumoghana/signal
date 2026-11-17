-- A reset's external Auth write has one durable owner. No time lease can hand
-- that authority to another invocation while a previous write may still run.
create table lumo_private.access_prototype_reset_executions(
 request_id uuid primary key references lumo_private.access_requests(id),
 execution_id uuid not null unique,
 state text not null check(state in('running','confirmed','rejected','completed')),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
alter table lumo_private.access_prototype_reset_executions enable row level security;
revoke all on lumo_private.access_prototype_reset_executions from public,anon,authenticated,service_role;
-- Preserve any earlier uncertain write as guarded, rather than issuing a second
-- Auth write when a new handler first sees an already-applying request.
insert into lumo_private.access_prototype_reset_executions(request_id,execution_id,state,created_at)
 select id,gen_random_uuid(),'running',coalesce(applying_at,created_at)
 from lumo_private.access_requests
 where purpose='recovery' and method='face' and environment='sandbox' and state='applying';

create function lumo_private.access_prototype_reset_execution(p_command text,p_payload jsonb) returns jsonb
language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare mod text:=p_payload->>'module';rid uuid:=(p_payload->>'requestId')::uuid;
 execution uuid:=(p_payload->>'executionId')::uuid;result jsonb;
 r lumo_private.access_requests%rowtype;run lumo_private.access_prototype_reset_executions%rowtype;
begin
 if execution is null or (p_payload-array['module','requestId','resetTokenHash','passwordFingerprint','executionId'])<>'{}'::jsonb
  or coalesce(p_payload->>'resetTokenHash','')!~'^[a-f0-9]{64}$'
  or coalesce(p_payload->>'passwordFingerprint','')!~'^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 select * into r from lumo_private.access_requests where id=rid and module=mod;
 if r.id is null or r.user_id is null then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
 -- Account-first locking matches enrollment and normal credential changes.
 perform pg_advisory_xact_lock(hashtextextended('lumo-access:'||r.user_id::text,0));
 select * into r from lumo_private.access_requests where id=rid and module=mod for update;
 if r.purpose<>'recovery' or r.method<>'face' or r.environment<>'sandbox'
  or r.reset_token_hash is distinct from p_payload->>'resetTokenHash'
  or r.state not in('verified','applying','completed') then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
 select * into run from lumo_private.access_prototype_reset_executions where request_id=rid for update;
 if p_command='complete.claim' then
  result:=lumo_private.access_prototype_face_dispatch('complete.begin',p_payload-'executionId');
  if result->>'ok' is distinct from 'true' or result->>'resetState'='completed' then return result;end if;
  if run.state='running' then return jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  if run.state='confirmed' then return result||jsonb_build_object('resetState','confirming','executionId',run.execution_id);end if;
  if run.state='completed' then return jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  insert into lumo_private.access_prototype_reset_executions(request_id,execution_id,state) values(rid,execution,'running')
   on conflict(request_id) do update set execution_id=excluded.execution_id,state='running',created_at=clock_timestamp(),updated_at=clock_timestamp();
  return result||jsonb_build_object('executionId',execution);
 end if;
 if run.request_id is null or run.execution_id is distinct from execution
  or r.password_fingerprint is distinct from p_payload->>'passwordFingerprint' then return jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
 if p_command='complete.applied' then
  if r.state<>'applying' or run.state not in('running','confirmed') then return jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  update lumo_private.access_prototype_reset_executions set state='confirmed',updated_at=clock_timestamp() where request_id=rid;
  return jsonb_build_object('ok',true);
 end if;
 if p_command='complete.failed' then
  if r.state<>'applying' or run.state<>'running' then return jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  update lumo_private.access_prototype_reset_executions set state='rejected',updated_at=clock_timestamp() where request_id=rid;
  update lumo_private.access_requests set state='verified',password_fingerprint=null,applying_at=null where id=rid;
  return jsonb_build_object('ok',true);
 end if;
 if p_command='complete.finish' then
  if run.state not in('confirmed','completed') then return jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  result:=lumo_private.access_prototype_face_dispatch('complete.finish',p_payload-'executionId');
  if result->>'ok'='true' then update lumo_private.access_prototype_reset_executions set state='completed',updated_at=clock_timestamp() where request_id=rid;end if;
  return result;
 end if;
 return jsonb_build_object('ok',false,'code','FORBIDDEN');
end $$;
revoke all on function lumo_private.access_prototype_reset_execution(text,jsonb) from public,anon,authenticated,service_role;

do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('public.lumo_access_prototype_service(text,jsonb)'::regprocedure);
 needle:='''complete.begin'',''complete.finish''';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>2 then raise exception 'Prototype reset command seam changed';end if;
 definition:=replace(definition,needle,'''complete.claim'',''complete.applied'',''complete.failed'',''complete.finish''');
 needle:=' return lumo_private.access_prototype_face_dispatch(p_command,p_payload);';
 if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Prototype reset dispatch seam changed';end if;
 execute replace(definition,needle,$dispatch$ if p_command in('complete.claim','complete.applied','complete.failed','complete.finish') then
  return lumo_private.access_prototype_reset_execution(p_command,p_payload);
 end if;
$dispatch$||needle);
end $patch$;
