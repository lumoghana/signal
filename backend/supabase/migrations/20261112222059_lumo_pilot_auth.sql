-- Controlled, bank-free handle/password test-account provisioning. No real contact is verified.
-- This RPC is available only to the Edge Function's server-held service role credential.
create table lumo_private.pilot_auth_rates (
 scope text not null,
 key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,
 attempts integer not null check (attempts>0),
 primary key(scope,key_hash,window_start)
);
create table lumo_private.pilot_registrations (
 handle text primary key check (handle ~ '^[a-z][a-z0-9_]{2,29}$'),
 registration_id uuid not null unique default gen_random_uuid(),
 user_id uuid,
 state text not null default 'reserved' check (state in ('reserved','provisioned','complete')),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default (clock_timestamp()+interval '5 minutes')
);
create index lumo_pilot_registrations_user on lumo_private.pilot_registrations(user_id) where user_id is not null;
alter table lumo_private.pilot_auth_rates enable row level security;
alter table lumo_private.pilot_registrations enable row level security;
revoke all on lumo_private.pilot_auth_rates,lumo_private.pilot_registrations from public,anon,authenticated,service_role;

create function lumo_private.pilot_rate_take(p_scope text,p_hash text,p_seconds integer,p_limit integer) returns boolean language plpgsql set search_path='' as $$
declare bucket timestamptz; used integer;
begin
 bucket:=to_timestamp(floor(extract(epoch from clock_timestamp())/p_seconds)*p_seconds);
 insert into lumo_private.pilot_auth_rates(scope,key_hash,window_start,attempts) values(p_scope,p_hash,bucket,1)
 on conflict(scope,key_hash,window_start) do update set attempts=pilot_auth_rates.attempts+1 returning attempts into used;
 return used<=p_limit;
end $$;

create function lumo_private.pilot_bootstrap(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_handle text; ip_hash text; handle_hash text; global_hash text:=encode(extensions.digest('lumo-pilot-auth-global','sha256'),'hex');
 registration lumo_private.pilot_registrations%rowtype; auth_user uuid; profile_user uuid; supplied_user uuid; supplied_registration uuid; mode text;
begin
 -- Bootstrap is deliberately a service operation, not a user command. Its trusted JWT role is
 -- checked in addition to SQL EXECUTE grants. User-editable metadata never grants this role.
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'handle') is distinct from 'string' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 v_handle:=p_payload->>'handle';if v_handle !~ '^[a-z][a-z0-9_]{2,29}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if p_action not in ('login.check','register.reserve','register.bind','register.complete','register.abort') or p_action is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 -- One short-lived global lock makes limit consumption and handle reservation atomic.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lumo-pilot-auth-bootstrap',7469));
 if p_action in ('login.check','register.reserve') then
  if jsonb_typeof(p_payload->'ipHash') is distinct from 'string' or (p_payload->>'ipHash') !~ '^[a-f0-9]{64}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  ip_hash:=p_payload->>'ipHash';handle_hash:=encode(extensions.digest(v_handle,'sha256'),'hex');
  delete from lumo_private.pilot_auth_rates where window_start<clock_timestamp()-interval '2 days';
  -- The global ceiling remains authoritative even when a client IP cannot be reliably identified.
  if not lumo_private.pilot_rate_take('all.global',global_hash,900,2000) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  -- Registration resume also checks a password; both routes share this account quota.
  if not lumo_private.pilot_rate_take('credential.handle',handle_hash,900,15) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  if p_action='login.check' then
   if not lumo_private.pilot_rate_take('login.ip',ip_hash,900,60) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
   return jsonb_build_object('ok',true);
  end if;
  if not lumo_private.pilot_rate_take('register.ip',ip_hash,3600,50) or not lumo_private.pilot_rate_take('register.global',global_hash,3600,500) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  select u.id into auth_user from auth.users u where u.email=v_handle||'@pilot.lumo.invalid' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false);
  select p.user_id into profile_user from lumo_private.profiles p where p.handle=v_handle;
  if profile_user is not null and profile_user is distinct from auth_user then return jsonb_build_object('ok',false,'code','HANDLE_UNAVAILABLE');end if;
  select * into registration from lumo_private.pilot_registrations r where r.handle=v_handle for update;
  if auth_user is null and registration.handle is not null and registration.expires_at>clock_timestamp() then return jsonb_build_object('ok',false,'code','REGISTRATION_PENDING');end if;
  if auth_user is null and (select count(*) from lumo_private.pilot_registrations where state='complete' or expires_at>clock_timestamp())>=1000 then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  mode:=case when auth_user is null then 'new' else 'resume' end;
  insert into lumo_private.pilot_registrations(handle,user_id,state) values(v_handle,auth_user,case when profile_user=auth_user then 'complete' when auth_user is not null then 'provisioned' else 'reserved' end)
  on conflict(handle) do update set registration_id=case when pilot_registrations.user_id=excluded.user_id and pilot_registrations.expires_at>clock_timestamp() then pilot_registrations.registration_id else gen_random_uuid() end,user_id=excluded.user_id,state=excluded.state,expires_at=clock_timestamp()+interval '5 minutes'
  returning * into registration;
  return jsonb_build_object('ok',true,'registrationId',registration.registration_id,'mode',mode);
 end if;
 begin
  if jsonb_typeof(p_payload->'registrationId') is distinct from 'string' then raise invalid_text_representation;end if;
  supplied_registration:=(p_payload->>'registrationId')::uuid;
  if p_action<>'register.abort' then
   if jsonb_typeof(p_payload->'userId') is distinct from 'string' then raise invalid_text_representation;end if;
   supplied_user:=(p_payload->>'userId')::uuid;
  end if;
 exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end;
 select * into registration from lumo_private.pilot_registrations r where r.handle=v_handle and r.registration_id=supplied_registration for update;
 if not found then return jsonb_build_object('ok',false,'code','RESERVATION_CHANGED');end if;
 select u.id into auth_user from auth.users u where u.email=v_handle||'@pilot.lumo.invalid' and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false);
 if p_action='register.abort' then
  if auth_user is null and not exists(select 1 from lumo_private.profiles p where p.handle=v_handle) then delete from lumo_private.pilot_registrations where handle=v_handle;end if;
  return jsonb_build_object('ok',true,'identityPresent',auth_user is not null);
 end if;
 if auth_user is distinct from supplied_user or registration.user_id is not null and registration.user_id<>supplied_user then return jsonb_build_object('ok',false,'code','RESERVATION_CHANGED');end if;
 if p_action='register.bind' then
  if registration.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'code','RESERVATION_EXPIRED');end if;
  update lumo_private.pilot_registrations set user_id=supplied_user,state=case when state='complete' then state else 'provisioned' end where handle=v_handle;
 elsif p_action='register.complete' then
  if not exists(select 1 from lumo_private.profiles p join lumo_private.accounts a on a.owner_user_id=p.user_id and a.kind='consumer' where p.user_id=supplied_user and p.handle=v_handle) then return jsonb_build_object('ok',false,'code','ACCOUNT_REQUIRED');end if;
  update lumo_private.pilot_registrations set user_id=supplied_user,state='complete' where handle=v_handle;
 end if;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function lumo_private.pilot_rate_take(text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function lumo_private.pilot_bootstrap(text,jsonb) from public,anon,authenticated;
grant usage on schema lumo_private to service_role;
grant execute on function lumo_private.pilot_bootstrap(text,jsonb) to service_role;
create function public.lumo_pilot_bootstrap(p_action text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select lumo_private.pilot_bootstrap(p_action,p_payload);
$$;
revoke all on function public.lumo_pilot_bootstrap(text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_pilot_bootstrap(text,jsonb) to service_role;
comment on function public.lumo_pilot_bootstrap(text,jsonb) is 'Server-only pilot Auth reservation and abuse limits. Never grants funds or verifies a real email, phone or identity.';

-- A regular Supabase email signup must not bypass the pilot registration limits. Only identities
-- provisioned by the server's admin path carry this app_metadata flag; user_metadata is ignored.
create function lumo_private.pilot_command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null then return lumo_private.failure('AUTH_REQUIRED','Sign in to Lumo before continuing.',false);end if;
 if not exists(select 1 from auth.users u where u.id=actor and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb) then
  return lumo_private.failure('PILOT_REQUIRED','Create your test account through the connected Lumo pilot.',false);
 end if;
 return lumo_private.command(p_command,p_payload);
end $$;
revoke all on function lumo_private.command(text,jsonb) from authenticated;
revoke all on function lumo_private.pilot_command(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function lumo_private.pilot_command(text,jsonb) to authenticated;
create or replace function public.lumo_rpc(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select lumo_private.pilot_command(p_command,p_payload);
$$;
revoke all on function public.lumo_rpc(text,jsonb) from public,anon;
grant execute on function public.lumo_rpc(text,jsonb) to authenticated;
