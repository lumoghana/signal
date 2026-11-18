-- Explicit pilot enrolment rollout, with a fail-closed production policy.
-- Preserve the current owner-approved pilot exception until staff enrolment is verified.
create table lumo_private.admin_auth_policy(
 id boolean primary key default true check(id),
 environment text not null default 'pilot' check(environment in('pilot','production')),
 require_mfa boolean not null,revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),updated_by uuid references lumo_private.admin_staff(user_id)
);
insert into lumo_private.admin_auth_policy(id,require_mfa) values(true,lumo_private.admin_mfa_required());
alter table lumo_private.admin_auth_policy enable row level security;
revoke all on lumo_private.admin_auth_policy from public,anon,authenticated,service_role;
create or replace function lumo_private.admin_mfa_required() returns boolean language sql stable set search_path='' as $$
 select coalesce((select environment='production' or require_mfa from lumo_private.admin_auth_policy where id),true)
$$;
comment on function lumo_private.admin_mfa_required() is 'Server-only policy. Production always requires MFA; a missing policy fails closed. Pilot rollout preserves existing access until enrolled staff explicitly enable it.';

create table lumo_private.admin_security_requests(
 actor_id uuid not null references lumo_private.admin_staff(user_id),request_key uuid not null,
 command text not null,fingerprint jsonb not null,result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_key)
);
alter table lumo_private.admin_security_requests enable row level security;
revoke all on lumo_private.admin_security_requests from public,anon,authenticated,service_role;
create trigger admin_security_request_immutable before update or delete on lumo_private.admin_security_requests for each row execute function lumo_private.immutable_posting();

create function lumo_private.admin_auth_policy_json() returns jsonb language sql stable set search_path='' as $$
 with counts as(select count(*) active,
  count(*) filter(where exists(select 1 from auth.mfa_factors f where f.user_id=s.user_id and f.factor_type='totp' and f.status='verified')) verified,
  count(*) filter(where s.role='super_admin' and exists(select 1 from auth.mfa_factors f where f.user_id=s.user_id and f.factor_type='totp' and f.status='verified')) access_admins
  from lumo_private.admin_staff s where s.status='active')
 select jsonb_build_object('environment',p.environment,'mfaEnforced',lumo_private.admin_mfa_required(),'revision',p.revision,'updatedAt',p.updated_at,
  'activeStaff',c.active,'verifiedStaff',c.verified,'staffToEnrol',c.active-c.verified,'verifiedAccessAdmins',c.access_admins,
  'readyToEnforce',c.active>0 and c.active=c.verified and c.access_admins>=1,
  'productionReady',c.active>0 and c.active=c.verified and c.access_admins>=2,
  'productionRequiresTwoAccessAdmins',true)
 from lumo_private.admin_auth_policy p cross join counts c where p.id
$$;

create function public.lumo_admin_security(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare checked jsonb;actor uuid;staff_role text;ident uuid;request_key uuid;expected bigint;reason text;fingerprint jsonb;prior lumo_private.admin_security_requests%rowtype;
 policy lumo_private.admin_auth_policy%rowtype;readiness jsonb;result jsonb;rows jsonb;pg integer;ps integer;total bigint;module_value text;old jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_command not in('security.policy','security.mfa.enable','security.mode.production','recovery.resets.list','recovery.resets.reconcile','recovery.resets.cancel') or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 checked:=public.lumo_admin_service('session',p_payload);if checked->>'ok' is distinct from 'true' then return checked;end if;
 actor:=(p_payload->>'actor')::uuid;staff_role:=checked#>>'{data,staff,role}';
 if p_command like 'security.%' and staff_role<>'super_admin' or p_command='recovery.resets.list' and staff_role not in('super_admin','supervisor','risk','support') or p_command in('recovery.resets.reconcile','recovery.resets.cancel') and staff_role not in('super_admin','supervisor','risk') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 -- Read-only rollout status is available before enrolment. Every security mutation
 -- and every recovery record read requires an actual verified second factor.
 if p_command<>'security.policy' and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then return jsonb_build_object('ok',false,'code','MFA_REQUIRED');end if;
 if p_command='security.policy' then
  return jsonb_build_object('ok',true,'data',jsonb_build_object('policy',lumo_private.admin_auth_policy_json()));
 elsif p_command='recovery.resets.list' then
  pg:=coalesce((p_payload->>'page')::integer,1);ps:=coalesce((p_payload->>'pageSize')::integer,25);
  if pg<1 or pg>100000 or ps<1 or ps>100 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select count(*) into total from lumo_private.access_prototype_reset_executions e where e.state in('running','confirmed');
  select coalesce(jsonb_agg(x.item order by x.created_at,x.request_id),'[]'::jsonb) into rows from(
   select e.created_at,e.request_id,jsonb_build_object('requestId',e.request_id,'module',r.module,'userId',r.user_id,'state',e.state,'createdAt',e.created_at,'updatedAt',e.updated_at,
    'requiresAuthMarker',e.requires_auth_marker,'authApplied',coalesce(u.raw_app_meta_data->>'lumo_reset_execution'=e.execution_id::text,false),'outcomeUnconfirmed',not coalesce(u.raw_app_meta_data->>'lumo_reset_execution'=e.execution_id::text,false)) item
   from lumo_private.access_prototype_reset_executions e join lumo_private.access_requests r on r.id=e.request_id left join auth.users u on u.id=r.user_id
   where e.state in('running','confirmed') order by e.created_at,e.request_id limit ps offset (pg-1)*ps)x;
  perform lumo_private.admin_log(actor,staff_role,p_command,'access_reset',null,'Recovery reset queue reviewed');
  return jsonb_build_object('ok',true,'data',jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps));
 end if;
 reason:=trim(coalesce(p_payload->>'reason',''));request_key:=(p_payload->>'requestId')::uuid;
 if length(reason) not between 3 and 2000 or request_key is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 fingerprint:=p_payload-'actor'-'session'-'aal'-'requestId';
 perform pg_advisory_xact_lock(hashtextextended('admin-security:'||actor::text||':'||request_key::text,21400));
 select * into prior from lumo_private.admin_security_requests q where q.actor_id=actor and q.request_key=request_key;
 if found then
  if prior.command<>p_command or prior.fingerprint is distinct from fingerprint then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
  return jsonb_build_object('ok',true,'data',prior.result||jsonb_build_object('replayed',true));
 end if;
 if p_command in('recovery.resets.reconcile','recovery.resets.cancel') then
  ident:=(p_payload->>'resetRequestId')::uuid;module_value:=p_payload->>'module';
  if ident is null or module_value not in('consumer','merchant','admin') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if p_command='recovery.resets.cancel' then checked:=lumo_private.access_cancel_pending_reset(ident,module_value);else checked:=lumo_private.access_reconcile_applied_reset(ident,module_value);end if;
  if checked->>'ok' is distinct from 'true' then return checked;end if;
  result:=jsonb_build_object('resetRequestId',ident,'module',module_value,'resolution',checked-'ok','authWritePerformed',false);
  perform lumo_private.admin_log(actor,staff_role,p_command,'access_reset',ident::text,reason,null,null,jsonb_build_object('module',module_value,'authWritePerformed',false,'resolved',true,'operation',p_command));
 else
  select * into policy from lumo_private.admin_auth_policy where id for update;
  expected:=(p_payload->>'expectedRevision')::bigint;
  if expected is null or expected<>policy.revision then return jsonb_build_object('ok',false,'code','STALE_CONTROL');end if;
  readiness:=lumo_private.admin_auth_policy_json();
  if readiness->>'readyToEnforce' is distinct from 'true' then return jsonb_build_object('ok',false,'code','STAFF_MFA_ENROLMENT_REQUIRED');end if;
  if p_command='security.mode.production' and readiness->>'productionReady' is distinct from 'true' then return jsonb_build_object('ok',false,'code','SECOND_ACCESS_ADMIN_REQUIRED');end if;
  old:=readiness;
  update lumo_private.admin_auth_policy set require_mfa=true,environment=case when p_command='security.mode.production' then 'production' else environment end,revision=revision+1,updated_at=clock_timestamp(),updated_by=actor where id;
  result:=jsonb_build_object('policy',lumo_private.admin_auth_policy_json(),'replayed',false);
  perform lumo_private.admin_log(actor,staff_role,p_command,'admin_auth_policy','staff',reason,null,old,result->'policy');
 end if;
 insert into lumo_private.admin_security_requests(actor_id,request_key,command,fingerprint,result) values(actor,request_key,p_command,fingerprint,result);
 return jsonb_build_object('ok',true,'data',result);
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function lumo_private.admin_auth_policy_json(),lumo_private.admin_mfa_required() from public,anon,authenticated,service_role;
revoke all on function public.lumo_admin_security(text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_admin_security(text,jsonb) to service_role;
