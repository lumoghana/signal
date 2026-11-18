-- Independent operational approvals bind a stable request to a captured target.
-- Existing canonical money/refund writers are deliberately unchanged.
alter table lumo_private.admin_approvals
 add column request_key uuid,
 add column request_fingerprint jsonb,
 add column target_type text check(target_type in('account','payment_link')),
 add column target_revision bigint,
 add column target_state jsonb,
 add column revision bigint not null default 1 check(revision>0),
 add column expires_at timestamptz,
 add column decision_key uuid,
 add column decision_fingerprint jsonb;
alter table lumo_private.admin_approvals drop constraint admin_approvals_status_check;
alter table lumo_private.admin_approvals add constraint admin_approvals_status_check
 check(status in('pending','rejected','executed','approved_pending_execution','cancelled','expired','superseded'));
create unique index admin_approval_actor_request on lumo_private.admin_approvals(requested_by,request_key) where request_key is not null;
create unique index admin_approval_decision_request on lumo_private.admin_approvals(decided_by,decision_key) where decision_key is not null;
create index admin_approval_target_pending on lumo_private.admin_approvals(target_type,entity_id) where status='pending';
alter table lumo_private.admin_approvals drop constraint admin_approvals_check;
alter table lumo_private.admin_approvals add constraint admin_approval_independent_reviewer
 check(decided_by is null or decided_by<>requested_by or status='cancelled');

create table lumo_private.admin_target_revisions(
 target_type text not null check(target_type in('account','payment_link')),
 entity_id uuid not null,revision bigint not null check(revision>0),
 updated_at timestamptz not null default clock_timestamp(),primary key(target_type,entity_id)
);
alter table lumo_private.admin_target_revisions enable row level security;
revoke all on lumo_private.admin_target_revisions from public,anon,authenticated,service_role;

create function lumo_private.admin_target_version_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare target text;ident uuid;
begin
 target:=case when tg_table_name in('profiles','accounts') then 'account' else 'payment_link' end;
 ident:=(case when tg_table_name='profiles' then to_jsonb(new)->>'user_id' when tg_table_name='accounts' then to_jsonb(new)->>'owner_user_id' else to_jsonb(new)->>'id' end)::uuid;
 if ident is null then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('admin-target:'||target||':'||ident::text,21400));
 insert into lumo_private.admin_target_revisions(target_type,entity_id,revision) values(target,ident,1)
 on conflict(target_type,entity_id) do update set revision=admin_target_revisions.revision+1,updated_at=clock_timestamp();
 return new;
end $$;
create trigger admin_profile_control_version before update of status on lumo_private.profiles
 for each row execute function lumo_private.admin_target_version_changed();
create trigger admin_link_control_version before update of revoked_at on lumo_private.merchant_payment_links
 for each row execute function lumo_private.admin_target_version_changed();
create trigger admin_account_control_version before update of status on lumo_private.accounts
 for each row execute function lumo_private.admin_target_version_changed();

create function lumo_private.admin_target_snapshot(p_type text,p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select case when p_type='account' then
  (select jsonb_build_object('status',p.status,'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'status',a.status) order by a.id) from lumo_private.accounts a where a.owner_user_id=p_id),'[]'::jsonb)) from lumo_private.profiles p where p.user_id=p_id)
 when p_type='payment_link' then
  (select jsonb_build_object('revokedAt',l.revoked_at,'createdAt',l.created_at,'kind',l.kind,'shopId',l.shop_id,'requestId',l.request_id) from lumo_private.merchant_payment_links l where l.id=p_id)
 end
$$;

create function lumo_private.admin_controlled_approval_json(p_id uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',a.id,'name',a.action,'action',a.action,'entityId',a.entity_id,'reason',a.reason,'caseId',a.case_id,
  'requestedBy',a.requested_by,'requesterName',s.display_name,'decidedBy',a.decided_by,'status',a.status,'decisionReason',a.decision_reason,
  'result',a.result,'createdAt',a.created_at,'decidedAt',a.decided_at,'revision',a.revision,'requestId',a.request_key,
  'targetRevision',a.target_revision,'targetState',a.target_state,'expiresAt',a.expires_at,
  'currentTargetRevision',coalesce(v.revision,0),'currentTargetState',case when a.target_type is not null then lumo_private.admin_target_snapshot(a.target_type,a.entity_id::uuid) else null end,
  'expired',a.status='pending' and a.expires_at<=clock_timestamp(),
  'stale',a.target_type is not null and (a.target_revision is distinct from coalesce(v.revision,0) or a.target_state is distinct from lumo_private.admin_target_snapshot(a.target_type,a.entity_id::uuid)))
 from lumo_private.admin_approvals a join lumo_private.admin_staff s on s.user_id=a.requested_by
 left join lumo_private.admin_target_revisions v on v.target_type=a.target_type and v.entity_id::text=a.entity_id where a.id=p_id
$$;

-- A pre-control pending restore cannot safely inherit a freshly captured target.
-- Preserve it as superseded, leaving separately bounded financial refunds alone.
with changed as(
 update lumo_private.admin_approvals set status='superseded',revision=revision+1,
  result=jsonb_build_object('code','STALE_APPROVAL','message','Re-propose this action against the current target before review.')
 where status='pending' and action<>'payment.refund' returning *
)
insert into lumo_private.admin_audit(actor_role,action,entity_type,entity_id,reason,case_id,before_value,after_value)
 select 'system','approvals.superseded','approval',id::text,'Target binding introduced; existing proposal requires current review.',case_id,
  jsonb_build_object('status','pending'),jsonb_build_object('status','superseded') from changed;

alter function public.lumo_admin_service(text,jsonb) rename to lumo_admin_service_before_approval_controls;
alter function public.lumo_admin_service_before_approval_controls(text,jsonb) set schema lumo_private;
revoke all on function lumo_private.lumo_admin_service_before_approval_controls(text,jsonb) from public,anon,authenticated,service_role;

create function public.lumo_admin_service(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare checked jsonb;actor uuid;staff_role text;ident uuid;case_id uuid;request_key uuid;fingerprint jsonb;target text;target_version bigint;target_state jsonb;
 approval lumo_private.admin_approvals%rowtype;action_value text;reason text;decision text;expected bigint;result jsonb;rows jsonb;total bigint;pg integer;ps integer;status_value text;
begin
 if p_command not in('approvals.list','approvals.get','approvals.create','approvals.decide','approvals.cancel') then
  return lumo_private.lumo_admin_service_before_approval_controls(p_command,p_payload);
 end if;
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 checked:=lumo_private.lumo_admin_service_before_approval_controls('session',p_payload);
 if checked->>'ok' is distinct from 'true' then return checked;end if;
 actor:=(p_payload->>'actor')::uuid;staff_role:=checked#>>'{data,staff,role}';
 if lumo_private.admin_mfa_required() and (p_payload->>'aal' is distinct from 'aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=actor and f.factor_type='totp' and f.status='verified')) then return jsonb_build_object('ok',false,'code','MFA_REQUIRED');end if;
 if p_command in('approvals.create','approvals.decide','approvals.cancel') and staff_role='auditor' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 reason:=trim(coalesce(p_payload->>'reason',''));
 if p_command in('approvals.create','approvals.decide','approvals.cancel') and length(reason) not between 3 and 2000 then return jsonb_build_object('ok',false,'code','REASON_REQUIRED');end if;

 if p_command='approvals.list' then
  pg:=coalesce((p_payload->>'page')::integer,1);ps:=coalesce((p_payload->>'pageSize')::integer,25);
  if pg<1 or pg>100000 or ps<1 or ps>100 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select count(*) into total from lumo_private.admin_approvals a where nullif(p_payload->>'status','') is null or a.status=p_payload->>'status';
  select coalesce(jsonb_agg(lumo_private.admin_controlled_approval_json(x.id) order by x.created_at desc,x.id),'[]'::jsonb) into rows
   from(select a.id,a.created_at from lumo_private.admin_approvals a where nullif(p_payload->>'status','') is null or a.status=p_payload->>'status' order by a.created_at desc,a.id limit ps offset (pg-1)*ps)x;
  result:=jsonb_build_object('rows',rows,'total',total,'page',pg,'pageSize',ps);
 elsif p_command='approvals.get' then
  ident:=(p_payload->>'id')::uuid;select * into approval from lumo_private.admin_approvals a where a.id=ident;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  result:=jsonb_build_object('record',lumo_private.admin_controlled_approval_json(ident),'approval',lumo_private.admin_controlled_approval_json(ident),'case',lumo_private.admin_case_json(approval.case_id),
   'timeline',(select coalesce(jsonb_agg(jsonb_build_object('at',a.created_at,'event',a.action,'detail',a.reason,'source','admin_audit','status','recorded') order by a.created_at),'[]'::jsonb) from lumo_private.admin_audit a where a.entity_type='approval' and a.entity_id=ident::text));
 elsif p_command='approvals.create' then
  if exists(select 1 from jsonb_object_keys(p_payload) k where k not in('actor','session','aal','action','entityId','caseId','reason','requestId','targetRevision')) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  action_value:=p_payload->>'action';ident:=(p_payload->>'entityId')::uuid;case_id:=(p_payload->>'caseId')::uuid;request_key:=(p_payload->>'requestId')::uuid;
  if ident is null or case_id is null or request_key is null or action_value not in('account.suspend','account.restore','session.revoke','payment_link.disable') or not exists(select 1 from lumo_private.admin_cases c where c.id=case_id) then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  fingerprint:=jsonb_build_object('action',action_value,'entityId',ident,'caseId',case_id,'reason',reason,'targetRevision',p_payload->'targetRevision');
  perform pg_advisory_xact_lock(hashtextextended('admin-approval:'||actor::text||':'||request_key::text,21400));
  select * into approval from lumo_private.admin_approvals a where a.requested_by=actor and a.request_key=request_key;
  if found then
   if approval.request_fingerprint is distinct from fingerprint then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'data',jsonb_build_object('id',approval.id,'status',approval.status,'record',lumo_private.admin_controlled_approval_json(approval.id),'replayed',true));
  end if;
  target:=case when action_value='payment_link.disable' then 'payment_link' else 'account' end;
  perform pg_advisory_xact_lock(hashtextextended('admin-target:'||target||':'||ident::text,21400));
  select coalesce(v.revision,0) into target_version from (values(1))seed(n) left join lumo_private.admin_target_revisions v on v.target_type=target and v.entity_id=ident;
  target_state:=lumo_private.admin_target_snapshot(target,ident);
  if target_state is null then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  if p_payload ? 'targetRevision' and (p_payload->>'targetRevision')::bigint is distinct from target_version then return jsonb_build_object('ok',false,'code','STALE_APPROVAL');end if;
  insert into lumo_private.admin_approvals(action,entity_id,reason,case_id,requested_by,request_key,request_fingerprint,target_type,target_revision,target_state,expires_at)
   values(action_value,ident::text,reason,case_id,actor,request_key,fingerprint,target,target_version,target_state,clock_timestamp()+interval '24 hours') returning * into approval;
  perform lumo_private.admin_log(actor,staff_role,p_command,'approval',approval.id::text,reason,case_id,null,jsonb_build_object('action',action_value,'entityId',ident,'targetRevision',target_version,'expiresAt',approval.expires_at));
  result:=jsonb_build_object('id',approval.id,'status','pending','record',lumo_private.admin_controlled_approval_json(approval.id),'replayed',false);
 else
  ident:=(p_payload->>'id')::uuid;request_key:=(p_payload->>'requestId')::uuid;expected:=(p_payload->>'expectedRevision')::bigint;
  if ident is null or request_key is null or expected is null or expected<1 then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-decision:'||actor::text||':'||request_key::text,21400));
  if exists(select 1 from lumo_private.admin_approvals a where a.decided_by=actor and a.decision_key=request_key and a.id<>ident) then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
  select * into approval from lumo_private.admin_approvals a where a.id=ident;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
  -- Target first, then approval rows: parallel opposing decisions share one lock order.
  perform pg_advisory_xact_lock(hashtextextended('admin-target:'||coalesce(approval.target_type,'legacy')||':'||approval.entity_id,21400));
  select * into approval from lumo_private.admin_approvals a where a.id=ident for update;
  fingerprint:=jsonb_build_object('command',p_command,'decision',p_payload->>'decision','reason',reason,'expectedRevision',expected);
  if approval.decision_key=request_key then
   if approval.decided_by is distinct from actor or approval.decision_fingerprint is distinct from fingerprint then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
   return jsonb_build_object('ok',true,'data',jsonb_build_object('id',ident,'status',approval.status,'record',lumo_private.admin_controlled_approval_json(ident),'replayed',true));
  end if;
  if approval.status<>'pending' then return jsonb_build_object('ok',false,'code',case when approval.status='superseded' then 'STALE_APPROVAL' when approval.status='expired' then 'APPROVAL_EXPIRED' else 'ALREADY_DECIDED' end);end if;
  if approval.revision<>expected then return jsonb_build_object('ok',false,'code','STALE_APPROVAL');end if;
  if approval.action='payment.refund' or approval.target_type is null then return jsonb_build_object('ok',false,'code','APPROVAL_REQUIRED','message','Use the bounded financial workflow or re-propose this legacy action.');end if;
  if p_command='approvals.cancel' then
   if approval.requested_by<>actor and staff_role<>'super_admin' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
   status_value:='cancelled';
  else
   if staff_role not in('super_admin','risk','supervisor') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
   if approval.requested_by=actor then return jsonb_build_object('ok',false,'code','SELF_APPROVAL_FORBIDDEN');end if;
   decision:=p_payload->>'decision';if decision not in('approve','reject') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   if approval.expires_at<=clock_timestamp() then
    update lumo_private.admin_approvals set status='expired',revision=revision+1,result=jsonb_build_object('code','APPROVAL_EXPIRED') where id=ident;
    perform lumo_private.admin_log(actor,staff_role,'approvals.expired','approval',ident::text,reason,approval.case_id,jsonb_build_object('status','pending'),jsonb_build_object('status','expired'));
    return jsonb_build_object('ok',false,'code','APPROVAL_EXPIRED');
   end if;
   if decision='reject' then status_value:='rejected';
   else
    select coalesce(v.revision,0) into target_version from (values(1))seed(n) left join lumo_private.admin_target_revisions v on v.target_type=approval.target_type and v.entity_id::text=approval.entity_id;
    target_state:=lumo_private.admin_target_snapshot(approval.target_type,approval.entity_id::uuid);
    if target_version is distinct from approval.target_revision or target_state is distinct from approval.target_state then
     update lumo_private.admin_approvals set status='superseded',revision=revision+1,result=jsonb_build_object('code','STALE_APPROVAL') where id=ident;
     perform lumo_private.admin_log(actor,staff_role,'approvals.superseded','approval',ident::text,reason,approval.case_id,jsonb_build_object('status','pending'),jsonb_build_object('status','superseded'));
     return jsonb_build_object('ok',false,'code','STALE_APPROVAL');
    end if;
    if approval.action in('account.suspend','account.restore') then
     update lumo_private.profiles set status=case when approval.action='account.suspend' then 'suspended' else 'active' end where user_id::text=approval.entity_id;
     if approval.action='account.suspend' then delete from auth.sessions where user_id::text=approval.entity_id;end if;
    elsif approval.action='session.revoke' then
     delete from auth.sessions where user_id::text=approval.entity_id;
     update lumo_private.approved_devices set revoked_at=clock_timestamp() where user_id::text=approval.entity_id and revoked_at is null;
     insert into lumo_private.admin_target_revisions(target_type,entity_id,revision) values('account',approval.entity_id::uuid,1) on conflict(target_type,entity_id) do update set revision=admin_target_revisions.revision+1,updated_at=clock_timestamp();
    else
     update lumo_private.merchant_payment_links set revoked_at=coalesce(revoked_at,clock_timestamp()) where id::text=approval.entity_id;
    end if;
    status_value:='executed';
    with superseded as(update lumo_private.admin_approvals set status='superseded',revision=revision+1,result=jsonb_build_object('code','STALE_APPROVAL','supersededBy',ident)
     where id<>ident and status='pending' and target_type=approval.target_type and entity_id=approval.entity_id returning id,case_id)
    insert into lumo_private.admin_audit(actor_id,actor_role,action,entity_type,entity_id,reason,case_id,before_value,after_value)
     select actor,staff_role,'approvals.superseded','approval',s.id::text,'A newer reviewed action changed the target.',s.case_id,jsonb_build_object('status','pending'),jsonb_build_object('status','superseded','supersededBy',ident) from superseded s;
   end if;
  end if;
  update lumo_private.admin_approvals set status=status_value,revision=revision+1,decided_by=actor,decision_reason=reason,decided_at=clock_timestamp(),
   decision_key=request_key,decision_fingerprint=fingerprint,result=jsonb_build_object('status',status_value,'moneyMoved',false) where id=ident;
  perform lumo_private.admin_log(actor,staff_role,p_command,'approval',ident::text,reason,approval.case_id,jsonb_build_object('status','pending','targetRevision',approval.target_revision),jsonb_build_object('status',status_value,'action',approval.action,'entityId',approval.entity_id));
  result:=jsonb_build_object('id',ident,'status',status_value,'record',lumo_private.admin_controlled_approval_json(ident),'replayed',false);
 end if;
 if p_command in('approvals.list','approvals.get') then perform lumo_private.admin_log(actor,staff_role,p_command,'approval',p_payload->>'id');end if;
 return jsonb_build_object('ok',true,'data',result);
exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation or check_violation or foreign_key_violation then
 return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function lumo_private.admin_target_version_changed(),lumo_private.admin_target_snapshot(text,uuid),lumo_private.admin_controlled_approval_json(uuid) from public,anon,authenticated,service_role;
revoke all on function public.lumo_admin_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_admin_service(text,jsonb) to service_role;
