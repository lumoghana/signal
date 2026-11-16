-- Approved v66 domain persistence. Only the trusted Edge gateway can call this RPC.
-- Existing immutable journals, balanced entries and post_money remain the money authority.
alter table lumo_private.profiles drop constraint if exists profiles_handle_check;
alter table lumo_private.profiles add constraint profiles_handle_check check(handle ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
alter table lumo_private.pilot_registrations drop constraint if exists pilot_registrations_handle_check;
alter table lumo_private.pilot_registrations add constraint pilot_registrations_handle_check check(handle ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
-- Retain the existing reviewed reservation/rate limiter, changing only its approved username rule.
do $change$ begin
 execute replace(pg_get_functiondef('lumo_private.pilot_bootstrap(text,jsonb)'::regprocedure),
   '^[a-z][a-z0-9_]{2,29}$','^[a-z0-9][a-z0-9._-]{2,29}$');
end $change$;

create table lumo_private.approved_profiles (
 user_id uuid primary key references auth.users(id),
 phone text unique check(phone is null or phone ~ '^0[0-9]{9}$'),
 contact_verified boolean not null default false check(contact_verified=false),
 created_at timestamptz not null default now()
);
create table lumo_private.approved_states (
 user_id uuid primary key references auth.users(id), revision bigint not null default 0 check(revision>=0),
 state jsonb not null check(jsonb_typeof(state)='object'), updated_at timestamptz not null default now()
);
create table lumo_private.approved_groups (
 id text primary key, revision bigint not null default 1 check(revision>0),
 account_id uuid unique not null references lumo_private.accounts(id),
 state jsonb not null check(jsonb_typeof(state)='object'), updated_at timestamptz not null default now()
);
create table lumo_private.approved_boxes (
 id text primary key, user_id uuid not null references auth.users(id),
 account_id uuid unique not null references lumo_private.accounts(id), created_at timestamptz not null default now()
);
create table lumo_private.approved_requests (
 id text primary key, sender_user_id uuid not null references auth.users(id), recipient_user_id uuid not null references auth.users(id), revision bigint not null default 1, state jsonb not null, created_at timestamptz not null default now(), check(sender_user_id<>recipient_user_id)
);
create table lumo_private.approved_partners (
 id text primary key, owner_user_id uuid not null references auth.users(id), partner_user_id uuid not null references auth.users(id), revision bigint not null default 1, kind text not null check(kind in('initial','release','protection')), state jsonb not null, updated_at timestamptz not null default now(), check(owner_user_id<>partner_user_id)
);
create table lumo_private.approved_postings (
 journal_id uuid primary key references lumo_private.journals(id), user_id uuid not null references auth.users(id),
 transaction_id text, group_id text references lumo_private.approved_groups(id), box_id text references lumo_private.approved_boxes(id),
 metadata jsonb not null default '{}'::jsonb
);
create table lumo_private.approved_attempts (
 user_id uuid not null references auth.users(id), attempt_id text not null check(attempt_id ~ '^[A-Za-z0-9_.:-]{10,100}$'),
 fingerprint text not null, result jsonb not null, created_at timestamptz not null default now(), primary key(user_id,attempt_id)
);
create table lumo_private.approved_devices (
 id text not null, user_id uuid not null references auth.users(id), session_id uuid not null,
 public_key text not null, algorithm text not null check(algorithm in('ES256','RS256')),
 revoked_at timestamptz, created_at timestamptz not null default now(), primary key(user_id,id)
);
create table lumo_private.approved_challenges (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), session_id uuid not null,
 device_id text not null, challenge text not null, fingerprint text not null, attempt_id text not null,
 expires_at timestamptz not null default now()+interval '60 seconds', consumed_at timestamptz,
 foreign key(user_id,device_id) references lumo_private.approved_devices(user_id,id)
);
do $lock$ declare tab text;begin
 foreach tab in array array['approved_profiles','approved_states','approved_groups','approved_boxes','approved_postings','approved_partners','approved_requests','approved_attempts','approved_devices','approved_challenges'] loop
  execute format('alter table lumo_private.%I enable row level security',tab);
  execute format('revoke all on table lumo_private.%I from public,anon,authenticated,service_role',tab);
 end loop;
end $lock$;

create function lumo_private.approved_live(p_actor uuid,p_session uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=p_session and s.user_id=p_actor and (s.not_after is null or s.not_after>clock_timestamp())
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()) and not coalesce(u.is_anonymous,false)
 and u.raw_app_meta_data->'lumo_pilot'='true'::jsonb);
$$;
create function lumo_private.approved_receipts(p_actor uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(lumo_private.receipt_json(j.id)||jsonb_build_object('transactionId',ap.transaction_id,'approvedGroupId',ap.group_id,'approvedBoxId',ap.box_id)||coalesce(ap.metadata,'{}'::jsonb) order by j.created_at desc,j.id),'[]'::jsonb)
 from lumo_private.journals j left join lumo_private.approved_postings ap on ap.journal_id=j.id
 where exists(select 1 from lumo_private.accounts a where a.id in(j.payer_account_id,j.payee_account_id) and a.owner_user_id=p_actor and a.kind='consumer');
$$;
create function lumo_private.approved_load(p_actor uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('ok',true,'account',lumo_private.account_json(p_actor),'revision',coalesce(s.revision,0),'state',s.state,
 'phone',(select phone from lumo_private.approved_profiles where user_id=p_actor),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'revision',g.revision,'accountId',g.account_id,'balance',a.balance,'state',g.state))
 from lumo_private.approved_groups g join lumo_private.accounts a on a.id=g.account_id
 where exists(select 1 from jsonb_array_elements(g.state->'members') m where m->>'id'=p_actor::text and m->>'status' in('active','invited'))),'[]'::jsonb),
 'boxes',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'accountId',b.account_id,'balance',a.balance)) from lumo_private.approved_boxes b join lumo_private.accounts a on a.id=b.account_id where b.user_id=p_actor),'[]'::jsonb),
 'partners',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'ownerUserId',r.owner_user_id,'partnerUserId',r.partner_user_id,'revision',r.revision,'kind',r.kind,'state',r.state)) from lumo_private.approved_partners r where p_actor in(r.owner_user_id,r.partner_user_id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'senderUserId',r.sender_user_id,'recipientUserId',r.recipient_user_id,'revision',r.revision,'state',r.state,'senderName',sp.display_name,'recipientName',rp.display_name,'senderHandle',sp.handle,'recipientHandle',rp.handle)) from lumo_private.approved_requests r join lumo_private.profiles sp on sp.user_id=r.sender_user_id join lumo_private.profiles rp on rp.user_id=r.recipient_user_id where p_actor in(r.sender_user_id,r.recipient_user_id)),'[]'::jsonb),
 'receipts',lumo_private.approved_receipts(p_actor))
 from (values(1)) v(x) left join lumo_private.approved_states s on s.user_id=p_actor;
$$;
create function lumo_private.approved_resolve_account(p_actor uuid,p_ref jsonb) returns uuid language plpgsql set search_path='' as $$
declare target uuid;kind text:=p_ref->>'kind';
begin
 if kind='wallet' then select id into target from lumo_private.accounts where owner_user_id=p_actor and accounts.kind='consumer' and status='active';
 elsif kind='funding' then select id into target from lumo_private.accounts where accounts.kind='test_funding' and status='active';
 elsif kind='user' then select id into target from lumo_private.accounts where owner_user_id=(p_ref->>'id')::uuid and accounts.kind='consumer' and status='active';
 elsif kind='box' then select account_id into target from lumo_private.approved_boxes where user_id=p_actor and id=p_ref->>'id';
 elsif kind='group' then select g.account_id into target from lumo_private.approved_groups g where g.id=p_ref->>'id' and exists(select 1 from jsonb_array_elements(g.state->'members')m where m->>'id'=p_actor::text and m->>'status'='active');
 elsif kind='merchant' then select m.account_id into target from lumo_private.shops s join lumo_private.merchants m on m.id=s.merchant_id where s.id=(p_ref->>'id')::uuid and s.accepting and m.status='active';
 end if;
 if target is null then raise exception using errcode='P0001',message='ACCOUNT_UNAVAILABLE';end if;
 return target;
end $$;

create function lumo_private.approved_service(p_command text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;session uuid;v_handle text;v_phone text;v_pin text;v_profile lumo_private.profiles%rowtype;
 snapshot lumo_private.approved_states%rowtype;prior lumo_private.approved_attempts%rowtype;
 g jsonb;b jsonb;i jsonb;j uuid;source uuid;destination uuid;own uuid;v_id text;v_revision bigint;v_balance bigint;
 posted jsonb:='[]'::jsonb;refs uuid[]:='{}';intent_ids jsonb:='[]';v_state jsonb;challenge lumo_private.approved_challenges%rowtype;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;session:=(p_payload->>'session')::uuid;
 if not lumo_private.approved_live(actor,session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,4271));
 if p_command='provision' then
  v_handle:=p_payload->>'handle';v_phone:=nullif(p_payload->>'phone','');v_pin:=p_payload->>'pin';
  if v_handle !~ '^[a-z0-9][a-z0-9._-]{2,29}$' or length(p_payload->>'displayName') not between 1 and 80
   or (v_phone is not null and v_phone !~ '^0[0-9]{9}$') or v_pin !~ '^[0-9]{4,6}$'
   or not exists(select 1 from auth.users where id=actor and email=v_handle||'@pilot.lumo.invalid') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  select * into v_profile from lumo_private.profiles where user_id=actor;
  if not found then
   insert into lumo_private.profiles(user_id,handle,display_name,pin_hash) values(actor,v_handle,p_payload->>'displayName',extensions.crypt(v_pin,extensions.gen_salt('bf',10)));
   insert into lumo_private.accounts(owner_user_id,kind) values(actor,'consumer');
  elsif v_profile.handle<>v_handle then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');end if;
  insert into lumo_private.approved_profiles(user_id,phone) values(actor,v_phone) on conflict(user_id) do nothing;
  return lumo_private.approved_load(actor);
 end if;
 select * into v_profile from lumo_private.profiles where user_id=actor and status='active';
 if not found then return jsonb_build_object('ok',false,'code','ACCOUNT_REQUIRED');end if;
 if not exists(select 1 from lumo_private.accounts where owner_user_id=actor and kind='consumer' and status='active') then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');end if;
 if p_command='load' then return lumo_private.approved_load(actor);end if;
 if p_command='resolve' then
  v_handle:=lower(regexp_replace(p_payload->>'query','^@',''));v_phone:=regexp_replace(p_payload->>'query','[\s()-]','','g');v_phone:=regexp_replace(v_phone,'^\+233','0');
  return coalesce((select jsonb_build_object('ok',true,'recipient',jsonb_build_object('id',p.user_id,'userId',p.user_id,'handle',p.handle,'name',p.display_name,'phone',a.phone,'rail','lumo')) from lumo_private.profiles p join lumo_private.accounts ca on ca.owner_user_id=p.user_id and ca.kind='consumer' and ca.status='active' left join lumo_private.approved_profiles a on a.user_id=p.user_id where p.status='active' and (p.handle=v_handle or a.phone=v_phone or p.user_id::text=v_handle) limit 1),jsonb_build_object('ok',false,'code','RECIPIENT_NOT_FOUND'));
 end if;
 if p_command='partner.read' then
  return coalesce((select jsonb_build_object('ok',true,'row',jsonb_build_object('id',r.id,'ownerUserId',r.owner_user_id,'partnerUserId',r.partner_user_id,'revision',r.revision,'kind',r.kind,'state',r.state),'ownerState',s.state,'partners',(lumo_private.approved_load(r.owner_user_id))->'partners') from lumo_private.approved_partners r join lumo_private.approved_states s on s.user_id=r.owner_user_id where r.id=p_payload->>'id' and actor in(r.owner_user_id,r.partner_user_id)),jsonb_build_object('ok',false,'code','PARTNER_UNAVAILABLE'));
 end if;
 if p_command='partner.respond' then
  select revision into v_revision from lumo_private.approved_partners where id=p_payload->>'id' and partner_user_id=actor for update;
  if not found then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
  if v_revision<>(p_payload->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  update lumo_private.approved_partners set state=p_payload->'state',revision=revision+1,updated_at=now() where id=p_payload->>'id' and partner_user_id=actor;
  return (select jsonb_build_object('ok',true,'row',jsonb_build_object('id',r.id,'ownerUserId',r.owner_user_id,'partnerUserId',r.partner_user_id,'revision',r.revision,'kind',r.kind,'state',r.state)) from lumo_private.approved_partners r where r.id=p_payload->>'id');
 end if;
 if p_command='attempt' then
  select * into prior from lumo_private.approved_attempts where user_id=actor and attempt_id=p_payload->>'attemptId';
  if found and prior.fingerprint<>p_payload->>'fingerprint' then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
  return jsonb_build_object('ok',true,'found',prior.attempt_id is not null,'result',prior.result,'snapshot',case when prior.attempt_id is not null then lumo_private.approved_load(actor) else null end);
 end if;
 if p_command='pin.change' then
  if not lumo_private.verify_pin(actor,p_payload->>'oldPin') then return jsonb_build_object('ok',false,'code','PIN_REQUIRED');end if;
  v_pin:=p_payload->>'newPin';if v_pin is null or v_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  update lumo_private.profiles set pin_hash=extensions.crypt(v_pin,extensions.gen_salt('bf',10)),pin_failures=0,pin_locked_until=null where user_id=actor;
  return jsonb_build_object('ok',true);
 end if;
 if p_command='verifyPin' then return jsonb_build_object('ok',lumo_private.verify_pin(actor,p_payload->>'pin'),'code','PIN_REQUIRED');end if;
 if p_command='device.register' then
  if not lumo_private.verify_pin(actor,p_payload->>'pin') then return jsonb_build_object('ok',false,'code','PIN_REQUIRED');end if;
  if length(p_payload->>'deviceId') not between 10 and 100 or length(p_payload->>'publicKey') not between 60 and 4096 or p_payload->>'algorithm' not in('ES256','RS256') then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
  insert into lumo_private.approved_devices(id,user_id,session_id,public_key,algorithm) values(p_payload->>'deviceId',actor,session,p_payload->>'publicKey',p_payload->>'algorithm')
  on conflict(user_id,id) do update set public_key=excluded.public_key,algorithm=excluded.algorithm,session_id=excluded.session_id,revoked_at=null;
  return jsonb_build_object('ok',true);
 end if;
 if p_command='device.challenge' then
  if not exists(select 1 from lumo_private.approved_devices where id=p_payload->>'deviceId' and user_id=actor and revoked_at is null) then return jsonb_build_object('ok',false,'code','DEVICE_REQUIRED');end if;
  delete from lumo_private.approved_challenges where user_id=actor and expires_at<now()-interval '1 day';
  insert into lumo_private.approved_challenges(user_id,session_id,device_id,challenge,fingerprint,attempt_id) values(actor,session,p_payload->>'deviceId',p_payload->>'challenge',p_payload->>'fingerprint',p_payload->>'attemptId') returning * into challenge;
  return jsonb_build_object('ok',true,'challengeId',challenge.id,'challenge',challenge.challenge,'expiresAt',challenge.expires_at);
 end if;
 if p_command='device.get' then
  return coalesce((select jsonb_build_object('ok',true,'publicKey',d.public_key,'algorithm',d.algorithm,'challenge',c.challenge,'fingerprint',c.fingerprint,'attemptId',c.attempt_id)
   from lumo_private.approved_challenges c join lumo_private.approved_devices d on d.user_id=c.user_id and d.id=c.device_id
   where c.id=(p_payload->>'challengeId')::uuid and c.user_id=actor and c.session_id=session and c.device_id=p_payload->>'deviceId' and c.expires_at>clock_timestamp() and c.consumed_at is null and d.revoked_at is null),jsonb_build_object('ok',false,'code','DEVICE_PROOF_INVALID'));
 end if;
 if p_command<>'commit' then return jsonb_build_object('ok',false,'code','UNKNOWN_COMMAND');end if;
 if p_payload->>'attemptId' !~ '^[A-Za-z0-9_.:-]{10,100}$' or length(p_payload->>'fingerprint')<>64 or jsonb_typeof(p_payload->'state')<>'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 select * into prior from lumo_private.approved_attempts where user_id=actor and attempt_id=p_payload->>'attemptId';
 if found then
  if prior.fingerprint<>p_payload->>'fingerprint' then return jsonb_build_object('ok',false,'code','IDEMPOTENCY_CONFLICT');end if;
  return prior.result||jsonb_build_object('replayed',true,'snapshot',lumo_private.approved_load(actor));
 end if;
 select * into snapshot from lumo_private.approved_states where user_id=actor for update;
 if coalesce(snapshot.revision,0)<>(p_payload->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
 -- Check every shared-group revision before any mutation. An absent record is revision zero.
 for g in select value from jsonb_array_elements(p_payload->'groups') order by value->>'id' loop
  select revision into v_revision from lumo_private.approved_groups where id=g->>'id' for update;
  if coalesce(v_revision,0)<>(g->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if not exists(select 1 from jsonb_array_elements(g->'state'->'members')m where m->>'id'=actor::text and m->>'status' in('active','invited')) then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 end loop;
 for i in select value from jsonb_array_elements(coalesce(p_payload->'requests','[]'::jsonb)) order by value->>'id' loop
  select revision into v_revision from lumo_private.approved_requests where id=i->>'id' for update;
  if coalesce(v_revision,0)<>(i->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if actor::text not in(i->>'senderUserId',i->>'recipientUserId') then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 end loop;
 for i in select value from jsonb_array_elements(coalesce(p_payload->'partners','[]'::jsonb)) order by value->>'id' loop
  select revision into v_revision from lumo_private.approved_partners where id=i->>'id' for update;
  if coalesce(v_revision,0)<>(i->>'expectedRevision')::bigint then return jsonb_build_object('ok',false,'code','REVISION_CONFLICT');end if;
  if i->>'ownerUserId'<>actor::text then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 end loop;
 if coalesce((p_payload->>'requiresAuth')::boolean,false) and not (p_payload ? 'verifiedChallengeId') and not lumo_private.verify_pin(actor,p_payload->>'pin') then return jsonb_build_object('ok',false,'code','PIN_REQUIRED');end if;
 begin
 -- Account locks use the shared ledger's universal UUID order. This includes every incoming recipient.
 select id into own from lumo_private.accounts where owner_user_id=actor and kind='consumer';refs:=array_append(refs,own);
 for b in select value from jsonb_array_elements(p_payload->'boxes') loop
  if not exists(select 1 from lumo_private.approved_boxes where id=b->>'id') then
   insert into lumo_private.accounts(owner_user_id,kind) values(actor,'money_box') returning id into destination;
   insert into lumo_private.approved_boxes(id,user_id,account_id) values(b->>'id',actor,destination);
  end if;
 end loop;
 for g in select value from jsonb_array_elements(p_payload->'groups') loop
  if not exists(select 1 from lumo_private.approved_groups where id=g->>'id') then
   insert into lumo_private.accounts(owner_user_id,kind) values(actor,'group') returning id into destination;
   insert into lumo_private.approved_groups(id,account_id,state) values(g->>'id',destination,g->'state');
  end if;
 end loop;
 for i in select value from jsonb_array_elements(p_payload->'intents') loop
  source:=lumo_private.approved_resolve_account(actor,i->'source');destination:=lumo_private.approved_resolve_account(actor,i->'destination');
  refs:=array_append(array_append(refs,source),destination);intent_ids:=intent_ids||jsonb_build_array(i||jsonb_build_object('sourceId',source,'destinationId',destination));
 end loop;
 select array_agg(distinct x) into refs from unnest(refs) x;
 perform 1 from lumo_private.accounts where id=any(refs) order by id for update;
 select balance into v_balance from lumo_private.accounts where id=own;
 if v_balance<>(p_payload->>'expectedWallet')::bigint then raise exception using errcode='P0001',message='REVISION_CONFLICT';end if;
 for b in select value from jsonb_array_elements(p_payload->'boxes') loop
  if (select a.balance from lumo_private.approved_boxes ab join lumo_private.accounts a on a.id=ab.account_id where ab.id=b->>'id' and ab.user_id=actor)<>(b->>'before')::bigint then raise exception using errcode='P0001',message='REVISION_CONFLICT';end if;
 end loop;
 if coalesce((p_payload->>'requiresAuth')::boolean,false) then
  if p_payload ? 'verifiedChallengeId' then
   update lumo_private.approved_challenges set consumed_at=clock_timestamp() where id=(p_payload->>'verifiedChallengeId')::uuid and user_id=actor and session_id=session and fingerprint=p_payload->>'fingerprint' and attempt_id=p_payload->>'attemptId' and expires_at>clock_timestamp() and consumed_at is null;
   if not found then raise exception using errcode='P0001',message='DEVICE_PROOF_INVALID';end if;
  end if;
 end if;
 -- This block rolls back ALL account creation, ledger and state updates on any error.
  for i in select value from jsonb_array_elements(intent_ids) loop
   if i->>'kind'='merchant_payment' then
    perform 1 from lumo_private.shops sh join lumo_private.merchants mer on mer.id=sh.merchant_id where sh.id=(i->>'shopId')::uuid and sh.accepting and mer.status='active' and mer.owner_user_id<>actor for share of sh,mer;
    if not found then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
    if i ? 'requestId' and i->>'requestId' is not null then
     perform 1 from lumo_private.payment_requests where id=(i->>'requestId')::uuid and shop_id=(i->>'shopId')::uuid and amount=(i->>'amount')::bigint and status='open' and expires_at>clock_timestamp() for update;
     if not found then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
    end if;
   end if;
   j:=lumo_private.post_money(actor,i->>'kind',(i->>'amount')::bigint,(i->>'sourceId')::uuid,(i->>'destinationId')::uuid,nullif(i->>'shopId','')::uuid,nullif(i->>'requestId','')::uuid,nullif(i->>'originalPaymentId','')::uuid);
   insert into lumo_private.approved_postings(journal_id,user_id,transaction_id,group_id,box_id,metadata) values(j,actor,i->>'transactionId',i->>'groupId',i->>'boxId',coalesce(i->'metadata','{}'::jsonb));
   posted:=posted||jsonb_build_array(lumo_private.receipt_json(j)||jsonb_build_object('transactionId',i->>'transactionId','approvedGroupId',i->>'groupId','approvedBoxId',i->>'boxId'));
   if i ? 'requestId' and i->>'requestId' is not null then
    update lumo_private.payment_requests set status='paid',paid_journal_id=j where id=(i->>'requestId')::uuid and status='open' and expires_at>clock_timestamp();
    if not found then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
   end if;
  end loop;
  if (select balance from lumo_private.accounts where id=own)<>(p_payload->'state'->>'wallet')::bigint then raise exception using errcode='P0001',message='UNBACKED_STATE';end if;
  for b in select value from jsonb_array_elements(p_payload->'boxes') loop
   if (select a.balance from lumo_private.approved_boxes ab join lumo_private.accounts a on a.id=ab.account_id where ab.id=b->>'id' and ab.user_id=actor)<>(b->>'after')::bigint then raise exception using errcode='P0001',message='UNBACKED_STATE';end if;
  end loop;
  for g in select value from jsonb_array_elements(p_payload->'groups') loop
   if (select a.balance from lumo_private.approved_groups ag join lumo_private.accounts a on a.id=ag.account_id where ag.id=g->>'id')<>(g->'state'->>'balance')::bigint then raise exception using errcode='P0001',message='UNBACKED_STATE';end if;
   update lumo_private.approved_groups set state=g->'state',revision=(g->>'expectedRevision')::bigint+1,updated_at=now() where id=g->>'id';
  end loop;
  for i in select value from jsonb_array_elements(coalesce(p_payload->'requests','[]'::jsonb)) loop
   insert into lumo_private.approved_requests(id,sender_user_id,recipient_user_id,revision,state) values(i->>'id',(i->>'senderUserId')::uuid,(i->>'recipientUserId')::uuid,(i->>'expectedRevision')::bigint+1,i->'state')
   on conflict(id) do update set state=excluded.state,revision=excluded.revision;
  end loop;
  update lumo_private.approved_requests r set state=jsonb_set(r.state,'{ledgerJournalId}',to_jsonb(ap.journal_id::text)) from lumo_private.approved_postings ap where ap.user_id=actor and ap.metadata->>'personalRequestId'=r.id and ap.journal_id in(select (value->>'id')::uuid from jsonb_array_elements(posted));
  for i in select value from jsonb_array_elements(coalesce(p_payload->'partners','[]'::jsonb)) loop
   insert into lumo_private.approved_partners(id,owner_user_id,partner_user_id,revision,kind,state) values(i->>'id',(i->>'ownerUserId')::uuid,(i->>'partnerUserId')::uuid,(i->>'expectedRevision')::bigint+1,i->>'kind',i->'state')
   on conflict(id) do update set state=excluded.state,revision=excluded.revision,updated_at=now();
  end loop;
  if jsonb_typeof(p_payload->'profileChange')='object' then
   update lumo_private.profiles set display_name=p_payload->'profileChange'->>'name' where user_id=actor;
   insert into lumo_private.approved_profiles(user_id,phone) values(actor,nullif(p_payload->'profileChange'->>'phone','')) on conflict(user_id) do update set phone=excluded.phone;
  end if;
  v_state:=p_payload->'state';v_state:=jsonb_set(v_state,'{groups}','[]'::jsonb);v_state:=v_state#-'{settings,pin}';
  if p_payload->'pinChange' is not null and p_payload->'pinChange'<>'null'::jsonb then
   v_pin:=p_payload->>'pinChange';if v_pin !~ '^[0-9]{4,6}$' then raise exception using errcode='P0001',message='INVALID_INPUT';end if;
   update lumo_private.profiles set pin_hash=extensions.crypt(v_pin,extensions.gen_salt('bf',10)),pin_failures=0,pin_locked_until=null where user_id=actor;
  end if;
  insert into lumo_private.approved_states(user_id,revision,state) values(actor,coalesce(snapshot.revision,0)+1,v_state)
  on conflict(user_id) do update set revision=excluded.revision,state=excluded.state,updated_at=now();
  insert into lumo_private.approved_attempts(user_id,attempt_id,fingerprint,result) values(actor,p_payload->>'attemptId',p_payload->>'fingerprint',jsonb_build_object('ok',true,'result',p_payload->'result','receipts',posted,'revision',coalesce(snapshot.revision,0)+1));
 exception when others then
  return jsonb_build_object('ok',false,'code',case when sqlstate='P0001' then sqlerrm else 'COMMIT_FAILED' end);
 end;
 return jsonb_build_object('ok',true,'result',p_payload->'result','receipts',posted,'snapshot',lumo_private.approved_load(actor));
exception when unique_violation then return jsonb_build_object('ok',false,'code','ALIAS_UNAVAILABLE');
 when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('ok',false,'code','INVALID_INPUT');
end $$;

revoke all on function lumo_private.approved_live(uuid,uuid),lumo_private.approved_receipts(uuid),lumo_private.approved_load(uuid),lumo_private.approved_resolve_account(uuid,jsonb),lumo_private.approved_service(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function lumo_private.approved_service(text,jsonb) to service_role;
create function public.lumo_approved_service(p_command text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select lumo_private.approved_service(p_command,p_payload);$$;
revoke all on function public.lumo_approved_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.lumo_approved_service(text,jsonb) to service_role;
comment on function public.lumo_approved_service(text,jsonb) is 'Service-only approved v66 gateway persistence. JWT identity/live session, CAS, immutable balanced shared ledger, private canonical groups. Never call from a public client.';
