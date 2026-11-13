-- A one-time repair for legacy test accounts whose repeated setup ignored a new PIN.
-- This is not production credential recovery and never resets a PIN administratively.
create table lumo_private.approved_pin_repairs (
 user_id uuid primary key references auth.users(id),
 session_id uuid not null, proof_session_id uuid not null,
 repaired_at timestamptz not null default clock_timestamp()
);
create table lumo_private.approved_pin_repair_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id), session_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '2 minutes',
 consumed_at timestamptz
);
alter table lumo_private.approved_pin_repairs enable row level security;
alter table lumo_private.approved_pin_repair_attempts enable row level security;
revoke all on lumo_private.approved_pin_repairs,lumo_private.approved_pin_repair_attempts from public,anon,authenticated,service_role;

create function lumo_private.approved_pin_repair_eligible(p_actor uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from auth.users u join lumo_private.profiles p on p.user_id=u.id
 join lumo_private.approved_profiles ap on ap.user_id=u.id
 join lumo_private.accounts a on a.owner_user_id=u.id and a.kind='consumer' and a.status='active'
 where u.id=p_actor and p.status='active' and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb
 and u.raw_app_meta_data->'lumo_approved_password' is distinct from 'true'::jsonb
 and not exists(select 1 from lumo_private.approved_states s where s.user_id=u.id and s.state#>>'{account,status}'='closed')
 and not exists(select 1 from lumo_private.approved_pin_repairs r where r.user_id=u.id));
$$;

create function lumo_private.approved_pin_repair(p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;session uuid;proof_session uuid;request_id uuid;
 attempt lumo_private.approved_pin_repair_attempts%rowtype;new_pin text;rate_hash text;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 begin actor:=(p_payload->>'actor')::uuid;session:=(p_payload->>'session')::uuid;
 exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end;
 if not lumo_private.approved_live(actor,session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if p_command='status' then return jsonb_build_object('ok',true,'testOnly',true,
  'eligible',lumo_private.approved_pin_repair_eligible(actor),
  'repaired',exists(select 1 from lumo_private.approved_pin_repairs r where r.user_id=actor));end if;
 if p_command not in('begin','commit') or p_command is null then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,4271));
 perform 1 from lumo_private.profiles p where p.user_id=actor for no key update;
 if not lumo_private.approved_pin_repair_eligible(actor) then return jsonb_build_object('ok',false,'code','PIN_REPAIR_UNAVAILABLE');end if;
 if p_command='begin' then
  rate_hash:=encode(extensions.digest(actor::text,'sha256'),'hex');
  if not lumo_private.pilot_rate_take('pin.repair.user',rate_hash,900,5) then return jsonb_build_object('ok',false,'code','RATE_LIMITED');end if;
  insert into lumo_private.approved_pin_repair_attempts(user_id,session_id) values(actor,session) returning * into attempt;
  return jsonb_build_object('ok',true,'requestId',attempt.id,'expiresAt',attempt.expires_at);
 end if;
 begin request_id:=(p_payload->>'requestId')::uuid;proof_session:=(p_payload->>'proofSession')::uuid;
 exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end;
 new_pin:=p_payload->>'newPin';
 if jsonb_typeof(p_payload->'newPin') is distinct from 'string' or new_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 select * into attempt from lumo_private.approved_pin_repair_attempts r
 where r.id=request_id and r.user_id=actor and r.session_id=session for update;
 if not found or attempt.consumed_at is not null or attempt.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'code','PIN_REPAIR_EXPIRED');end if;
 -- The Edge gateway obtains this new Auth session only by checking the CURRENT password.
 -- An arbitrary old session, another owner, or the original caller session is never proof.
 if proof_session=session or not lumo_private.approved_live(actor,proof_session)
  or not exists(select 1 from auth.sessions s where s.id=proof_session and s.user_id=actor and s.created_at>=attempt.created_at and s.created_at<=clock_timestamp()) then
  return jsonb_build_object('ok',false,'code','PIN_REPAIR_EXPIRED');end if;
 if not lumo_private.approved_live(actor,session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 if not lumo_private.approved_pin_repair_eligible(actor) then return jsonb_build_object('ok',false,'code','PIN_REPAIR_UNAVAILABLE');end if;
 update lumo_private.profiles set pin_hash=extensions.crypt(new_pin,extensions.gen_salt('bf',10)),pin_failures=0,pin_locked_until=null where user_id=actor;
 update lumo_private.approved_pin_repair_attempts set consumed_at=clock_timestamp() where id=request_id;
 insert into lumo_private.approved_pin_repairs(user_id,session_id,proof_session_id) values(actor,session,proof_session);
 update lumo_private.approved_devices set revoked_at=clock_timestamp() where user_id=actor and revoked_at is null;
 update lumo_private.approved_challenges set consumed_at=clock_timestamp() where user_id=actor and consumed_at is null;
 perform lumo_private.notify_user(actor,'security.pin_repaired','Test transaction PIN repaired',
  'Your legacy test PIN was repaired after checking your current sign-in password. Use your new PIN to register biometric approvals again.','account',null);
 return jsonb_build_object('ok',true,'repaired',true,'testOnly',true);
end $$;

revoke all on function lumo_private.approved_pin_repair_eligible(uuid),lumo_private.approved_pin_repair(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function lumo_private.approved_pin_repair(text,jsonb) to service_role;
create function public.lumo_approved_pin_repair(p_command text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select lumo_private.approved_pin_repair(p_command,p_payload);
$$;
revoke all on function public.lumo_approved_pin_repair(text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_approved_pin_repair(text,jsonb) to service_role;

-- Repeating signup must not claim that a newly entered PIN replaced an existing one.
-- Patch the current guarded service, retaining all later ledger/session hardening.
do $resume$ declare source text;needle text;
begin
 source:=pg_get_functiondef('lumo_private.approved_service(text,jsonb)'::regprocedure);
 needle:='elsif v_profile.handle<>v_handle then return jsonb_build_object(''ok'',false,''code'',''ACCOUNT_UNAVAILABLE'');end if;';
 if strpos(source,needle)=0 then raise exception 'Expected approved provision guard is missing';end if;
 execute replace(source,needle,'elsif v_profile.handle<>v_handle then return jsonb_build_object(''ok'',false,''code'',''ACCOUNT_UNAVAILABLE'');else return jsonb_build_object(''ok'',false,''code'',''EXISTING_ACCOUNT'');end if;');
end $resume$;
