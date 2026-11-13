-- Connected review fixes: atomic account closure and private group reports.
-- No balance, credential or identity data is replaced. Closed accounts retain read-only history.
alter table lumo_private.accounts drop constraint accounts_status_check;
alter table lumo_private.accounts add constraint accounts_status_check check(status in('active','suspended','closed'));
create table lumo_private.approved_group_reports(
 id text primary key,
 group_id text not null references lumo_private.approved_groups(id),
 reporter_user_id uuid references auth.users(id),
 message_id text,
 reason text,
 created_at timestamptz not null default now(),
 status text not null default 'saved',
 payload jsonb not null default '{}'::jsonb,
 unique(group_id,reporter_user_id,message_id)
);
create index approved_group_reports_reporter_idx on lumo_private.approved_group_reports(reporter_user_id);
alter table lumo_private.approved_group_reports enable row level security;
revoke all on lumo_private.approved_group_reports from public,anon,authenticated,service_role;
comment on table lumo_private.approved_group_reports is 'Private report records. Never included in consumer/group snapshots. No live moderation workflow is implied.';
create or replace function lumo_private.approved_archive_group_reports(p_group text,p_state jsonb) returns void language plpgsql set search_path='' as $archive$
declare r jsonb;n bigint;reporter uuid;
begin
 for r,n in select value,ordinality from jsonb_array_elements(case when jsonb_typeof(p_state#>'{chat,reports}')='array' then p_state#>'{chat,reports}' else '[]'::jsonb end) with ordinality loop
  reporter:=case when r->>'reporterId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r->>'reporterId')::uuid else null end;
  if reporter is not null and not exists(select 1 from auth.users where id=reporter) then reporter:=null;end if;
  insert into lumo_private.approved_group_reports(id,group_id,reporter_user_id,message_id,reason,payload)
   values('legacy:'||p_group||':'||coalesce(r->>'id',n::text),p_group,reporter,r->>'messageId',r->>'reason',r)
   on conflict do nothing;
 end loop;
end $archive$;
revoke all on function lumo_private.approved_archive_group_reports(text,jsonb) from public,anon,authenticated,service_role;
do $move$ declare g record;begin
 for g in select id,state from lumo_private.approved_groups where jsonb_array_length(case when jsonb_typeof(state#>'{chat,reports}')='array' then state#>'{chat,reports}' else '[]'::jsonb end)>0 loop
  perform lumo_private.approved_archive_group_reports(g.id,g.state);
  update lumo_private.approved_groups set state=jsonb_set(state,'{chat,reports}','[]'::jsonb),revision=revision+1,updated_at=now() where id=g.id;
 end loop;
 -- Existing closure decisions retain their intent; only receiving eligibility is repaired.
 update lumo_private.accounts a set status='closed' from lumo_private.approved_states s where a.owner_user_id=s.user_id and a.kind='consumer' and s.state#>>'{account,status}'='closed';
end $move$;
CREATE OR REPLACE FUNCTION lumo_private.approved_service(p_command text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid;session uuid;v_handle text;v_phone text;v_pin text;v_profile lumo_private.profiles%rowtype;
 snapshot lumo_private.approved_states%rowtype;prior lumo_private.approved_attempts%rowtype;
 g jsonb;b jsonb;i jsonb;j uuid;source uuid;destination uuid;own uuid;v_id text;v_revision bigint;v_balance bigint;
 posted jsonb:='[]'::jsonb;refs uuid[]:='{}';intent_ids jsonb:='[]';v_state jsonb;challenge lumo_private.approved_challenges%rowtype;
begin
 if (auth.jwt()->>'role') is distinct from 'service_role' then return jsonb_build_object('ok',false,'code','FORBIDDEN');end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('ok',false,'code','INVALID_INPUT');end if;
 actor:=(p_payload->>'actor')::uuid;session:=(p_payload->>'session')::uuid;
 if not lumo_private.approved_live(actor,session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if; perform lumo_private.approved_actor_context(actor,session);
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
  elsif v_profile.handle<>v_handle then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');else return jsonb_build_object('ok',false,'code','EXISTING_ACCOUNT');end if;
  insert into lumo_private.approved_profiles(user_id,phone) values(actor,v_phone) on conflict(user_id) do nothing;
  return lumo_private.approved_load(actor);
 end if;
 select * into v_profile from lumo_private.profiles where user_id=actor and status='active';
 if not found then return jsonb_build_object('ok',false,'code','ACCOUNT_REQUIRED');end if;
 if not exists(select 1 from lumo_private.accounts where owner_user_id=actor and kind='consumer' and status in('active','closed')) then return jsonb_build_object('ok',false,'code','ACCOUNT_UNAVAILABLE');end if;
 if exists(select 1 from lumo_private.accounts where owner_user_id=actor and kind='consumer' and status='closed') and p_command not in('load','attempt') then return jsonb_build_object('ok',false,'code','ACCOUNT_CLOSED');end if;
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
 if p_payload#>>'{state,account,status}'='closed' then
  perform 1 from lumo_private.approved_groups ag
   where ag.state->>'status' is distinct from 'closed' and (
    ag.state->>'creatorId'=actor::text
    or exists(select 1 from jsonb_array_elements(ag.state->'members') m where m->>'id'=actor::text and m->>'status'='active')
    or exists(select 1 from jsonb_array_elements(coalesce(ag.state->'contributions','[]'::jsonb)) c where c->>'memberId'=actor::text and c->>'status'='success' and coalesce((c->>'amount')::bigint,0)>coalesce((c->>'refundedAmount')::bigint,0)))
   order by ag.id for update;
  if found then return jsonb_build_object('ok',false,'code','CLOSURE_BLOCKED');end if;
 end if;
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
   if i->>'kind'='merchant_payment' and i#>>'{metadata,merchantAccessApproved}'='true' then perform set_config('lumo.approved.merchant_shop',i->>'shopId',true);end if; j:=lumo_private.post_money(actor,i->>'kind',(i->>'amount')::bigint,(i->>'sourceId')::uuid,(i->>'destinationId')::uuid,nullif(i->>'shopId','')::uuid,nullif(i->>'requestId','')::uuid,nullif(i->>'originalPaymentId','')::uuid);
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
   perform lumo_private.approved_archive_group_reports(g->>'id',g->'state');
   update lumo_private.approved_groups set state=case when jsonb_typeof(g#>'{state,chat}')='object' then jsonb_set(g->'state','{chat,reports}','[]'::jsonb) else g->'state' end,revision=(g->>'expectedRevision')::bigint+1,updated_at=now() where id=g->>'id';
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
  -- Closure and incoming postings serialize on the same ledger account row.
  -- A concurrent incoming posting changes expectedWallet and forces a fresh checklist.
  if v_state#>>'{account,status}'='closed' then
   if not coalesce((p_payload->>'requiresAuth')::boolean,false) then raise exception using errcode='P0001',message='PIN_REQUIRED';end if;
   if (select balance from lumo_private.accounts where id=own)<>0
     or exists(select 1 from lumo_private.approved_boxes ab join lumo_private.accounts ba on ba.id=ab.account_id where ab.user_id=actor and ba.balance<>0)
     or jsonb_array_length(coalesce(p_payload->'intents','[]'::jsonb))<>0 then raise exception using errcode='P0001',message='CLOSURE_BLOCKED';end if;
   update lumo_private.accounts set status='closed' where id=own and kind='consumer';
  end if;
  -- Report details never enter the shared group envelope or mutation result.
  for i in select value from jsonb_array_elements(coalesce(p_payload->'privateReports','[]'::jsonb)) loop
   if i->>'reporterId' is distinct from actor::text or length(i->>'reason') not between 1 and 500
    or not exists(select 1 from lumo_private.approved_groups ag where ag.id=i->>'groupId'
     and exists(select 1 from jsonb_array_elements(ag.state->'members') m where m->>'id'=actor::text and m->>'status'='active')
     and exists(select 1 from jsonb_array_elements(coalesce(ag.state#>'{chat,messages}','[]'::jsonb)) msg where msg->>'id'=i->>'messageId' and msg->>'senderId'<>actor::text and msg->>'status'='sent' and nullif(msg->>'deletedAt','') is null))
    then raise exception using errcode='P0001',message='REPORT_UNAVAILABLE';end if;
   insert into lumo_private.approved_group_reports(id,group_id,reporter_user_id,message_id,reason,created_at,payload)
    values(i->>'id',i->>'groupId',actor,i->>'messageId',i->>'reason',coalesce(nullif(i->>'at','')::timestamptz,now()),i)
    on conflict(group_id,reporter_user_id,message_id) do nothing;
  end loop;

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
end $function$;
CREATE OR REPLACE FUNCTION lumo_private.approved_load(p_actor uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('ok',true,'account',lumo_private.account_json(p_actor),'revision',coalesce(s.revision,0),'state',s.state,
 'phone',(select phone from lumo_private.approved_profiles where user_id=p_actor),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'revision',g.revision,'accountId',g.account_id,'balance',a.balance,'state',g.state,'merchantRefunds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'reference',lumo_private.receipt_json(r.id)->>'reference','amount',r.amount,'createdAt',r.created_at,'originalPaymentId',r.original_payment_id,'merchantName',mer.name,'shopName',sh.name) order by r.created_at,r.id) from lumo_private.journals r join lumo_private.journals original on original.id=r.original_payment_id left join lumo_private.shops sh on sh.id=original.shop_id left join lumo_private.merchants mer on mer.id=sh.merchant_id where r.type='refund' and r.payee_account_id=g.account_id),'[]'::jsonb)))
 from lumo_private.approved_groups g join lumo_private.accounts a on a.id=g.account_id
 where exists(select 1 from jsonb_array_elements(g.state->'members') m where m->>'id'=p_actor::text and m->>'status' in('active','invited'))),'[]'::jsonb),
 'boxes',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'accountId',b.account_id,'balance',a.balance)) from lumo_private.approved_boxes b join lumo_private.accounts a on a.id=b.account_id where b.user_id=p_actor),'[]'::jsonb),
 'partners',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'ownerUserId',r.owner_user_id,'partnerUserId',r.partner_user_id,'revision',r.revision,'kind',r.kind,'state',r.state)) from lumo_private.approved_partners r where p_actor in(r.owner_user_id,r.partner_user_id)),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'senderUserId',r.sender_user_id,'recipientUserId',r.recipient_user_id,'revision',r.revision,'state',r.state,'senderName',sp.display_name,'recipientName',rp.display_name,'senderHandle',sp.handle,'recipientHandle',rp.handle)) from lumo_private.approved_requests r join lumo_private.profiles sp on sp.user_id=r.sender_user_id join lumo_private.profiles rp on rp.user_id=r.recipient_user_id where p_actor in(r.sender_user_id,r.recipient_user_id)),'[]'::jsonb),
 'receipts',lumo_private.approved_receipts(p_actor))
 from (values(1)) v(x) left join lumo_private.approved_states s on s.user_id=p_actor;
$function$;
CREATE OR REPLACE FUNCTION lumo_private.post_money(actor uuid, kind text, amount bigint, source uuid, destination uuid, shop uuid DEFAULT NULL::uuid, request uuid DEFAULT NULL::uuid, original uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare j uuid; source_balance bigint; source_kind text; dest_balance bigint; closed_group jsonb;
begin
 -- Refunds to a closed collection are accepted only while a creator can return
 -- them to every original remaining source. Otherwise reject before debiting the merchant.
 if kind='refund' then
  select ag.state into closed_group from lumo_private.approved_groups ag where ag.account_id=destination and ag.state->>'status'='closed' for share;
  if found then
   if not exists(select 1 from jsonb_array_elements(closed_group->'members') member
     join lumo_private.accounts ca on ca.owner_user_id::text=member->>'id' and ca.kind='consumer' and ca.status='active'
     join lumo_private.profiles cp on cp.user_id=ca.owner_user_id and cp.status='active'
     where member->>'id'=closed_group->>'creatorId' and member->>'status'='active')
    or exists(select 1 from jsonb_array_elements(coalesce(closed_group->'contributions','[]'::jsonb)) c
     where c->>'status'='success' and coalesce((c->>'amount')::bigint,0)>coalesce((c->>'refundedAmount')::bigint,0)
     and not exists(select 1 from lumo_private.accounts ca join lumo_private.profiles cp on cp.user_id=ca.owner_user_id and cp.status='active'
      where ca.owner_user_id::text=c->>'memberId' and ca.kind='consumer' and ca.status='active'))
    or coalesce((select sum(greatest(0,coalesce((c->>'amount')::bigint,0)-coalesce((c->>'refundedAmount')::bigint,0)))
      from jsonb_array_elements(coalesce(closed_group->'contributions','[]'::jsonb)) c where c->>'status'='success'),0)<post_money.amount
   then raise exception using errcode='P0001',message='REFUND_DESTINATION_UNAVAILABLE';end if;
  end if;
 end if;
 -- Every caller takes the same account lock order, including opposite-direction transfers.
 perform 1 from lumo_private.accounts where id in (source,destination) order by id for update;
 if kind='merchant_payment' and request is not null and not exists (
  select 1 from lumo_private.payment_requests r where r.id=request and r.shop_id=shop and r.status='open' and r.expires_at>clock_timestamp() and r.amount=post_money.amount
 ) then raise exception using errcode='P0001',message='REQUEST_UNAVAILABLE';end if;
 select balance,accounts.kind into source_balance,source_kind from lumo_private.accounts where id=source and status='active';
 select balance into dest_balance from lumo_private.accounts where id=destination and status='active';
 if source_balance is null or dest_balance is null then raise exception using errcode='P0001',message='ACCOUNT_UNAVAILABLE'; end if;
 if source_kind<>'test_funding' and source_balance<amount then raise exception using errcode='P0001',message='INSUFFICIENT_FUNDS'; end if;
 if dest_balance+amount>10000000 then raise exception using errcode='P0001',message='WALLET_LIMIT'; end if;
 insert into lumo_private.journals(type,amount,payer_account_id,payee_account_id,actor_user_id,shop_id,request_id,original_payment_id)
 values(kind,amount,source,destination,actor,shop,request,original) returning id into j;
 insert into lumo_private.entries(journal_id,account_id,amount) values(j,source,-amount),(j,destination,amount);
 update lumo_private.accounts set balance=balance-amount where id=source;
 update lumo_private.accounts set balance=balance+amount where id=destination;
 insert into lumo_private.events(user_id,journal_id)
 select distinct owner_user_id,j from lumo_private.accounts where id in (source,destination) and owner_user_id is not null;
 return j;
end $function$;
CREATE OR REPLACE FUNCTION public.lumo_approved_merchant_commit(p_actor uuid, p_session uuid, p_revision bigint, p_ledger_stamp text, p_state jsonb, p_money_authorized boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare saved lumo_private.approved_merchant_network%rowtype;b jsonb;old_b jsonb;u jsonb;owner_u jsonb;s jsonb;r jsonb;old_r jsonb;
 merchant_id uuid;account_id uuid;shop_id uuid;owner_id uuid;user_id uuid;j uuid;original lumo_private.journals%rowtype;role text;already bigint;amount bigint;new_revision bigint;
begin
 if not lumo_private.approved_live(p_actor,p_session) then return jsonb_build_object('ok',false,'code','SESSION_REVOKED');end if; perform lumo_private.approved_actor_context(p_actor,p_session);
 if jsonb_typeof(p_state) is distinct from 'object' or octet_length(p_state::text)>16000000 then return jsonb_build_object('ok',false,'code','INVALID_NETWORK');end if;
 select * into saved from lumo_private.approved_merchant_network where id for update;
 if saved.revision<>p_revision then return jsonb_build_object('ok',false,'code','CONCURRENT_UPDATE');end if;
 -- Shared payments and metadata mutations use the same canonical account locks.
 perform 1 from lumo_private.accounts a
 where exists(select 1 from lumo_private.merchants m where m.account_id=a.id)
 or exists(select 1 from jsonb_each(p_state->'businesses') business
   cross join lateral jsonb_array_elements(business.value->'refunds') refund
   join lumo_private.journals original_payment on original_payment.id=(refund.value->>'transactionId')::uuid
   where refund.value->>'status'='paid' and original_payment.payer_account_id=a.id)
 order by a.id for update;
 if lumo_private.approved_merchant_stamp() is distinct from p_ledger_stamp then return jsonb_build_object('ok',false,'code','CONCURRENT_UPDATE');end if;
 begin
 for b in select value from jsonb_each(p_state->'businesses') loop
  merchant_id:=(b#>>'{business,id}')::uuid;old_b:=saved.document#>array['businesses',merchant_id::text];
  select value into owner_u from jsonb_array_elements(p_state->'users') where value->>'businessId'=merchant_id::text and value->>'role'='owner' and value->>'active'='true' limit 1;
  owner_id:=(owner_u->>'_sharedUserId')::uuid;
  if owner_id is null then raise exception 'MERCHANT_IDENTITY_REQUIRED';end if;
  select m.account_id into account_id from lumo_private.merchants m where m.id=merchant_id;
  if account_id is null then
   if owner_id<>p_actor then raise exception 'FORBIDDEN';end if;
   insert into lumo_private.accounts(owner_user_id,kind) values(owner_id,'merchant') returning id into account_id;
   insert into lumo_private.merchants(id,owner_user_id,account_id,name) values(merchant_id,owner_id,account_id,b#>>'{business,name}');
  else
   if exists(select 1 from lumo_private.merchants m where m.id=merchant_id and m.owner_user_id<>owner_id) then raise exception 'OWNERSHIP_TRANSFER_UNAVAILABLE';end if;
  end if;
  update lumo_private.merchants set name=b#>>'{business,name}' where id=merchant_id;
  for s in select value from jsonb_array_elements(b->'shops') loop
   shop_id:=(s->>'id')::uuid;
   if exists(select 1 from lumo_private.shops sh where sh.id=shop_id and sh.merchant_id<>merchant_id) then raise exception 'SHOP_SCOPE_MISMATCH';end if;
   insert into lumo_private.shops(id,merchant_id,name,accepting) values(shop_id,merchant_id,s->>'name',coalesce((s->>'accepting')::boolean,true) and coalesce((s->>'open')::boolean,true))
   on conflict(id) do update set name=excluded.name,accepting=excluded.accepting;
   insert into lumo_private.shop_settings(shop_id,location,published,latitude,longitude) values(shop_id,coalesce(s->>'area',''),coalesce((s->>'published')::boolean,false),(s->>'lat')::numeric,(s->>'lng')::numeric)
   on conflict on constraint shop_settings_pkey do update set location=excluded.location,published=excluded.published,latitude=excluded.latitude,longitude=excluded.longitude;
  end loop;
  for u in select value from jsonb_array_elements(p_state->'users') where value->>'businessId'=merchant_id::text and value->>'role'<>'owner' and value?'_sharedUserId' loop
   user_id:=(u->>'_sharedUserId')::uuid;
   for s in select value from jsonb_array_elements(u->'shopIds') loop
    shop_id:=trim(both '"' from s::text)::uuid;
    if not exists(select 1 from lumo_private.shops sh where sh.id=shop_id and sh.merchant_id=merchant_id) then raise exception 'SHOP_SCOPE_MISMATCH';end if;
    insert into lumo_private.staff_memberships(shop_id,user_id,role,status,invited_by) values(shop_id,user_id,u->>'role',case when u->>'active'='true' then 'active' else 'removed' end,owner_id)
    on conflict on constraint staff_memberships_shop_id_user_id_key do update set role=excluded.role,status=excluded.status,updated_at=clock_timestamp();
   end loop;
   update lumo_private.staff_memberships sm set status='removed',updated_at=clock_timestamp() where sm.user_id=user_id and sm.shop_id in(select sh.id from lumo_private.shops sh where sh.merchant_id=merchant_id)
    and not exists(select 1 from jsonb_array_elements_text(u->'shopIds') assigned where assigned.value=sm.shop_id::text);
  end loop;
  for r in select value from jsonb_array_elements(b->'requests') loop
   shop_id:=(r->>'shopId')::uuid;
   select value into u from jsonb_array_elements(p_state->'users') where value->>'id'=r->>'createdByUserId';
   user_id:=coalesce((u->>'_sharedUserId')::uuid,owner_id);
   if not exists(select 1 from lumo_private.shops sh where sh.id=shop_id and sh.merchant_id=merchant_id) then raise exception 'SHOP_SCOPE_MISMATCH';end if;
   insert into lumo_private.payment_requests(id,shop_id,amount,note,created_by,status,expires_at,created_at)
   values((r->>'id')::uuid,shop_id,(r->>'amount')::bigint,coalesce(r->>'description',''),user_id,r->>'status',(r->>'expiresAt')::timestamptz,(r->>'createdAt')::timestamptz)
   on conflict(id) do update set status=case when lumo_private.payment_requests.status='paid' then 'paid' else excluded.status end;
  end loop;
  -- A close resets each shop's trading view while its merchant account keeps all funds.
  for r in select value from jsonb_array_elements(b->'closings') loop
   if not exists(select 1 from jsonb_array_elements(coalesce(old_b->'closings','[]'::jsonb)) prior_close where prior_close.value->>'id'=r->>'id') then
    update lumo_private.shops sh set trading_since=greatest(sh.trading_since,(r->>'createdAt')::timestamptz) where sh.id=(r->>'shopId')::uuid and sh.merchant_id=merchant_id;
   end if;
  end loop;
  for r in select value from jsonb_array_elements(b->'refunds') where value->>'status'='paid' loop
   if exists(select 1 from lumo_private.approved_merchant_refunds rf where rf.refund_id=r->>'id') then continue;end if;
   -- Existing canonical refunds are projected using their canonical journal id.
   if exists(select 1 from lumo_private.journals jn where jn.type='refund' and jn.id::text=r->>'id') then continue;end if;
   if not p_money_authorized then raise exception 'STEP_UP_REQUIRED';end if;
   select * into original from lumo_private.journals jn where jn.id=(r->>'transactionId')::uuid and jn.type='merchant_payment' and jn.payee_account_id=account_id for update;
   if original.id is null then raise exception 'INVALID_PAYMENT';end if;
   role:=lumo_private.staff_role(p_actor,original.shop_id);amount:=(r->>'amount')::bigint;
   select coalesce(sum(jn.amount),0) into already from lumo_private.journals jn where jn.original_payment_id=original.id and jn.type='refund';
   if role not in('owner','manager') or role is null then raise exception 'FORBIDDEN';end if;
   if amount<=0 or amount+already>original.amount then raise exception 'REFUND_EXCEEDS_PAYMENT';end if;
   if role='manager' and amount+already>10000 then raise exception 'OWNER_APPROVAL_REQUIRED';end if;
   j:=lumo_private.post_money(p_actor,'refund',amount,account_id,original.payer_account_id,original.shop_id,original.request_id,original.id);
   insert into lumo_private.approved_merchant_refunds(refund_id,journal_id) values(r->>'id',j);
  end loop;
 end loop;
 new_revision:=saved.revision+1;
 update lumo_private.approved_merchant_network set document=p_state,revision=new_revision where id;
 return jsonb_build_object('ok',true,'revision',new_revision);
 exception when others then
  return jsonb_build_object('ok',false,'code',case when SQLERRM in('FORBIDDEN','STEP_UP_REQUIRED','SHOP_SCOPE_MISMATCH','MERCHANT_IDENTITY_REQUIRED','OWNERSHIP_TRANSFER_UNAVAILABLE','INVALID_PAYMENT','REFUND_EXCEEDS_PAYMENT','OWNER_APPROVAL_REQUIRED','INSUFFICIENT_FUNDS','ACCOUNT_UNAVAILABLE','REFUND_DESTINATION_UNAVAILABLE') then SQLERRM else 'MERCHANT_COMMIT_FAILED' end);
 end;
end $function$;
create index if not exists lumo_journals_payee_history on lumo_private.journals(payee_account_id,created_at desc,id);
create index if not exists lumo_journals_payer_history on lumo_private.journals(payer_account_id,created_at desc,id);

revoke all on function lumo_private.approved_service(text,jsonb) from public,anon,authenticated;
grant execute on function lumo_private.approved_service(text,jsonb) to service_role;
