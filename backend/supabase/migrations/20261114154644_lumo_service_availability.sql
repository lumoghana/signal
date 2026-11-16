-- Shared operational controls. All current money paths remain test-money paths.
create table lumo_private.service_availability (
 id text primary key, name text not null, provider_mode text not null check(provider_mode in('internal_test','sandbox','unavailable')),
 health_source text not null default 'shared_gateway', mode text not null default 'automatic' check(mode in('automatic','manual_off')),
 circuit text not null default 'healthy' check(circuit in('healthy','open','recovering')),
 public_message text not null default 'This payment option is temporarily unavailable. Please use another method or try again later.',
 internal_reason text, scheduled_start timestamptz, scheduled_end timestamptz,
 window_started timestamptz not null default now(), observations integer not null default 0, failures integer not null default 0,
 recovery_successes integer not null default 0, opened_at timestamptz, last_checked_at timestamptz, updated_at timestamptz not null default now(), updated_by uuid,
 check((scheduled_start is null and scheduled_end is null) or (scheduled_start is not null and scheduled_end>scheduled_start))
);
alter table lumo_private.service_availability enable row level security;
revoke all on lumo_private.service_availability from public,anon,authenticated;
insert into lumo_private.service_availability(id,name,provider_mode) values
 ('lumo_transfer','Lumo transfers','internal_test'),('merchant_payment','Campus merchant payments','internal_test'),
 ('test_funding','Add test money','internal_test'),('momo_send','MoMo transfers · sandbox','sandbox'),('bank_send','Bank transfers · sandbox','sandbox'),
 ('momo_collection','Guest MoMo collections · sandbox','sandbox'),
 ('momo_send_mtn','MTN MoMo transfers · sandbox','sandbox'),('momo_send_telecel','Telecel transfers · sandbox','sandbox'),('momo_send_at','AT Money transfers · sandbox','sandbox'),
 ('momo_collection_mtn','MTN guest collections · sandbox','sandbox'),('momo_collection_telecel','Telecel guest collections · sandbox','sandbox'),('momo_collection_at','AT Money guest collections · sandbox','sandbox');

create function lumo_private.service_json(s lumo_private.service_availability, p_internal boolean default false)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('serviceId',s.id,'id',s.id,'name',s.name,'mode',s.mode,
 'status',case when s.mode='manual_off' then 'manual_off' when s.scheduled_start<=now() and now()<s.scheduled_end then 'maintenance' when s.provider_mode='unavailable' then 'unavailable' else s.circuit end,
 'available',s.mode='automatic' and not coalesce(s.scheduled_start<=now() and now()<s.scheduled_end,false) and s.provider_mode<>'unavailable' and s.circuit='healthy',
 'providerMode',s.provider_mode,'healthSource',s.health_source,
 'message',case when s.mode='manual_off' or coalesce(s.scheduled_start<=now() and now()<s.scheduled_end,false) or s.circuit<>'healthy' or s.provider_mode='unavailable' then s.public_message else '' end,
 'lastCheckedAt',s.last_checked_at,'updatedAt',s.updated_at,'scheduledStart',s.scheduled_start,'scheduledEnd',s.scheduled_end,
 'liveProviderConnected',false)
 || case when p_internal then jsonb_build_object('reason',s.internal_reason,'observations',s.observations,'failures',s.failures,'recoverySuccesses',s.recovery_successes,'openedAt',s.opened_at,'updatedBy',s.updated_by,
 'healthExplanation','Checks cover the shared gateway and persistence. No live bank or MoMo API is connected.') else '{}'::jsonb end;
$$;
revoke all on function lumo_private.service_json(lumo_private.service_availability,boolean) from public,anon,authenticated;

create function public.lumo_service_status(p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 -- A successful call verifies the gateway-to-persistence path only. Spaced,
 -- non-financial probes allow recovery without sending a payment to test health.
 if p_payload->>'probe'='true' then
  update lumo_private.service_availability set
   recovery_successes=case when circuit<>'healthy' then recovery_successes+1 else 0 end,
   circuit=case when circuit<>'healthy' and recovery_successes>=2 then 'healthy' when circuit<>'healthy' then 'recovering' else 'healthy' end,
   opened_at=case when circuit<>'healthy' and recovery_successes>=2 then null else opened_at end,
   failures=case when circuit<>'healthy' and recovery_successes>=2 then 0 else failures end,
   last_checked_at=clock_timestamp()
  where provider_mode<>'unavailable' and (not p_payload ? 'probeServices' or id in(select jsonb_array_elements_text(p_payload->'probeServices'))) and (last_checked_at is null or last_checked_at<clock_timestamp()-interval '15 seconds')
    and (circuit='healthy' or opened_at<clock_timestamp()-interval '30 seconds');
 end if;
 select coalesce(jsonb_agg(lumo_private.service_json(s,false) order by s.id),'[]'::jsonb) into rows from lumo_private.service_availability s;
 return jsonb_build_object('ok',true,'sandbox',true,'checkedAt',clock_timestamp(),'services',rows);
end $$;
revoke all on function public.lumo_service_status(jsonb) from public,anon,authenticated;
grant execute on function public.lumo_service_status(jsonb) to service_role;

create function public.lumo_service_observe(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s lumo_private.service_availability%rowtype; bad boolean;fresh boolean;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_payload->>'outcome' not in('success','infrastructure_failure') then return jsonb_build_object('ok',true,'ignored',true);end if;
 select * into s from lumo_private.service_availability where id=p_payload->>'serviceId' for update;
 if not found then return jsonb_build_object('ok',false,'code','SERVICE_UNKNOWN');end if;
 bad:=p_payload->>'outcome'='infrastructure_failure';fresh:=s.window_started<clock_timestamp()-interval '60 seconds';
 s.observations:=case when fresh then 1 else s.observations+1 end;
 s.failures:=case when fresh then bad::integer else s.failures+bad::integer end;
 if fresh then s.window_started:=clock_timestamp();end if;
 -- Business validation errors never reach this function as infrastructure failures.
 if bad then
  s.recovery_successes:=0;
  if s.circuit<>'healthy' or s.failures>=3 and s.observations>=5 then s.circuit:='open';s.opened_at:=clock_timestamp();end if;
 end if;
 update lumo_private.service_availability set observations=s.observations,failures=s.failures,window_started=s.window_started,circuit=s.circuit,opened_at=s.opened_at,recovery_successes=s.recovery_successes,last_checked_at=clock_timestamp() where id=s.id;
 return jsonb_build_object('ok',true,'data',lumo_private.service_json(s,false));
end $$;
revoke all on function public.lumo_service_observe(jsonb) from public,anon,authenticated;
grant execute on function public.lumo_service_observe(jsonb) to service_role;

create function lumo_private.require_service(p_id text)
returns void language plpgsql set search_path='' as $$
declare s lumo_private.service_availability%rowtype;
begin
 -- Share locks prevent a completed manual shutdown racing a new ledger commit.
 select * into s from lumo_private.service_availability where id=p_id for share;
 if not found or s.mode='manual_off' or s.provider_mode='unavailable' or s.circuit<>'healthy'
  or coalesce(s.scheduled_start<=clock_timestamp() and clock_timestamp()<s.scheduled_end,false)
 then raise exception using errcode='P0001',message='SERVICE_PAUSED';end if;
end $$;
revoke all on function lumo_private.require_service(text) from public,anon,authenticated;

create function lumo_private.service_ledger_guard()
returns trigger language plpgsql set search_path='' as $$
declare kind text;network text;
begin
 if tg_table_name='guest_momo_attempts' then
  perform lumo_private.require_service('merchant_payment');perform lumo_private.require_service('momo_collection');
  network:=case new.network when 'airteltigo' then 'at' else new.network end;
  perform lumo_private.require_service('momo_collection_'||network);return new;
 end if;
 if tg_table_name='journals' then
  if new.type='test_funding' then perform lumo_private.require_service('test_funding');end if;
  if new.type in('transfer','iou_payment') then perform lumo_private.require_service('lumo_transfer');end if;
  -- Guest confirmations started before an outage remain resolvable. Their
  -- initiation was checked above; refunds/reversals are never blocked here.
  if new.type='merchant_payment' and not exists(select 1 from lumo_private.guest_momo_attempts a where a.id=current_setting('lumo.guest.posting_attempt',true) and a.status='pending' and a.provider_status='approved' and a.amount=new.amount and a.shop_id=new.shop_id) then perform lumo_private.require_service('merchant_payment');end if;
  return new;
 end if;
 select j.type into kind from lumo_private.journals j where j.id=new.journal_id;
 if kind='external_simulation' then
  if new.metadata->>'rail'='bank' then perform lumo_private.require_service('bank_send');
  elsif new.metadata->>'rail'='momo' then
   perform lumo_private.require_service('momo_send');
   network:=case lower(new.metadata#>>'{recipient,network}') when 'mtn momo' then 'mtn' when 'telecel cash' then 'telecel' when 'at money' then 'at' else null end;
   if network is not null then perform lumo_private.require_service('momo_send_'||network);end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function lumo_private.service_ledger_guard() from public,anon,authenticated;
create trigger service_new_journal_guard before insert on lumo_private.journals for each row execute function lumo_private.service_ledger_guard();
create trigger service_new_guest_guard before insert on lumo_private.guest_momo_attempts for each row execute function lumo_private.service_ledger_guard();
create trigger service_new_posting_guard before insert on lumo_private.approved_postings for each row execute function lumo_private.service_ledger_guard();
create function lumo_private.admin_services(p_command text,p_payload jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare s lumo_private.service_availability%rowtype;before_value jsonb;after_value jsonb;rows jsonb;actor uuid;v_role text;v_session uuid;
begin
 actor:=(p_payload->>'actor')::uuid;v_session:=(p_payload->>'session')::uuid;
 select role into v_role from lumo_private.admin_staff where user_id=actor and status='active';
 if v_role is null or not exists(select 1 from auth.sessions where id=v_session and user_id=actor) or p_payload->>'aal'<>'aal2' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_command='services.list' then
  select coalesce(jsonb_agg(lumo_private.service_json(a,true) order by a.id),'[]'::jsonb) into rows from lumo_private.service_availability a;
  return jsonb_build_object('ok',true,'data',jsonb_build_object('rows',rows,'total',jsonb_array_length(rows),'page',1,'pageSize',100));
 end if;
 if v_role not in('technical','super_admin','supervisor') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if p_command not in('services.update','services.schedule') then return jsonb_build_object('ok',false,'code','UNKNOWN_COMMAND');end if;
 if char_length(trim(coalesce(p_payload->>'reason','')))<5 or char_length(p_payload->>'reason')>1000 or char_length(coalesce(p_payload->>'message',''))>300 then return jsonb_build_object('ok',false,'code','INVALID_INPUT','message','Enter a reason of 5–1,000 characters and a public message up to 300 characters.');end if;
 select * into s from lumo_private.service_availability where id=coalesce(p_payload->>'serviceId',p_payload->>'id') for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND');end if;
 before_value:=lumo_private.service_json(s,true);
 if p_command='services.update' then
  if p_payload->>'mode' not in('automatic','manual_off') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  s.mode:=p_payload->>'mode';
 else
  s.scheduled_start:=nullif(p_payload->>'scheduledStart','')::timestamptz;s.scheduled_end:=nullif(p_payload->>'scheduledEnd','')::timestamptz;
  if s.scheduled_start is null and s.scheduled_end is not null or s.scheduled_start is not null and (s.scheduled_end is null or s.scheduled_end<=s.scheduled_start or s.scheduled_end>clock_timestamp()+interval '366 days') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 end if;
 s.internal_reason:=trim(p_payload->>'reason');s.public_message:=coalesce(nullif(trim(p_payload->>'message'),''),s.public_message);
 update lumo_private.service_availability set mode=s.mode,public_message=s.public_message,internal_reason=s.internal_reason,scheduled_start=s.scheduled_start,scheduled_end=s.scheduled_end,updated_at=clock_timestamp(),updated_by=actor where id=s.id returning * into s;
 after_value:=lumo_private.service_json(s,true);
 perform lumo_private.admin_log(actor,v_role,p_command,'service',s.id,s.internal_reason,null,before_value,after_value);
 return jsonb_build_object('ok',true,'data',after_value);
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;
revoke all on function lumo_private.admin_services(text,jsonb) from public,anon,authenticated;

-- Preserve the guest RPC's rollback contract while surfacing the known outage
-- code. The existing function keeps all signature checks and grants unchanged.
do $$
declare source text; updated text;
begin
 source:=pg_get_functiondef('public.lumo_guest_checkout(text,jsonb)'::regprocedure);
 if position('''SERVICE_PAUSED''' in source)=0 then
  updated:=replace(source,'''PROVIDER_UNAVAILABLE'') then SQLERRM','''PROVIDER_UNAVAILABLE'',''SERVICE_PAUSED'') then SQLERRM');
  if source=updated then raise exception 'Guest error mapping changed: review before installing availability controls';end if;
  execute updated;
 end if;
end $$;
