-- Sandbox-only provider simulation with real account-bound recovery authority.
-- No provider simulation by itself establishes phone ownership or face identity.
create table lumo_private.access_enrollments (
 module text not null check(module in ('consumer','merchant','admin')),
 user_id uuid not null references auth.users(id),revision bigint not null default 1 check(revision>0),
 phone text not null,reference_id uuid not null,face_digests jsonb not null,
 capability_hash text check(capability_hash is null or capability_hash ~ '^[a-f0-9]{64}$'),key_reference uuid,
 environment text not null default 'sandbox' check(environment='sandbox'),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 primary key(module,user_id)
);
create table lumo_private.access_requests (
 id uuid primary key,module text not null check(module in ('consumer','merchant','admin')),
 purpose text not null check(purpose in ('enrollment','recovery')),method text not null check(method in ('sms','face','key')),
 user_id uuid references auth.users(id),auth_session uuid,identifier text,
 enrollment_revision bigint not null default 0,phone text,reference_id uuid not null,face_digests jsonb,
 otp_hash text check(otp_hash is null or otp_hash ~ '^[a-f0-9]{64}$'),attempts integer not null default 0 check(attempts>=0),
 state text not null default 'pending' check(state in ('pending','verified','applying','completed','locked','superseded')),
 reset_token_hash text check(reset_token_hash is null or reset_token_hash ~ '^[a-f0-9]{64}$'),password_fingerprint text,
 capability_hash text,key_reference uuid,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',
 verified_at timestamptz,applying_at timestamptz,completed_at timestamptz,
 environment text not null default 'sandbox' check(environment='sandbox')
);
create index access_request_owner on lumo_private.access_requests(module,user_id,created_at desc);
create index access_request_identifier on lumo_private.access_requests(module,identifier,created_at desc) where purpose='recovery';
create unique index access_one_applying on lumo_private.access_requests(user_id) where state='applying';
create table lumo_private.access_rates(key text primary key,started_at timestamptz not null,attempts integer not null);
create table lumo_private.access_credential_writes(
 user_id uuid primary key references auth.users(id),claim_id uuid not null unique,module text not null check(module in('consumer','merchant','admin')),
 auth_session uuid not null,password_fingerprint text not null check(password_fingerprint ~ '^[a-f0-9]{64}$'),
 state text not null check(state in('applying','completed')),created_at timestamptz not null default clock_timestamp(),completed_at timestamptz
);
create table lumo_private.access_audit(
 id uuid primary key default gen_random_uuid(),module text not null,user_id uuid references auth.users(id),request_id uuid,
 action text not null,environment text not null default 'sandbox' check(environment='sandbox'),
 created_at timestamptz not null default clock_timestamp()
);
do $lock$ declare t text;begin
 foreach t in array array['access_enrollments','access_requests','access_rates','access_credential_writes','access_audit'] loop
  execute format('alter table lumo_private.%I enable row level security',t);
  execute format('revoke all on lumo_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $lock$;
create trigger access_audit_immutable before update or delete on lumo_private.access_audit for each row execute function lumo_private.immutable_posting();

create function lumo_private.access_face_digests(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p)='array' then case when jsonb_array_length(p)=3 then
  not exists(select 1 from jsonb_array_elements(p) d where jsonb_typeof(d)<>'string' or d#>>'{}' !~ '^[a-f0-9]{64}$')
  and (select count(distinct d#>>'{}')=3 from jsonb_array_elements(p) d)
 else false end else false end;
$$;
create function lumo_private.access_phone(p text) returns text language sql immutable set search_path='' as $$
 select case when v ~ '^0[25][0-9]{8}$' then '+233'||substr(v,2) when v ~ '^233[25][0-9]{8}$' then '+'||v when v ~ '^\+233[25][0-9]{8}$' then v else null end
 from (select regexp_replace(coalesce(p,''),'[ ()-]','','g') v) x;
$$;
create function lumo_private.access_account_allowed(p_module text,p_user uuid) returns boolean language plpgsql stable set search_path='' as $$
declare allowed boolean:=false;
begin
 if p_module not in ('consumer','merchant','admin') or not exists(select 1 from auth.users u where u.id=p_user and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false)) then return false;end if;
 if p_module='admin' then
  return exists(select 1 from lumo_private.admin_staff s join auth.users u on u.id=s.user_id where s.user_id=p_user and s.status='active' and u.raw_app_meta_data->'lumo_admin'='true'::jsonb);
 end if;
 if not exists(select 1 from auth.users u join lumo_private.profiles p on p.user_id=u.id where u.id=p_user and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb and p.status='active') then return false;end if;
 if p_module='consumer' then return exists(select 1 from lumo_private.approved_profiles p where p.user_id=p_user and p.personal_account);end if;
 -- Tenant installations inspect the current own record, never the frozen legacy source.
 if to_regclass('lumo_private.merchant_user_bindings') is not null then
  execute 'select exists(select 1 from lumo_private.merchant_user_bindings b join lumo_private.merchant_runtimes r on r.merchant_id=b.merchant_id join lumo_private.merchants m on m.id=b.merchant_id cross join lateral jsonb_array_elements(coalesce(r.document->''users'',''[]''::jsonb)) u where b.shared_user_id=$1 and u->>''id''=b.user_id and u->>''_sharedUserId''=$1::text and u->>''active''=''true'' and m.status=''active'')' into allowed using p_user;
 else
  select exists(select 1 from lumo_private.approved_merchant_network n cross join lateral jsonb_array_elements(coalesce(n.document->'users','[]'::jsonb)) u join lumo_private.merchants m on m.id::text=u->>'businessId' where u->>'_sharedUserId'=p_user::text and u->>'active'='true' and m.status='active') into allowed;
 end if;
 return allowed;
end $$;
create function lumo_private.access_registered_phone(p_module text,p_user uuid) returns text language plpgsql stable set search_path='' as $$
declare value text;
begin
 select lumo_private.access_phone(p.phone) into value from lumo_private.approved_profiles p where p.user_id=p_user;
 if value is not null or p_module<>'merchant' then return value;end if;
 if to_regclass('lumo_private.merchant_user_bindings') is not null then
  execute 'select lumo_private.access_phone(u->>''phone'') from lumo_private.merchant_user_bindings b join lumo_private.merchant_runtimes r on r.merchant_id=b.merchant_id cross join lateral jsonb_array_elements(coalesce(r.document->''users'',''[]''::jsonb)) u where b.shared_user_id=$1 and u->>''id''=b.user_id and u->>''active''=''true'' limit 1' into value using p_user;
 else
  select lumo_private.access_phone(u->>'phone') into value from lumo_private.approved_merchant_network n cross join lateral jsonb_array_elements(coalesce(n.document->'users','[]'::jsonb)) u where u->>'_sharedUserId'=p_user::text and u->>'active'='true' limit 1;
 end if;
 return value;
end $$;
create function lumo_private.access_live(p_module text,p_user uuid,p_session uuid) returns boolean language sql stable set search_path='' as $$
 select lumo_private.access_account_allowed(p_module,p_user) and exists(select 1 from auth.sessions s where s.user_id=p_user and s.id=p_session and (s.not_after is null or s.not_after>clock_timestamp()));
$$;
create function lumo_private.access_rate(p_key text,p_limit integer,p_window interval) returns boolean language plpgsql set search_path='' as $$
declare hits integer;
begin
 insert into lumo_private.access_rates as r(key,started_at,attempts) values(p_key,clock_timestamp(),1)
 on conflict(key) do update set started_at=case when r.started_at<clock_timestamp()-p_window then clock_timestamp() else r.started_at end,attempts=case when r.started_at<clock_timestamp()-p_window then 1 else r.attempts+1 end returning attempts into hits;
 return hits<=p_limit;
end $$;
create function lumo_private.access_enrollment_json(p_module text,p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('phoneMasked',case when e.phone is null then '' else '+233••••'||right(e.phone,4) end,'phoneVerified',false,'phoneSimulation',true,'faceEnrolled',e.user_id is not null,'faceSimulation',true,'backupKeyReady',e.capability_hash is not null,'keyReference',e.key_reference)
 from (select 1) x left join lumo_private.access_enrollments e on e.module=p_module and e.user_id=p_user;
$$;

create function public.lumo_access_service(p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 actor uuid;sid uuid;proof_sid uuid;rid uuid;mod text;identifier text;method text;value_phone text;cap text;reset_hash text;fingerprint text;otp text;ref uuid;kref uuid;
 e lumo_private.access_enrollments%rowtype;r lumo_private.access_requests%rowtype;who uuid;email text;handle text;revoked integer;known boolean;allowed_keys text[];
 w lumo_private.access_credential_writes%rowtype;claim uuid;
 base jsonb:=jsonb_build_object('simulation',true,'providerMode','sandbox','identityVerified',false,'livenessVerified',false,'phoneVerified',false);
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload)<>'object' or p_payload is null or octet_length(p_payload::text)>12000 then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 allowed_keys:=array['module','actor','session','proofSession','requestId','claimId','otpHash','phone','faceDigests','referenceId','capabilityHash','keyReference','identifier','method','rateKey','resetTokenHash','passwordFingerprint'];
 if exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(allowed_keys)) then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 mod:=p_payload->>'module';
 if mod is null or mod not in('consumer','merchant','admin') then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 if p_command in('credential.guard','credential.begin','credential.finish') then
  actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;
  if actor is null or sid is null or not exists(select 1 from auth.sessions s where s.id=sid and s.user_id=actor and (s.not_after is null or s.not_after>clock_timestamp())) or not (lumo_private.access_account_allowed('consumer',actor) or lumo_private.access_account_allowed('merchant',actor) or lumo_private.access_account_allowed('admin',actor)) then return base||jsonb_build_object('ok',false,'code','AUTH_REQUIRED');end if;
  perform pg_advisory_xact_lock(hashtextextended('lumo-access:'||actor::text,0));
  if p_command='credential.guard' then
   -- Call credential.begin/finish as well to span an external Auth write.
   if exists(select 1 from lumo_private.access_requests q where q.user_id=actor and q.state='applying') or exists(select 1 from lumo_private.access_credential_writes q where q.user_id=actor and q.state='applying') then return base||jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
   return base||jsonb_build_object('ok',true);
  end if;
  claim:=(p_payload->>'claimId')::uuid;fingerprint:=p_payload->>'passwordFingerprint';proof_sid:=(p_payload->>'proofSession')::uuid;
  if claim is null or fingerprint is null or fingerprint!~'^[a-f0-9]{64}$' then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into w from lumo_private.access_credential_writes where user_id=actor for update;
  if w.state='completed' and (w.claim_id=claim or p_command='credential.begin' and w.auth_session=sid and w.password_fingerprint=fingerprint) then
   if w.password_fingerprint is distinct from fingerprint or w.auth_session is distinct from sid then return base||jsonb_build_object('ok',false,'code','RESET_CONFLICT');end if;
   return base||jsonb_build_object('ok',true,'claimId',w.claim_id,'writeState','completed');
  end if;
  if exists(select 1 from lumo_private.access_requests q where q.user_id=actor and q.state='applying') then return base||jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  if proof_sid is null or proof_sid=sid or not exists(select 1 from auth.sessions s where s.id=proof_sid and s.user_id=actor and (s.not_after is null or s.not_after>clock_timestamp())) then return base||jsonb_build_object('ok',false,'code','STEP_UP_REQUIRED');end if;
  if p_command='credential.begin' then
   if w.state='applying' then
    if w.auth_session is distinct from sid or w.password_fingerprint is distinct from fingerprint then return base||jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
    return base||jsonb_build_object('ok',true,'claimId',w.claim_id,'writeState','applying');
   end if;
   insert into lumo_private.access_credential_writes(user_id,claim_id,module,auth_session,password_fingerprint,state) values(actor,claim,mod,sid,fingerprint,'applying')
   on conflict(user_id) do update set claim_id=excluded.claim_id,module=excluded.module,auth_session=excluded.auth_session,password_fingerprint=excluded.password_fingerprint,state='applying',created_at=clock_timestamp(),completed_at=null;
   insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,actor,claim,'credential.change.started');
   return base||jsonb_build_object('ok',true,'claimId',claim,'writeState','applying');
  end if;
  if w.state is distinct from 'applying' or w.claim_id is distinct from claim or w.password_fingerprint is distinct from fingerprint or w.auth_session is distinct from sid then return base||jsonb_build_object('ok',false,'code','RESET_CONFLICT');end if;
  update lumo_private.access_credential_writes set state='completed',completed_at=clock_timestamp() where user_id=actor;
  update lumo_private.access_enrollments set revision=revision+1,updated_at=clock_timestamp() where user_id=actor;
  insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,actor,claim,'credential.change.completed');
  return base||jsonb_build_object('ok',true,'claimId',claim,'writeState','completed');
 end if;
 if p_command='status' and p_payload->>'actor' is null then return base||jsonb_build_object('ok',true,'mode','sandbox');end if;
 if p_command in('guard','status','auth.rate','proof.close','enroll.begin','enroll.verify','key.rotate') then
  actor:=(p_payload->>'actor')::uuid;sid:=(p_payload->>'session')::uuid;
  if actor is null or sid is null or not lumo_private.access_live(mod,actor,sid) then return base||jsonb_build_object('ok',false,'code','AUTH_REQUIRED');end if;
  if p_command in('guard','status') then
   select u.email,split_part(u.email,'@',1) into email,handle from auth.users u where u.id=actor;
   return base||jsonb_build_object('ok',true,'ownerId',actor,'email',email,'handle',handle,'phone',lumo_private.access_registered_phone(mod,actor),'resetInProgress',exists(select 1 from lumo_private.access_requests q where q.user_id=actor and q.state='applying') or exists(select 1 from lumo_private.access_credential_writes q where q.user_id=actor and q.state='applying'),'enrollment',lumo_private.access_enrollment_json(mod,actor));
  end if;
  if p_command='auth.rate' then
   if coalesce(p_payload->>'rateKey','')!~'^[a-f0-9]{64}$' then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   if not lumo_private.access_rate('password:'||mod||':'||actor::text,5,interval '1 minute') then return base||jsonb_build_object('ok',false,'code','RATE_LIMITED','retryAfter',60);end if;
   return base||jsonb_build_object('ok',true);
  end if;
  if p_command='proof.close' then
   proof_sid:=(p_payload->>'proofSession')::uuid;
   if proof_sid is null or proof_sid=sid or exists(select 1 from auth.sessions s where s.id=proof_sid and s.user_id<>actor) then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
   delete from auth.sessions where id=proof_sid and user_id=actor;
   return base||jsonb_build_object('ok',true);
  end if;
  if p_command in('enroll.begin','key.rotate') then
   proof_sid:=(p_payload->>'proofSession')::uuid;
   if proof_sid is null or proof_sid=sid or not lumo_private.access_live(mod,actor,proof_sid) then return base||jsonb_build_object('ok',false,'code','STEP_UP_REQUIRED');end if;
  end if;
  if p_command in('enroll.begin','enroll.verify','key.rotate') then
   perform pg_advisory_xact_lock(hashtextextended('lumo-access:'||actor::text,0));
   if exists(select 1 from lumo_private.access_requests q where q.user_id=actor and q.state='applying') or exists(select 1 from lumo_private.access_credential_writes q where q.user_id=actor and q.state='applying') then return base||jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  end if;
 end if;

 if p_command='enroll.begin' then
  rid:=(p_payload->>'requestId')::uuid;ref:=(p_payload->>'referenceId')::uuid;otp:=p_payload->>'otpHash';
  if rid is null or ref is null or otp is null or otp!~'^[a-f0-9]{64}$' or not coalesce(lumo_private.access_face_digests(p_payload->'faceDigests'),false) then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  value_phone:=lumo_private.access_registered_phone(mod,actor);
  if mod='admin' or value_phone is null then value_phone:=lumo_private.access_phone(p_payload->>'phone');
  elsif p_payload->>'phone' is not null and lumo_private.access_phone(p_payload->>'phone') is distinct from value_phone then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if value_phone is null then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if exists(select 1 from lumo_private.access_requests q where q.module=mod and q.user_id=actor and q.purpose='enrollment' and q.created_at>clock_timestamp()-interval '60 seconds') or not lumo_private.access_rate('enroll:'||mod||':'||actor::text,5,interval '1 hour') then return base||jsonb_build_object('ok',false,'code','RATE_LIMITED','retryAfter',60);end if;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=actor for update;
  insert into lumo_private.access_requests(id,module,purpose,method,user_id,auth_session,enrollment_revision,phone,reference_id,face_digests,otp_hash) values(rid,mod,'enrollment','sms',actor,sid,coalesce(e.revision,0),value_phone,ref,p_payload->'faceDigests',otp) returning * into r;
  insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,actor,rid,'enrollment.started');
  return base||jsonb_build_object('ok',true,'requestId',rid,'expiresAt',r.expires_at,'retryAfter',60,'phoneMasked','+233••••'||right(value_phone,4));
 end if;

 if p_command='enroll.verify' then
  rid:=(p_payload->>'requestId')::uuid;cap:=p_payload->>'capabilityHash';otp:=p_payload->>'otpHash';kref:=(p_payload->>'keyReference')::uuid;
  if rid is null or cap is null or cap!~'^[a-f0-9]{64}$' or otp is null or otp!~'^[a-f0-9]{64}$' or kref is null then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  if r.id is null or r.purpose<>'enrollment' or r.user_id is distinct from actor or r.auth_session is distinct from sid or r.state<>'pending' or r.expires_at<=clock_timestamp() then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  if r.otp_hash is distinct from otp then
   update lumo_private.access_requests set attempts=attempts+1,state=case when attempts+1>=5 then 'locked' else state end where id=rid;
   return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');
  end if;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=actor for update;
  if coalesce(e.revision,0)<>r.enrollment_revision then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  insert into lumo_private.access_enrollments(module,user_id,revision,phone,reference_id,face_digests,capability_hash,key_reference) values(mod,actor,r.enrollment_revision+1,r.phone,r.reference_id,r.face_digests,cap,kref)
  on conflict(module,user_id) do update set revision=excluded.revision,phone=excluded.phone,reference_id=excluded.reference_id,face_digests=excluded.face_digests,capability_hash=excluded.capability_hash,key_reference=excluded.key_reference,updated_at=clock_timestamp();
  update lumo_private.access_requests set state='completed',capability_hash=cap,key_reference=kref,completed_at=clock_timestamp(),otp_hash=null where id=rid;
  insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,actor,rid,'enrollment.completed');
  return base||jsonb_build_object('ok',true,'keyReference',kref,'backupKeyReference',kref,'phoneMasked','+233••••'||right(r.phone,4),'enrollment',lumo_private.access_enrollment_json(mod,actor));
 end if;

 if p_command='key.rotate' then
  cap:=p_payload->>'capabilityHash';kref:=(p_payload->>'keyReference')::uuid;
  if cap is null or cap!~'^[a-f0-9]{64}$' or kref is null then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=actor for update;
  if e.user_id is null then return base||jsonb_build_object('ok',false,'code','ENROLLMENT_REQUIRED');end if;
  update lumo_private.access_enrollments set capability_hash=cap,key_reference=kref,revision=revision+1,updated_at=clock_timestamp() where module=mod and user_id=actor;
  insert into lumo_private.access_audit(module,user_id,action) values(mod,actor,'capability.rotated');
  return base||jsonb_build_object('ok',true,'keyReference',kref,'backupKeyReference',kref,'enrollment',lumo_private.access_enrollment_json(mod,actor));
 end if;

 if p_command='recovery.start' then
  rid:=(p_payload->>'requestId')::uuid;identifier:=lower(btrim(coalesce(p_payload->>'identifier','')));method:=p_payload->>'method';otp:=p_payload->>'otpHash';
  if rid is null or method is null or method not in('sms','face','key') or length(identifier)>254 or (mod<>'admin' and identifier!~'^[a-z0-9][a-z0-9._-]{2,29}$') or (mod='admin' and identifier!~'^[^ @<>]+@[^ @<>]+\.[^ @<>]+$') or otp is null or otp!~'^[a-f0-9]{64}$' or coalesce(p_payload->>'rateKey','')!~'^[a-f0-9]{64}$' then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  -- A campus Wi-Fi/NAT can legitimately share an address across the pilot.
  -- Keep the strict per-account limit without giving 20 unrelated students one
  -- shared allowance; the wider client bucket still bounds anonymous abuse.
  if not lumo_private.access_rate('start-client:'||(p_payload->>'rateKey'),250,interval '15 minutes') or not lumo_private.access_rate('start-account:'||mod||':'||encode(extensions.digest(identifier,'sha256'),'hex'),5,interval '15 minutes') then return base||jsonb_build_object('ok',false,'code','RATE_LIMITED','retryAfter',900);end if;
  if exists(select 1 from lumo_private.access_requests q where q.module=mod and q.identifier=identifier and q.purpose='recovery' and q.created_at>clock_timestamp()-interval '60 seconds') then return base||jsonb_build_object('ok',false,'code','RATE_LIMITED','retryAfter',60);end if;
  select u.id into who from auth.users u where (case when mod='admin' then lower(u.email)=identifier else u.email=identifier||'@pilot.lumo.invalid' end) and lumo_private.access_account_allowed(mod,u.id) limit 1;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=who;
  if e.capability_hash is null then who:=null;end if;
  insert into lumo_private.access_requests(id,module,purpose,method,user_id,identifier,enrollment_revision,phone,reference_id,otp_hash) values(rid,mod,'recovery',method,who,identifier,case when who is null then 0 else e.revision end,case when who is null then null else e.phone end,coalesce(e.reference_id,gen_random_uuid()),otp) returning * into r;
  return base||jsonb_build_object('ok',true,'requestId',rid,'expiresAt',r.expires_at,'retryAfter',60);
 end if;

 if p_command in('recovery.context','recovery.verify') then
  rid:=(p_payload->>'requestId')::uuid;cap:=p_payload->>'capabilityHash';
  if rid is null or cap is null or cap!~'^[a-f0-9]{64}$' then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  if r.id is null or r.purpose<>'recovery' or r.state<>'pending' or r.expires_at<=clock_timestamp() or r.attempts>=5 then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  if p_command='recovery.verify' and p_payload->>'method' is distinct from r.method then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=r.user_id for update;
  if r.user_id is null or e.capability_hash is null or e.capability_hash is distinct from cap or e.revision<>r.enrollment_revision or not lumo_private.access_account_allowed(mod,r.user_id) then
   update lumo_private.access_requests set attempts=attempts+1,state=case when attempts+1>=5 then 'locked' else state end where id=rid;
   return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');
  end if;
  if p_command='recovery.context' then return base||jsonb_build_object('ok',true,'ownerId',r.user_id,'referenceId',r.reference_id,'method',r.method,'expiresAt',r.expires_at);end if;
  reset_hash:=p_payload->>'resetTokenHash';
  if reset_hash is null or reset_hash!~'^[a-f0-9]{64}$' then return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  if (r.method='sms' and r.otp_hash is distinct from p_payload->>'otpHash') or (r.method='face' and not coalesce(lumo_private.access_face_digests(p_payload->'faceDigests'),false)) then
   update lumo_private.access_requests set attempts=attempts+1,state=case when attempts+1>=5 then 'locked' else state end where id=rid;
   return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');
  end if;
  update lumo_private.access_requests set state='verified',reset_token_hash=reset_hash,verified_at=clock_timestamp(),expires_at=clock_timestamp()+interval '5 minutes',otp_hash=null where id=rid;
  insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,r.user_id,rid,'recovery.verified');
  return base||jsonb_build_object('ok',true,'requestId',rid,'expiresAt',clock_timestamp()+interval '5 minutes');
 end if;

 if p_command in('complete.begin','complete.finish') then
  rid:=(p_payload->>'requestId')::uuid;reset_hash:=p_payload->>'resetTokenHash';fingerprint:=p_payload->>'passwordFingerprint';
  if rid is null or reset_hash is null or reset_hash!~'^[a-f0-9]{64}$' or fingerprint is null or fingerprint!~'^[a-f0-9]{64}$' then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  select * into r from lumo_private.access_requests where id=rid and module=mod for update;
  if r.id is null or r.purpose<>'recovery' or r.user_id is null or r.reset_token_hash is distinct from reset_hash or r.state not in('verified','applying','completed') then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  perform pg_advisory_xact_lock(hashtextextended('lumo-access:'||r.user_id::text,0));
  if r.state='completed' then
   if r.password_fingerprint is distinct from fingerprint or r.completed_at<clock_timestamp()-interval '1 hour' then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
   if p_command='complete.finish' then return base||jsonb_build_object('ok',true,'completed',true);end if;
   select u.email,split_part(u.email,'@',1) into email,handle from auth.users u where u.id=r.user_id;
   return base||jsonb_build_object('ok',true,'ownerId',r.user_id,'email',email,'handle',handle,'resetState','completed');
  end if;
  if (r.state='verified' and r.expires_at<=clock_timestamp()) or not lumo_private.access_account_allowed(mod,r.user_id) then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  if exists(select 1 from lumo_private.access_credential_writes q where q.user_id=r.user_id and q.state='applying') then return base||jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
  select * into e from lumo_private.access_enrollments where module=mod and user_id=r.user_id for update;
  if e.user_id is null or e.revision<>r.enrollment_revision or e.capability_hash is null then return base||jsonb_build_object('ok',false,'code','PROOF_INVALID');end if;
  if r.state='applying' and r.password_fingerprint is distinct from fingerprint then return base||jsonb_build_object('ok',false,'code','RESET_CONFLICT');end if;
  if p_command='complete.begin' then
   if r.state='verified' then
    if exists(select 1 from lumo_private.access_requests q where q.user_id=r.user_id and q.state='applying' and q.id<>rid) then return base||jsonb_build_object('ok',false,'code','RESET_IN_PROGRESS');end if;
    update lumo_private.access_requests set state='applying',password_fingerprint=fingerprint,applying_at=clock_timestamp() where id=rid;
   end if;
   select u.email,split_part(u.email,'@',1) into email,handle from auth.users u where u.id=r.user_id;
   return base||jsonb_build_object('ok',true,'ownerId',r.user_id,'email',email,'handle',handle,'resetState','applying');
  end if;
  if r.state<>'applying' then return base||jsonb_build_object('ok',false,'code','RESET_CONFLICT');end if;
  delete from auth.sessions where user_id=r.user_id;get diagnostics revoked=row_count;
  update lumo_private.approved_devices set revoked_at=coalesce(revoked_at,clock_timestamp()) where user_id=r.user_id and revoked_at is null;
  update lumo_private.access_enrollments set capability_hash=null,key_reference=null,revision=revision+1,updated_at=clock_timestamp() where user_id=r.user_id;
  update lumo_private.access_requests set state='completed',completed_at=clock_timestamp() where id=rid;
  insert into lumo_private.access_audit(module,user_id,request_id,action) values(mod,r.user_id,rid,'password.reset.completed');
  return base||jsonb_build_object('ok',true,'completed',true,'revokedSessions',revoked);
 end if;
 return base||jsonb_build_object('ok',false,'code','INVALID_INPUT');
exception when invalid_text_representation or check_violation or unique_violation or datetime_field_overflow then return jsonb_build_object('ok',false,'code','INVALID_INPUT','simulation',true);
end $$;

revoke all on function lumo_private.access_face_digests(jsonb),lumo_private.access_phone(text),lumo_private.access_account_allowed(text,uuid),lumo_private.access_registered_phone(text,uuid),lumo_private.access_live(text,uuid,uuid),lumo_private.access_rate(text,integer,interval),lumo_private.access_enrollment_json(text,uuid),public.lumo_access_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.lumo_access_service(text,jsonb) to service_role;

